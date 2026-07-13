/**
 * 성취기준 explanation — 교사 확인(원문 확정) 복원 (2026-07-13)
 *
 * 배경: PR #76이 explanation PUA 82건 중 58건을 자동 복원하고 24건을 교사 확인 대기로 보류.
 *   그중 17건을 담당 교사가 2022 개정 교육과정 원문으로 확정 → 이 스크립트로 반영한다.
 *
 * 저장 형식: 정본 content(√·xⁿ 등)와 클라이언트 MathText(유니코드 수식→KaTeX) 렌더 파이프라인에
 *   맞춰 유니코드 수식(√ ² ³ ∑ ½ ∛ ° π → 등)으로 저장. LaTeX 소스 아님.
 *
 * 보류 유지(7건): 원문 미제공/불완전 —
 *   [12경수02-06](부등식 영역 예시식 미확정),
 *   [12고대03-06]·[12고미01-05]·[12이수01-04]·[12전수01-07]·[12전수02-07]·[12전수03-09]
 *   (고려사항 용어·기호 나열부의 PUA — 우선순위 낮음).
 *
 * 비파괴: standards.js 헤더 보존, 지정한 code의 explanation만 교체. 다른 필드/구조 불변.
 * 안전장치: 대상 code가 없거나, 현재 explanation에 PUA가 없거나(이미 정상), 새 값에 PUA가 있으면 중단.
 *
 * 실행:
 *   node scripts/apply-explanation-teacher-fixes.mjs --dry-run
 *   node scripts/apply-explanation-teacher-fixes.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DRY = process.argv.includes('--dry-run')
const CANONICAL = path.join(ROOT, 'server', 'data', 'standards.js')

const isPua = (c) => { const cp = c.codePointAt(0); return cp >= 0xE000 && cp <= 0xF8FF }
const hasPua = (v) => typeof v === 'string' && [...v].some(isPua)

// ── 교사 확정 explanation (유니코드 수식) ──
const FIXES = {
  '[10공수1-01-03]': '다항식의 인수분해는 다음의 경우를 다룬다. a²+b²+c²+2ab+2bc+2ca=(a+b+c)², a³+3a²b+3ab²+b³=(a+b)³, a³-3a²b+3ab²-b³=(a-b)³, a³+b³=(a+b)(a²-ab+b²), a³-b³=(a-b)(a²+ab+b²)',
  '[10기수1-01-03]': '다항식의 인수분해는 다음의 인수분해 공식을 이용하는 간단한 수준으로 다룬다. ma+mb=m(a+b)',
  '[9수02-19]': '다항식의 곱셈과 다항식의 인수분해의 역관계를 이해하고, 이와 유사한 관계를 찾아보는 활동을 하게 한다. 다항식의 곱셈과 인수분해는 다음의 경우를 다룬다. m(a+b)=ma+mb, (a+b)²=a²+2ab+b², (a-b)²=a²-2ab+b², (a+b)(a-b)=a²-b², (x+a)(x+b)=x²+(a+b)x+ab, (ax+b)(cx+d)=acx²+(ad+bc)x+bd',
  '[10공수2-03-04]': '유리식은 유리함수의 의미를 이해할 수 있을 정도로 간단히 다루고, 유리함수는 y=(ax+b)/(cx+d)의 기본적인 형태를 중심으로 간단한 문제만 다룬다.',
  '[10기수2-03-04]': '유리식은 유리함수의 의미를 이해할 수 있을 정도로 간단히 다루고, 유리함수는 y=k/x 형태만 다룬다.',
  '[10공수2-03-05]': '무리식은 무리함수의 의미를 이해할 수 있을 정도로 간단히 다루고, 무리함수는 y=√(ax+b)+c의 기본적인 형태를 중심으로 간단한 문제만 다룬다.',
  '[10기수2-03-05]': '무리식은 무리함수의 의미를 이해할 수 있을 정도로 간단히 다루고, 무리함수는 y=√(ax) 형태만 다룬다.',
  '[9수02-22]': '이차함수 y=f(x)에서 최댓값과 최솟값은 x의 범위가 실수 전체인 경우만 다룬다.',
  '[12미적Ⅰ-03-03]': '닫힌구간 [a, b]에서 연속함수 f(x)의 함숫값이 음이 아닌 경우 함수 f(x)의 그래프와 x축으로 둘러싸인 도형의 넓이를 f(x)의 a에서 b까지의 정적분이라 하고, 이를 일반적인 연속함수에 대한 정적분의 정의로 확장한다.',
  '[12미적Ⅱ-02-01]': '지수함수와 로그함수의 극한은 지수함수 eˣ와 로그함수 ln x의 도함수를 구하는 데 필요한 정도로 간단히 다룬다.',
  '[12인수04-03]': '일차함수 형태의 추세선에 대하여 일변수함수로 정의된 손실함수만을 다룬다.',
  '[12고대02-05]': '대칭변환, 닮음변환, 회전변환은 R²→R²인 경우만 다룬다.',
  '[12대수03-05]': '여러 가지 수열의 합에서는 자연수의 거듭제곱의 합 ∑k, ∑k², ∑k³과 수열의 합이 간단한 것만 다룬다.',
  '[12고기01-03]': '대수적 수와 작도가능성을 이해하게 하고, 작도불가능한 수로 ∛2, cos 20°, π와 같은 예를 다룰 수 있다.',
  '[12고미03-07]': '테일러급수를 활용하여 sin 20°와 같은 수의 근삿값을 구하고, 함수의 극한을 구하는 과정을 다룰 수 있다.',
  '[12이수02-04]': 'n!, 집합의 분할, 수의 분할, 피보나치 수열, 하노이의 탑, 최대공약수 등의 재귀적 알고리즘을 다룰 수 있다.',
  '[6수04-05]': '가능성이 직관적으로 파악되는 생활 속의 간단한 사건에 대하여 그 가능성을 0, ½, 1 등과 같은 수로 표현하게 한다. 사건이 일어날 가능성과 일어나지 않을 가능성이 같은 경우에 사건이 일어날 가능성을 ½로 표현할 수 있음을 이해하게 한다.',
}

const { ALL_STANDARDS } = await import(CANONICAL + '?t=' + Date.now())
const byCode = new Map(ALL_STANDARDS.map((s) => [s.code, s]))

// 사전 검증
const errors = []
for (const [code, val] of Object.entries(FIXES)) {
  const s = byCode.get(code)
  if (!s) { errors.push(`${code}: 정본에 없음`); continue }
  if (hasPua(val)) { errors.push(`${code}: 새 값에 PUA 포함(비정상)`); continue }
  if (!hasPua(s.explanation)) errors.push(`${code}: 현재 explanation에 PUA 없음(이미 정상?) — before='${(s.explanation || '').slice(0, 40)}'`)
}
if (errors.length) {
  console.error('[검증 실패]\n  ' + errors.join('\n  '))
  process.exit(1)
}

const next = ALL_STANDARDS.map((s) => (FIXES[s.code] ? { ...s, explanation: FIXES[s.code] } : s))

console.log(`교사 확정 반영 대상: ${Object.keys(FIXES).length}건`)
for (const code of Object.keys(FIXES)) {
  const before = byCode.get(code).explanation.replace(new RegExp("[\\uE000-\\uF8FF]", "gu"), "◇").replace(/\s+/g, " ").trim()
  console.log(`\n${code}`)
  console.log(`  before: ${before.length > 80 ? before.slice(0, 80) + '…' : before}`)
  console.log(`  after : ${FIXES[code].length > 80 ? FIXES[code].slice(0, 80) + '…' : FIXES[code]}`)
}

// 반영 후 전체 잔존 PUA 재확인
const remainPua = next.filter((s) => hasPua(s.explanation)).map((s) => s.code)
console.log(`\n반영 후 explanation 잔존 PUA: ${remainPua.length}건`)
console.log('  ' + remainPua.join(', '))

if (!DRY) {
  const src = fs.readFileSync(CANONICAL, 'utf8')
  const marker = 'export const ALL_STANDARDS = '
  const headerEnd = src.indexOf(marker)
  if (headerEnd < 0) { console.error('standards.js에서 export 마커를 찾지 못함'); process.exit(1) }
  const header = src.slice(0, headerEnd)
  fs.writeFileSync(CANONICAL, header + marker + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n[저장] 정본 갱신 완료 (${Object.keys(FIXES).length}건): ${CANONICAL}`)
} else {
  console.log('\n(dry-run — 미저장)')
}
