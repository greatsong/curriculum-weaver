/**
 * 로그인했지만 현재 버전의 개인정보 동의 기록이 없는 사용자에게 한 번 묻는 화면.
 * Google로 처음 로그인한 사람(가입 화면의 동의 체크를 거치지 않음)과, 동의 기록이 없던 기존 회원이 대상이다.
 *
 * 저장(updateUser)에 실패해도 사용자가 동의 버튼을 누른 뒤라면 이번 접속은 그대로 시작할 수 있게 한다
 * (연수 중 저장 장애로 서비스 진입이 막히지 않게). 그 경우 다음 접속 때 다시 묻는다.
 */
import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { CONSENT_TEXT, markSessionConsent, hasPrivacyConsent, hasSessionConsent } from '../lib/privacyConsent'
import PrivacyConsentFields, { isConsentComplete } from './PrivacyConsentFields'
import Logo from './Logo'

/** 로그인한 사용자의 동의 기록을 확인해 없으면 동의 화면, 있으면 원래 화면을 보여 준다(ProtectedRoute가 사용). */
export function RequirePrivacyConsent({ user, children }) {
  // 동의 기록 저장에 실패해 '이번 접속만 시작'을 고른 직후 화면을 다시 그리기 위한 상태
  const [sessionPassed, setSessionPassed] = useState(false)
  if (!sessionPassed && !hasPrivacyConsent(user) && !hasSessionConsent(user?.id)) {
    return <PrivacyConsentGate onPassed={() => setSessionPassed(true)} />
  }
  return children
}

export default function PrivacyConsentGate({ onPassed }) {
  const user = useAuthStore((s) => s.user)
  const acceptPrivacyConsent = useAuthStore((s) => s.acceptPrivacyConsent)
  const logout = useAuthStore((s) => s.logout)
  const [value, setValue] = useState({ collection: false })
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const complete = isConsentComplete(value)

  const agree = async () => {
    if (!complete || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await acceptPrivacyConsent()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const continueThisSession = () => {
    markSessionConsent(user?.id)
    onPassed?.()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #EFF6FF 50%, #F5F3FF 100%)', padding: 16 }}>
      <div
        data-testid="privacy-consent-gate"
        style={{ width: '100%', maxWidth: 520, background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-xl, 16px)', boxShadow: 'var(--shadow-lg)', padding: '28px 24px', fontFamily: 'var(--font-sans)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Logo /></div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text-primary)', textAlign: 'center' }}>{CONSENT_TEXT.title}</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 6px' }}>{CONSENT_TEXT.intro}</p>
        {user?.email && <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 14px' }}>{user.email}</p>}

        <PrivacyConsentFields value={value} onChange={setValue} idPrefix="gate" />

        {failed && (
          <div role="alert" style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-md)', fontSize: 13, color: '#DC2626', lineHeight: 1.5 }}>
            {CONSENT_TEXT.saveError}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={agree} disabled={saving} style={smallButton('#DC2626')}>{CONSENT_TEXT.retryButton}</button>
              <button type="button" onClick={continueThisSession} style={smallButton('#6B7280')}>{CONSENT_TEXT.continueButton}</button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={agree}
          disabled={!complete || saving}
          style={{ marginTop: 16, width: '100%', padding: '12px 16px', background: complete ? '#111827' : '#9CA3AF', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, cursor: complete && !saving ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)' }}
        >
          {saving ? '저장 중...' : CONSENT_TEXT.agreeButton}
        </button>
        <button
          type="button"
          onClick={() => logout?.()}
          style={{ marginTop: 8, width: '100%', padding: '10px 16px', background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
        >
          {CONSENT_TEXT.logoutButton}
        </button>
      </div>
    </div>
  )
}

function smallButton(color) {
  return { padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#fff', background: color, border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
}
