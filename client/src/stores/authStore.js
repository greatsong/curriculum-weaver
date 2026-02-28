import { create } from 'zustand'
// import { supabase } from '../lib/supabase'  // 나중에 다시 활성화

// 테스트 모드: 더미 유저로 즉시 사용
export const useAuthStore = create((set) => ({
  user: { id: 'test-user', email: 'teacher@test.com' },
  profile: { id: 'test-user', display_name: '테스트 교사', role: 'teacher' },
  loading: false,

  initialize: () => {
    // 테스트 모드에서는 초기화 불필요
    set({ loading: false })
  },

  signOut: () => {
    // 테스트 모드에서는 로그아웃 불필요
  },

  // === 나중에 Supabase Auth 활성화 시 아래 코드 복원 ===
  // initialize: async () => {
  //   const { data: { session } } = await supabase.auth.getSession()
  //   if (session?.user) {
  //     set({ user: session.user })
  //     await get().fetchProfile()
  //   }
  //   set({ loading: false })
  //   supabase.auth.onAuthStateChange(async (event, session) => {
  //     if (event === 'SIGNED_IN' && session?.user) {
  //       set({ user: session.user })
  //       await get().fetchProfile()
  //     } else if (event === 'SIGNED_OUT') {
  //       set({ user: null, profile: null })
  //     }
  //   })
  // },
  // signInWithGoogle: async () => { ... },
  // signOut: async () => { await supabase.auth.signOut(); set({ user: null, profile: null }) },
}))
