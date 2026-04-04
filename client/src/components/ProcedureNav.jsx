import { PHASES, PHASE_LIST, PROCEDURES, PROCEDURE_LIST, getProceduresByPhase } from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import { useState } from 'react'

/**
 * 16 절차를 6개 Phase 그룹으로 보여주는 네비게이션
 * Dribbble-quality: 깔끔한 수평 탭 + 확장 절차 바
 */
export default function ProcedureNav({
  currentProcedure,
  onProcedureChange,
  completedProcedures = [],
  boardStatuses = {},
}) {
  const [expandedPhase, setExpandedPhase] = useState(() => {
    const proc = PROCEDURES[currentProcedure]
    return proc?.phase || 'T'
  })

  return (
    <nav style={{
      background: 'var(--color-bg-secondary)',
      borderBottom: '1px solid var(--color-border)',
      flexShrink: 0,
    }}>
      {/* Phase 탭 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '6px 12px',
        overflowX: 'auto',
      }}>
        {PHASE_LIST.map((phase) => {
          const procedures = getProceduresByPhase(phase.id)
          const isExpanded = expandedPhase === phase.id
          const hasCurrentProcedure = procedures.some((p) => p.code === currentProcedure)
          const completedCount = procedures.filter((p) => completedProcedures.includes(p.code)).length
          const allDone = completedCount > 0 && completedCount === procedures.length

          return (
            <button
              key={phase.id}
              onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
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
              {allDone ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={hasCurrentProcedure ? 'rgba(255,255,255,0.8)' : '#22C55E'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/>
                </svg>
              ) : completedCount > 0 ? (
                <span style={{ fontSize: 10, opacity: 0.6 }}>{completedCount}/{procedures.length}</span>
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
          )
        })}
      </div>

      {/* 확장된 Phase의 절차 목록 */}
      {expandedPhase && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 12px',
          overflowX: 'auto',
          borderTop: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-primary)',
        }}>
          {getProceduresByPhase(expandedPhase).map((proc) => {
            const isActive = proc.code === currentProcedure
            const isCompleted = completedProcedures.includes(proc.code)
            const steps = PROCEDURE_STEPS[proc.code]
            const totalSteps = steps?.length || 0
            const status = boardStatuses[proc.code]
            const phase = PHASE_LIST.find((p) => p.id === expandedPhase)

            return (
              <button
                key={proc.code}
                onClick={() => onProcedureChange(proc.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
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
                }}
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
                {isCompleted && !isActive ? (
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
                {totalSteps > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{totalSteps}s</span>
                )}
                {status === 'confirmed' && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E' }} />
                )}
                {status === 'locked' && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#9CA3AF' }} />
                )}
              </button>
            )
          })}
        </div>
      )}
    </nav>
  )
}
