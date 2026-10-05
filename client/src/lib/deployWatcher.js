/**
 * 새 배포 감시 장치 — 열린 탭이 새 배포를 알아채고 최신 코드로 바뀌게 한다.
 *
 * 배경(2026-10-05): 10/3 오후에 연 탭을 이틀 넘게 새로고침 없이 쓰는 동안 채팅 전송 잠금 수정이
 * 배포됐지만, 그 탭은 옛 코드로 돌아 두 AI 답이 한 칸에 섞였다. 그래서
 * - 번들에 박힌 빌드 식별자(__APP_BUILD_ID__)와 /version.json을 비교해 새 배포를 감지하고
 * - 화면 상단에 안내를 띄우며
 * - 안전할 때만(입력 손실 0) 자동으로 새로고침한다.
 *
 * 감지 시점: 탭이 다시 보일 때, focus, online, 탭이 보이는 동안 일정 간격. 숨은 탭은 요청하지 않는다.
 * 자동 새로고침 시점: 일정 시간 이상 숨었던 탭이 다시 보일 때, 앱 안에서 페이지(경로)를 옮길 때.
 *
 * 외부 의존(fetch, document, 저장소, 안전 판정, 새로고침)은 모두 주입받아 테스트할 수 있다.
 */
import {
  normalizeBuildId,
  parseVersionResponse,
  hasNewDeploy,
  isAutoReloadPath,
  canAutoReload,
  rememberAutoReload,
} from './deployVersion'

export const DEPLOY_POLL_MS = 5 * 60_000 // 보이는 탭의 확인 간격
export const MIN_HIDDEN_MS_FOR_AUTO_RELOAD = 60_000 // 이만큼 숨었다 돌아와야 자동 새로고침
export const MIN_CHECK_GAP_MS = 30_000 // focus 등 잦은 이벤트의 확인 최소 간격
export const VERSION_FETCH_TIMEOUT_MS = 10_000

const INITIAL_STATE = Object.freeze({
  updateAvailable: false, // 새 배포를 감지했는지
  remoteId: null, // 서버의 빌드 식별자
  dismissed: false, // 사용자가 안내를 닫았는지 (다시 보이면 되살린다)
  blockedReasons: null, // 마지막 자동 새로고침을 막은 이유
  autoReloadLimited: false, // 같은 배포로의 자동 새로고침을 이미 한 번 했는지
})

/**
 * @param {object} deps
 * @param {string} deps.currentId - 이 번들의 빌드 식별자
 * @param {string} [deps.versionUrl='/version.json']
 * @param {typeof fetch} deps.fetchImpl
 * @param {Document} deps.doc - visibilityState와 visibilitychange 이벤트
 * @param {Window} deps.win - focus·online 이벤트
 * @param {Storage|null} deps.storage - sessionStorage (자동 새로고침 1회 제한)
 * @param {() => { safe: boolean, reasons: string[] }} deps.getSafety
 * @param {() => string} deps.getPathname
 * @param {() => void} deps.reload
 * @param {() => number} [deps.now]
 */
