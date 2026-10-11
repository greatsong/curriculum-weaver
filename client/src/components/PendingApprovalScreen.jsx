import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'

/**
 * 가입 승인 대기 화면 (2026-10-11)
 *
 * 2026-10-11 15:00(한국 시간) 이후에 가입한 계정은 관리자 승인 또는 초대 링크로 승인되어야
 * 서비스를 쓸 수 있다. 승인 전에는 이 화면만 보인다(초대 링크 화면은 예외로 열린다).
 *
 * @param {{ status?: 'pending'|'rejected' }} props
 */
export default function PendingApprovalScreen({ status = 'pending' }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const refreshApproval = useAuthStore((s) => s.refreshApproval)
  const [checking, setChecking] = useState(false)
  const [checkedOnce, setCheckedOnce] = useState(false)
  const rejected = status === 'rejected'

  const handleRecheck = async () => {
    setChecking(true)
    try {
      await refreshApproval()
    } finally {
      setChecking(false)
      setCheckedOnce(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" data-testid="pending-approval">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          {rejected ? '가입이 승인되지 않았습니다' : '관리자 승인을 기다리고 있습니다'}
        </h1>
        {user?.email && <p className="text-sm text-gray-500 mb-4">{user.email}</p>}
        {rejected ? (
          <p className="text-sm text-gray-600 leading-relaxed mb-6">
            이 계정은 이용이 승인되지 않았습니다. 관리자에게 문의해 주세요.
          </p>
        ) : (
          <div className="text-sm text-gray-600 leading-relaxed mb-6 space-y-2">
            <p>가입 신청이 접수되었습니다. 관리자가 승인하면 바로 이용할 수 있습니다.</p>
            <p className="font-medium text-gray-800">초대 링크를 받았다면 그 링크를 다시 열어 주세요.</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {!rejected && (
            <button
              type="button"
              onClick={handleRecheck}
              disabled={checking}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-60 min-h-[44px]"
            >
              {checking ? '확인 중...' : '승인 상태 다시 확인'}
            </button>
          )}
          <button
            type="button"
            onClick={() => logout()}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium min-h-[44px]"
          >
            로그아웃
          </button>
        </div>
        {checkedOnce && !checking && !rejected && (
          <p className="text-xs text-gray-400 mt-3" role="status">아직 승인되지 않았습니다.</p>
        )}
      </div>
    </div>
  )
}
