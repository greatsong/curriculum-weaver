/**
 * 성취기준 explanation — 교육부 고시 원문 확정 복원 (2026-07-13)
 *
 * 배경: PR #77 이후 남은 explanation 보류 7건(전문/고급/진로선택 수학과 과학계열 전문교과)을
 *   교육부 고시 제2022-33호 [별책8 수학과]·[별책20 과학 계열 선택 과목] HWP 원문의
 *   수식 객체(EQEDIT)를 직접 판독해 확정. 깨진 수식 기호(◇)를 원문 기호로 채우고,
 *   데이터에서 잘린 '용어와 기호' 목록을 원문대로 완전 복원, 페이지/섹션 bleed 제거.
 *
 * 확정값 소스: scripts/results/explanation-gosi-fixes.json
 * 저장 형식: 정본 content 및 클라이언트 MathText 렌더와 일관된 유니코드 수식(⁻¹ ₙ ᵣ ∫ ∏ ² 등).
 *
 * 비파괴: 헤더 보존, 지정 code의 explanation만 교체. 안전장치: code 존재·현재 PUA 보유·새 값 PUA 0 검사.
 *
 * 실행: node scripts/apply-explanation-gosi-fixes.mjs [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DRY = process.argv.includes('--dry-run')
const CANONICAL = path.join(ROOT, 'server', 'data', 'standards.js')
const FIXES_JSON = path.join(ROOT, 'scripts', 'results', 'explanation-gosi-fixes.json')

const isPua = (c) => { const cp = c.codePointAt(0); return cp >= 0xE000 && cp <= 0xF8FF }
const hasPua = (v) => typeof v === 'string' && [...v].some(isPua)

const FIXES = JSON.parse(fs.readFileSync(FIXES_JSON, 'utf8')).fixes
const { ALL_STANDARDS } = await import(CANONICAL + '?t=' + Date.now())
const byCode = new Map(ALL_STANDARDS.map((s) => [s.code, s]))

const errors = []
for (const [code, val] of Object.entries(FIXES)) {
  const s = byCode.get(code)
  if (!s) { errors.push(`${code}: 정본에 없음`); continue }
  if (hasPua(val)) { errors.push(`${code}: 새 값에 PUA 포함(비정상)`); continue }
  if (!hasPua(s.explanation)) errors.push(`${code}: 현재 explanation에 PUA 없음(이미 정상?)`)
}
if (errors.length) { console.error('[검증 실패]\n  ' + errors.join('\n  ')); process.exit(1) }

const next = ALL_STANDARDS.map((s) => (FIXES[s.code] ? { ...s, explanation: FIXES[s.code] } : s))

console.log(`고시 원문 확정 반영 대상: ${Object.keys(FIXES).length}건`)
for (const code of Object.keys(FIXES)) console.log(`  ${code} → ${FIXES[code].replace(/\s+/g, ' ').slice(0, 70)}…`)

const remainPua = next.filter((s) => hasPua(s.explanation)).map((s) => s.code)
const allPua = next.filter((s) => Object.keys(s).some((k) => typeof s[k] === 'string' && hasPua(s[k]))).map((s) => s.code)
console.log(`\n반영 후 explanation 잔존 PUA: ${remainPua.length}건 [${remainPua.join(', ')}]`)
console.log(`반영 후 전체 필드 잔존 PUA: ${allPua.length}건 [${allPua.join(', ')}]`)

if (!DRY) {
  const src = fs.readFileSync(CANONICAL, 'utf8')
  const marker = 'export const ALL_STANDARDS = '
  const headerEnd = src.indexOf(marker)
  if (headerEnd < 0) { console.error('export 마커 없음'); process.exit(1) }
  fs.writeFileSync(CANONICAL, src.slice(0, headerEnd) + marker + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n[저장] 정본 갱신 완료 (${Object.keys(FIXES).length}건)`)
} else {
  console.log('\n(dry-run — 미저장)')
}
