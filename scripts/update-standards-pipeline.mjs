/**
 * update-standards-pipeline.mjs
 *
 * 성취기준 정본(server/data/standards.js) 갱신 후 밟아야 하는 수동 체인을
 * 하나로 묶은 오케스트레이터. **안정성 최우선** 설계:
 *
 *  - 기본 모드 = 검사 전용(read-only). 어떤 쓰기도 하지 않는다.
 *  - 쓰기는 --apply 명시 시에만, 그것도 모든 게이트 통과 후에만 실행.
 *  - --apply는 시드 전에 Supabase 현재 상태를 타임스탬프 백업으로 저장.
 *  - 데이터 처리 로직은 새로 만들지 않고 기존 검증된 스크립트를 자식 프로세스로
 *    재사용(report-standards-quality / seed-standards-from-canonical /
 *    verify-standards-supabase). 이 스크립트 고유 로직은 읽기 전용 점검뿐.
 *  - 비용이 드는 단계(임베딩 재생성, 링크 재판정 LLM 호출)는 절대 자동 실행하지
 *    않고, 대상 목록 파일과 실행 명령만 출력한다 → 사람이 결정.
 *
 * ── 검사 항목 (기본 모드) ──
 *  1. 정본 구조 무결성: 건수/중복 code/빈 content
 *  2. 품질 게이트: report-standards-quality.mjs --max-flagged 30
 *  3. OpenAI 임베딩 캐시 커버리지: 정본 code 중 임베딩 없는 코드 (시맨틱 검색 공백)
 *  4. UMAP 좌표 캐시 해시 정합: embeddings-cache.json (production은 미스 시 좌표 생략)
 *  5. Supabase 정합: verify-standards-supabase.mjs (누락 0 확인)
 *  6. 링크 참조 무결성: curriculum_links의 code가 전부 정본에 존재하는지
 *
 * ── --apply 추가 단계 (게이트 전부 통과 시에만) ──
 *  A. Supabase curriculum_standards 백업 → scripts/results/backup-standards-<ts>.json
 *  B. 정본↔DB content diff → 변경 code 목록 → scripts/results/changed-codes-<ts>.json
 *  C. seed-standards-from-canonical.mjs 실행 (비파괴 upsert, --prune-extra 없이)
 *  D. verify-standards-supabase.mjs 재실행 (사후 확인)
 *  E. 남은 수동 단계 체크리스트 출력 (임베딩 동기화 / 링크 재판정 / 서버 반영)
 *
 * 실행:
 *   node scripts/update-standards-pipeline.mjs                # 검사만 (안전)
 *   node scripts/update-standards-pipeline.mjs --apply        # 백업 + 시드 + 재검증
 *   node scripts/update-standards-pipeline.mjs --skip-embeddings  # 136MB 캐시 파싱 생략
 *
 * 환경변수: server/.env를 자동 로드 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'server', '.env');
const RESULTS_DIR = path.join(__dirname, 'results');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SKIP_EMBEDDINGS = args.includes('--skip-embeddings');

// server/.env 자동 로드 (이미 설정된 값은 덮지 않음 — node 기본 동작과 동일하게 보수적으로)
try {
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* env 없이도 오프라인 검사(1~4)는 동작 */ }

const HAS_SUPABASE_ENV = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── 결과 수집 ──
const results = []; // { step, status: 'PASS'|'WARN'|'FAIL'|'SKIP', detail }
function record(step, status, detail = '') {
  results.push({ step, status, detail });
  const icon = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌', SKIP: '⏭️ ' }[status];
  console.log(`\n${icon} [${step}] ${status}${detail ? ' — ' + detail : ''}`);
}

function runChild(label, scriptRelPath, extraArgs = []) {
  console.log(`\n━━━ ${label}: node ${scriptRelPath} ${extraArgs.join(' ')} ━━━`);
  const r = spawnSync('node', [path.join(ROOT, scriptRelPath), ...extraArgs], {
    cwd: ROOT, stdio: 'inherit', env: process.env,
  });
  return r.status === 0;
}

