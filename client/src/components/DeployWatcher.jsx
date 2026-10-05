/**
 * 새 배포 감시 + 안내 막대. App에서 <Routes>보다 앞에 둔다.
 *
 * 앞에 두는 이유: 경로가 바뀐 커밋에서 React는 떠난 페이지의 effect 정리를 모두 마친 뒤
 * 형제 순서대로 새 effect를 돌린다. 그래서 이 컴포넌트의 판정 시점에는 떠난 페이지의 입력란과
 * 신고가 이미 빠져 있고(이동 뒤에도 남는 상태만 본다), 새 페이지가 진입하며 보내는 요청은
 * 아직 시작 전이라 "저장 중"으로 잘못 세지 않는다.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import DeployUpdateBanner from './DeployUpdateBanner'
import { getAppDeployWatcher, APP_BUILD_ID, safeSessionStorage } from '../lib/appDeployWatcher'
import { settleAutoReload } from '../lib/deployVersion'
import { checkReloadSafety, typedFieldTracker } from '../lib/reloadSafety'
import { pushToast } from '../stores/toastStore'

const IDLE_STATE = Object.freeze({ updateAvailable: false, dismissed: false })
const noopSubscribe = () => () => {}
const getIdleState = () => IDLE_STATE

/**
 * @param {object} [props]
 * @param {object|null} [props.watcher] - 테스트용 주입. 생략하면 앱 감시 장치(dev에서는 null).
 * @param {() => {safe: boolean, reasons: string[]}} [props.checkSafety] - 테스트용 주입
 */
export default function DeployWatcher({ watcher: injected, checkSafety = checkReloadSafety } = {}) {
  const watcher = injected === undefined ? getAppDeployWatcher() : injected
  const state = useSyncExternalStore(
    watcher ? watcher.subscribe : noopSubscribe,
    watcher ? watcher.getState : getIdleState,
  )
  const location = useLocation()
  const lastPathRef = useRef(location.pathname)

  useEffect(() => {
    if (!watcher) return undefined
    typedFieldTracker.start(document)
    // 자동 새로고침으로 새 빌드에 도착했으면 짧게 알린다(갑자기 화면이 바뀐 이유)
    if (injected === undefined && settleAutoReload(safeSessionStorage(), APP_BUILD_ID).arrived) {
      pushToast({ kind: 'info', message: '새 버전이 배포되어 화면을 다시 불러왔습니다.', duration: 5_000 })
    }
    watcher.start()
    return () => {
      watcher.stop()
      typedFieldTracker.stop()
    }
  }, [watcher, injected])

  useEffect(() => {
    if (!watcher || location.pathname === lastPathRef.current) return
    lastPathRef.current = location.pathname
    watcher.handleRouteChange()
  }, [watcher, location.pathname])

  if (!watcher) return null
  return (
    <DeployUpdateBanner
      open={Boolean(state.updateAvailable && !state.dismissed)}
      checkSafety={checkSafety}
      onReload={watcher.reloadNow}
      onDismiss={watcher.dismiss}
    />
  )
}
