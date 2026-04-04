import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import Logo from '../components/Logo'
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, signup, error, clearError } = useAuthStore()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
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
        // Supabase 이메일 인증이 필요한 경우
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Logo size={32} />
          <h1 className="text-xl font-bold text-gray-900">커리큘럼 위버</h1>
        </div>
      </header>

      {/* 로그인 폼 */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 sm:p-8">
            {/* 아이콘 + 제목 */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                {mode === 'login' ? (
                  <LogIn size={28} className="text-blue-600" />
                ) : (
                  <UserPlus size={28} className="text-blue-600" />
                )}
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {mode === 'login' ? '로그인' : '회원가입'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {mode === 'login'
                  ? 'AI 협력 수업 설계를 시작하세요'
                  : '새 계정을 만들어 팀에 참여하세요'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 이름 (회원가입) */}
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이름
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="예: 김교사"
                    maxLength={20}
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* 이메일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이메일
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teacher@school.edu"
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* 비밀번호 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? '6자 이상 입력' : '비밀번호 입력'}
                    required
                    minLength={mode === 'signup' ? 6 : undefined}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* 에러 메시지 */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* 성공 메시지 */}
              {successMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-600">{successMessage}</p>
                </div>
              )}

              {/* 제출 버튼 */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? '처리 중...'
                  : mode === 'login'
                    ? '로그인'
                    : '계정 만들기'}
              </button>
            </form>

            {/* 모드 전환 */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                {mode === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}
                <button
                  onClick={toggleMode}
                  className="ml-1.5 text-blue-600 font-medium hover:text-blue-700"
                >
                  {mode === 'login' ? '회원가입' : '로그인'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
