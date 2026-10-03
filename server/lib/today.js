/**
 * AI 프롬프트용 "오늘 날짜" (한국 시간 기준)
 *
 * 2026-10-03 요청: AI가 오늘 날짜를 몰라 팀 일정·기간을 제안할 때 이미 지난 날짜로 잡거나
 * 안내문 예시의 날짜(4.1~4.7 등)를 그대로 옮겼다. 서버는 UTC로 돌 수 있으므로 반드시
 * Asia/Seoul로 계산한다(한국 자정~오전 9시에 하루 전 날짜가 들어가는 일을 막는다).
 */

const KST_PARTS = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
})

/**
 * @param {Date} [now]
 * @returns {string} 예: "2026년 10월 3일(토)"
 */
export function formatKoreanToday(now = new Date()) {
  const p = Object.fromEntries(KST_PARTS.formatToParts(now).map((x) => [x.type, x.value]))
  return `${p.year}년 ${p.month}월 ${p.day}일(${p.weekday})`
}

/**
 * 시스템 프롬프트에 넣는 오늘 날짜 섹션.
 * @param {Date} [now]
 */
export function buildTodayPromptSection(now = new Date()) {
  return `[오늘 날짜]
${formatKoreanToday(now)}, 한국 시간
- 일정·기간·마감일을 제안하거나 계산할 때는 이 날짜를 기준으로 한다. 이미 지난 날짜로 일정을 잡지 않는다.
- 안내문이나 활동 사례에 나온 날짜(예: 4.1~4.7)는 예시일 뿐이므로 그대로 옮기지 않는다.
- 교사가 수업 시기나 학사 일정을 알려 주면 그 정보를 우선한다.`
}
