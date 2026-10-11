import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../lib/api'

const ROLE_LABELS = { host: '호스트', editor: '편집자', viewer: '열람자' }

/**
 * 워크스페이스 참여 요청 (멤버 탭, host·owner 전용)
 * 초대 링크를 연 계정의 이메일이 초대한 이메일과 다르면 참여 요청이 된다. 여기서 수락하면 멤버가 된다.
 * 대기 중인 요청이 없으면 아무것도 그리지 않는다.
 *
 * @param {{ workspaceId: string, onAccepted?: () => void }} props
 */
export default function JoinRequestList({ workspaceId, onAccepted }) {
  const [requests, setRequests] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiGet(`/api/workspaces/${workspaceId}/join-requests`)
      setRequests(res?.requests || [])
    } catch {
      setRequests([])
    }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const act = async (request, action) => {
    setBusyId(request.id)
    setError('')
    try {
      await apiPost(`/api/workspaces/${workspaceId}/join-requests/${request.id}/${action}`, {})
      await load()
      if (action === 'accept') onAccepted?.()
    } catch (err) {
      setError(err?.message || '처리하지 못했습니다.')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  if (requests.length === 0 && !error) return null

  return (
    <div
      data-testid="join-requests"
      style={{
        background: '#FFFBEB',
        border: '1px solid #FDE68A',
        borderRadius: 'var(--radius-xl)',
        padding: '14px 18px',
        marginBottom: 16,
      }}
    >
      <p style={{ fontSize: 14, fontWeight: 600, color: '#92400E', margin: '0 0 4px' }}>
        참여 요청 {requests.length}건
      </p>
      <p style={{ fontSize: 12, color: '#B45309', margin: '0 0 10px' }}>
        초대한 이메일과 다른 계정으로 초대 링크를 열었습니다. 아는 분이면 수락해 주세요.
      </p>
      {error && <p role="alert" style={{ fontSize: 12, color: '#DC2626', margin: '0 0 8px' }}>{error}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {requests.map((r) => {
          const busy = busyId === r.id
          return (
            <div
              key={r.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #FEF3C7' }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0, wordBreak: 'break-all' }}>
                  {r.user_name ? `${r.user_name} · ` : ''}{r.user_email || '이메일 없음'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '2px 0 0', wordBreak: 'break-all' }}>
                  초대한 이메일 {r.invited_email || '없음'} · 역할 {ROLE_LABELS[r.requested_role] || r.requested_role}
                  {r.created_at ? ` · ${new Date(r.created_at).toLocaleString('ko-KR')}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => act(r, 'accept')} disabled={busy} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>
                  수락
                </button>
                <button type="button" onClick={() => act(r, 'reject')} disabled={busy} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
                  거절
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
