// CommonMark 강조(emphasis) 인접 규칙 보정
//
// CommonMark는 닫는 `**` 바로 앞이 문장부호이고 바로 뒤에 글자가 붙으면
// (예: **"인용"**를, **제안(XML)**을, **『어린 왕자』**가) 닫는 구분자로
// 인정하지 않아 한국어 AI 답변에서 `**`가 리터럴로 노출된다.
// 짝을 이룬 `**...**`의 경계에 zero-width space(U+200B, 비공백·비문장부호)를
// 삽입해 구분자 인접 규칙을 통과시킨다. 코드 펜스/인라인 코드 구간은 건드리지 않는다.

const ZWSP = '​'
const PUNCT = /[\p{P}\p{S}]/u
const WS_OR_PUNCT = /[\s\p{P}\p{S}]/u

function fixSegment(text) {
  return text.replace(/\*\*([^*\n]+)\*\*/g, (match, inner, offset, str) => {
    const before = str[offset - 1] || ''
    const after = str[offset + match.length] || ''
    let body = inner
    // 여는 **: 뒤가 문장부호 + 앞이 글자면 왼쪽 구분자로 인정 안 됨
    if (PUNCT.test(inner[0]) && before && !/\s/.test(before)) {
      body = ZWSP + body
    }
    // 닫는 **: 앞이 문장부호 + 뒤가 글자면 오른쪽 구분자로 인정 안 됨
    if (PUNCT.test(inner[inner.length - 1]) && after && !WS_OR_PUNCT.test(after)) {
      body = body + ZWSP
    }
    return `**${body}**`
  })
}

// 인라인 코드(`...`)를 피해서 한 줄 안의 일반 텍스트만 보정
function fixLine(line) {
  if (!line.includes('`')) return fixSegment(line)
  return line
    .split(/(`+[^`]*`+)/)
    .map((seg) => (seg.startsWith('`') ? seg : fixSegment(seg)))
    .join('')
}

export function fixEmphasisFlanking(text) {
  if (!text || !text.includes('**')) return text
  let inFence = false
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        return line
      }
      return inFence ? line : fixLine(line)
    })
    .join('\n')
}
