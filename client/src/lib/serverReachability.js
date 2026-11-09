/**
 * 서버 연결 확인 — 화면(Vercel)은 열리는데 API 서버(Railway)에 닿지 않는 상황을 알아챈다.
 *
 * 학교·기관 망이 서버 주소를 차단하면 화면은 정상으로 보이고 기능만 동작하지 않아, 교사에게는
 * 서비스가 고장 난 것처럼 보였다(2026-10-19, 11-05, 11-10). 서버 상태 주소를 직접 불러 구분한다.
 */
import { API_BASE } from './api'

export const HEALTH_TIMEOUT_MS = 6_000
/** 연속으로 이만큼 실패해야 안내한다 — 한 번의 지연이나 배포 재시작으로는 띄우지 않는다 */
export const FAILURES_BEFORE_NOTICE = 2
export const RETRY_WHILE_DOWN_MS = 15_000
export const RECHECK_AFTER_FAILURE_MS = 4_000

/**
 * 서버 상태 주소를 한 번 부른다. 응답이 오면(상태 코드와 무관하게) 서버에 닿은 것이다.
 * @returns {Promise<boolean>} 서버에 닿았으면 true
 */
export async function pingServer({ fetchImpl = globalThis.fetch, timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // no-cors: 응답 내용은 읽지 않고 닿았는지만 본다. CORS 설정과 무관하게 연결 실패만 예외가 된다.
    await fetchImpl(`${API_BASE}/api/health`, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 연속 실패 횟수와 기기의 인터넷 연결 여부로 안내 종류를 정한다.
 * @returns {'ok'|'offline'|'blocked'}
 *   offline: 기기의 인터넷 연결이 끊김 / blocked: 인터넷은 되는데 서버에만 닿지 않음
 */
export function classifyReachability({ failures, online }) {
  if (failures < FAILURES_BEFORE_NOTICE) return 'ok'
  return online === false ? 'offline' : 'blocked'
}

export const REACHABILITY_MESSAGES = Object.freeze({
  offline: '인터넷 연결이 끊겼습니다. 연결을 확인하면 자동으로 다시 시도합니다.',
  blocked: '서버에 연결할 수 없습니다. 지금 사용하는 망에서 서버 주소가 차단되었을 수 있습니다. 다른 망(휴대전화 연결 등)에서 다시 열어 보세요.',
})
