import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { RequirePrivacyConsent } from './PrivacyConsentGate'
import PendingApprovalScreen from './PendingApprovalScreen'

/** 로딩 표시 (인증·승인 확인 중) */
function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>로딩 중...</p>
      </div>
    </div>
  )
}

/**
 * 인증 필수 라우트 래퍼
 * 가입 승인 대기·거절 계정에는 승인 대기 화면을 보여 준다. allowPending이면(초대 링크 화면) 그대로 연다.
 */
export default function ProtectedRoute({ children, allowPending = false }) {
  const { user, loading, approvalStatus, refreshApproval } = useAuthStore()
  const location = useLocation()

  // 세션은 있는데 승인 상태를 아직 묻지 않았으면 묻는다
  useEffect(() => {
    if (user && approvalStatus === 'unknown') refreshApproval?.()
  }, [user, approvalStatus, refreshApproval])

  if (loading) return <FullScreenSpinner />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!allowPending) {
    if (approvalStatus === 'unknown' || approvalStatus === 'loading') return <FullScreenSpinner />
    if (approvalStatus === 'pending' || approvalStatus === 'rejected') {
      return <PendingApprovalScreen status={approvalStatus} />
    }
  }

  // 현재 버전의 개인정보 동의 기록이 없으면(Google 첫 로그인·기록 없던 기존 회원) 한 번 묻는다
  return <RequirePrivacyConsent user={user}>{children}</RequirePrivacyConsent>
}

