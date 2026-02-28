import { lazy, Suspense } from 'react'

const Graph3D = lazy(() => import('../components/Graph3D'))

export default function GraphPage() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <Suspense fallback={
        <div className="flex items-center justify-center h-full bg-gray-900">
          <div className="text-center text-gray-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">3D 그래프 로딩 중...</p>
          </div>
        </div>
      }>
        <Graph3D />
      </Suspense>
    </div>
  )
}
