/**
 * 성취기준 explanation 필드의 HWP 수식/기호 폰트 PUA(U+E000–U+F8FF) 글리프 복원 (2026-07-13)
 *
 * 배경: PR #75가 content의 PUA만 복원하고 explanation은 놓침 → 화면에서 빈칸·네모로 깨짐(82건).
 *   - 수학과 32건: 다양한 수식 글리프. 확정 매핑만 적용, 미확정 공식류는 손대지 않고 보류 목록으로.
 *   - 체육과 50건: 전부 단일 U+F09F 하나, 항상 문장 끝(완결 문장 뒤)에 붙은 잉여 마커.
 *     동일 학년/과목의 오염 없는 형제 해설 30건이 모두 마커 없이 "…한다."로 끝나므로,
 *     해당 후행 " +U+F09F"는 잉여 글리프임이 확정됨 → 제거해 정본 형제와 동일 형태로 복원.
 *
 * 원칙: 계수·기호를 추정하지 않는다. 확정 매핑(아래 CONFIRMED)에 없는 PUA가 하나라도
 *   포함된 레코드는 건너뛰고 scripts/results/explanation-pua-remaining.json 에 교사 확인용으로 기록.
 *
 * 비파괴: standards.js의 헤더를 보존하고 explanation 필드만 교체(다른 필드/구조 불변).
 *
 * 실행:
 *   node scripts/fix-explanation-pua.mjs --dry-run   # 미저장, 리포트만
 *   node scripts/fix-explanation-pua.mjs             # 정본 standards.js 갱신 + remaining 기록
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DRY = process.argv.includes('--dry-run')

const CANONICAL = path.join(ROOT, 'server', 'data', 'standards.js')
const REMAINING = path.join(ROOT, 'scripts', 'results', 'explanation-pua-remaining.json')

const isPua = (c) => { const cp = c.codePointAt(0); return cp >= 0xE000 && cp <= 0xF8FF }
const hasPua = (v) => typeof v === 'string' && [...v].some(isPua)
const puaHex = (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase()

// ── 확정 PUA→문자 매핑 ──
//  (a) fix-pua-20260713.json(교사 확인 원문 복원)에서 확정된 것:
//      E035=2, E036=3, E047='='(등호), E0F2=n, E0FC=x
//  (b) 문맥상 유일 해석(캐논 표현):
//      E0F1=m  — 'm×n 행렬'(canonical) + 'N(m,σ²)' 두 독립 문맥에서 일관
//  각 레코드는 자신이 가진 PUA가 전부 이 표에 있을 때만 디코딩된다(부분 복원 금지).
const CONFIRMED = {
  'U+E035': '2',
  'U+E036': '3',
  'U+E047': '=',
  'U+E0F2': 'n',
  'U+E0FC': 'x',
  'U+E0F1': 'm',
}

const decodeConfirmed = (text) =>
  [...text].map((c) => (isPua(c) ? (CONFIRMED[puaHex(c)] ?? c) : c)).join('')

// 체육 후행 마커 제거: 문자열 끝의 (공백)*U+F09F(공백)* 제거
const stripTrailingF09F = (text) =>
  text.replace(/[\s\uF09F]*\uF09F[\s\uF09F]*$/u, '')

const maskDiamond = (text) =>
  [...text].map((c) => (isPua(c) ? '◇' : c)).join('')

const { ALL_STANDARDS } = await import(CANONICAL + '?t=' + Date.now())

const fixedMath = []
const fixedChe = []
const remaining = []

const next = ALL_STANDARDS.map((s) => {
  if (!hasPua(s.explanation)) return s
  const orig = s.explanation
  const distinct = [...new Set([...orig].filter(isPua).map(puaHex))]

  // ── 체육: 단일 후행 U+F09F 잉여 마커 제거 ──
  if (s.subject === '체육' && distinct.length === 1 && distinct[0] === 'U+F09F') {
    const out = stripTrailingF09F(orig)
    if (hasPua(out)) { // 안전장치: 제거 후에도 PUA가 남으면 손대지 않음
      remaining.push(recordRemaining(s, orig, distinct, '체육 F09F 제거 후 잔여 PUA — 비정상, 보류'))
      return s
    }
    fixedChe.push({ code: s.code, before: orig.slice(-24), after: out.slice(-18) })
    return { ...s, explanation: out }
  }

  // ── 수학 등: 확정 매핑으로 전부 커버되는 경우에만 디코딩 ──
  const uncovered = distinct.filter((h) => !(h in CONFIRMED))
  if (uncovered.length === 0) {
    const out = decodeConfirmed(orig)
    if (hasPua(out)) {
      remaining.push(recordRemaining(s, orig, distinct, '디코딩 후 잔여 PUA — 보류'))
      return s
    }
    fixedMath.push({ code: s.code, subject: s.subject, cps: distinct, before: excerpt(orig), after: excerpt(out) })
    return { ...s, explanation: out }
  }

  // ── 미확정 PUA 포함 → 교사 확인 대기 ──
  remaining.push(recordRemaining(s, orig, distinct, `미확정 PUA ${uncovered.length}종 포함`))
  return s
})

function excerpt(text) {
  // PUA 주변을 보여주기 위해 masked 형태로 앞부분 축약
  const m = maskDiamond(text).replace(/\s+/g, ' ').trim()
  return m.length > 90 ? m.slice(0, 90) + '…' : m
}
function recordRemaining(s, orig, distinct, reason) {
  return {
    code: s.code,
    subject: s.subject,
    field: 'explanation',
    codepoints: distinct,
    reason,
    masked: maskDiamond(orig),
  }
}

console.log(`PUA 포함 explanation 총 ${fixedMath.length + fixedChe.length + remaining.length}건`)
console.log(`  자동 복원: 수학류 ${fixedMath.length}건 + 체육 ${fixedChe.length}건 = ${fixedMath.length + fixedChe.length}건`)
console.log(`  교사 확인 대기(remaining): ${remaining.length}건`)

console.log('\n[수학류 복원 상세]')
for (const f of fixedMath) console.log(`  ${f.code} (${f.subject}) ${f.cps.join(',')}\n     → ${f.after}`)

console.log('\n[체육 복원 샘플 5건] (후행 " +U+F09F" 제거)')
for (const f of fixedChe.slice(0, 5)) console.log(`  ${f.code}: …${JSON.stringify(f.before)} → …${JSON.stringify(f.after)}`)

if (!DRY) {
  const src = fs.readFileSync(CANONICAL, 'utf8')
  const marker = 'export const ALL_STANDARDS = '
  const headerEnd = src.indexOf(marker)
  if (headerEnd < 0) { console.error('standards.js에서 export 마커를 찾지 못함'); process.exit(1) }
  const header = src.slice(0, headerEnd)
  fs.writeFileSync(CANONICAL, header + marker + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n[저장] 정본 갱신 완료: ${CANONICAL}`)

  fs.mkdirSync(path.dirname(REMAINING), { recursive: true })
  fs.writeFileSync(REMAINING, JSON.stringify({
    generated_at: '2026-07-13',
    note: '성취기준 explanation의 미확정 HWP 수식 PUA — 교사 확인/교육과정 원문 필요. ◇=미확정 PUA 위치. 추정 금지.',
    confirmed_map: CONFIRMED,
    count: remaining.length,
    records: remaining,
  }, null, 2))
  console.log(`[저장] 교사 확인 대기 목록: ${REMAINING} (${remaining.length}건)`)
} else {
  console.log('\n(dry-run — 미저장)')
}