console.log('════════════════════════════════════════════════════');
console.log(`  성취기준 업데이트 파이프라인 (${APPLY ? 'APPLY — 쓰기 포함' : '검사 전용 — 아무것도 쓰지 않음'})`);
console.log('════════════════════════════════════════════════════');

// ═══ 1. 정본 구조 무결성 ═══
const { ALL_STANDARDS } = await import(path.join(ROOT, 'server/data/standards.js'));
{
  const codes = ALL_STANDARDS.map(s => s.code);
  const codeSet = new Set(codes);
  const dup = codes.length - codeSet.size;
  const emptyContent = ALL_STANDARDS.filter(s => !s.content || !s.content.trim()).length;
  const emptyCode = ALL_STANDARDS.filter(s => !s.code || !s.code.trim()).length;
  if (codes.length === 0 || dup > 0 || emptyCode > 0) {
    record('1. 정본 구조', 'FAIL', `${codes.length}건, 중복 ${dup}, 빈 code ${emptyCode}`);
  } else if (emptyContent > 0) {
    record('1. 정본 구조', 'WARN', `${codes.length}건 (중복 0), 빈 content ${emptyContent}건`);
  } else {
    record('1. 정본 구조', 'PASS', `${codes.length}건, 중복 0, 빈 content 0`);
  }
}
const canonCodes = new Set(ALL_STANDARDS.map(s => s.code));

// ═══ 2. 품질 게이트 (기존 스크립트 재사용) ═══
{
  const ok = runChild('품질 게이트', 'scripts/report-standards-quality.mjs', ['--max-flagged', '30']);
  record('2. 품질 게이트', ok ? 'PASS' : 'FAIL', ok ? '플래그 허용치 이내' : '허용치 초과 — standards.js 오염 의심');
}

// ═══ 3. OpenAI 임베딩 캐시 커버리지 ═══
{
  const CACHE = path.join(ROOT, 'server/data/openai-embeddings-cache.json');
  if (SKIP_EMBEDDINGS) {
    record('3. 임베딩 커버리지', 'SKIP', '--skip-embeddings');
  } else if (!fs.existsSync(CACHE)) {
    record('3. 임베딩 커버리지', 'WARN', '캐시 파일 없음 — generateEmbeddings.js 필요 (시맨틱 검색이 런타임 생성 시도)');
  } else {
    const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    const embCodes = new Set(Object.keys(cache.embeddings || {}));
    const missing = [...canonCodes].filter(c => !embCodes.has(c));
    const stale = [...embCodes].filter(c => !canonCodes.has(c));
    if (missing.length > 0) {
      record('3. 임베딩 커버리지', 'WARN',
        `정본 ${canonCodes.size} 중 임베딩 누락 ${missing.length}건 (시맨틱 검색에서 제외됨) — 예: ${missing.slice(0, 5).join(' ')}`);
    } else {
      record('3. 임베딩 커버리지', 'PASS',
        `정본 전 code 임베딩 보유 (캐시 ${embCodes.size}, 잉여 ${stale.length}, 모델 ${cache.model}, 생성 ${cache.created_at})`);
    }
  }
}

// ═══ 4. UMAP 좌표 캐시 해시 정합 ═══
{
  const CACHE = path.join(ROOT, 'server/data/embeddings-cache.json');
  // embeddings.js:157과 동일한 해시 규칙: codes.sort().join(',')
  const expectedHash = ALL_STANDARDS.map(s => s.code).sort().join(',');
  if (!fs.existsSync(CACHE)) {
    record('4. UMAP 좌표 캐시', 'WARN', '캐시 없음 — dev는 부팅 시 재계산, production은 좌표 생략(그래프 초기 배치 소실)');
  } else {
    const { hash, coords } = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (hash === expectedHash) {
      record('4. UMAP 좌표 캐시', 'PASS', `해시 일치, 좌표 ${Object.keys(coords || {}).length}건`);
    } else {
      record('4. UMAP 좌표 캐시', 'WARN', '해시 불일치(정본 변경 흔적) — dev 서버 1회 기동으로 재생성됨. production 배포 전 재생성 권장');
    }
  }
}

