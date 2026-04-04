/**
 * 인증 및 권한 미들웨어
 *
 * JWT 토큰 검증 + 역할 기반 접근 제어.
 * Supabase Auth와 연동하여 사용자 인증 처리.
 */
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { getMemberRole } from '../lib/supabaseService.js'

/**
 * JWT 인증 필수 미들웨어
 *
 * Authorization: Bearer <token> 헤더에서 JWT 추출 후 Supabase로 검증.
 * 성공 시 req.user에 사용자 정보 설정.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function requireAuth(req, res, next) {
  // 개발 모드: Supabase 미설정 시 더미 사용자로 바이패스
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    req.user = {
      id: 'dev-user-001',
      email: 'dev@curriculum-weaver.local',
      user_metadata: { display_name: '개발자' },
    }
    req.token = 'dev-token'
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
  }

  const token = authHeader.slice(7)

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
      return res.status(401).json({ error: '유효하지 않은 토큰입니다.' })
    }

    req.user = user
    req.token = token
    next()
  } catch (err) {
    console.error('[auth] 토큰 검증 오류:', err.message)
    return res.status(401).json({ error: '인증 처리 중 오류가 발생했습니다.' })
  }
}

/**
 * 선택적 인증 미들웨어
 *
 * 토큰이 있으면 검증하고 req.user 설정, 없으면 그대로 통과.
 * 공개 엔드포인트에서 인증된 사용자 정보를 선택적으로 활용할 때 사용.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    req.user = null
    return next()
  }

  const token = authHeader.slice(7)

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    req.user = error ? null : user
    req.token = error ? null : token
  } catch {
    req.user = null
  }

  next()
}

/**
 * 역할 기반 접근 제어 미들웨어 팩토리
 *
 * 워크스페이스 내 사용자의 역할을 확인하여 허용된 역할만 통과시킴.
 * req.params.workspaceId 또는 req.params.id에서 워크스페이스 ID를 추출.
 *
 * @param {...string} roles - 허용할 역할 목록 ('host', 'owner', 'editor', 'viewer')
 * @returns {import('express').RequestHandler}
 *
 * @example
 * // owner 또는 host만 접근 가능
 * router.put('/:id', requireAuth, requireRole('owner', 'host'), updateHandler)
 *
 * // editor 이상 접근 가능
 * router.post('/', requireAuth, requireRole('owner', 'host', 'editor'), createHandler)
 */
export function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '인증이 필요합니다.' })
    }

    // 워크스페이스 ID 추출 (라우트 파라미터에서)
    const workspaceId = req.params.workspaceId || req.params.id
    if (!workspaceId) {
      return res.status(400).json({ error: '워크스페이스 ID가 필요합니다.' })
    }

    try {
      const userRole = await getMemberRole(workspaceId, req.user.id)
      if (!userRole) {
        return res.status(403).json({ error: '이 워크스페이스의 멤버가 아닙니다.' })
      }

      if (!roles.includes(userRole)) {
        return res.status(403).json({
          error: `이 작업에는 ${roles.join(' 또는 ')} 역할이 필요합니다. (현재: ${userRole})`
        })
      }

      req.memberRole = userRole
      next()
    } catch (err) {
      console.error('[auth] 역할 확인 오류:', err.message)
      return res.status(500).json({ error: '권한 확인 중 오류가 발생했습니다.' })
    }
  }
}

/**
 * 시스템 관리자 확인 미들웨어
 *
 * users 테이블의 role이 'admin'인 경우에만 통과.
 * requireAuth 다음에 사용해야 함.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '인증이 필요합니다.' })
  }

  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .single()

    if (data?.role !== 'admin') {
      return res.status(403).json({ error: '관리자 전용 기능입니다.' })
    }

    next()
  } catch (err) {
    console.error('[auth] 관리자 확인 오류:', err.message)
    return res.status(500).json({ error: '권한 확인 중 오류가 발생했습니다.' })
  }
}
