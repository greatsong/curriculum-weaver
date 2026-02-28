import { Routes, Route, Navigate } from 'react-router-dom'
// import { useAuthStore } from './stores/authStore'  // 나중에 다시 활성화
import Dashboard from './pages/Dashboard'
import SessionPage from './pages/SessionPage'
import DataManage from './pages/DataManage'

// 테스트 모드: 로그인 없이 바로 사용
// ProtectedRoute는 나중에 Supabase Auth 활성화 시 다시 사용
// function ProtectedRoute({ children }) {
//   const { user, loading } = useAuthStore()
//   if (loading) return <div>로딩 중...</div>
//   if (!user) return <Navigate to="/login" replace />
//   return children
// }

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/session/:sessionId" element={<SessionPage />} />
      <Route path="/data" element={<DataManage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
