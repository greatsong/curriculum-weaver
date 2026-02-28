import { STAGES } from 'curriculum-weaver-shared/constants.js'
import { Search, Map, Building2, BarChart3, Package, Rocket, RefreshCw, Check } from 'lucide-react'

const STAGE_ICONS = {
  Search, Map, Building2, BarChart3, Package, Rocket, RefreshCw,
}

export default function StageNav({ currentStage, onStageChange, completedStages = [] }) {
  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2 shrink-0">
      <div className="flex items-center gap-1 overflow-x-auto">
        {STAGES.map((stage, i) => {
          const isActive = stage.id === currentStage
          const isCompleted = completedStages.includes(stage.id)
          const Icon = STAGE_ICONS[stage.icon]

          return (
            <button
              key={stage.id}
              onClick={() => onStageChange(stage.id)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
                ${isActive
                  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                  : isCompleted
                    ? 'text-green-600 hover:bg-green-50'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }
              `}
              title={stage.name}
            >
              {isCompleted && !isActive ? (
                <Check size={16} className="text-green-500" />
              ) : Icon ? (
                <Icon size={16} />
              ) : (
                <span className="text-xs">{stage.id}</span>
              )}
              <span className="hidden sm:inline">{stage.shortName}</span>
              <span className="sm:hidden text-xs">{stage.id}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
