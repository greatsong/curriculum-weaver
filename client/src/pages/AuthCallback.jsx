/**
 * OAuth 콜백 페이지
 *
 * Supabase가 OAuth 완료 후 이 경로로 리다이렉트한다 (redirectTo 지정).
 * URL hash/query의 액세스 토큰을 detectSessionInUrl이 자동 처리하고,
 * onAuthStateChange에서 SIGNED_IN 이벤트가 발생하면 워크스페이스로 이동한다.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let unsub = null

    // 이미 세션이 확립된 상태로 들어온 경우 즉시 이동
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate('/workspaces', { replace: true })
      }
    })

    // OAuth 리다이렉트 직후 세션 확립을 기다린다
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        navigate('/workspaces', { replace: true })
      } else if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true })
      }
    })
    unsub = data.subscription

    // URL에 OAuth 에러 파라미터가 있으면 표시
    const params = new URLSearchParams(window.location.hash.replace(/^#/, '?') || window.location.search)
    const err = params.get('error_description') || params.get('error')
    if (err) setError(decodeURIComponent(err))

    // 안전장치: 8초 뒤에도 이벤트가 오지 않으면 로그인 페이지로
    const timeout = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.user) {
          navigate('/login', { replace: true })
        }
      })
    }, 8000)

    return () => {
      clearTimeout(timeout)
      unsub?.unsubscribe?.()
    }
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm mx-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-red-600 text-xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">로그인 실패</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-gray-500">로그인 처리 중...</p>
      </div>
    </div>
  )
}
