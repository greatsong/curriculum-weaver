import { PHASES, PHASE_LIST, PROCEDURES, PROCEDURE_LIST, getProceduresByPhase } from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import { useState, useEffect, useRef } from 'react'

/**
 * 준비(prep) + 5개 과정(T·A·Ds·DI·E)의 18개 세부활동을 그룹으로 보여주는 네비게이션
 * Dribbble-quality: 깔끔한 수평 탭 + 확장 절차 바
 */
export default function ProcedureNav({
  currentProcedure,
  onProcedureChange,
  completedProcedures = [],
  boardStatuses = {},
  skippedCodes = new Set(),
}) {
  const [expandedPhase, setExpandedPhase] = useState(() => {
    const proc = PROCEDURES[currentProcedure]
    return proc?.phase || 'T'
  })
  // 현재 절차가 바뀌면(서버에서 복원·팀원 이동·건너뛰기 보정) 그 단계를 펼친다.
  // 예전에는 처음 그릴 때 한 번만 정해, 프로젝트를 불러오기 전 기본값(팀준비)이 남아
  // "분석 A가 선택됐는데 아래에 T-1~T-5가 보이는" 일이 생겼다(2026-10-03 제보).
  useEffect(() => {
    const phase = PROCEDURES[currentProcedure]?.phase
    if (phase) setExpandedPhase(phase)
  }, [currentProcedure])
  // 한 줄 안에서 현재 절차 칩이 가려지지 않게 가로 스크롤을 맞춘다
  const activeChipRef = useRef(null)
  useEffect(() => {
    activeChipRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [currentProcedure, expandedPhase])

  return (
    <nav style={{
      background: 'var(--color-bg-secondary)',
      borderBottom: '1px solid var(--color-border)',
      flexShrink: 0,
    }}>
      {/* 단계 탭과 펼친 단계의 절차 칩을 한 줄에 둔다(작업 화면 세로 공간 확보, 2026-10-03) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '4px 12px',
        overflowX: 'auto',
      }}>
        {PHASE_LIST.map((phase) => {
          const procedures = getProceduresByPhase(phase.id)
          const isExpanded = expandedPhase === phase.id
          const hasCurrentProcedure = procedures.some((p) => p.code === currentProcedure)
          // 스킵된 절차는 완료 분모에서 제외 — 하나만 스킵해도 단계가 영원히
          // 미완료로 남는 문제 방지. 전부 스킵된 단계는 완료로 치지 않는다.
          const activeProcs = procedures.filter((p) => !skippedCodes.has(p.code))
          const completedCount = activeProcs.filter((p) => completedProcedures.includes(p.code)).length
          const allDone = completedCount > 0 && completedCount === activeProcs.length

          return (
            <div key={phase.id} style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button
              onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
              aria-expanded={isExpanded}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                fontFamily: 'var(--font-sans)',
                background: hasCurrentProcedure ? phase.color : isExpanded ? 'var(--color-bg-tertiary)' : 'transparent',
                color: hasCurrentProcedure ? '#fff' : isExpanded ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!hasCurrentProcedure && !isExpanded) {
                  e.currentTarget.style.background = 'var(--color-bg-tertiary)'
                  e.currentTarget.style.color = 'var(--color-text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!hasCurrentProcedure && !isExpanded) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
            >
              {/* Phase dot */}
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: hasCurrentProcedure ? 'rgba(255,255,255,0.5)' : phase.color,
                flexShrink: 0,
              }} />
              <span>{phase.name}</span>
              {/* 단계 코드(T·A·Ds·DI·E) — AI와 절차 카드가 "A-4"처럼 코드로 부르므로 어느 단계인지 알 수 있게 */}
              {phase.id !== 'prep' && (
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.6, letterSpacing: '0.02em' }}>{phase.id}</span>
              )}
              {allDone ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={hasCurrentProcedure ? 'rgba(255,255,255,0.8)' : '#22C55E'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/>
                </svg>
              ) : completedCount > 0 ? (
                <span style={{ fontSize: 10, opacity: 0.6 }}>{completedCount}/{activeProcs.length}</span>
              ) : null}
              {/* Chevron */}
              <svg
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transition: 'transform var(--transition-fast)',
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  opacity: 0.5,
                }}
              >
                <polyline points="4 6 8 10 12 6"/>
              </svg>
            </button>
            {isExpanded && renderChips(phase.id)}
            </div>
          )
        })}
      </div>
    </nav>
  )

  // 펼친 단계의 절차 칩 묶음 — 단계 탭 바로 오른쪽에 붙는다
  function renderChips(phaseId) {
    return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '2px 4px',
          margin: '0 8px 0 2px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border-subtle)',
        }}>
          {getProceduresByPhase(phaseId).map((proc) => {
            const isActive = proc.code === currentProcedure
            const isCompleted = completedProcedures.includes(proc.code)
            const isSkippedProc = skippedCodes.has(proc.code)
            const steps = PROCEDURE_STEPS[proc.code]
            const totalSteps = steps?.length || 0
            const status = boardStatuses[proc.code]
            const phase = PHASE_LIST.find((p) => p.id === phaseId)

            return (
              <button
                key={proc.code}
                ref={isActive ? activeChipRef : undefined}
                onClick={() => onProcedureChange(proc.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  gap: 6,
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  border: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  fontFamily: 'var(--font-sans)',
                  background: isActive ? 'var(--color-bg-secondary)' : 'transparent',
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                  color: isActive ? 'var(--color-text-primary)' : isCompleted ? '#16A34A' : 'var(--color-text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  // 생략된 절차: 취소선 + 반투명 (열람은 가능하므로 클릭은 막지 않음)
                  ...(isSkippedProc ? { textDecoration: 'line-through', opacity: 0.45 } : {}),
                }}
                title={isSkippedProc ? '팀 결정으로 생략된 절차 (열람만 가능)' : (totalSteps > 0 ? `${proc.name} · 세부 스텝 ${totalSteps}개` : undefined)}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--color-bg-secondary)'
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.boxShadow = 'none'
                  }
                }}
              >
                {proc.displayCode ? (
                  /* 표시 코드(A-4 등) — 예전 전체 순번(9 등)은 AI·절차 카드의 "A-4"와 연결되지 않았다(2026-10-03 제보) */
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    height: 18,
                    padding: '0 6px',
                    borderRadius: 9,
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                    background: isActive ? phase?.color : 'transparent',
                    color: isActive ? '#fff' : isCompleted ? '#16A34A' : phase?.color,
                    border: `1.5px solid ${isActive ? phase?.color : isCompleted ? '#86EFAC' : '#D1D5DB'}`,
                  }}>
                    {isCompleted && !isActive && (
                      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/>
                      </svg>
                    )}
                    {proc.displayCode}
                  </span>
                ) : isCompleted && !isActive ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/>
                  </svg>
                ) : (
                  <span style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 700,
                    flexShrink: 0,
                    background: isActive ? phase?.color : 'transparent',
                    color: isActive ? '#fff' : phase?.color,
                    border: `1.5px solid ${isActive ? phase?.color : '#D1D5DB'}`,
                  }}>
                    {proc.order}
                  </span>
                )}
                <span>{proc.name}</span>
                {/* 세부 스텝 수는 한 줄 배치를 위해 칩 툴팁(title)으로 옮겼다 */}
                {status === 'confirmed' && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E' }} />
                )}
                {status === 'stale' && (
                  <span title="앞 단계 수정 후 재검토 필요" style={{ width: 5, height: 5, borderRadius: '50%', background: '#F59E0B' }} />
                )}
                {status === 'locked' && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#9CA3AF' }} />
                )}
              </button>
            )
          })}
        </div>
    )
  }
}
