/**
 * seed-standards-to-supabase.mjs
 *
 * standards_full.json → Supabase curriculum_standards 테이블 upsert
 *
 * 실행: node scripts/seed-standards-to-supabase.mjs
 *
 * 필요 환경변수:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 옵션:
 *   --dry-run     DB에 쓰지 않고 통계만 출력
 *   --batch-size  한 번에 upsert할 행 수 (기본 200)
 *   --input       JSON 파일 경로 (기본: scripts/results/standards_full.json)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 파싱 ──
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = (() => {
  const idx = args.indexOf('--batch-size');
  return idx >= 0 ? parseInt(args[idx + 1]) || 200 : 200;
})();
const INPUT_PATH = (() => {
  const idx = args.indexOf('--input');
  return idx >= 0
    ? args[idx + 1]
    : join(__dirname, 'results', 'standards_full.json');
})();

// ── Supabase 클라이언트 ──
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('ERROR: 환경변수를 설정하세요:');
    console.error('  export SUPABASE_URL=https://xxx.supabase.co');
    console.error('  export SUPABASE_SERVICE_ROLE_KEY=eyJ...');
    process.exit(1);
  }

  return createClient(url, key);
}

// ── school_level 정규화 (한국어 → Supabase enum) ──
const SCHOOL_LEVEL_NORM = {
  'elementary': 'elementary',
  'middle': 'middle',
  'high': 'high',
  '초등학교': 'elementary',
  '중학교': 'middle',
  '고등학교': 'high',
};

function normalizeSchoolLevel(val) {
  if (!val) return null;
  return SCHOOL_LEVEL_NORM[val] || null;
}

// ── JSON → DB row 변환 ──
function toDbRow(item) {
  return {
    code: item.code,
    subject: item.subject,
    grade_group: item.grade_group || null,
    school_level: normalizeSchoolLevel(item.school_level),
    area: item.area || null,
    content: item.content,
    explanation: item.explanation || null,
    considerations: item.considerations || null,
    competencies: item.competencies || null,
    content_system: item.content_system || null,
    teaching_learning: item.teaching_learning || null,
    assessment_guide: item.assessment_guide || null,
    keywords: item.keywords || [],
    // embedding은 별도 스크립트로 생성
  };
}

// ── 배치 upsert ──
async function batchUpsert(supabase, rows, batchSize) {
  const total = rows.length;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < total; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('curriculum_standards')
      .upsert(batch, {
        onConflict: 'code',
        ignoreDuplicates: false,
      })
      .select('code');

    if (error) {
      console.error(`  BATCH ERROR (${i}~${i + batch.length}): ${error.message}`);
      // 개별 행 재시도
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from('curriculum_standards')
          .upsert(row, { onConflict: 'code' });
        if (rowErr) {
          console.error(`    ROW ERROR [${row.code}]: ${rowErr.message}`);
          errors++;
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }

    // 진행 상황
    const pct = ((i + batch.length) / total * 100).toFixed(0);
    process.stdout.write(`\r  진행: ${i + batch.length}/${total} (${pct}%)`);
  }

  process.stdout.write('\n');
  return { inserted, errors };
}

// ── 메인 ──
async function main() {
  console.log('=== Supabase 성취기준 시드 ===\n');

  // 1. JSON 읽기
  if (!existsSync(INPUT_PATH)) {
    console.error(`ERROR: 입력 파일 없음: ${INPUT_PATH}`);
    console.error('먼저 ETL 스크립트를 실행하세요: node scripts/import-standards-full.mjs');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_PATH, 'utf-8'));
  console.log(`입력: ${INPUT_PATH}`);
  console.log(`총 ${raw.length}개 성취기준\n`);

  // 2. DB row 변환
  const dbRows = raw.map(toDbRow);

  // 유효성 검증
  const invalid = dbRows.filter(r => !r.code || !r.content || !r.subject);
  if (invalid.length > 0) {
    console.warn(`WARNING: ${invalid.length}개 불완전한 행 (code/content/subject 없음):`);
    invalid.slice(0, 5).forEach(r => console.warn(`  ${r.code || '(no code)'}`));
    // 불완전한 행 제외
    const valid = dbRows.filter(r => r.code && r.content && r.subject);
    console.log(`유효한 행: ${valid.length}개\n`);
  }

  const validRows = dbRows.filter(r => r.code && r.content && r.subject);

  // 통계
  const bySchool = {};
  validRows.forEach(r => {
    const sl = r.school_level || 'unknown';
    bySchool[sl] = (bySchool[sl] || 0) + 1;
  });
  console.log('[학교급별 분포]');
  Object.entries(bySchool).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log();

  // 3. Dry run 여부
  if (DRY_RUN) {
    console.log('[DRY RUN] DB에 쓰지 않습니다.');
    console.log(`upsert할 행: ${validRows.length}개`);
    console.log(`배치 크기: ${BATCH_SIZE}`);
    console.log(`배치 수: ${Math.ceil(validRows.length / BATCH_SIZE)}`);
    console.log('\n샘플 (첫 3행):');
    validRows.slice(0, 3).forEach(r => {
      console.log(JSON.stringify({
        code: r.code,
        subject: r.subject,
        school_level: r.school_level,
        grade_group: r.grade_group,
        has_explanation: !!r.explanation,
        has_competencies: !!r.competencies,
        has_content_system: !!r.content_system,
        keywords_count: r.keywords?.length || 0,
      }, null, 2));
    });
    return;
  }

  // 4. Supabase upsert
  const supabase = getSupabase();

  console.log(`Supabase upsert 시작 (batch=${BATCH_SIZE})...`);
  const start = Date.now();
  const { inserted, errors } = await batchUpsert(supabase, validRows, BATCH_SIZE);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n=== 완료 ===`);
  console.log(`  성공: ${inserted}개`);
  if (errors > 0) console.log(`  실패: ${errors}개`);
  console.log(`  소요시간: ${elapsed}초`);

  // 5. 검증: DB에서 카운트
  const { count, error } = await supabase
    .from('curriculum_standards')
    .select('*', { count: 'exact', head: true });

  if (!error) {
    console.log(`  DB 총 행: ${count}개`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
