import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || 'placeholder'

const navigatorLockWithFallback = async (name, acquireTimeout, fn) => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    try {
      return await navigator.locks.request(
        name,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          if (lock) return await fn()
          return await fn()
        },
      )
    } catch {
      return await fn()
    }
  }
  return await fn()
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    lock: navigatorLockWithFallback,
  },
})
