import { Link, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import { useIsSiteAdmin } from '../lib/siteAdmin'

function AdminGate({ children, fallback }) {
  const { loading, isAdmin, error, retry } = useIsSiteAdmin()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }
  // 확인 자체가 실패했으면(망·서버 오류) 다른 곳으로 보내지 않고 다시 시도를 안내한다. 화면 내용은 열지 않는다
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg-primary)' }} data-testid="admin-check-failed">
        <div className="text-center" style={{ maxWidth: 360 }}>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">화면을 열지 못했습니다</h2>
          <p className="text-sm text-gray-500 mb-5">서버에 연결하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.</p>
          <div className="flex items-center justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={retry}>다시 시도</button>
            <Link to="/workspaces" className="btn btn-secondary no-underline">워크스페이스로</Link>
          </div>
        </div>
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
