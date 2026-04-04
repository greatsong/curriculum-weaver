import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { apiGet, apiPut } from '../lib/api'

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,

  /**
   * 앱 시작 시 기존 세션을 확인하고 Auth state 변경을 구독한다
   */
  initialize: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error

      if (session?.user) {
        set({ user: session.user, session, loading: false })
      } else {
        set({ user: null, session: null, loading: false })
      }

      // Auth 상태 변경 구독
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            set({ user: session?.user ?? null, session: session ?? null })
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
  signup: async (email, password, displayName) => {
    set({ error: null })
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
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
      const updated = await apiPut('/api/auth/profile', data)
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