// ═══ 5. Supabase 정합 (기존 스크립트 재사용) ═══
if (!HAS_SUPABASE_ENV) {
  record('5. Supabase 정합', 'SKIP', 'SUPABASE_URL/SERVICE_ROLE_KEY 없음 (server/.env 확인)');
} else {
  const ok = runChild('Supabase 정합 검증', 'scripts/verify-standards-supabase.mjs');
  record('5. Supabase 정합', ok ? 'PASS' : 'FAIL', ok ? '정본 code 전부 resolve' : '누락 code 존재 — 시드 필요');
}

// ═══ 6. 링크 참조 무결성 (read-only) ═══
let sb = null;
if (HAS_SUPABASE_ENV) {
  const { createClient } = await import('@supabase/supabase-js');
  sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}
if (!sb) {
  record('6. 링크 참조 무결성', 'SKIP', 'Supabase env 없음');
} else {
  const orphans = new Set();
  let total = 0;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('curriculum_links')
      .select('source_code,target_code').range(from, from + PAGE - 1);
    if (error) { record('6. 링크 참조 무결성', 'FAIL', `조회 실패: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    total += data.length;
    for (const r of data) {
      if (!canonCodes.has(r.source_code)) orphans.add(r.source_code);
      if (!canonCodes.has(r.target_code)) orphans.add(r.target_code);
    }
    if (data.length < PAGE) break;
  }
  if (total > 0) {
    if (orphans.size === 0) record('6. 링크 참조 무결성', 'PASS', `링크 ${total}건, 정본 밖 code 참조 0`);
    else record('6. 링크 참조 무결성', 'WARN',
      `링크 ${total}건 중 정본 밖 code ${orphans.size}종 참조 (하이드레이션 시 skip됨) — 예: ${[...orphans].slice(0, 5).join(' ')}`);
  }
}

// ═══ 게이트 판정 ═══
const fails = results.filter(r => r.status === 'FAIL');
const warns = results.filter(r => r.status === 'WARN');

console.log('\n════════════════ 검사 요약 ════════════════');
for (const r of results) {
  console.log(`  ${{ PASS: '✅', WARN: '⚠️ ', FAIL: '❌', SKIP: '⏭️ ' }[r.status]} ${r.step}: ${r.status}`);
}
console.log(`  → PASS ${results.filter(r => r.status === 'PASS').length} / WARN ${warns.length} / FAIL ${fails.length} / SKIP ${results.filter(r => r.status === 'SKIP').length}`);

if (!APPLY) {
  if (fails.length > 0) {
    console.log('\n❌ FAIL 항목이 있습니다. 원인 해소 전 --apply를 실행하지 마세요.');
    process.exit(1);
  }
  console.log('\n검사 전용 모드 종료 (아무것도 쓰지 않았습니다).');
  console.log('시드가 필요하면: node scripts/update-standards-pipeline.mjs --apply');
  process.exit(0);
}

// ═══════════════════ APPLY 모드 ═══════════════════
if (fails.length > 0) {
  console.log('\n❌ 게이트 FAIL — 안전을 위해 쓰기 단계를 중단합니다. 위 FAIL 항목을 먼저 해소하세요.');
  process.exit(1);
}
if (!sb) {
  console.log('\n❌ Supabase env 없이는 --apply를 실행할 수 없습니다.');
  process.exit(1);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ═══ A. 백업 (embedding 컬럼 제외 — 크기·복원 실용성) ═══
console.log('\n━━━ A. Supabase curriculum_standards 백업 ━━━');
const backupRows = [];
{
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('curriculum_standards')
      .select('id,code,subject,grade_group,school_level,area,content,explanation,keywords')
      .range(from, from + PAGE - 1);
    if (error) { console.error(`❌ 백업 실패: ${error.message} — 중단`); process.exit(1); }
    if (!data || data.length === 0) break;
    backupRows.push(...data);
    if (data.length < PAGE) break;
  }
}
const backupFile = path.join(RESULTS_DIR, `backup-standards-${ts}.json`);
fs.writeFileSync(backupFile, JSON.stringify({ created_at: ts, count: backupRows.length, rows: backupRows }));
console.log(`  백업 완료: ${backupRows.length}행 → ${path.relative(ROOT, backupFile)}`);

// ═══ B. 정본↔DB content diff → 변경 code 목록 ═══
console.log('\n━━━ B. 정본↔DB content diff ━━━');
const dbByCode = new Map(backupRows.map(r => [r.code, r]));
const changedCodes = [];
const newCodes = [];
for (const s of ALL_STANDARDS) {
  const db = dbByCode.get(s.code);
  if (!db) { newCodes.push(s.code); continue; }
  const canonContent = (s.content || '').trim();
  if (canonContent && canonContent !== (db.content || '').trim()) changedCodes.push(s.code);
}
const changedFile = path.join(RESULTS_DIR, `changed-codes-${ts}.json`);
fs.writeFileSync(changedFile, JSON.stringify({ created_at: ts, changed: changedCodes, added: newCodes }, null, 2));
console.log(`  content 변경 예정: ${changedCodes.length}건 / 신규 insert: ${newCodes.length}건 → ${path.relative(ROOT, changedFile)}`);

// 변경 코드가 낀 링크 수 (재판정 규모 안내용, read-only)
let affectedLinks = 0;
if (changedCodes.length > 0) {
  const changedSet = new Set(changedCodes);
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('curriculum_links')
      .select('source_code,target_code').range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    affectedLinks += data.filter(r => changedSet.has(r.source_code) || changedSet.has(r.target_code)).length;
    if (data.length < PAGE) break;
  }
  console.log(`  변경 code가 낀 링크: ${affectedLinks}건 (재판정 후보)`);
}

if (changedCodes.length === 0 && newCodes.length === 0) {
  console.log('\n✅ 정본과 DB가 이미 일치합니다 (content 기준). 시드를 생략합니다.');
  process.exit(0);
}

// ═══ C. 시드 (기존 비파괴 스크립트 재사용, --prune-extra 없이) ═══
{
  const ok = runChild('C. Supabase 시드 (비파괴 upsert)', 'scripts/seed-standards-from-canonical.mjs');
  if (!ok) {
    console.error(`\n❌ 시드 실패 — 백업은 ${path.relative(ROOT, backupFile)} 에 있습니다. 중단.`);
    process.exit(1);
  }
}

// ═══ D. 사후 검증 ═══
{
  const ok = runChild('D. 사후 Supabase 정합 재검증', 'scripts/verify-standards-supabase.mjs');
  if (!ok) {
    console.error(`\n❌ 사후 검증 실패 — 백업: ${path.relative(ROOT, backupFile)}`);
    process.exit(1);
  }
}

// ═══ E. 남은 수동 단계 체크리스트 (비용 단계는 자동 실행하지 않음) ═══
console.log('\n════════════ 남은 수동 단계 (비용/판단 필요 — 자동 실행 안 함) ════════════');
let step = 1;
if (changedCodes.length > 0 || newCodes.length > 0) {
  console.log(`  ${step++}. 임베딩 부분 갱신 (${changedCodes.length + newCodes.length}건):`);
  console.log(`     → 변경분만: node scripts/sync-restored-standards.mjs 방식 참고, 또는 전량:`);
  console.log(`     → node scripts/generateEmbeddings.js  (OpenAI 비용 발생)`);
}
if (affectedLinks > 0) {
  console.log(`  ${step++}. 링크 재판정 (${affectedLinks}건, LLM 비용 발생):`);
  console.log(`     → node scripts/generateLinksV2.mjs --rejudge --codes-file ${path.relative(ROOT, changedFile)}`);
  console.log(`     → node scripts/promoteLinks.mjs --dry-run  (확인 후 실행)`);
}
console.log(`  ${step++}. 서버 반영: 재시작 또는 관리자 POST /api/standards/refresh (인메모리 reload + UMAP 캐시 무효화)`);
console.log(`  ${step++}. 배포 전 최종 확인: node scripts/update-standards-pipeline.mjs  (검사 전용 재실행)`);
console.log(`\n  롤백이 필요하면: ${path.relative(ROOT, backupFile)} (id·code·content 보존)`);
console.log('\n✅ APPLY 완료');
