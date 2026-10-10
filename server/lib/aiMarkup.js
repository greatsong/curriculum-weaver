/**
 * AI 답을 저장·표시하기 전에 남은 제안 원문(XML 블록)을 지운다.
 *
 * 정상 응답의 블록은 파서(parseAISuggestions 등)가 먼저 꺼내 지운다. 하지만 AI 출력이 길이 한도에서
 * 끊기면 닫는 태그가 없어 파서가 못 잡고, 원문 JSON이 메시지 본문에 그대로 저장돼 화면에 보였다
 * (2026-10-03 운영: 4,823자 답 끝에 닫히지 않은 <ai_suggestion …).
 *
 * 1) 남아 있는 완결 블록과 self-closing 태그를 지운다(본문 뒤쪽을 지우지 않게 먼저 처리).
 * 2) 닫히지 않은 블록은 여는 태그부터 끝까지 지운다(끊긴 제안 원문).
 * 3) 짝 없는 닫는 태그를 지운다.
 * 4) 블록을 지운 자리에 남은 빈 코드 울타리를 지운다. 루나(GPT-6)가 제안 블록을 ```xml … ```로 감싸는
 *    경우가 있어(2026-10-10 운영·시험 95건 중 1~4건), 블록만 지우면 빈 코드 상자가 화면에 남았다.
 */
import { stripEmptyCodeFences } from 'curriculum-weaver-shared/codeFence.js'

const TAGS = 'ai_suggestion|coherence_check|procedure_advance|board_update|stage_advance'
const COMPLETE = new RegExp(`<(${TAGS})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'g')
const SELF_CLOSING = new RegExp(`<(?:${TAGS})\\b[^>]*\\/>`, 'g')
const UNCLOSED_TO_END = new RegExp(`<(?:${TAGS})\\b[\\s\\S]*$`)
const STRAY_CLOSING = new RegExp(`<\\/(?:${TAGS})>`, 'g')

export function stripLeftoverAiMarkup(text) {
  if (typeof text !== 'string' || !text) return ''
  const stripped = text
    .replace(COMPLETE, '')
    .replace(SELF_CLOSING, '')
    .replace(UNCLOSED_TO_END, '')
    .replace(STRAY_CLOSING, '')
  return stripEmptyCodeFences(stripped)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
