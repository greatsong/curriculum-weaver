/**
 * AI에 보낼 대화 이력 창 — 결정적이고 앞부분이 고정되는 방식.
 *
 * 종전: "최근 전체 20개 + 현재 절차 12개" 병합. 턴마다 가장 오래된 메시지가 빠져 이력 앞부분이
 * 매번 바뀌었고, 그래서 프롬프트 캐시가 대화 구간에서 거의 적중하지 않았다(2026-10-10 운영 호출
 * 1,345건 재구성 시뮬레이션).
 *
 * 지금: 현재 절차 메시지가 20개 이하면 전부, 넘으면 시작점을 10개 단위로만 옮긴다(20~29개 유지).
 * 시작점이 0인 동안에는 절차 진입 직전 대화(다른 절차) 최대 8개를 앞에 붙여 흐름을 잇는다.
 * 창은 DB 순서와 메시지 수로만 정해지므로 같은 팀의 요청은 같은 접두어를 받는다.
 */

export const HISTORY_WINDOW_MIN = 20
export const HISTORY_WINDOW_STEP = 10
export const HISTORY_PRE_CONTEXT = 8

/**
 * @param {Object[]} procMessages - 현재 절차의 메시지(시간순, 현재 교사 메시지는 이미 뺀 것)
 * @param {Object[]} preMessages - 현재 절차 첫 메시지 직전의 메시지(시간순, 최대 HISTORY_PRE_CONTEXT개)
 * @returns {Object[]} 시간순 이력
 */
export function selectHistoryWindow(procMessages = [], preMessages = []) {
  const proc = (procMessages || []).filter((m) => m && m.sender_type !== 'system')
  const n = proc.length
  const start = n > HISTORY_WINDOW_MIN
    ? Math.floor((n - HISTORY_WINDOW_MIN) / HISTORY_WINDOW_STEP) * HISTORY_WINDOW_STEP
    : 0
  const windowed = proc.slice(start)
  if (start > 0) return windowed
  const pre = (preMessages || [])
    .filter((m) => m && m.sender_type !== 'system')
    .slice(-HISTORY_PRE_CONTEXT)
  return [...pre, ...windowed]
}
