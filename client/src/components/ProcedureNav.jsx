import { PHASES, PHASE_LIST, PROCEDURES, PROCEDURE_LIST, getProceduresByPhase } from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import {
  ClipboardList, Users, Search, Compass, Rocket, RefreshCw,
  Check, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useState } from 'react'

const PHASE_ICONS = {
  ClipboardList, Users, Search, Compass, Rocket, RefreshCw,
}

/**
 * 16 절차를 6개 Phase 그룹으로 보여주는 네비게이션
 */
export default function ProcedureNav({
  currentProcedure,
  onProcedureChange,
  completedProcedures = [],
  boardStatuses = {},
}) {
  const [expandedPhase, setExpandedPhase] = useState(() => {
    // 현재 절차가 속한 Phase를 기본 확장
    const proc = PROCEDURES[currentProcedure]
    return proc?.phase || 'T'
  })

  return (
    <nav className="bg-white border-b border-gray-200 shrink-0">
      {/* Phase 탭 (가로 스크롤) */}
      <div className="flex items-center gap-0.5 px-2 sm:px-4 py-1.5 overflow-x-auto">
        {PHASE_LIST.map((phase) => {
          const procedures = getProceduresByPhase(phase.id)
          const isExpanded = expandedPhase === phase.id
          const hasCurrentProcedure = procedures.some((p) => p.code === currentProcedure)
          const completedCount = procedures.filter((p) =>
            completedProcedures.includes(p.code)
          ).length
          const PhaseIcon = PHASE_ICONS[phase.icon]

          return (
            <button
              key={phase.id}
              onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
              className={`
                flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all min-h-[40px]
                ${hasCurrentProcedure
                  ? 'text-white'
                  : isExpanded
                    ? 'bg-gray-100 text-gray-700'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }
              `}
              style={hasCurrentProcedure ? { backgroundColor: phase.color } : undefined}
            >
              {PhaseIcon && <PhaseIcon size={14} />}
              <span>{phase.name}</span>
              {completedCount > 0 && completedCount === procedures.length ? (
                <Check size={12} className={hasCurrentProcedure ? 'text-white/80' : 'text-green-500'} />
              ) : completedCount > 0 ? (
                <span className={`text-[10px] ${hasCurrentProcedure ? 'text-white/70' : 'text-gray-400'}`}>
                  {completedCount}/{procedures.length}
                </span>
              ) : null}
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )
        })}
      </div>

      {/* 확장된 Phase의 절차 목록 */}
      {expandedPhase && (
        <div className="flex items-center gap-1 px-2 sm:px-4 py-1.5 overflow-x-auto border-t border-gray-100 bg-gray-50">
          {getProceduresByPhase(expandedPhase).map((proc) => {
            const isActive = proc.code === currentProcedure
            const isCompleted = completedProcedures.includes(proc.code)
            const steps = PROCEDURE_STEPS[proc.code]
            const totalSteps = steps?.length || 0
            const status = boardStatuses[proc.code] // 'draft' | 'confirmed' | 'locked'
            const phase = PHASE_LIST.find((p) => p.id === expandedPhase)

            return (
              <button
                key={proc.code}
                onClick={() => onProcedureChange(proc.code)}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all
                  ${isActive
                    ? 'bg-white shadow-sm border border-gray-200 text-gray-900 font-semibold'
                    : isCompleted
                      ? 'text-green-600 hover:bg-green-50'
                      : 'text-gray-500 hover:bg-white hover:shadow-sm'
                  }
                `}
              >
                {isCompleted && !isActive ? (
                  <Check size={12} className="text-green-500" />
                ) : (
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{
                      backgroundColor: isActive ? phase?.color : 'transparent',
                      color: isActive ? '#fff' : phase?.color,
                      border: `1.5px solid ${isActive ? phase?.color : '#d1d5db'}`,
                    }}
                  >
                    {proc.order}
                  </span>
                )}
                <span>{proc.name}</span>
                {totalSteps > 0 && (
                  <span className="text-[10px] text-gray-400">{totalSteps}s</span>
                )}
                {status === 'confirmed' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                )}
                {status === 'locked' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </nav>
  )
}
