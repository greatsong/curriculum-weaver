import { createClient } from '@supabase/supabase-js'

// Service role: RLS 우회, 서버 전용
// Lazy 초기화 — 환경변수 없이도 서버 시작 가능
let _admin = null

function getAdmin() {
  if (!_admin) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수를 설정하세요.')
    }
    _admin = createClient(url, key)
  }
  return _admin
}

// Proxy로 lazy 초기화 — 실제 API 호출 시에만 환경변수 필요
export const supabaseAdmin = new Proxy({}, {
  get(_, prop) {
    return getAdmin()[prop]
  },
})
