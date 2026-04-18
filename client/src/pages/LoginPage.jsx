import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import Logo from '../components/Logo'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, signup, signInWithGoogle, error, clearError } = useAuthStore()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [subject, setSubject] = useState('')
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const handleGoogleLogin = async () => {
    setGoogleSubmitting(true)
    clearError()
    try {
      await signInWithGoogle()
      // Supabase가 브라우저를 Google로 리다이렉트하므로 여기서 navigate 불필요
    } catch {
      setGoogleSubmitting(false)
    }
  }

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'signup' : 'login'))
    clearError()
    setSuccessMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    if (mode === 'signup' && (!displayName.trim() || !privacyConsent)) return

    setSubmitting(true)
    clearError()
    setSuccessMessage('')

    try {
      if (mode === 'login') {
        await login(email.trim(), password)
        navigate('/workspaces', { replace: true })
      } else {
        const data = await signup(email.trim(), password, displayName.trim(), {
          school_name: schoolName.trim(),
          subject: subject.trim(),
        })
        if (data.user && !data.session) {
          setSuccessMessage('인증 이메일이 발송되었습니다. 이메일을 확인해주세요.')
        } else {
          navigate('/workspaces', { replace: true })
        }
      }
    } catch {
      // error는 authStore에서 관리
    } finally {
      setSubmitting(false)
    }
  }

  const fieldLabelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginBottom: 6,
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #FAFBFC 0%, #EFF6FF 50%, #F5F3FF 100%)',
      }}
    >
      {/* 미니멀 로고 */}
      <div style={{ padding: '32px 32px 0' }}>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate('/') }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            transition: 'opacity var(--transition-fast)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          <Logo size={28} />
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            커리큘럼 위버
          </span>
        </a>
      </div>

      {/* 중앙 로그인 카드 */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full" style={{ maxWidth: 400 }}>
          <div
            className="animate-slide-up"
            style={{
              background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-lg)',
              padding: '40px 32px',
            }}
          >
            {/* 제목 */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h2 style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                margin: '0 0 8px',
              }}>
                {mode === 'login' ? '다시 오신 것을 환영합니다' : '새 계정 만들기'}
              </h2>
              <p style={{
                fontSize: 14,
                color: 'var(--color-text-secondary)',
                margin: 0,
              }}>
                {mode === 'login'
                  ? 'AI와 함께 협력적 수업을 설계해보세요!'
                  : '팀과 함께 융합 수업을 설계하세요'}
              </p>
            </div>

            {/* Google OAuth 버튼 */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleSubmitting || submitting}
              style={{
                width: '100%',
                padding: '11px 16px',
                background: '#fff',
                color: '#1F2937',
                border: '1px solid #D1D5DB',
                borderRadius: 'var(--radius-md)',
                fontSize: 14,
                fontWeight: 500,
                cursor: googleSubmitting ? 'not-allowed' : 'pointer',
                opacity: googleSubmitting ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                transition: 'all var(--transition-fast)',
                fontFamily: 'var(--font-sans)',
                marginBottom: 16,
              }}
              onMouseEnter={(e) => { if (!googleSubmitting) e.currentTarget.style.background = '#F9FAFB' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C40.9 35.5 44 30.2 44 24c0-1.2-.1-2.4-.4-3.5z"/>
              </svg>
              {googleSubmitting ? '이동 중...' : 'Google로 계속하기'}
            </button>

            {/* 구분선 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              margin: '0 0 16px',
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              <span>또는 이메일로</span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 회원가입 추가 필드 */}
              {mode === 'signup' && (
                <>
                  <div>
                    <label style={fieldLabelStyle}>이름 *</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="예: 김교사"
                      maxLength={20}
                      required
                      style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={fieldLabelStyle}>소속 학교</label>
                    <input
                      type="text"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="예: OO중학교"
                      maxLength={50}
                      style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={fieldLabelStyle}>담당 교과</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="예: 과학, 수학"
                      maxLength={50}
                      style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </div>
                </>
              )}

              {/* 이메일 */}
              <div>
                <label style={fieldLabelStyle}>이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seoul@sen.go.kr"
                  required
                  autoComplete="email"
                  style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              {/* 비밀번호 */}
              <div>
                <label style={fieldLabelStyle}>비밀번호</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? '6자 이상 입력' : '비밀번호 입력'}
                    required
                    minLength={mode === 'signup' ? 6 : undefined}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    style={{ width: '100%', padding: '10px 40px 10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 4,
                      cursor: 'pointer',
                      color: 'var(--color-text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 개인정보 동의 (회원가입) */}
              {mode === 'signup' && (
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  lineHeight: 1.5,
                }}>
                  <input
                    type="checkbox"
                    checked={privacyConsent}
                    onChange={(e) => setPrivacyConsent(e.target.checked)}
                    style={{ marginTop: 3, accentColor: '#3B82F6' }}
                  />
                  <span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>[필수]</strong> 개인정보 수집·이용에 동의합니다.
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                      수집 항목: 이름, 이메일, 소속, 담당 교과 | 목적: 서비스 제공 및 팀 협업 | 보유 기간: 회원 탈퇴 시까지
                    </span>
                  </span>
                </label>
              )}

              {/* 에러 */}
              {error && (
                <div style={{
                  padding: '10px 14px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  color: '#DC2626',
                }}>
                  {error}
                </div>
              )}

              {/* 성공 */}
              {successMessage && (
                <div style={{
                  padding: '10px 14px',
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  color: '#16A34A',
                }}>
                  {successMessage}
                </div>
              )}

              {/* 제출 */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#111827',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.5 : 1,
                  transition: 'all var(--transition-fast)',
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = '#1F2937' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#111827' }}
              >
                {submitting
                  ? '처리 중...'
                  : mode === 'login'
                    ? '로그인'
                    : '계정 만들기'}
              </button>
            </form>

            {/* 모드 전환 */}
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
                {mode === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}
                <button
                  onClick={toggleMode}
                  style={{
                    marginLeft: 6,
                    background: 'none',
                    border: 'none',
                    color: '#3B82F6',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#2563EB'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#3B82F6'}
                >
                  {mode === 'login' ? '회원가입' : '로그인'}
                </button>
              </p>
            </div>
          </div>

          {/* 하단 설명 */}
          <p style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            marginTop: 24,
          }}>
            서울특별시교육청 &middot; Human-AI Agency
          </p>
        </div>
      </main>
    </div>
  )
}
