/**
 * verify-standards-supabase.mjs
 *
 * 검증: "검색 API가 반환하는 모든 code가 Supabase에서 resolveStandardId로 조회되는가"
 *
 * 검색 런타임 단일 소스인 정본(server/data/standards.js, ALL_STANDARDS)의 모든 code가
 * Supabase curriculum_standards 테이블에 존재하는지(= resolveStandardId가 id를 돌려주는지)
 * 확인한다. 읽기 전용 — DB에 아무것도 쓰지 않는다.
 *
 * 실행:
 *   node --env-file=server/.env scripts/verify-standards-supabase.mjs
 *   (또는 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 export 후 실행)
 */

import { createClient } from '@supabase/supabase-js';
import { ALL_STANDARDS } from '../server/data/standards.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  process.exit(1);
}
const sb = createClient(url, key);

// 정본 코드 집합 (검색이 반환할 수 있는 전체 code)
const canonicalSet = new Set(ALL_STANDARDS.map(s => s.code));
const canonicalCodes = [...canonicalSet];
console.log(`[정본] standards.js code: ${canonicalCodes.length}개 (rows=${ALL_STANDARDS.length})`);

// Supabase 전체 code를 페이지네이션으로 수집
async function fetchAllDbCodes() {
  const codes = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('curriculum_standards')
      .select('code')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`DB code 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) codes.add(r.code);
    if (data.length < PAGE) break;
  }
  return codes;
}

const dbCodes = await fetchAllDbCodes();
console.log(`[Supabase] curriculum_standards code: ${dbCodes.size}개\n`);

// 1) 정본 → DB: 누락된(=resolve 실패) code
const missingInDb = canonicalCodes.filter(c => !dbCodes.has(c));
// 2) DB → 정본: 정본에 없는 잉여 code (검색에는 안 나오지만 FK 보유 가능)
const extraInDb = [...dbCodes].filter(c => !canonicalSet.has(c));

console.log('=== 검증 결과 ===');
console.log(`정본 code 중 Supabase에 누락: ${missingInDb.length}개`);
if (missingInDb.length > 0) {
  console.log('  누락 샘플(최대 30):', missingInDb.slice(0, 30).join(' '));
}
console.log(`Supabase 잉여(정본 외) code: ${extraInDb.length}개`);
if (extraInDb.length > 0) {
  console.log('  잉여 샘플(최대 30):', extraInDb.slice(0, 30).join(' '));
}

// resolveStandardId 동등성 스팟체크: 임의 code 5개가 실제 id로 해석되는지
const sample = canonicalCodes.slice(0, 5);
const { data: resolved } = await sb
  .from('curriculum_standards')
  .select('code,id')
  .in('code', sample);
console.log('\n[resolveStandardId 스팟체크]');
for (const code of sample) {
  const hit = (resolved || []).find(r => r.code === code);
  console.log(`  ${code} -> ${hit ? hit.id : 'MISS'}`);
}

console.log(
  missingInDb.length === 0
    ? '\n✅ PASS: 검색이 반환하는 모든 code가 Supabase에서 조회됨'
    : `\n❌ FAIL: ${missingInDb.length}개 code가 Supabase에 없음 (재시드 필요)`
);
process.exit(missingInDb.length === 0 ? 0 : 1);
