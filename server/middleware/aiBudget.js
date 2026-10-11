/**
 * AI 사용 상한 (2026-10-11)
 *
 * 두 가지 상한을 건다. 관리자(users.role='admin')는 둘 다 제외한다.
 *   1. 사용자별 하루 호출 수 — 한국 시간 자정 이후 ai_usage의 그 사용자 성공 행(error_code IS NULL) 수가
 *      AI_DAILY_USER_LIMIT(기본 400) 이상이면 429 ai_daily_limit.
 *      매 요청 DB를 읽지 않도록 사용자별 메모리 카운트를 쓴다: 그날 첫 요청에서 DB 값으로 초기화하고,
 *      통과할 때 1 올리고, 라우트가 요청을 거절(4xx·5xx)하면 되돌리고, 자정이 지나면 다시 초기화한다.
 *   2. 서비스 전체 하루 비용 — 오늘 ai_usage 비용 합계(lib/aiPricing.js 추정치)가 AI_DAILY_BUDGET_USD(기본 10)
 *      이상이면 모든 사용자 429 ai_budget_exceeded. 합계는 60초 캐시.
 *
 * index.js에서 라우터보다 먼저 실행되므로 토큰을 직접 검증(verifyTokenCached, 60초 캐시)해 사용자를 얻는다.
 * 토큰이 없거나 무효이거나 승인 대기면 판단하지 않고 넘긴다(뒤의 requireAuth가 401·403으로 막는다).
 * Supabase가 없는 로컬 인메모리 개발에서는 아무것도 하지 않는다.
 * 사용량 조회가 실패하면 서비스를 막지 않고 경고만 남긴다(상한은 비용 안전망이라 장애 때는 통과시킨다).
 */
import { verifyTokenCached } from './auth.js'
import { resolveApproval, isAdminUser, isSupabaseConfigured } from '../lib/approval.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { estimateCost } from '../lib/aiPricing.js'

/** 상한을 거는 경로 — AI를 실제로 부르는 POST 요청만. 정적 절차 안내(procedure-intro·stage-intro)는 AI를 부르지 않아 제외한다 */
export const AI_BUDGET_ROUTES = Object.freeze([
  /^\/api\/chat\/message\/?$/,
  /^\/api\/standards\/recommend-ai\/?$/,
  /^\/api\/standards\/links\/scenario\/?$/,
  /^\/api\/materials\/upload\/?$/,
  /^\/api\/materials\/url\/?$/,
  /^\/api\/materials\/[^/]+\/reanalyze\/?$/,
])

const DEFAULT_USER_LIMIT = 400
const DEFAULT_BUDGET_USD = 10
const COST_CACHE_TTL_MS = 60_000
const KST_OFFSET_MS = 9 * 3_600_000
const DAY_MS = 86_400_000

export function isAiBudgetRoute(method, path) {
  if (String(method || '').toUpperCase() !== 'POST') return false
  const clean = String(path || '').split('?')[0]
  return AI_BUDGET_ROUTES.some((re) => re.test(clean))
}

