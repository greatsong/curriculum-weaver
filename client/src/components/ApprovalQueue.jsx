import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../lib/api'

const PROVIDER_LABELS = { google: '구글', email: '이메일' }

/** 가입 방식 표시 */
export function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || provider || '이메일'
}

/** 목록을 못 읽었을 때 안내 — 원인(ApiError.status)에 따라 나눈다. 0은 연결 실패·시간 초과 */
export function loadErrorMessage(status) {
  if (status === 403) return '관리자 권한이 필요합니다.'
  if (!status) return '서버에 연결하지 못했습니다. 잠시 후 다시 불러와 주세요.'
  return '승인 대기 목록을 불러오지 못했습니다. 잠시 후 다시 불러와 주세요.'
}

/**
 * 관리자 가입 승인 대기 목록 (DataManage "가입 승인" 탭)
 * GET /api/admin/users/pending, POST /api/admin/users/:id/approve|reject
 *
 * @param {{ onCountChange?: (n: number) => void }} props
 */
export default function ApprovalQueue({ onCountChange }) {
  const [data, setData] = useState(null) // null=로딩 전, { pending, since, without_profile } | { error, status }
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await apiGet('/api/admin/users/pending')
      setData(res)
      onCountChange?.(res?.pending?.length || 0)
    } catch (err) {
      setData({ error: err?.message || '불러오지 못했습니다.', status: err?.status || 0, pending: [] })
    }
  }, [onCountChange])

  useEffect(() => { load() }, [load])

  const act = async (user, action) => {
    const label = action === 'approve' ? '승인' : '거절'
    if (action === 'reject' && !confirm(`${user.email} 계정을 거절할까요? 거절한 계정은 서비스를 이용할 수 없습니다.`)) return
    setBusyId(user.id)
    try {
      await apiPost(`/api/admin/users/${user.id}/${action}`, {})
      await load()
    } catch (err) {
      alert(`${label} 처리 실패: ${err?.message || '알 수 없는 오류'}`)
    } finally {
      setBusyId(null)
    }
  }

  if (!data) return <div className="py-16 text-center text-sm text-gray-400">불러오는 중…</div>
  if (data.error) {
    return (
      <div className="py-16 text-center text-sm space-y-3">
        <p className="text-red-500">{loadErrorMessage(data.status)}</p>
        {data.status !== 403 && (
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 border border-gray-200">
            다시 불러오기
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="approval-queue">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {data.since ? `${new Date(data.since).toLocaleString('ko-KR')} 이후 가입한 계정은 승인해야 이용할 수 있습니다. ` : ''}
          초대받은 이메일로 초대 링크를 연 계정은 자동으로 승인됩니다.
        </p>
        <button onClick={load} className="shrink-0 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 border border-gray-200">
          새로고침
        </button>
      </div>
      {data.without_profile > 0 && (
        <p className="text-xs text-gray-400">
          커리큘럼 위버에 로그인한 적이 없는 계정 {data.without_profile}개는 표시하지 않습니다.
          이 계정으로 커리큘럼 위버에 로그인하면 목록에 나타납니다.
        </p>
      )}
      {data.pending.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500 bg-white rounded-xl border border-gray-200">승인을 기다리는 계정이 없습니다</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">이메일</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium hidden sm:table-cell">이름</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">가입 방식</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium hidden md:table-cell">가입 시각</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.pending.map((u) => {
                const busy = busyId === u.id
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-2 break-all">
                      {u.email}
                      {u.provider === 'email' && !u.email_confirmed && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[11px] whitespace-nowrap">메일 미확인</span>
                      )}
                      <div className="sm:hidden text-xs text-gray-500">{u.name}</div>
                    </td>
                    <td className="px-4 py-2 hidden sm:table-cell">
                      {u.name || '—'}
                      {(u.school_name || u.subject) && (
                        <div className="text-xs text-gray-400">{[u.school_name, u.subject].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{providerLabel(u.provider)}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-500 hidden md:table-cell">{u.created_at ? new Date(u.created_at).toLocaleString('ko-KR') : ''}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => act(u, 'approve')}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 min-h-[36px]"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => act(u, 'reject')}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 min-h-[36px]"
                        >
                          거절
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
