/**
 * Rate Limiter 미들웨어 — 30인 학급(3인 × 10팀) 동시 사용 대응
 *
 * 학교 환경은 전원이 NAT 뒤 같은 공인 IP를 공유하므로 IP 키만 쓰면
 * 학급 전체가 한도를 함께 소진한다(수업 시작 429 폭탄). 그래서:
 * - 사용자별 한도: 검증된 사용자 id로 키를 만든다. limiter는 requireAuth보다 먼저
 *   실행되어 req.user가 없으므로, limiter 안에서 verifyTokenCached(60초 캐시)로 토큰을
 *   검증한다. 같은 캐시를 requireAuth가 이어 쓰므로 인증 서버 왕복은 늘지 않는다.
 *   토큰이 없거나 무효(만료 포함)면 IP 키로 둔다.
 * - 인증 서버 장애로 검증 자체가 예외를 던지거나 5초 안에 끝나지 않으면, 학급 전체가 IP 버킷
 *   하나를 나눠 쓰지 않도록 토큰의 sub를 별도 이름공간(s:)의 임시 키로 쓴다. 장애 중 보호 라우트는
 *   requireAuth가 어차피 거절하므로, 이 임시 키가 실제로 쓰이는 곳은 공개 라우트뿐이다.
 * - IP 백스톱: 단일 IP의 비정상 폭주를 사용자 키와 무관하게 차단
 */

import crypto from 'node:crypto'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { verifyTokenCached } from './auth.js'

// IPv6 안전 IP 추출 헬퍼
// IPv4는 주소 그대로, IPv6는 /56 대역으로 묶는다(주소를 바꿔 가며 한도를 피하지 못하게).
function safeIp(req) {
  const ip = req.ip || '0.0.0.0'
  // IPv6-mapped IPv4 (::ffff:1.2.3.4) → IPv4로 정규화
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  return ipKeyGenerator(normalized)
}

const MAX_TOKEN_LENGTH = 8192
// 무효 토큰을 짧게 기억해, 같은 토큰을 반복해 보낼 때 인증 서버를 다시 부르지 않는다
const INVALID_TOKEN_TTL_MS = 30_000
const INVALID_TOKEN_MAX = 2_000
const invalidTokens = new Map() // sha256(token) → expiresAt
// 같은 토큰의 동시 요청(페이지 첫 진입 버스트)은 검증 한 번을 함께 기다린다
const inflightVerifications = new Map() // sha256(token) → Promise<user|null>
// 검증을 기다리는 최대 시간(ms) — 넘기면 임시 키(s:)로 진행
const VERIFY_WAIT_MS = Number(process.env.RATE_LIMIT_VERIFY_WAIT_MS) || 5_000
const VERIFY_TIMED_OUT = Symbol('verify-timed-out')

function rememberInvalid(hash) {
  invalidTokens.set(hash, Date.now() + INVALID_TOKEN_TTL_MS)
  if (invalidTokens.size > INVALID_TOKEN_MAX) {
    const now = Date.now()
    for (const [k, exp] of invalidTokens) {
      if (exp <= now) invalidTokens.delete(k)
    }
    while (invalidTokens.size > INVALID_TOKEN_MAX) {
      invalidTokens.delete(invalidTokens.keys().next().value)
    }
  }
}

function isRememberedInvalid(hash) {
  const exp = invalidTokens.get(hash)
  if (!exp) return false
  if (exp <= Date.now()) {
    invalidTokens.delete(hash)
    return false
  }
  return true
}

/**
 * JWT 페이로드를 서명 검증 없이 읽는다 — 형식 사전 거름과 장애 시 임시 키 전용.
 * 이 값만으로 사용자를 식별하지 않는다.
 */
