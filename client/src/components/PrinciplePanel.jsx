import { useStageStore } from '../stores/stageStore'
import { STAGES } from 'curriculum-weaver-shared/constants.js'
import { BookOpen } from 'lucide-react'

export default function PrinciplePanel({ stage }) {
  const { principles } = useStageStore()
  const stageInfo = STAGES.find((s) => s.id === stage)

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={16} className="text-blue-600" />
        <h3 className="font-semibold text-gray-900 text-sm">설계 원칙</h3>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        {stageInfo?.name} 단계에서 참고할 원칙들
      </p>

      {principles.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-xs">원칙이 아직 등록되지 않았습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {principles.map((p) => (
            <div key={p.id} className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded shrink-0">
                  {p.id}
                </span>
                <div>
                  <p className="text-sm font-medium text-blue-900">{p.name}</p>
                  <p className="text-xs text-blue-700 mt-1 leading-relaxed">{p.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
