import { useState, useMemo } from 'react'
import { useStageStore } from '../stores/stageStore'
import { STAGES } from 'curriculum-weaver-shared/constants.js'
import { Layers, Target, ChevronDown, ChevronRight } from 'lucide-react'

export default function PrinciplePanel({ stage }) {
  const { principles, generalPrinciples } = useStageStore()
  const stageInfo = STAGES.find((s) => s.id === stage)
  const [expandedGP, setExpandedGP] = useState(null)
  const [expandedSubstep, setExpandedSubstep] = useState(null)

  const toggleGP = (id) => setExpandedGP(expandedGP === id ? null : id)
  const toggleSubstep = (code) => setExpandedSubstep(expandedSubstep === code ? null : code)

  // 서브스텝별로 원리 그룹화
  const groupedPrinciples = useMemo(() => {
    const groups = {}
    for (const p of principles) {
      const key = p.substep || 'etc'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    return Object.entries(groups)
  }, [principles])

  return (
    <div className="p-4">
      {/* 총괄 원리 섹션 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={16} className="text-purple-600" />
          <h3 className="font-semibold text-gray-900 text-sm">총괄 원리</h3>
          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
            모든 단계 공통
          </span>
        </div>

        {generalPrinciples.length === 0 ? (
          <div className="text-center py-4 text-gray-400">
            <p className="text-xs">총괄 원리를 불러오는 중...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {generalPrinciples.map((gp) => (
              <div key={gp.id} className="bg-purple-50 rounded-lg border border-purple-100">
                <button
                  onClick={() => toggleGP(gp.id)}
                  className="w-full flex items-start gap-2 p-3 text-left hover:bg-purple-100/50 transition-colors rounded-lg"
                >
                  <span className="text-xs font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                    {gp.id.replace('GP0', '')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-purple-900">{gp.name}</p>
                    <p className="text-xs text-purple-700 mt-0.5 leading-relaxed">{gp.description}</p>
                  </div>
                  {expandedGP === gp.id
                    ? <ChevronDown size={14} className="text-purple-400 shrink-0 mt-1" />
                    : <ChevronRight size={14} className="text-purple-400 shrink-0 mt-1" />
                  }
                </button>

                {expandedGP === gp.id && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {gp.guidelines.map((g, i) => (
                      <div key={g.id} className="flex gap-2 text-xs text-purple-800 bg-white/60 rounded p-2">
                        <span className="text-purple-400 shrink-0 font-mono">{i + 1}</span>
                        <span className="leading-relaxed">{g.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 구분선 */}
      <hr className="border-gray-200 mb-4" />

      {/* 단계별 원리 섹션 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900 text-sm">단계별 원리</h3>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          {stageInfo?.name} 단계 전용 원리
        </p>

        {principles.length === 0 ? (
          <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            <p className="text-xs">단계별 원리가 준비 중입니다</p>
            <p className="text-[10px] mt-1 text-gray-300">총괄 원리를 참고하여 설계를 진행하세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groupedPrinciples.map(([substep, items]) => (
              <div key={substep} className="bg-blue-50 rounded-lg border border-blue-100">
                <button
                  onClick={() => toggleSubstep(substep)}
                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-blue-100/50 transition-colors rounded-lg"
                >
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded shrink-0">
                    {substep}
                  </span>
                  <span className="text-sm font-medium text-blue-900 flex-1">{items.length}개 유의사항</span>
                  {expandedSubstep === substep
                    ? <ChevronDown size={14} className="text-blue-400 shrink-0" />
                    : <ChevronRight size={14} className="text-blue-400 shrink-0" />
                  }
                </button>

                {expandedSubstep === substep && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {items.map((p) => (
                      <div key={p.id} className="flex gap-2 text-xs text-blue-800 bg-white/60 rounded p-2">
                        <span className="text-blue-400 shrink-0 font-mono text-[10px]">{p.id.replace('SP', '')}</span>
                        <div>
                          <span className="font-medium">{p.name}</span>
                          <p className="text-blue-600 mt-0.5 leading-relaxed">{p.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
