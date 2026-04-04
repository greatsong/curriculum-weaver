/**
 * Rate Limiter 미들웨어 — 100명 동시 사용자 대응
 *
 * 엔드포인트 유형별로 다른 제한을 적용하여
 * Anthropic API 보호 및 brute force 방지.
 */

import rateLimit from 'express-rate-limit'

// ── 일반 API: 분당 120회 (사용자당) ──
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
})

// ── AI 채팅: 분당 10회 (사용자당) — Anthropic API 보호 ──
export const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'AI 채팅 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
})

// ── 인증: 분당 5회 (IP당) — brute force 방지 ──
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: '인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
})

// ── 파일 업로드: 분당 5회 (사용자당) ──
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: '파일 업로드가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
})
