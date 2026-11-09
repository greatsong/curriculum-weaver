/**
 * 가입 승인 대기 안내 — 관리자가 워크스페이스 목록을 열면 승인을 기다리는 교사 수를 알린다.
 *
 * 승인 대기자는 /data의 가입 승인 탭을 열어야만 보였다. 관리자가 그 화면을 열지 않는 동안
 * 13명이 최대 한 달 가까이 기다렸다(2026-11-10 점검). 관리자에게만 렌더한다(조회도 관리자 전용 API).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../lib/api'

/** 가장 오래 기다린 사람의 대기 일수(내림) */
export function longestWaitDays(pending, now = Date.now()) {
  const times = (Array.isArray(pending) ? pending : [])
    .map((u) => Date.parse(u?.created_at || ''))
    .filter(Number.isFinite)
  if (times.length === 0) return 0
  return Math.max(0, Math.floor((now - Math.min(...times)) / 86_400_000))
}

export default function PendingApprovalNotice() {
  const [pending, setPending] = useState([])

  useEffect(() => {
    let alive = true
    apiGet('/api/admin/users/pending')
      .then((res) => { if (alive) setPending(Array.isArray(res?.pending) ? res.pending : []) })
      .catch(() => { /* 안내는 보조 기능이다. 조회에 실패하면 띄우지 않는다 */ })
    return () => { alive = false }
  }, [])

  if (pending.length === 0) return null
  const days = longestWaitDays(pending)

  return (
    <div
      data-testid="pending-approval-notice"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        padding: '10px 14px', marginBottom: 16, borderRadius: 10,
        background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: 13,
      }}
    >
      <span>
        가입 승인을 기다리는 교사가 {pending.length}명 있습니다.
        {days >= 1 && ` 가장 오래 기다린 교사는 ${days}일째입니다.`}
      </span>
      <Link to="/data" className="btn btn-secondary no-underline" style={{ padding: '4px 12px', fontSize: 12.5 }}>
        승인 화면 열기
      </Link>
    </div>
  )
}
