/**
 * AI 답의 빈 코드 울타리 정리 (2026-10-10)
 *
 * 루나(GPT-6)가 제안 블록(<ai_suggestion> 등)을 ```xml … ```로 감싸는 경우가 있다(운영 첫 응답, 시험 95건 중 1~4건).
 * 블록만 지우면 빈 코드 상자가 남아 화면에 보였다.
 */
/**
 * 줄 머리의 ``` 울타리를 순서대로 여닫는 짝으로 묶어, 안이 공백뿐인 짝과
 * 짝 없이 끝에 남은 여는 울타리(뒤가 공백뿐)를 지운다. 내용이 있는 코드 블록은 그대로 둔다.
 * 서버 저장본(server/lib/aiMarkup.js)과 화면 스트리밍(client/src/stores/chatStore.js)이 함께 사용한다.
 */
export function stripEmptyCodeFences(text) {
  if (typeof text !== 'string' || !text.includes('```')) return text || ''
  const re = /(^|\n)[ \t]*```[\w-]*[ \t]*(?=\n|$)/g
  const fences = []
  let m
  while ((m = re.exec(text))) fences.push({ start: m.index + m[1].length, end: re.lastIndex })
  const cuts = []
  for (let i = 0; i < fences.length; i += 2) {
    const open = fences[i]
    const close = fences[i + 1]
    if (close) {
      if (!text.slice(open.end, close.start).trim()) cuts.push([open.start, close.end])
    } else if (!text.slice(open.end).trim()) {
      cuts.push([open.start, text.length])
    }
  }
  let out = text
  for (const [a, b] of cuts.reverse()) out = out.slice(0, a) + out.slice(b)
  return out
}
