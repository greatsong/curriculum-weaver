import { createClient } from '@supabase/supabase-js'

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
  }

  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' })
  }

  req.user = user
  req.supabase = supabase
  next()
}

export async function requireAdmin(req, res, next) {
  const { data: userData } = await req.supabase
    .from('users')
    .select('role')
    .eq('id', req.user.id)
    .single()

  if (userData?.role !== 'admin') {
    return res.status(403).json({ error: '관리자 전용 기능입니다.' })
  }
  next()
}
