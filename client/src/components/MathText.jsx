import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// 성취기준 content/explanation은 "한국어 평문 + 인라인 수식"이 섞여 있다.
// (예: "무리함수 y=√(ax+b)+c의 그래프를 그릴 수 있고, ...")
// 문장 전체를 KaTeX로 넘기면 한글이 깨지므로, 수식 구간만 골라 렌더한다.
//
// 설계 원칙
//  1) text를 [평문 런 | 수식 후보 런]으로 분절한다. 수식 후보 런은 라틴 문자/숫자와
//     수학 기호(= + - / × ÷ √ ∑ ∫ π 위첨자 등)로만 이루어진 최대 연속 구간이다.
//     공백은 런에 포함하지 않는다 → "y=xⁿ (n은 양의 정수)" 같은 경우 뒤의 한글 괄호절이
//     평문으로 남아 깔끔하다.
//  2) 후보 런이라도 "진짜 수식 신호"(√·위첨자·∑ 등 강한 기호 또는 피연산자 사이의
//     이항연산자)가 없으면 평문으로 취급한다 → [2수04-03]의 "○, ×, /" 같은 기호 열거를
//     오탐하지 않는다.
//  3) 변환/렌더 실패 시 원문 텍스트로 폴백한다(빈칸·에러 노출 금지).

// 위첨자 유니코드 → 일반 문자
const SUPERSCRIPT_MAP = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
  'ⁱ': 'i', 'ⁿ': 'n',
}

// 아래첨자 유니코드 → 일반 문자 (드물지만 방어)
const SUBSCRIPT_MAP = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₍': '(', '₎': ')',
}

// 단일 기호 유니코드 → LaTeX 명령
const SYMBOL_MAP = {
  '×': '\\times ', // ×
  '÷': '\\div ',   // ÷
  '≤': '\\leq ',   // ≤
  '≥': '\\geq ',   // ≥
  '≠': '\\neq ',   // ≠
  '±': '\\pm ',    // ±
  '∑': '\\sum ',   // ∑
  '∏': '\\prod ',  // ∏
  '∫': '\\int ',   // ∫
  'π': '\\pi ',    // π
  '∞': '\\infty ', // ∞
  '∈': '\\in ',    // ∈
  '∉': '\\notin ', // ∉
  '⊆': '\\subseteq ', // ⊆
  '⊂': '\\subset ',   // ⊂
  '→': '\\to ',    // →
  '≈': '\\approx ', // ≈
  '√': '\\sqrt', // √ (뒤에서 별도 처리하지만 폴백용)
}

const SUPERSCRIPT_CHARS = Object.keys(SUPERSCRIPT_MAP).join('')
const SUBSCRIPT_CHARS = Object.keys(SUBSCRIPT_MAP).join('')

// 수식 후보 런에 포함될 수 있는 문자(공백 제외)
const MATH_CHAR_CLASS = new RegExp(
  '[A-Za-z0-9=+\\-*/^()\\[\\]{}.,' +
    '√∑∏∫π∞≤≥≠±×÷' +
    '∈∉⊆⊂→≈' +
    SUPERSCRIPT_CHARS +
    SUBSCRIPT_CHARS +
    ']'
)

