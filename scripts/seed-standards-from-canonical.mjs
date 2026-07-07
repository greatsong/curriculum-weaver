/**
 * seed-standards-from-canonical.mjs
 *
 * 정본(server/data/standards.js, ALL_STANDARDS, 4,856개)을 단일 소스로 Supabase
 * curriculum_standards를 재정합한다. 검색 런타임(store.js)이 쓰는 바로 그 파일이므로,
 * 이 스크립트를 쓰면 "검색 소스 == 시드 소스"가 보장된다.
 *
 * ── 정합 원칙 (비파괴) ──
 *  - 매칭 키: code (onConflict). 기존 id는 건드리지 않음 → project_standards /
 *    curriculum_links FK 안전.
 *  - content: 정본이 권위. 정본 content가 비어있지 않으면 항상 정본 값으로 교체.
 *    (standards_full 시드본은 일부 content가 중간에 잘려 있어 정본이 더 완전함 — 81건 교정)
 *  - explanation / area / grade_group / keywords / school_level: 기존 DB 값이 비어
 *    있을 때만 정본 값으로 채움(fill). 기존 값이 있으면 보존 — 둘 다 채워진
 *    explanation 2,224건을 무분별하게 덮지 않기 위함.
 *  - competencies / content_system / assessment_guide / considerations /
 *    teaching_learning / embedding: payload에서 완전히 제외 → 기존 값 보존.
 *    (standards_full에서 시드된 rich 메타 4,053건과 임베딩을 지키기 위함)
 *
 * ── 옵션 ──
 *   --dry-run        DB에 쓰지 않고 변경 통계만 출력 (읽기는 함)
 *   --batch-size N   upsert 배치 크기 (기본 300)
 *   --prune-extra    정본에 없는 잉여 code 행을 삭제 (FK 참조 0건일 때만; 사전 확인 후)
 *
 * 실행:
 *   node --env-file=server/.env scripts/seed-standards-from-canonical.mjs --dry-run
 *   node --env-file=server/.env scripts/seed-standards-from-canonical.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { ALL_STANDARDS } from '../server/data/standards.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PRUNE_EXTRA = args.includes('--prune-extra');
const BATCH_SIZE = (() => {
  const i = args.indexOf('--batch-size');
  return i >= 0 ? parseInt(args[i + 1]) || 300 : 300;
})();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  process.exit(1);
}
const sb = createClient(url, key);

// ── school_level 정규화 + 파생 ──
const SCHOOL_LEVEL_NORM = {
  elementary: 'elementary', middle: 'middle', high: 'high',
  초등학교: 'elementary', 중학교: 'middle', 고등학교: 'high',
};
function normalizeSchoolLevel(val) {
  if (!val) return null;
  return SCHOOL_LEVEL_NORM[val] || null;
}
function deriveSchoolLevel(std) {
  const norm = normalizeSchoolLevel(std.school_level);
  if (norm) return norm;
  const g = (std.grade_group || '').trim();
  if (g.startsWith('초')) return 'elementary';
  if (g.startsWith('중')) return 'middle';
  if (g.startsWith('고')) return 'high';
  // 코드 접두 숫자로 파생: [4..]/[6..]=초, [9..]=중, [10..]/[12..]=고
  const m = (std.code || '').match(/^\[(\d{1,2})/);
  if (m) {
    const n = parseInt(m[1]);
    if (n <= 6) return 'elementary';
    if (n === 9) return 'middle';
    if (n >= 10) return 'high';
  }
  return null;
}

const empty = (v) => v == null || (typeof v === 'string' && v.trim() === '');

// ── 정본 → 빠른 조회 맵 ──
const canonByCode = new Map();
for (const s of ALL_STANDARDS) {
  if (!canonByCode.has(s.code)) canonByCode.set(s.code, s);
}
const canonCodes = [...canonByCode.keys()];
console.log(`[정본] standards.js: ${ALL_STANDARDS.length} rows, ${canonCodes.length} codes\n`);

// ── 기존 DB 행 전량 수집 (병합 판단에 필요) ──
async function fetchAllDbRows() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('curriculum_standards')
      .select('code,subject,grade_group,school_level,area,content,explanation,keywords')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`DB 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

console.log('기존 DB 행 수집 중...');
const dbRows = await fetchAllDbRows();
const dbByCode = new Map(dbRows.map(r => [r.code, r]));
console.log(`기존 DB: ${dbRows.length} codes\n`);

// ── 병합 행 + 변경 통계 ──
const stats = { contentReplaced: 0, explFilled: 0, areaFilled: 0, gradeFilled: 0, schoolFilled: 0, keywordsFilled: 0, newInsert: 0, unchanged: 0 };
const payload = [];

for (const code of canonCodes) {
  const c = canonByCode.get(code);
  const db = dbByCode.get(code); // 없으면 신규 insert

  const row = { code, subject: c.subject || db?.subject || '미분류' };

  // content: 정본 권위 (비어있지 않으면 교체)
  const canonContent = (c.content || '').trim();
  row.content = canonContent || db?.content || '';
  let changed = false;
  if (!db) { stats.newInsert++; changed = true; }
  else {
    if (canonContent && canonContent !== (db.content || '').trim()) { stats.contentReplaced++; changed = true; }
  }

  // 아래 필드: 기존 비어있을 때만 채움
  if (empty(db?.explanation) && !empty(c.explanation)) { row.explanation = c.explanation; stats.explFilled++; changed = true; }
  else if (db) row.explanation = db.explanation; // 보존 (명시 포함, 어차피 동일값 no-op)

  if (empty(db?.area) && !empty(c.area)) { row.area = c.area; stats.areaFilled++; changed = true; }
  else if (db) row.area = db.area;

  if (empty(db?.grade_group) && !empty(c.grade_group)) { row.grade_group = c.grade_group; stats.gradeFilled++; changed = true; }
  else if (db) row.grade_group = db.grade_group;

  const dbSchool = db?.school_level;
  if (empty(dbSchool)) {
    const derived = deriveSchoolLevel(c);
    if (derived) { row.school_level = derived; stats.schoolFilled++; changed = true; }
  } else {
    row.school_level = dbSchool;
  }

  const dbKw = db?.keywords;
  if ((!dbKw || dbKw.length === 0) && Array.isArray(c.keywords) && c.keywords.length > 0) {
    row.keywords = c.keywords; stats.keywordsFilled++; changed = true;
  } else if (dbKw) row.keywords = dbKw;

  if (!changed && db) { stats.unchanged++; continue; } // 변경 없으면 upsert 생략
  payload.push(row);
}

console.log('=== 병합 변경 요약 ===');
console.log(`  content 교체(정본 권위):   ${stats.contentReplaced}`);
console.log(`  explanation 채움(빈 값만):  ${stats.explFilled}`);
console.log(`  area 채움:                 ${stats.areaFilled}`);
console.log(`  grade_group 채움:          ${stats.gradeFilled}`);
console.log(`  school_level 파생/채움:     ${stats.schoolFilled}`);
console.log(`  keywords 채움:             ${stats.keywordsFilled}`);
console.log(`  신규 insert:               ${stats.newInsert}`);
console.log(`  변경 없음(skip):           ${stats.unchanged}`);
console.log(`  → upsert 대상 행:          ${payload.length}`);

// ── 잉여 code (정본에 없음) ──
const canonSet = new Set(canonCodes);
const extraCodes = dbRows.map(r => r.code).filter(c => !canonSet.has(c));
console.log(`\n정본 외 잉여 DB code: ${extraCodes.length}개`);
if (extraCodes.length) console.log('  ', extraCodes.slice(0, 30).join(' '));

if (DRY_RUN) {
  console.log('\n[DRY RUN] DB에 쓰지 않았습니다.');
  if (payload.length) {
    console.log('변경 행 샘플(최대 3):');
    payload.slice(0, 3).forEach(r => console.log('  ', JSON.stringify({ code: r.code, content: (r.content || '').slice(0, 50) })));
  }
  process.exit(0);
}

// ── upsert 실행 (embedding/rich 메타 미포함 → 보존) ──
let ok = 0, fail = 0;
for (let i = 0; i < payload.length; i += BATCH_SIZE) {
  const batch = payload.slice(i, i + BATCH_SIZE);
  const { error } = await sb
    .from('curriculum_standards')
    .upsert(batch, { onConflict: 'code', ignoreDuplicates: false });
  if (error) {
    console.error(`  BATCH ERROR (${i}~${i + batch.length}): ${error.message}`);
    fail += batch.length;
  } else {
    ok += batch.length;
  }
  process.stdout.write(`\r  upsert: ${Math.min(i + BATCH_SIZE, payload.length)}/${payload.length}`);
}
process.stdout.write('\n');
console.log(`upsert 완료: 성공 ${ok}, 실패 ${fail}`);

// ── 잉여 행 prune (옵션, FK 0건 확인된 경우만) ──
if (PRUNE_EXTRA && extraCodes.length) {
  console.log(`\n잉여 ${extraCodes.length}개 행 삭제 중...`);
  const { error } = await sb.from('curriculum_standards').delete().in('code', extraCodes);
  if (error) console.error('  prune 실패:', error.message);
  else console.log('  prune 완료');
}

// ── 최종 카운트 ──
const { count } = await sb.from('curriculum_standards').select('*', { count: 'exact', head: true });
console.log(`\nDB 최종 행 수: ${count}`);
