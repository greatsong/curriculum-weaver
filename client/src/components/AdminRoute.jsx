import { Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import { useIsSiteAdmin } from '../lib/siteAdmin'

function AdminGate({ children, fallback }) {
  const { loading, isAdmin } = useIsSiteAdmin()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }
  // 관리자가 아니면 화면이 있다는 것을 알리지 않고 다른 곳으로 보낸다(종전 제거 주소와 같은 동작)
  if (!isAdmin) return <Navigate to={fallback} replace />
  return children
}

/**
 * 관리자 전용 라우트 — 로그인·가입 승인은 ProtectedRoute가, 관리자 여부는 AdminGate가 본다.
 * 화면 가림일 뿐이고 실제 차단은 서버 requireAdmin이 한다.
 */
export default function AdminRoute({ children, fallback = '/graph' }) {
  return (
    <ProtectedRoute>
      <AdminGate fallback={fallback}>{children}</AdminGate>
    </ProtectedRoute>
  )
}
