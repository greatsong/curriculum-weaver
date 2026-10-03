/**
 * AI에게 보낼 대화 기록에서 "지금 보내는 선생님 메시지"를 뺀다.
 *
 * 화면은 선생님 메시지를 먼저 저장(POST /api/chat/teacher)한 뒤 AI를 부르고(POST /api/chat/message),
 * 서버는 최근 대화를 DB에서 불러온 다음 현재 메시지를 마지막 턴으로 한 번 더 붙인다(aiAgent.buildMessages).
 * 그래서 현재 메시지가 대화에 두 번 들어가, AI가 답마다 "같은 메시지가 두 번 들어와 한 번만
 * 반영했습니다"라고 적었다(2026-10-03 운영 제보. 7월 1일 최근 대화 조회로 바꾼 뒤 모든 요청에서 발생).
 *
 * 1) teacherMessageId(화면이 방금 저장한 메시지 번호)가 오면 그 메시지만 뺀다.
 *    번호가 기록에 없으면 중복도 없는 것이므로 아무것도 빼지 않는다.
 * 2) 번호가 없으면(배포 전에 열어 둔 옛 탭) 마지막 AI 응답 이후의 선생님 메시지 중 내용이 같은
 *    가장 최근 하나만 뺀다. 마지막 AI 응답보다 앞의 같은 말은 선생님이 실제로 반복한 것이라 남긴다.
 *
 * @param {Array<{id?: string, sender_type?: string, content?: string}>} messages 시간순 최근 대화
 * @param {{ teacherMessageId?: string, content?: string }} current
 * @returns {Array} 새 배열(원본은 바꾸지 않음)
 */
export function excludeCurrentTeacherMessage(messages, { teacherMessageId, content } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return Array.isArray(messages) ? messages : []

  if (teacherMessageId !== undefined && teacherMessageId !== null && teacherMessageId !== '') {
    const idx = messages.findIndex((m) => m && String(m.id) === String(teacherMessageId))
    if (idx === -1) return messages
    return [...messages.slice(0, idx), ...messages.slice(idx + 1)]
  }

  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) return messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m) continue
    if (m.sender_type === 'ai') break
    if (m.sender_type === 'teacher' && typeof m.content === 'string' && m.content.trim() === text) {
      return [...messages.slice(0, i), ...messages.slice(i + 1)]
    }
  }
  return messages
}
