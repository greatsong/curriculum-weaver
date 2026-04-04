// TODO: OAuth 구현 완료 후 App.jsx 라우트에 연결할 것. 현재는 미사용 코드.
// 관련: CLAUDE.md의 "TODO: Auth 구현 계획" 참조
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-gray-500">로그인 처리 중...</p>
      </div>
    </div>
  )
}