function decodeJwtPayload(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * 요청의 Bearer 토큰을 검증해 rate limit 키에 쓸 식별자를 정한다.
 * @returns {Promise<{ kind: 'user'|'degraded'|'ip', id?: string }>}
 */
async function resolveIdentity(req) {
  // 앞 단계에서 이미 인증된 경우(라우트 안쪽에 마운트된 limiter)
  if (req.user?.id) return { kind: 'user', id: String(req.user.id) }

  const authHeader = req.headers?.authorization
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return { kind: 'ip' }
  const token = authHeader.slice(7).trim()
  if (!token || token.length > MAX_TOKEN_LENGTH) return { kind: 'ip' }

  // 형식 사전 거름: JWT 모양이 아니거나 sub가 없거나 이미 만료된 토큰은 인증 서버를 부르지 않는다
  const payload = decodeJwtPayload(token)
  const sub = typeof payload?.sub === 'string' && payload.sub.length > 0 && payload.sub.length <= 64 ? payload.sub : null
  if (!sub) return { kind: 'ip' }
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return { kind: 'ip' }

  // Supabase 미설정(로컬 placeholder 모드)에서는 검증할 수 없으므로 IP 키
  if (!isSupabaseConfigured()) return { kind: 'ip' }

  const hash = crypto.createHash('sha256').update(token).digest('base64')
  if (isRememberedInvalid(hash)) return { kind: 'ip' }

  let pending = inflightVerifications.get(hash)
  if (!pending) {
    pending = verifyTokenCached(token)
    inflightVerifications.set(hash, pending)
    // 성공·실패와 관계없이 끝나면 지운다(성공 결과는 verifyTokenCached 캐시에 남는다)
    pending.then(() => inflightVerifications.delete(hash), () => inflightVerifications.delete(hash))
  }

  // 인증 서버가 응답하지 않을 때 공개 라우트까지 붙잡히지 않도록 기다리는 시간에 상한을 둔다.
  // 시간이 지나면 임시 키로 진행하고, 검증은 뒤에서 마저 끝나 캐시를 채운다.
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(VERIFY_TIMED_OUT), VERIFY_WAIT_MS)
  })
  try {
    const user = await Promise.race([pending, timeout])
    if (user === VERIFY_TIMED_OUT) return { kind: 'degraded', id: sub }
    if (user?.id) return { kind: 'user', id: String(user.id) }
    rememberInvalid(hash)
    return { kind: 'ip' }
  } catch {
    // 인증 서버 장애 — 학급 전체가 IP 버킷 하나로 몰리지 않게 임시 키를 쓴다
    return { kind: 'degraded', id: sub }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 사용자 단위 키: 검증된 사용자 id → (장애 시) 임시 sub 키 → IP 순.
 * 같은 학교 IP를 공유해도 사용자별로 독립 버킷을 쓴다.
 * 한 요청에 limiter가 여러 개 걸려도 검증은 한 번만 한다.
 */
async function userKey(req) {
  if (!req._rlIdentityPromise) req._rlIdentityPromise = resolveIdentity(req)
  const identity = await req._rlIdentityPromise
  if (identity.kind === 'user') return `u:${identity.id}`
  if (identity.kind === 'degraded') return `s:${identity.id}`
  return `ip:${safeIp(req)}`
}

// ── IP 백스톱: 분당 3,000회 (IP당) — 플러딩 방지 ──
// 30인 학급의 정상 피크(진입 버스트 + 자료 폴링 + 일반 사용)를 넉넉히 수용하면서
// 단일 IP의 비정상 폭주만 차단한다.
export const ipBackstopLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => safeIp(req),
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// ── 일반 API: 분당 240회 (사용자당) ──
// 절차를 한 번 옮기면 보드·성취기준·자료·원리 조회와 안내·이동 기록으로 8~9회 요청이 나간다.
// 19개 절차를 빠르게 둘러보면 1분 안에 150회를 넘어 120회 한도에서 보드 조회가 막혔다(2026-10-04 측정).
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// ── AI 채팅: 분당 10회 (사용자당) — Anthropic API 보호 ──
export const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { error: 'AI 채팅 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// ── 미래보기(관리자 전용): 분당 40회 (사용자당, GET 제외) ──
// 여덟 관점을 한꺼번에 요청하고 조합을 바꿔 가며 넘기는 속도보다 넉넉하게 잡는다.
export const futures2Limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  skip: (req) => req.method === 'GET',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { error: '미래를 너무 빠르게 넘기고 있습니다. 잠시 후 다시 넘겨 주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// ── 수업 시나리오 생성: 분당 20회 (사용자당) ──
// 카드를 여는 속도보다 넉넉하게 잡는다. 캐시된 응답도 같은 한도에 포함된다.
export const scenarioLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { error: '수업 아이디어 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// ── 로그인/가입: 분당 10회 (IP+이메일당) — brute force 방지 ──
// IP 단독 키는 학교 NAT에서 학급 전체가 분당 5회를 공유해 수업 시작 로그인이
// 막히던 문제가 있었다. 계정(brute force) 단위 보호가 목적이므로 이메일을 키에 포함.
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase().slice(0, 254)
      : ''
    return `${safeIp(req)}:${email}`
  },
  message: { error: '인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// ── 파일 업로드: 분당 5회 (사용자당) ──
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { error: '파일 업로드가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// 내부 테스트용 export
export const _internal = {
  userKey,
  resolveIdentity,
  safeIp,
  resetCaches() {
    invalidTokens.clear()
    inflightVerifications.clear()
  },
}