export function createDeployWatcher(deps) {
  const {
    versionUrl = '/version.json',
    fetchImpl,
    doc,
    win,
    storage,
    getSafety,
    getPathname,
    reload,
    now = () => Date.now(),
    setIntervalFn = (fn, ms) => setInterval(fn, ms),
    clearIntervalFn = (id) => clearInterval(id),
    pollMs = DEPLOY_POLL_MS,
    minHiddenMs = MIN_HIDDEN_MS_FOR_AUTO_RELOAD,
    minCheckGapMs = MIN_CHECK_GAP_MS,
    fetchTimeoutMs = VERSION_FETCH_TIMEOUT_MS,
  } = deps
  const currentId = normalizeBuildId(deps.currentId)

  let state = INITIAL_STATE
  const listeners = new Set()
  let started = false
  let pollTimer = null
  let hiddenAt = null
  let lastCheckAt = -Infinity
  let inflight = null

  function setState(patch) {
    const next = { ...state, ...patch }
    if (Object.keys(next).every((k) => Object.is(next[k], state[k]))) return
    state = next
    for (const listener of listeners) listener()
  }

  const isVisible = () => doc?.visibilityState !== 'hidden'

  /** 서버의 빌드 식별자를 확인한다. 실패·HTML 폴백·형식 오류는 모두 "업데이트 없음". */
  function checkNow({ force = false } = {}) {
    if (!started || !currentId) return Promise.resolve(state)
    if (inflight) return inflight
    const t = now()
    if (!force && t - lastCheckAt < minCheckGapMs) return Promise.resolve(state)
    lastCheckAt = t

    inflight = (async () => {
      let remote = null
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller ? setTimeout(() => controller.abort(), fetchTimeoutMs) : null
      try {
        const sep = versionUrl.includes('?') ? '&' : '?'
        const res = await fetchImpl(`${versionUrl}${sep}t=${t}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          ...(controller ? { signal: controller.signal } : {}),
        })
        const text = await res.text()
        remote = parseVersionResponse({ ok: res.ok, contentType: res.headers?.get?.('content-type'), text })
      } catch {
        remote = null // 네트워크 실패는 조용히 무시한다
      } finally {
        if (timer) clearTimeout(timer)
      }
      if (!started) return state
      if (remote && hasNewDeploy(currentId, remote)) {
        if (remote !== state.remoteId) {
          setState({ updateAvailable: true, remoteId: remote, dismissed: false, blockedReasons: null, autoReloadLimited: false })
        }
      } else if (remote && remote === currentId && state.updateAvailable) {
        // 배포가 이 빌드로 되돌아갔다(롤백) → 안내를 거둔다
        setState({ ...INITIAL_STATE })
      }
      return state
    })().finally(() => { inflight = null })
    return inflight
  }

  /**
   * 안전하면 자동으로 새로고침한다. 했으면 true.
   * @param {'return'|'navigate'} trigger
   */
  function tryAutoReload(trigger) {
    if (!started || !state.updateAvailable || !state.remoteId) return false
    let pathname = ''
    try { pathname = getPathname() } catch { /* 경로를 모르면 하지 않는다 */ }
    if (!isAutoReloadPath(pathname)) return false

    let safety
    try {
      safety = getSafety()
    } catch {
      safety = null
    }
    if (!safety || safety.safe !== true) {
      setState({ blockedReasons: safety?.reasons?.length ? [...safety.reasons] : ['unknown'] })
      return false
    }
    if (!canAutoReload(storage, currentId, state.remoteId)) {
      setState({ autoReloadLimited: true })
      return false
    }
    // 기록을 남기지 못하면 무한 새로고침을 막을 수 없으므로 안내만 한다
    if (!rememberAutoReload(storage, currentId, state.remoteId, now())) {
      setState({ autoReloadLimited: true })
      return false
    }
    setState({ blockedReasons: null })
    try {
      reload(trigger)
    } catch { /* 새로고침 호출 실패 시 안내가 남는다 */ }
    return true
  }

  function startPolling() {
    if (pollTimer != null) return
    pollTimer = setIntervalFn(() => {
      // 숨은 탭과 이미 감지한 뒤에는 요청하지 않는다
      if (!isVisible() || state.updateAvailable) return
      checkNow({ force: true })
    }, pollMs)
  }

  function stopPolling() {
    if (pollTimer == null) return
    clearIntervalFn(pollTimer)
    pollTimer = null
  }

  async function handleVisibilityChange() {
    if (!started) return
    if (!isVisible()) {
      hiddenAt = now()
      stopPolling()
      return
    }
    const hiddenFor = hiddenAt == null ? 0 : now() - hiddenAt
    hiddenAt = null
    startPolling()
    if (state.dismissed) setState({ dismissed: false }) // 돌아오면 닫았던 안내를 다시 보인다
    if (!state.updateAvailable) await checkNow({ force: true })
    if (hiddenFor >= minHiddenMs) tryAutoReload('return')
  }

  const onVisibility = () => { handleVisibilityChange() }
  const onFocus = () => { if (isVisible() && !state.updateAvailable) checkNow() }
  const onOnline = () => { if (isVisible() && !state.updateAvailable) checkNow({ force: true }) }

  return {
    /** 감시를 시작한다. 빌드 식별자가 없으면(dev·테스트) 아무것도 하지 않는다. */
    start() {
      if (started || !currentId) return
      started = true
      doc?.addEventListener?.('visibilitychange', onVisibility)
      win?.addEventListener?.('focus', onFocus)
      win?.addEventListener?.('online', onOnline)
      if (isVisible()) startPolling()
      else hiddenAt = now()
    },
    stop() {
      if (!started) return
      started = false
      stopPolling()
      doc?.removeEventListener?.('visibilitychange', onVisibility)
      win?.removeEventListener?.('focus', onFocus)
      win?.removeEventListener?.('online', onOnline)
    },
    checkNow,
    handleVisibilityChange,
    /** 앱 안에서 경로가 바뀐 직후 부른다. 새 배포가 감지돼 있고 안전하면 그 주소로 새로고침한다. */
    handleRouteChange() {
      if (state.updateAvailable) return tryAutoReload('navigate')
      checkNow() // 아직 모르면 확인만 한다(간격 제한 적용)
      return false
    },
    /** 사용자가 [새로고침]을 눌렀을 때 (안전 확인은 안내 막대가 한다) */
    reloadNow() {
      try { reload('manual') } catch { /* 무시 */ }
    },
    dismiss() {
      setState({ dismissed: true })
    },
    getState() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
