import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import Logo from '../components/Logo'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, signup, error, clearError } = useAuthStore()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'signup' : 'login'))
    clearError()
    setSuccessMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    if (mode === 'signup' && !displayName.trim()) return

    setSubmitting(true)
    clearError()
    setSuccessMessage('')

    try {
      if (mode === 'login') {
        await login(email.trim(), password)
        navigate('/workspaces', { replace: true })
      } else {
        const data = await signup(email.trim(), password, displayName.trim())
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
                  ? 'AI 협력 수업 설계를 시작하세요'
                  : '팀과 함께 융합 수업을 설계하세요'}
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 이름 (회원가입) */}
              {mode === 'signup' && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 6,
                  }}>
                    이름
                  </label>
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
              )}

              {/* 이메일 */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 6,
                }}>
                  이메일
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teacher@school.edu"
                  required
                  autoComplete="email"
                  style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              {/* 비밀번호 */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 6,
                }}>
                  비밀번호
                </label>
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
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            marginTop: 24,
          }}>
            40가지 설계 원리 기반 AI 협력 수업설계 플랫폼
          </p>
        </div>
      </main>
    </div>
  )
}
