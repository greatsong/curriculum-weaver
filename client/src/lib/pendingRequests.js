/**
 * 끝나지 않은 쓰기 요청(POST·PUT·PATCH·DELETE) 수.
 * 저장 도중에 새 배포 자동 새로고침이 일어나 요청이 끊기지 않게 api.js가 센다.
 */
let count = 0

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * 쓰기 요청이면 수를 하나 올리고, 끝낼 때 부를 함수를 돌려준다(여러 번 불러도 한 번만 내린다).
 * 읽기 요청이면 아무것도 하지 않는 함수를 돌려준다.
 * @param {string} [method]
 */
export function beginWriteRequest(method = 'GET') {
  if (READ_METHODS.has(String(method || 'GET').toUpperCase())) return () => {}
  count += 1
  let ended = false
  return () => {
    if (ended) return
    ended = true
    count = Math.max(0, count - 1)
  }
}

export function getPendingWriteCount() {
  return count
}

/** 테스트 전용 */
export function resetPendingWritesForTest() {
  count = 0
}
