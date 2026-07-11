/**
 * 인증 및 권한 미들웨어
 *
 * JWT 토큰 검증 + 역할 기반 접근 제어.
 * Supabase Auth와 연동하여 사용자 인증 처리.
 */
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { getMemberRole } from '../lib/supabaseService.js'

// ── 로컬 dev 인증 바이패스 ─────────────────────────────────────────
// 활성 조건: DEV_AUTH_BYPASS=true **그리고** NODE_ENV !== 'production' (둘 다 필수).
// 클라이언트가 placeholder Supabase 모드(VITE_SUPABASE_URL=placeholder)로 떠서
// 토큰 없이/더미 토큰으로 요청해도, 실제 Supabase에 존재하는 dev 전용 유저로
// req.user를 설정해 로컬 E2E가 가능하게 한다. (QA ISSUE-001)
// dev 유저는 workspaces.owner_id 등 FK가 auth.users를 참조하므로 반드시 실존해야 함.
const DEV_BYPASS_EMAIL = 'dev@curriculum-weaver.local'
let _devUserPromise = null
let _devBypassLogged = false

function isDevBypassEnabled() {
  return process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production'
}

/**
 * dev 전용 유저를 idempotent하게 생성/조회하고 프로세스 내 캐시한다.
 * 실패 시 null 반환(= 바이패스 비활성) + 경고 로그.
 */
async function getDevBypassUser() {
  if (_devUserPromise) return _devUserPromise

  _devUserPromise = (async () => {
    try {
      // 1) 생성 시도 (이미 있으면 에러 → 조회로 폴백)
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: DEV_BYPASS_EMAIL,
        email_confirm: true,
        user_metadata: { display_name: '개발자' },
      })

      let user = created?.user || null
      if (!user) {
        // 2) 이미 존재 → listUsers로 조회
        const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        if (listErr) throw listErr
        user = listData?.users?.find((u) => u.email === DEV_BYPASS_EMAIL) || null
        if (!user) throw createErr || new Error(`dev 유저(${DEV_BYPASS_EMAIL}) 생성/조회 모두 실패`)
      }

      // users 프로필 upsert (public.users FK 대비)
      try {
        await supabaseAdmin.from('users').upsert({
          id: user.id,
          email: user.email,
          display_name: user.user_metadata?.display_name || '개발자',
          school_name: '',
          subject: '',
        }, { onConflict: 'id', ignoreDuplicates: false })
      } catch {
        // 프로필 upsert 실패는 무시
      }

      if (!_devBypassLogged) {
        _devBypassLogged = true
        console.warn(`[auth] DEV_AUTH_BYPASS 활성 — 미인증 요청을 dev 유저(${DEV_BYPASS_EMAIL}, ${user.id})로 처리합니다. 프로덕션에서는 절대 켜지 마세요.`)
      }
      return user
    } catch (err) {
      console.error(`[auth] DEV_AUTH_BYPASS: dev 유저 생성/조회 실패 — 바이패스 비활성. 원인: ${err.message}`)
      _devUserPromise = null // 다음 요청에서 재시도 가능
      return null
    }
  })()

  return _devUserPromise
}

/**
 * 바이패스 활성 상태에서 dev 유저로 req.user를 설정 시도.
 * @returns {Promise<boolean>} 설정 성공 여부
 */
async function tryDevBypass(req) {
  if (!isDevBypassEnabled()) return false
  const devUser = await getDevBypassUser()
  if (!devUser) return false
  req.user = devUser
  req.token = null
  return true
}

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
  // 프로덕션/스테이징에서는 반드시 환경변수가 설정되어야 함
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const isDeployment = process.env.NODE_ENV === 'production'
      || process.env.RAILWAY_ENVIRONMENT
      || process.env.VERCEL
      || process.env.RENDER
      || process.env.FLY_APP_NAME
      || process.env.HEROKU_APP_NAME
    if (isDeployment) {
      console.error('[auth] CRITICAL: Supabase 환경변수 미설정 (배포 환경)')
      return res.status(500).json({ error: '서버 인증 설정 오류. 관리자에게 문의하세요.' })
    }
    // NODE_ENV가 명시적으로 development이거나 미설정인 로컬에서만 바이패스
    if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
      console.error('[auth] CRITICAL: Supabase 미설정 + NODE_ENV가 development가 아님')
      return res.status(500).json({ error: '서버 인증 설정 오류. 관리자에게 문의하세요.' })
    }
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
    // 로컬 dev 바이패스: 토큰 없는 요청을 dev 유저로 처리
    if (await tryDevBypass(req)) return next()
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
  }

  const token = authHeader.slice(7)

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
      // 로컬 dev 바이패스: 더미/만료 토큰도 dev 유저로 처리
      if (await tryDevBypass(req)) return next()
      return res.status(401).json({ error: '유효하지 않은 토큰입니다.' })
    }

    // users 테이블에 프로필 자동 생성 (없으면 upsert)
    try {
      const displayName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '교사'
      await supabaseAdmin.from('users').upsert({
        id: user.id,
        email: user.email,
        display_name: displayName,
        school_name: user.user_metadata?.school_name || '',
        subject: user.user_metadata?.subject || '',
      }, { onConflict: 'id', ignoreDuplicates: false })
    } catch {
      // 프로필 upsert 실패는 무시 (인증 자체는 성공)
    }

    req.user = user
    req.token = token
    next()
  } catch (err) {
    console.error('[auth] 토큰 검증 오류:', err.message)
    if (await tryDevBypass(req)) return next()
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
    // 로컬 dev 바이패스: 토큰 없어도 dev 유저로 식별
    if (await tryDevBypass(req)) return next()
    req.user = null
    return next()
  }

  const token = authHeader.slice(7)

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if ((error || !user) && await tryDevBypass(req)) return next()
    req.user = error ? null : user
    req.token = error ? null : token
  } catch {
    if (await tryDevBypass(req)) return next()
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
