import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'

const Graph3DShowcase = lazy(() =>
  import('../components/Graph3DShowcase').catch(() => {
    window.location.reload()
    return { default: () => null }
  })
)
// 구 3D 화면 (검증 기간 유지 — ?mode=explore-legacy)
const Graph3D = lazy(() =>
  import('../components/Graph3D').catch(() => {
    window.location.reload()
    return { default: () => null }
  })
)
const DesignMode = lazy(() =>
  import('../components/DesignMode').catch(() => {
    window.location.reload()
    return { default: () => null }
  })
)

/**
 * 교과 연결 페이지 — 모드 라우터
 * - 성취기준 연결 찾기(기본, mode=design): 질문별 보기 (두 과목·주제·학년 간 연결·성취기준)
 * - 교육과정 전체 지도(mode=explore): 3D 성운 (감상·발표용)
 * URL이 상태를 기록: ?mode=design|explore + 보기/필터 파라미터 + project(보낼 곳)
 */
export default function GraphPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = searchParams.get('mode') || 'design'

  const toDesign = () => {
    const next = new URLSearchParams(searchParams)
    next.set('mode', 'design')
    next.delete('subjects') // project(보낼 곳)는 그대로 둔다
    setSearchParams(next)
  }

  // 설계 모드에서 이월된 교과군 필터 (탐험 모드용)
  const initialSubjects = (searchParams.get('subjects') || '').split(',').filter(Boolean)

  return (
    // 보낼 곳·저장 상태 안내는 각 화면(연결 찾기·전체 지도) 안의 머리 줄이 맡는다(ExplorationContextBar).
    <div className="h-screen w-screen overflow-hidden">
      <Suspense fallback={
        <div className="flex items-center justify-center h-full bg-gray-50">
          <div className="text-center text-gray-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">교과 연결 로딩 중...</p>
          </div>
        </div>
      }>
        {mode === 'explore' ? (
          <Graph3DShowcase />
        ) : mode === 'explore-legacy' ? (
          <div className="relative h-full">
            <Graph3D initialSubjects={initialSubjects.length > 0 ? initialSubjects : null} />
            {/* 설계 모드 복귀 토글 */}
            <button onClick={toDesign}
              className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5 px-4 py-2 bg-white/95 hover:bg-white text-gray-800 rounded-full text-xs font-bold shadow-lg border border-gray-200 transition">
              🧭 성취기준 연결 찾기로
            </button>
          </div>
        ) : (
          <DesignMode />
        )}
      </Suspense>
    </div>
  )
}
