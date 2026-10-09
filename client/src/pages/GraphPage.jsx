import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'

const Graph3DShowcase = lazy(() =>
  import('../components/Graph3DShowcase').catch(() => {
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
  const [searchParams] = useSearchParams()
  // 구 3D 화면(?mode=explore-legacy, react-force-graph-3d)은 2026-10-09 삭제 — 성운(explore)으로 보낸다
  const mode = searchParams.get('mode') === 'explore-legacy' ? 'explore' : (searchParams.get('mode') || 'design')

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
        ) : (
          <DesignMode />
        )}
      </Suspense>
    </div>
  )
}
