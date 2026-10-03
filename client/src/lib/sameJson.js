/**
 * 서버에서 다시 받은 값이 지금 상태와 같은지(JSON 기준) 판단한다.
 *
 * 2026-10-03 제보: 탭에서 나갔다 돌아오면 바뀐 내용이 없어도 모든 상태가 새 객체로 교체돼
 * 채팅이 맨 아래로 미끄러지고 보드 재로딩이 연쇄로 한 번 더 돌았다(복귀 1회에 API 13회).
 * 같으면 기존 참조를 그대로 두어 화면·effect가 반응하지 않게 한다.
 * 비교에 실패하거나(순환 참조 등) 키 순서가 달라 다르게 보이면 "다름"으로 보고
 * 예전처럼 새 값으로 교체한다 — 틀려도 기존 동작으로 돌아갈 뿐 데이터가 낡지 않는다.
 */
export function sameJson(a, b) {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