export function getDailyUserLimit(env = process.env) {
  const n = Number.parseInt(String(env.AI_DAILY_USER_LIMIT ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USER_LIMIT
}

export function getDailyBudgetUsd(env = process.env) {
  const n = Number.parseFloat(String(env.AI_DAILY_BUDGET_USD ?? ''))
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET_USD
}

/** 한국 시간 날짜 키 (YYYY-MM-DD) */
export function kstDayKey(nowMs = Date.now()) {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 한국 시간 오늘 자정의 ISO 시각 */
export function kstMidnightIso(nowMs = Date.now()) {
  const kstMs = nowMs + KST_OFFSET_MS
  return new Date(kstMs - (kstMs % DAY_MS) - KST_OFFSET_MS).toISOString()
}

export function dailyLimitBody(limit) {
  return { code: 'ai_daily_limit', error: `오늘 AI 사용량(${limit}회)을 모두 사용했습니다. 내일 다시 이용해 주세요.` }
}

export const BUDGET_EXCEEDED_BODY = Object.freeze({
  code: 'ai_budget_exceeded',
  error: '오늘 서비스 전체 AI 사용량이 한도에 도달했습니다. 관리자에게 문의해 주세요.',
})

// ── DB 조회 (기본 구현) ──────────────────────────────────────────

/** 오늘(한국 시간) 그 사용자의 성공한 AI 호출 수 */
async function countUserCallsSinceDb(userId, sinceIso) {
  const { count, error } = await supabaseAdmin.from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('error_code', null)
    .gte('created_at', sinceIso)
  if (error) throw error
  return Number.isFinite(count) ? count : 0
}

/** 오늘(한국 시간) 전체 AI 비용 추정 합계(달러) */
async function sumCostSinceDb(sinceIso) {
  let total = 0
  for (let off = 0; off < 200_000; off += 1000) {
    const { data, error } = await supabaseAdmin.from('ai_usage')
      .select('model, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens')
      .gte('created_at', sinceIso)
      .order('id', { ascending: true })
      .range(off, off + 999)
    if (error) throw error
    for (const row of data || []) total += estimateCost(row) || 0
    if (!data || data.length < 1000) break
  }
  return total
}

/**
 * 상한 판단기를 만든다(테스트에서 의존성을 바꿔 끼울 수 있게).
 * @param {object} [deps]
 */
export function createAiBudget(deps = {}) {
  const {
    countUserCallsSince = countUserCallsSinceDb,
    sumCostSince = sumCostSinceDb,
    isAdmin = isAdminUser,
    verifyToken = verifyTokenCached,
    approvalOf = resolveApproval,
    enabled = () => isSupabaseConfigured(),
    now = () => Date.now(),
    env = process.env,
    logger = console,
  } = deps

  const userEntries = new Map() // userId → { day, count, ready }
  let costCache = { day: null, value: 0, fetchedAt: 0, ok: false }
  let costInflight = null

  /** 그날 사용자 카운트 항목 (첫 요청에서 DB로 초기화, 자정이 지나면 새로 만든다) */
  async function userEntry(userId) {
    const day = kstDayKey(now())
    let entry = userEntries.get(userId)
    if (!entry || entry.day !== day) {
      entry = { day, count: 0, ready: null }
      entry.ready = countUserCallsSince(userId, kstMidnightIso(now()))
        .then((n) => { entry.count += n })
        .catch((err) => logger.warn?.('[ai-budget] 사용자 사용량 조회 실패(통과시킴):', err?.message || err))
      userEntries.set(userId, entry)
      if (userEntries.size > 10_000) {
        for (const [k, v] of userEntries) if (v.day !== day) userEntries.delete(k)
      }
    }
    await entry.ready
    return entry
  }

  /** 오늘 전체 비용 (60초 캐시). 조회 실패 시 직전 값(없으면 0)을 쓴다 */
  async function todayCost({ force = false } = {}) {
    const day = kstDayKey(now())
    const fresh = costCache.day === day && now() - costCache.fetchedAt < COST_CACHE_TTL_MS
    if (fresh && !force) return costCache.value
    if (!costInflight) {
      costInflight = sumCostSince(kstMidnightIso(now()))
        .then((value) => {
          costCache = { day, value, fetchedAt: now(), ok: true }
          const budget = getDailyBudgetUsd(env)
          if (value >= budget) {
            logger.warn?.(`[ai-budget] 오늘 AI 비용 추정 $${value.toFixed(2)}가 한도 $${budget}에 도달했습니다. 관리자 외 AI 요청을 막습니다.`)
          }
          return value
        })
        .catch((err) => {
          logger.warn?.('[ai-budget] 오늘 비용 합계 조회 실패(직전 값 사용):', err?.message || err)
          const value = costCache.day === day ? costCache.value : 0
          costCache = { day, value, fetchedAt: now(), ok: false }
          return value
        })
        .finally(() => { costInflight = null })
    }
    return costInflight
  }

  /**
   * 한 사용자의 AI 요청 한 건을 판단한다.
   * @returns {Promise<{ ok: true, release: () => void } | { ok: false, status: number, body: object }>}
   */
  async function checkUser(userId) {
    const pass = { ok: true, release: () => {} }
    if (!enabled() || !userId) return pass
    if (await isAdmin(userId)) return pass

    const budget = getDailyBudgetUsd(env)
    const spent = await todayCost()
    if (spent >= budget) return { ok: false, status: 429, body: { ...BUDGET_EXCEEDED_BODY } }

    const limit = getDailyUserLimit(env)
    const entry = await userEntry(userId)
    if (entry.count >= limit) return { ok: false, status: 429, body: dailyLimitBody(limit) }
    entry.count += 1
    let released = false
    return {
      ok: true,
      release: () => {
        if (released) return
        released = true
        if (userEntries.get(userId) === entry) entry.count = Math.max(0, entry.count - 1)
      },
    }
  }

  /** Express 미들웨어 — index.js에서 /api에 마운트한다 */
  async function middleware(req, res, next) {
    const path = String(req.originalUrl || req.url || '').split('?')[0]
    if (!isAiBudgetRoute(req.method, path) || !enabled()) return next()
    const header = req.headers?.authorization
    if (!header?.startsWith('Bearer ')) return next()

    let user = null
    try {
      user = await verifyToken(header.slice(7))
    } catch {
      return next() // 인증 판단은 requireAuth에 맡긴다
    }
    if (!user) return next()
    const approval = await approvalOf(user).catch(() => null)
    if (!approval?.approved) return next()

    let result
    try {
      result = await checkUser(user.id)
    } catch (err) {
      logger.warn?.('[ai-budget] 상한 판단 실패(통과시킴):', err?.message || err)
      return next()
    }
    if (!result.ok) return res.status(result.status).json(result.body)

    // 라우트가 요청을 거절하면(권한·형식·진행 중 등 4xx·5xx) 셈을 되돌린다
    const settle = () => { if (res.statusCode >= 400) result.release() }
    res.once?.('finish', settle)
    res.once?.('close', settle)
    next()
  }

  /** 관리자 화면용 상태 — 오늘 비용·한도·초과 여부 */
  async function status({ force = false } = {}) {
    const budget = getDailyBudgetUsd(env)
    if (!enabled()) {
      return { enabled: false, today_cost_usd: 0, budget_usd: budget, exceeded: false, user_daily_limit: getDailyUserLimit(env) }
    }
    const spent = await todayCost({ force })
    return {
      enabled: true,
      day: kstDayKey(now()),
      today_cost_usd: Number(spent.toFixed(4)),
      budget_usd: budget,
      exceeded: spent >= budget,
      user_daily_limit: getDailyUserLimit(env),
      cost_checked_at: costCache.fetchedAt ? new Date(costCache.fetchedAt).toISOString() : null,
      cost_query_ok: costCache.ok,
    }
  }

  return { middleware, checkUser, status, todayCost, _userEntries: userEntries }
}

const defaultBudget = createAiBudget()

/** index.js에 마운트하는 기본 미들웨어 */
export const aiBudget = defaultBudget.middleware

/** 라우트 안에서 직접 판단할 때(예: 시연 모드 AI 안내) — req.user가 이미 있는 경우 */
export const checkAiBudgetForUser = defaultBudget.checkUser

/** 관리자 사용량 응답에 붙이는 오늘 비용·한도 상태 */
export const getAiBudgetStatus = defaultBudget.status
