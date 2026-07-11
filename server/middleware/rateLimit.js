/**
 * Rate Limiter 미들웨어 — 30인 학급(3인 × 10팀) 동시 사용 대응
 *
 * 학교 환경은 전원이 NAT 뒤 같은 공인 IP를 공유하므로 IP 키만 쓰면
 * 학급 전체가 한도를 함께 소진한다(수업 시작 429 폭탄). 그래서:
 * - 사용자별 한도: JWT의 sub 클레임으로 키 (limiter가 requireAuth보다 먼저
 *   실행되어 req.user가 없으므로, 서명 검증 없이 sub만 디코드해 버킷 키로 사용.
 *   위조 sub는 자기 버킷만 만들 뿐이고, 실제 인증은 requireAuth가 담당)
 * - IP 백스톱: 위조 sub 회전으로 사용자별 한도를 우회하는 단일 IP 폭주 차단
 */

import rateLimit from 'express-rate-limit'

// IPv6 안전 IP 추출 헬퍼
function safeIp(req) {
  const ip = req.ip || '0.0.0.0'
  // IPv6-mapped IPv4 (::ffff:1.2.3.4) → IPv4로 정규화
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

/**
 * Bearer JWT에서 sub 클레임 추출 (서명 검증 없음 — rate limit 버킷 키 전용).
 * 파싱 실패 시 null. 요청당 1회만 파싱하도록 req에 캐시.
 */
function jwtSub(req) {
  if (req._rlJwtSub !== undefined) return req._rlJwtSub
  let sub = null
  try {
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const parts = authHeader.slice(7).split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
        if (typeof payload?.sub === 'string' && payload.sub.length <= 64) sub = payload.sub
      }
    }
  } catch {
    sub = null
  }
  req._rlJwtSub = sub
  return sub
}

/**
 * 사용자 단위 키: 검증된 req.user → JWT sub → IP 순.
 * (같은 학교 IP를 공유해도 사용자별로 독립 버킷)
 */
function userKey(req) {
  const id = req.user?.id || jwtSub(req)
  return id ? `u:${id}` : `ip:${safeIp(req)}`
}

// ── IP 백스톱: 분당 3,000회 (IP당) — 위조 sub 회전·플러딩 방지 ──
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

// ── 일반 API: 분당 120회 (사용자당) ──
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
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
