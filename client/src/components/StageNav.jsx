import { STAGES, PHASES } from 'curriculum-weaver-shared/constants.js'
import { Target, Settings, Search, Map, Building2, BarChart3, Compass, Package, Play, RotateCcw, Award, Rocket, Check, Users, RefreshCw } from 'lucide-react'

const STAGE_ICONS = {
  Target, Settings, Search, Map, Building2, BarChart3, Compass, Package, Play, RotateCcw, Award, Rocket, Users, RefreshCw,
}

export default function StageNav({ currentStage, onStageChange, completedStages = [] }) {
  // 단계를 phase별로 그룹핑
  const grouped = PHASES.map(phase => ({
    ...phase,
    stages: STAGES.filter(s => s.phase === phase.id),
  }))

  return (
    <nav className="bg-white border-b border-gray-200 px-2 sm:px-4 py-1.5 sm:py-2 shrink-0">
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {grouped.map((phase, pi) => (
          <div key={phase.id} className="flex items-center">
            {/* 대단계 라벨 */}
            <span
              className="hidden lg:inline text-[10px] font-bold px-1.5 py-0.5 rounded mr-0.5 shrink-0"
              style={{ color: phase.color, backgroundColor: `${phase.color}15` }}
            >
              {phase.id}
            </span>
            {/* 하위 단계 버튼들 */}
            {phase.stages.map((stage) => {
              const isActive = stage.id === currentStage
              const isCompleted = completedStages.includes(stage.id)
              const Icon = STAGE_ICONS[stage.icon]

              return (
                <button
                  key={stage.id}
                  onClick={() => onStageChange(stage.id)}
                  className={`
                    flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all min-h-[40px]
                    ${isActive
                      ? 'text-white'
                      : isCompleted
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }
                  `}
                  style={isActive ? { backgroundColor: phase.color } : undefined}
                  title={`${stage.code}: ${stage.name}`}
                >
                  {isCompleted && !isActive ? (
                    <Check size={14} className="text-green-500" />
                  ) : Icon ? (
                    <Icon size={14} />
                  ) : (
                    <span className="text-[10px]">{stage.code}</span>
                  )}
                  <span className="hidden sm:inline">{stage.shortName}</span>
                  <span className="sm:hidden text-[10px]">{stage.code}</span>
                </button>
              )
            })}
            {/* 단계 구분선 */}
            {pi < grouped.length - 1 && (
              <div className="w-px h-6 bg-gray-200 mx-1 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </nav>
  )
}