// "진짜 수식"인지 판정하는 강한 신호
const STRONG_SIGNAL = new RegExp(
  '[√∑∏∫π∞≤≥≠±∈∉⊆⊂≈' +
    SUPERSCRIPT_CHARS +
    SUBSCRIPT_CHARS +
    ']'
)
// 피연산자 사이의 이항연산자 (예: 2×2, y=x, x+b, )/( )
const BINARY_EXPR = /[A-Za-z0-9)\]][=×÷/+\-*][A-Za-z0-9(\[√]/u

function isMathRun(run) {
  if (STRONG_SIGNAL.test(run)) return true
  if (BINARY_EXPR.test(run)) return true
  return false
}

// 수식 후보 런에서 괄호가 균형 잡힌 최장 접두부 길이를 구한다.
// 뒤에 열린 괄호가 한글 절을 여는 경우(예: "xⁿ(n은 실수)")를 잘라내
// 매달린 "(" 가 KaTeX로 새어나가지 않도록 한다.
function balancedPrefixLen(run) {
  let depth = 0
  let safeEnd = 0 // depth가 0으로 돌아온 마지막 지점(=균형 접두부 끝)
  for (let i = 0; i < run.length; i++) {
    const c = run[i]
    if (c === '(') {
      depth++
    } else if (c === ')') {
      if (depth === 0) {
        // 짝 없는 닫는 괄호 → 여기서 자른다
        return safeEnd
      }
      depth--
      if (depth === 0) safeEnd = i + 1
    } else if (depth === 0) {
      safeEnd = i + 1
    }
  }
  return depth === 0 ? run.length : safeEnd
}

// run 안에서 idx의 여는 괄호에 대응하는 닫는 괄호 위치를 찾는다
function matchParen(str, openIdx) {
  let depth = 0
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '(') depth++
    else if (str[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// 유니코드 수식 런 → LaTeX
function unicodeRunToLatex(input) {
  // 1) 분수 (A)/(B) → \dfrac{A}{B} (중첩 없는 단순형)
  let run = input.replace(/\(([^()]+)\)\/\(([^()]+)\)/g, (_m, a, b) => `\\dfrac{${a}}{${b}}`)

  // 2) 문자 스캔하며 √ / 위첨자 / 기호 변환
  let out = ''
  let i = 0
  while (i < run.length) {
    const ch = run[i]

    // √: 뒤 괄호가 인자면 \sqrt{...}, 아니면 다음 토큰을 인자로
    if (ch === '√') {
      if (run[i + 1] === '(') {
        const close = matchParen(run, i + 1)
        if (close !== -1) {
          const inner = run.slice(i + 2, close)
          out += '\\sqrt{' + unicodeRunToLatex(inner) + '}'
          i = close + 1
          continue
        }
      }
      // 괄호 없는 경우: 이어지는 영숫자/위첨자 토큰을 인자로
      let j = i + 1
      let token = ''
      while (j < run.length && /[A-Za-z0-9]/.test(run[j])) {
        token += run[j]
        j++
      }
      out += token ? `\\sqrt{${token}}` : '\\sqrt{\\ }'
      i = j
      continue
    }

    // 위첨자 런 → ^{...}
    if (SUPERSCRIPT_MAP[ch]) {
      let sup = ''
      while (i < run.length && SUPERSCRIPT_MAP[run[i]]) {
        sup += SUPERSCRIPT_MAP[run[i]]
        i++
      }
      out += `^{${sup}}`
      continue
    }

    // 아래첨자 런 → _{...}
    if (SUBSCRIPT_MAP[ch]) {
      let sub = ''
      while (i < run.length && SUBSCRIPT_MAP[run[i]]) {
        sub += SUBSCRIPT_MAP[run[i]]
        i++
      }
      out += `_{${sub}}`
      continue
    }

    // 단일 기호
    if (SYMBOL_MAP[ch]) {
      out += SYMBOL_MAP[ch]
      i++
      continue
    }

    // 그 외(영숫자, = + - ( ) { } \ 등)는 그대로
    out += ch
    i++
  }
  return out
}

// text를 세그먼트 배열로 분절. 각 세그먼트는 {math:boolean, raw:string, html?:string}
function segmentText(text) {
  if (!text || typeof text !== 'string') return []
  const segments = []
  let lastIndex = 0
  // 공백을 제외한 수식 후보 런
  const runRe = new RegExp(MATH_CHAR_CLASS.source + '+', 'g')
  let m
  while ((m = runRe.exec(text)) !== null) {
    const fullRun = m[0]
    const start = m.index
    // 앞의 평문
    if (start > lastIndex) {
      segments.push({ math: false, raw: text.slice(lastIndex, start) })
    }
    // 괄호 균형 접두부만 수식 후보로, 나머지(한글 절 여는 괄호 등)는 평문으로
    const cut = balancedPrefixLen(fullRun)
    const run = fullRun.slice(0, cut)
    const rest = fullRun.slice(cut)
    if (run && isMathRun(run)) {
      try {
        const latex = unicodeRunToLatex(run)
        const html = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: false,
          output: 'htmlAndMathml',
        })
        segments.push({ math: true, raw: run, html })
      } catch {
        // 변환/렌더 실패 → 원문 폴백
        segments.push({ math: false, raw: run })
      }
    } else if (run) {
      // 수식 신호 없는 후보 런(예: "○, ×, /"의 단독 기호) → 평문
      segments.push({ math: false, raw: run })
    }
    // 균형 접두부 뒤에 남은 부분(한글 절을 여는 괄호 등)은 평문
    if (rest) {
      segments.push({ math: false, raw: rest })
    }
    lastIndex = start + fullRun.length
  }
  if (lastIndex < text.length) {
    segments.push({ math: false, raw: text.slice(lastIndex) })
  }
  return segments
}

/**
 * 한국어 평문 + 인라인 수식을 함께 렌더한다.
 * @param {{ text?: string, children?: string, className?: string, as?: string }} props
 */
export default function MathText({ text, children, className, as: As = 'span' }) {
  const source = typeof text === 'string' ? text : typeof children === 'string' ? children : ''
  const segments = useMemo(() => segmentText(source), [source])

  if (!source) return null
  // 수식이 하나도 없으면 문자열만 반환(불필요한 span 중첩 방지)
  const hasMath = segments.some((s) => s.math)
  if (!hasMath) {
    return As === 'span' && !className ? source : <As className={className}>{source}</As>
  }

  return (
    <As className={className}>
      {segments.map((seg, idx) =>
        seg.math ? (
          <span key={idx} dangerouslySetInnerHTML={{ __html: seg.html }} />
        ) : (
          <span key={idx}>{seg.raw}</span>
        )
      )}
    </As>
  )
}

// 테스트/재사용을 위해 내부 함수 노출
export { segmentText, unicodeRunToLatex, isMathRun }
