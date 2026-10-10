/**
 * 개인정보 처리방침 변경 안내 막대 — 화면 아래 가운데에 고정(2026-10-11 OpenAI 전환).
 *
 * 처리방침(lib/privacyPolicy.js change)은 "내용이 바뀌면 서비스 화면에서 미리 알린다"고 약속한다.
 * 닫으면 이 브라우저에서는 다시 보이지 않고, 안내 기간이 지나면 저절로 사라진다. 처리방침 화면에서는 숨긴다.
 */
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'

export const POLICY_NOTICE_KEY = 'cw_policy_notice_20261011_dismissed'
export const POLICY_NOTICE_UNTIL = '2026-10-31T23:59:59+09:00'
export const POLICY_NOTICE_TITLE = '개인정보 처리방침 변경 안내(10월 11일 시행)'
export const POLICY_NOTICE_MESSAGE = 'AI 채팅 응답에 OpenAI 모델을 사용합니다. 이를 위해 채팅, 설계 보드, 업로드 자료 내용이 OpenAI(미국)로 전송됩니다.'

function isDismissed() {
  try {
    return localStorage.getItem(POLICY_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

export default function PolicyNoticeBanner({ now = new Date() }) {
  const location = useLocation()
  const [dismissed, setDismissed] = useState(isDismissed)

  if (dismissed) return null
  if (now.getTime() > new Date(POLICY_NOTICE_UNTIL).getTime()) return null
  if (location.pathname.startsWith('/privacy')) return null

  const dismiss = () => {
    try { localStorage.setItem(POLICY_NOTICE_KEY, '1') } catch { /* 저장 불가 브라우저: 이번 화면에서만 닫는다 */ }
    setDismissed(true)
  }

  return (
    <div role="status" aria-live="polite" style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{POLICY_NOTICE_TITLE}</div>
          <div>{POLICY_NOTICE_MESSAGE}</div>
        </div>
        <Link to="/privacy" style={linkStyle}>처리방침 보기</Link>
        <button type="button" onClick={dismiss} aria-label="안내 닫기" style={closeStyle}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

const wrapStyle = {
  position: 'fixed',
  bottom: 12,
  left: 0,
  right: 0,
  zIndex: 10040,
  display: 'flex',
  justifyContent: 'center',
  padding: '0 16px',
  pointerEvents: 'none',
}

const cardStyle = {
  pointerEvents: 'auto',
  maxWidth: 640,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 10px 10px 16px',
  borderRadius: 12,
  background: '#1F2937',
  color: '#F9FAFB',
  boxShadow: '0 8px 24px rgba(17, 24, 39, 0.25)',
  fontSize: 13,
  lineHeight: 1.5,
  fontFamily: 'var(--font-sans, inherit)',
}

const linkStyle = {
  flexShrink: 0,
  padding: '4px 12px',
  borderRadius: 8,
  background: '#FFFFFF',
  color: '#111827',
  fontWeight: 700,
  textDecoration: 'none',
}

const closeStyle = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  color: '#F9FAFB',
  cursor: 'pointer',
}
