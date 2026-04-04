/**
 * Rate Limiter 미들웨어 — 100명 동시 사용자 대응
 *
 * 엔드포인트 유형별로 다른 제한을 적용하여
 * Anthropic API 보호 및 brute force 방지.
 */

import rateLimit from 'express-rate-limit'

// IPv6 안전 IP 추출 헬퍼
function safeIp(req) {
  const ip = req.ip || '0.0.0.0'
  // IPv6-mapped IPv4 (::ffff:1.2.3.4) → IPv4로 정규화
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

// ── 일반 API: 분당 120회 (사용자당) ──
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || safeIp(req),
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// ── AI 채팅: 분당 10회 (사용자당) — Anthropic API 보호 ──
export const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || safeIp(req),
  message: { error: 'AI 채팅 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// ── 인증: 분당 5회 (IP당) — brute force 방지 ──
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => safeIp(req),
  message: { error: '인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})

// ── 파일 업로드: 분당 5회 (사용자당) ──
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || safeIp(req),
  message: { error: '파일 업로드가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  validate: { xForwardedForHeader: false, default: true },
})
