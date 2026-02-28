import { STAGES, BOARD_TYPES, BOARD_TYPE_LABELS } from 'curriculum-weaver-shared/constants.js'
import { useStageStore } from '../stores/stageStore'
import { FileText } from 'lucide-react'

export default function DesignBoard({ sessionId, stage }) {
  const { boards, loading } = useStageStore()
  const stageInfo = STAGES.find((s) => s.id === stage)
  const boardTypes = BOARD_TYPES[stage] || []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        로딩 중...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 단계 헤더 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-bold text-gray-900">
          {stage}단계: {stageInfo?.name}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{stageInfo?.description}</p>
      </div>

      {/* 보드 카드들 */}
      {boardTypes.map((boardType) => {
        const board = boards[boardType]
        const label = BOARD_TYPE_LABELS[boardType] || boardType

        return (
          <div key={boardType} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
              <FileText size={16} className="text-gray-400" />
              <h3 className="font-medium text-gray-700">{label}</h3>
              {board?.version > 1 && (
                <span className="text-xs text-gray-400 ml-auto">v{board.version}</span>
              )}
            </div>
            <div className="p-5">
              {board?.content && Object.keys(board.content).length > 0 ? (
                <BoardContent type={boardType} content={board.content} />
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">아직 내용이 없습니다</p>
                  <p className="text-xs mt-1">AI와 대화하면서 이 보드를 채워나가세요</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BoardContent({ type, content }) {
  // 보드 타입별 렌더링 (추후 확장)
  if (typeof content === 'string') {
    return <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
  }

  // JSONB 데이터를 키-값 테이블로 표시
  return (
    <div className="space-y-3">
      {Object.entries(content).map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{key}</dt>
          <dd className="mt-1 text-sm text-gray-800">
            {typeof value === 'object' ? (
              <pre className="bg-gray-50 rounded p-2 text-xs overflow-auto">{JSON.stringify(value, null, 2)}</pre>
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </div>
  )
}
