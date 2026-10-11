import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

/**
 * 초대 수락 페이지
 */
export default function InviteAcceptPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [workspace, setWorkspace] = useState(null)

  const refreshApproval = useAuthStore((s) => s.refreshApproval)
  const approvalStatus = useAuthStore((s) => s.approvalStatus)
  const logout = useAuthStore((s) => s.logout)
  const [requestMessage, setRequestMessage] = useState('')
  // 초대 링크는 한 번만 쓸 수 있으므로 같은 토큰으로 두 번 요청하지 않는다(개발 모드 StrictMode의 이중 실행 포함)
  const acceptedTokenRef = useRef(null)
  const redirectTimerRef = useRef(null)

  useEffect(() => () => { if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current) }, [])

  useEffect(() => {
    if (acceptedTokenRef.current === token) return
    acceptedTokenRef.current = token
    async function accept() {
      try {
        const { useWorkspaceStore } = await import('../stores/workspaceStore')
        const ws = await useWorkspaceStore.getState().acceptInvite(token)
        if (ws.kind === 'requested') {
          // 초대 이메일과 로그인 계정이 달라 참여 요청이 되었다 — host가 수락해야 들어간다
          setRequestMessage(ws.message || '초대한 팀의 호스트가 확인하면 들어갈 수 있습니다.')
          setStatus('requested')
          return
        }
        // 초대로 가입 승인이 되었을 수 있으니 승인 상태를 다시 확인한다
        await refreshApproval?.()
        setWorkspace(ws)
        setStatus('success')
        redirectTimerRef.current = setTimeout(() => navigate(`/workspaces/${ws.id}`), 3000)
      } catch (err) {
        setError(err.message)
        setStatus('error')
      }
    }
    accept()
  }, [token, navigate, refreshApproval])

  if (status === 'requested') {
    const blocked = approvalStatus === 'pending' || approvalStatus === 'rejected'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm mx-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-amber-700 text-xl" aria-hidden="true">…</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">참여 요청을 보냈습니다</h2>
          <p className="text-sm text-gray-500 mb-4">{requestMessage}</p>
          {blocked ? (
            <button
              onClick={() => logout()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
            >
              로그아웃
            </button>
          ) : (
            <button
              onClick={() => navigate('/workspaces')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
            >
              워크스페이스 목록으로
            </button>
          )}
        </div>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">초대를 처리 중입니다...</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm mx-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-red-600 text-xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">초대 수락 실패</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => navigate('/workspaces')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            워크스페이스 목록으로
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-sm mx-4">
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">참여 완료</h2>
        <p className="text-sm text-gray-500 mb-4">
          {workspace?.name || '워크스페이스'}에 참여했습니다.
          <br />잠시 후 자동으로 이동합니다.
        </p>
        <button
          onClick={() => navigate(`/workspaces/${workspace?.id}`)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          바로 이동
        </button>
      </div>
    </div>
  )
}
