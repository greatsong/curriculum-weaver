import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { apiGet, apiPut } from '../lib/api'

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  error: null,

  /**
   * 앱 시작 시 기존 세션을 확인하고 Auth state 변경을 구독한다
   * Supabase 미설정 시 개발 모드로 자동 전환
   */
  initialize: async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

    // 개발 모드: Supabase 미설정 + Vite 개발 서버에서만 더미 사용자로 바이패스
    // 프로덕션 빌드(import.meta.env.DEV === false)에서는 절대 바이패스하지 않음
    if (import.meta.env.DEV && (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co')) {
      console.info('[Auth] 개발 모드: Supabase 미설정 → 더미 사용자로 진입')
      const devUser = {
        id: 'dev-user-001',
        email: 'dev@curriculum-weaver.local',
        user_metadata: { display_name: '개발자' },
      }
      set({ user: devUser, session: { access_token: 'dev-token', user: devUser }, loading: false, initialized: true })
      return
    }

    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error

      if (session?.user) {
        set({ user: session.user, session, loading: false, initialized: true })
      } else {
        set({ user: null, session: null, loading: false, initialized: true })
      }

      // Auth 상태 변경 구독
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            const prevUser = get().user
            const nextUser = session?.user ?? null
            // 동일 사용자면 user 객체 참조를 그대로 유지한다.
            // (탭 복귀 시 Supabase가 SIGNED_IN/TOKEN_REFRESHED를 다시 발화하는데,
            //  매번 새 user 객체를 set하면 user를 의존하는 effect들이 재실행되어
            //  진행 중이던 워크플로우 절차/단계가 초기화되는 버그가 발생한다.)
            if (prevUser && nextUser && prevUser.id === nextUser.id) {
              set({ session: session ?? null })
            } else {
              set({ user: nextUser, session: session ?? null })
            }
          } else if (event === 'SIGNED_OUT') {
            set({ user: null, session: null })
          }
        }
      )

      // cleanup 함수 저장
      set({ _authSubscription: subscription })
    } catch (err) {
      console.error('[Auth] 초기화 실패:', err)
      set({ user: null, session: null, loading: false, error: err.message })
    }
  },

  /**
   * 이메일/비밀번호 로그인
   */
  login: async (email, password) => {
    set({ error: null })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      set({ user: data.user, session: data.session })
      return data
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 이메일/비밀번호 회원가입
   */
  signup: async (email, password, displayName, extra = {}) => {
    set({ error: null })
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            school_name: extra.school_name || '',
            subject: extra.subject || '',
          },
        },
      })
      if (error) throw error
      set({ user: data.user, session: data.session })
      return data
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * Google OAuth 로그인 — Supabase 리다이렉트 플로우
   *
   * 사용자를 Google 로그인 화면으로 보낸 뒤, 완료되면 /auth/callback으로 복귀.
   * 복귀 URL은 현재 오리진 기반으로 동적 구성해서 로컬/스테이징/프로덕션 모두 대응.
   */
  signInWithGoogle: async () => {
    set({ error: null })
    try {
      const redirectTo = `${window.location.origin}/auth/callback`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (error) throw error
      return data
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 로그아웃
   */
  logout: async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      set({ user: null, session: null })
    } catch (err) {
      console.error('[Auth] 로그아웃 실패:', err)
      // 강제로 상태 초기화
      set({ user: null, session: null })
    }
  },

  /**
   * 프로필 업데이트 (서버 API 경유)
   */
  updateProfile: async (data) => {
    try {
      const updated = await apiPut('/api/auth/me', data)
      // Supabase user metadata도 업데이트
      if (data.display_name) {
        await supabase.auth.updateUser({
          data: { display_name: data.display_name },
        })
      }
      return updated
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 에러 초기화
   */
  clearError: () => set({ error: null }),

  /**
   * 구독 해제 (cleanup)
   */
  cleanup: () => {
    const sub = get()._authSubscription
    if (sub) sub.unsubscribe()
    set({ _authSubscription: null })
  },
}))
