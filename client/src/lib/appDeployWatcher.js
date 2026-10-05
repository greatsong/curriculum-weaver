/**
 * 앱에서 쓰는 새 배포 감시 장치 한 벌 (실제 fetch·document·sessionStorage에 연결).
 * dev 서버·테스트에서는 빌드 식별자가 없거나 'dev'라 꺼진다(null).
 */
import { createDeployWatcher } from './deployWatcher'
import { normalizeBuildId } from './deployVersion'
import { checkReloadSafety } from './reloadSafety'

/* global __APP_BUILD_ID__ */
// vite.config.js의 define이 빌드 때 문자열로 바꿔 넣는다. 정의가 없으면(vitest 등) null.
export const APP_BUILD_ID = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : null

export function isDeployWatchEnabled() {
  if (import.meta.env?.DEV) return false
  if (APP_BUILD_ID === 'dev') return false
  return normalizeBuildId(APP_BUILD_ID) != null
}

/** sessionStorage를 쓸 수 있으면 돌려주고, 막혀 있으면 null */
export function safeSessionStorage() {
  try {
    const storage = window.sessionStorage
    storage.getItem('cw-deploy-probe')
    return storage
  } catch {
    return null
  }
}

let instance = null

export function getAppDeployWatcher() {
  if (!isDeployWatchEnabled()) return null
  if (!instance) {
    const base = import.meta.env?.BASE_URL || '/'
    instance = createDeployWatcher({
      currentId: APP_BUILD_ID,
      versionUrl: `${base.endsWith('/') ? base : `${base}/`}version.json`,
      fetchImpl: (...args) => window.fetch(...args),
      doc: document,
      win: window,
      storage: safeSessionStorage(),
      getSafety: () => checkReloadSafety(),
      getPathname: () => window.location.pathname,
      // 라우트 이동이면 이미 이동할 주소로 바뀐 뒤라 그 주소로 전체 새로고침된다
      reload: () => window.location.reload(),
    })
  }
  return instance
}
