/**
 * 이어서 시뮬레이션 버튼 — 프로젝트 페이지 헤더용
 *
 * 현재 프로젝트 상태(보드·채팅·자료)를 복제한 읽기 전용 시뮬레이션 프로젝트를 만들고,
 * 남은 절차를 AI가 이어서 설계한다 (POST /api/demo/continue, SSE 스트리밍).
 * 원본 프로젝트는 읽기만 하며 절대 변경되지 않는다.
 * 스펙: _workspace/design/demo-continue-considerations.md
 */
import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, getHeaders } from '../lib/api'
import { recoverSimulation } from '../lib/simulationRecovery'
import { pushToast } from '../stores/toastStore'

export default function ContinueSimulationButton({ projectId, workspaceId, skippedCount = 0 }) {
  const navigate = useNavigate()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null) // { phase, saved, total }
  const runningRef = useRef(false)
  const mountedRef = useRef(true)
  const requestRef = useRef(null)
  const abortRef = useRef(null)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; abortRef.current?.abort() }
  }, [])

  const safeSet = (fn) => { if (mountedRef.current) fn() }

  const start = async () => {
    if (runningRef.current || skippedCount > 0) return
    const ok = confirm(
      '지금까지 작성된 내용을 복제한 뒤, 남은 절차를 AI가 이어서 설계한 참고용 시뮬레이션을 만듭니다.\n' +
      '원본 프로젝트는 변경되지 않습니다. (일일 데모 한도 1회 차감)\n\n시작할까요?'
    )
    if (!ok) return

    runningRef.current = true
    setRunning(true)
    setProgress({ phase: '준비', saved: 0, total: 0 })

    const controller = new AbortController()
    abortRef.current = controller
    if (requestRef.current?.source !== projectId) requestRef.current = { source: projectId, id: crypto.randomUUID() }
    let created = null
    const showComplete = (project) => {
      requestRef.current = null
      if (!mountedRef.current) return
      pushToast({ kind: 'success', message: '시뮬레이션이 완성됐어요. 새 시뮬레이션으로 이동합니다.' })
      navigate(`/workspaces/${project.workspaceId || workspaceId}/projects/${project.projectId}`)
    }

    try {
      const headers = await getHeaders()
      const res = await fetch(`${API_BASE}/api/demo/continue`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, requestId: requestRef.current.id }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 409 && data.projectId) created = data
        if ([400, 403, 404, 429].includes(res.status) || data.status === 'failed') requestRef.current = null
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
            created = { projectId: parsed.projectId, workspaceId: parsed.workspaceId || workspaceId }
            safeSet(() => setProgress({ phase: '복제', saved: 0, total: parsed.remaining?.length || 0 }))
          } else if (parsed.type === 'clone_complete') {
            safeSet(() => setProgress((p) => ({ ...(p || {}), phase: 'AI 시뮬레이션' })))
          } else if (parsed.type === 'heartbeat') {
            // 서버 내부 라벨('이어서1차' 등)은 노출하지 않고 복제/AI 시뮬레이션 두 단계로만 표시
            safeSet(() => setProgress((p) => ({ ...(p || {}), phase: parsed.phase === '복제' ? '복제' : 'AI 시뮬레이션' })))
          } else if (parsed.type === 'phase_complete') {
            safeSet(() => setProgress((p) => ({ ...(p || {}), saved: parsed.saved, total: parsed.total })))
          } else if (parsed.type === 'complete') {
            terminal = true
            showComplete(parsed)
          } else if (parsed.type === 'partial_failure') {
            terminal = true
            requestRef.current = null
            pushToast({ kind: 'error', message: parsed.message || '이어서 생성에 실패했습니다. 저장된 결과는 보존됩니다. 원본에서 다시 시도해주세요.' })
          } else if (parsed.type === 'error') {
            throw new Error(parsed.message)
          }
        }
      }
      if (!terminal) throw new Error('연결이 중단되었습니다. 다시 누르면 기존 요청 상태를 확인합니다.')
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted) return
      if (created?.projectId) {
        safeSet(() => setProgress(p => ({ ...p, phase: '서버 상태 확인' })))
        pushToast({ kind: 'info', message: '서버에 저장된 생성 결과를 다시 확인합니다.' })
        try {
          const result = await recoverSimulation(created, { signal: controller.signal })
          if (!result) return
          requestRef.current = null
          if (result.status === 'simulation') showComplete(created)
          else pushToast({ kind: 'error', message: '생성이 완료되지 못했습니다. 저장된 결과는 보존됩니다. 원본에서 다시 시도해주세요.' })
        } catch (recoveryError) {
          if (mountedRef.current) pushToast({ kind: 'error', message: recoveryError.message })
        }
      } else pushToast({ kind: 'error', message: err.message || '시뮬레이션 생성 중 오류가 발생했습니다.' })
    } finally {
      runningRef.current = false
      safeSet(() => { setRunning(false); setProgress(null) })
    }
  }

  if (skippedCount > 0 && !running) {
    return <button type="button" disabled aria-label="이어서 시뮬레이션 사용 불가" title="생략한 단계가 있어 현재 지원되지 않습니다. A-3 아이디어 탐색은 가능합니다." style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 44, minHeight: 44, justifyContent: 'center', padding: '6px 8px', border: 0, background: 'none', color: '#8B5CF6', opacity: .5, fontSize: 12 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
      <span className="hidden xl:inline">이어서 시뮬레이션</span>
    </button>
  }

  if (running) {
    return (
      <div
        title="시뮬레이션 생성 중 — 다른 작업을 계속하셔도 됩니다"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 14px',
          margin: '0 4px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          color: '#fff',
          background: 'linear-gradient(90deg, #8B5CF6, #3B82F6)',
          boxShadow: '0 1px 8px rgba(139, 92, 246, 0.35)',
        }}
      >
        <span style={{
          width: 7, height: 7, flexShrink: 0,
          borderRadius: '50%', background: '#fff',
          animation: 'pulseSoft 1.2s ease-in-out infinite',
        }} />
        <span className="hidden xl:inline">{progress?.phase || '생성'} 중</span>
        {progress?.total > 0 && (
          <span style={{
            padding: '1px 7px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: 'rgba(255, 255, 255, 0.22)',
          }}>
            {progress.saved}/{progress.total}
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={start}
      title="현재 설계로 시뮬레이션 — 지금까지의 내용을 복제한 뒤 남은 절차를 AI가 이어서 설계 (원본은 변경되지 않음)"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 8px',
        background: 'none',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        fontSize: 12,
        whiteSpace: 'nowrap',
        flexShrink: 0,
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
      {/* 프로젝트 헤더의 다른 버튼과 같은 기준 — 확대된 작업 화면에서 줄바꿈되지 않도록 xl부터 글자 표시 */}
      <span className="hidden xl:inline">현재 설계로 시뮬레이션</span>
    </button>
  )
}
