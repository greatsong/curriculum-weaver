import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
// import { useAuthStore } from './stores/authStore'  // 나중에 다시 활성화
import Dashboard from './pages/Dashboard'
import SessionPage from './pages/SessionPage'
import DataManage from './pages/DataManage'

const GraphPage = lazy(() => import('./pages/GraphPage'))
const IntroPage = lazy(() => import('./pages/IntroPage'))

// 테스트 모드: 로그인 없이 바로 사용
// ProtectedRoute는 나중에 Supabase Auth 활성화 시 다시 사용
// function ProtectedRoute({ children }) {
//   const { user, loading } = useAuthStore()
//   if (loading) return <div>로딩 중...</div>
//   if (!user) return <Navigate to="/login" replace />
//   return children
// }

// 첫 방문 시 /intro로 리다이렉트
function HomeRoute() {
  const introDone = localStorage.getItem('cw_intro_done')
  if (!introDone) return <Navigate to="/intro" replace />
  return <Dashboard />
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/intro" element={<IntroPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/data" element={<DataManage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
