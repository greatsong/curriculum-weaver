/**
 * 이어서 시뮬레이션 버튼 — 프로젝트 페이지 헤더용
 *
 * 현재 프로젝트 상태(보드·채팅·자료)를 복제한 읽기 전용 시뮬레이션 프로젝트를 만들고,
 * 남은 절차를 AI가 이어서 설계한다 (POST /api/demo/continue, SSE 스트리밍).
 * 원본 프로젝트는 읽기만 하며 절대 변경되지 않는다.
 * 스펙: _workspace/design/demo-continue-considerations.md
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, getHeaders } from '../lib/api'
import { pushToast } from '../stores/toastStore'

export default function ContinueSimulationButton({ projectId, workspaceId }) {
  const navigate = useNavigate()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null) // { phase, saved, total }
  const runningRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const safeSet = (fn) => { if (mountedRef.current) fn() }

  const start = async () => {
    if (runningRef.current) return
    const ok = confirm(
      '지금까지 작성된 내용을 복제한 뒤, 남은 절차를 AI가 이어서 설계한 참고용 시뮬레이션을 만듭니다.\n' +
      '원본 프로젝트는 변경되지 않습니다. (일일 데모 한도 1회 차감)\n\n시작할까요?'
    )
    if (!ok) return

    runningRef.current = true
    setRunning(true)
    setProgress({ phase: '준비', saved: 0, total: 0 })

    try {
      const headers = await getHeaders()
      const res = await fetch(`${API_BASE}/api/demo/continue`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let terminal = false

      while (!terminal) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let parsed
          try { parsed = JSON.parse(line.slice(6)) } catch { continue }

          if (parsed.type === 'started') {
            safeSet(() => setProgress({ phase: '복제', saved: 0, total: parsed.remaining?.length || 0 }))
          } else if (parsed.type === 'clone_complete') {
            safeSet(() => setProgress((p) => ({ ...(p || {}), phase: 'AI 설계' })))
          } else if (parsed.type === 'heartbeat') {
            safeSet(() => setProgress((p) => ({ ...(p || {}), phase: parsed.phase || p?.phase || 'AI 설계' })))
          } else if (parsed.type === 'phase_complete') {
            safeSet(() => setProgress((p) => ({ ...(p || {}), saved: parsed.saved, total: parsed.total })))
          } else if (parsed.type === 'complete') {
            terminal = true
            pushToast({ kind: 'success', message: '시뮬레이션이 완성됐어요. 새 시뮬레이션으로 이동합니다.' })
            navigate(`/workspaces/${parsed.workspaceId || workspaceId}/projects/${parsed.projectId}`)
          } else if (parsed.type === 'partial_failure') {
            terminal = true
            pushToast({ kind: 'error', message: parsed.message || '이어서 생성에 실패했습니다. 실패본을 삭제하고 다시 시도해주세요.' })
          } else if (parsed.type === 'error') {
            throw new Error(parsed.message)
          }
        }
      }
    } catch (err) {
      pushToast({ kind: 'error', message: err.message || '시뮬레이션 생성 중 오류가 발생했습니다.' })
    } finally {
      runningRef.current = false
      safeSet(() => { setRunning(false); setProgress(null) })
    }
  }

  if (running) {
    return (
      <div
        title="시뮬레이션 생성 중 — 다른 작업을 계속하셔도 됩니다"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 'var(--radius-md)',
          fontSize: 12.5,
          color: '#8B5CF6',
          background: '#8B5CF608',
          minHeight: 44,
        }}
      >
        <div style={{
          width: 13, height: 13, flexShrink: 0,
          border: '2px solid #DDD6FE', borderTopColor: '#8B5CF6',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <span className="hidden sm:inline">
          {progress?.phase || '생성'} 중{progress?.total > 0 ? ` ${progress.saved}/${progress.total}` : ''}…
        </span>
      </div>
    )
  }

  return (
    <button
      onClick={start}
      title="여기부터 시뮬레이션 — 지금까지의 내용을 복제한 뒤 남은 절차를 AI가 이어서 설계 (원본은 변경되지 않음)"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 8px',
        background: 'none',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        fontSize: 13,
        color: '#8B5CF6',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        fontFamily: 'var(--font-sans)',
        minHeight: 44,
        minWidth: 44,
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = '#8B5CF608'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
      <span className="hidden sm:inline">여기부터 시뮬레이션</span>
    </button>
  )
}
