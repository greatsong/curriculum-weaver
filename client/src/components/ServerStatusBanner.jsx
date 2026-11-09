/**
 * 서버 연결 안내 막대 — 화면은 열렸는데 API 서버에 닿지 않을 때 화면 아래에 띄운다.
 *
 * 평소에는 처음 한 번만 확인한다. 실패하면 잠시 뒤 다시 확인하고, 연속으로 실패했을 때만 안내한다.
 * 안내가 떠 있는 동안에는 주기적으로 다시 확인해, 연결이 돌아오면 스스로 사라진다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  pingServer, classifyReachability, REACHABILITY_MESSAGES,
  RETRY_WHILE_DOWN_MS, RECHECK_AFTER_FAILURE_MS,
} from '../lib/serverReachability'

const wrapStyle = {
  position: 'fixed', bottom: 12, left: 0, right: 0, zIndex: 10040,
  display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none',
}
const cardStyle = {
  pointerEvents: 'auto', maxWidth: 680, display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 12px 10px 16px', borderRadius: 12, background: '#7F1D1D', color: '#FEF2F2',
  boxShadow: '0 8px 24px rgba(17, 24, 39, 0.25)', fontSize: 13, lineHeight: 1.5,
}
const buttonStyle = {
  flexShrink: 0, minHeight: 32, padding: '4px 12px', borderRadius: 8, border: 'none',
  background: '#FFFFFF', color: '#7F1D1D', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

/**
 * @param {object} [props]
 * @param {() => Promise<boolean>} [props.ping] - 테스트용 주입
 */
export default function ServerStatusBanner({ ping = pingServer } = {}) {
  const [failures, setFailures] = useState(0)
  const [checking, setChecking] = useState(false)
  const failuresRef = useRef(0)
  const timerRef = useRef(null)
  const aliveRef = useRef(true)
  const runningRef = useRef(false)

  const check = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    clearTimeout(timerRef.current)
    setChecking(true)
    const ok = await ping()
    runningRef.current = false
    if (!aliveRef.current) return
    setChecking(false)
    failuresRef.current = ok ? 0 : failuresRef.current + 1
    setFailures(failuresRef.current)
    if (!ok) {
      const delay = failuresRef.current === 1 ? RECHECK_AFTER_FAILURE_MS : RETRY_WHILE_DOWN_MS
      timerRef.current = setTimeout(check, delay)
    }
  }, [ping])

  useEffect(() => {
    aliveRef.current = true
    check()
    // 인터넷이 다시 연결되거나 탭으로 돌아왔을 때, 실패 중이었다면 바로 다시 확인한다
    const recheckIfDown = () => { if (failuresRef.current > 0) check() }
    const onVisible = () => { if (document.visibilityState === 'visible') recheckIfDown() }
    window.addEventListener('online', recheckIfDown)
    window.addEventListener('offline', check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      aliveRef.current = false
      clearTimeout(timerRef.current)
      window.removeEventListener('online', recheckIfDown)
      window.removeEventListener('offline', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  const kind = classifyReachability({ failures, online: typeof navigator === 'undefined' ? true : navigator.onLine })
  if (kind === 'ok') return null

  return (
    <div style={wrapStyle}>
      <div role="alert" data-testid="server-status-banner" data-kind={kind} style={cardStyle}>
        <span>{REACHABILITY_MESSAGES[kind]}</span>
        <button type="button" style={buttonStyle} onClick={check} disabled={checking}>
          {checking ? '확인 중' : '다시 확인'}
        </button>
      </div>
    </div>
  )
}
