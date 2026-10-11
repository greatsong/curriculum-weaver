/**
 * AI 사용 상한 (middleware/aiBudget.js) — 사용자별 하루 호출 수, 서비스 전체 하루 비용,
 * 자정 초기화, 관리자 제외, 라우트 거절 시 되돌리기. DB·인증은 가짜 함수로 바꿔 끼운다.
 */
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import {
  createAiBudget, isAiBudgetRoute, kstDayKey, kstMidnightIso, dailyLimitBody, BUDGET_EXCEEDED_BODY,
  getDailyUserLimit, getDailyBudgetUsd,
} from '../aiBudget.js'

const quietLogger = { warn: vi.fn() }

function setup(over = {}) {
  const state = { now: Date.parse('2026-10-12T03:00:00Z'), dbCounts: new Map(), cost: 0, admins: new Set() }
  const deps = {
    countUserCallsSince: vi.fn(async (userId) => state.dbCounts.get(userId) || 0),
    sumCostSince: vi.fn(async () => state.cost),
    isAdmin: vi.fn(async (userId) => state.admins.has(userId)),
    verifyToken: vi.fn(async (token) => (token.startsWith('tok-') ? { id: token.slice(4) } : null)),
    approvalOf: vi.fn(async (user) => ({ approved: user.id !== 'pending-user', status: user.id !== 'pending-user' ? 'approved' : 'pending' })),
    enabled: () => true,
    now: () => state.now,
    env: { AI_DAILY_USER_LIMIT: '3', AI_DAILY_BUDGET_USD: '10' },
    logger: quietLogger,
    ...over,
  }
  const budget = createAiBudget(deps)
  return { budget, state, deps }
}

describe('대상 경로', () => {
  it('AI를 부르는 POST 경로만 대상', () => {
    expect(isAiBudgetRoute('POST', '/api/chat/message')).toBe(true)
    expect(isAiBudgetRoute('POST', '/api/standards/recommend-ai')).toBe(true)
    expect(isAiBudgetRoute('POST', '/api/standards/links/scenario')).toBe(true)
    expect(isAiBudgetRoute('POST', '/api/materials/upload')).toBe(true)
    expect(isAiBudgetRoute('POST', '/api/materials/url?x=1')).toBe(true)
    expect(isAiBudgetRoute('POST', '/api/materials/abc-123/reanalyze')).toBe(true)
    // 정적 절차 안내는 AI를 부르지 않는다
    expect(isAiBudgetRoute('POST', '/api/chat/procedure-intro')).toBe(false)
    expect(isAiBudgetRoute('POST', '/api/chat/stage-intro')).toBe(false)
    expect(isAiBudgetRoute('POST', '/api/chat/teacher')).toBe(false)
    expect(isAiBudgetRoute('GET', '/api/chat/message')).toBe(false)
    expect(isAiBudgetRoute('GET', '/api/materials/abc/analysis')).toBe(false)
  })
  it('env 기본값: 사용자 400회, 전체 10달러', () => {
    expect(getDailyUserLimit({})).toBe(400)
    expect(getDailyBudgetUsd({})).toBe(10)
    expect(getDailyUserLimit({ AI_DAILY_USER_LIMIT: '50' })).toBe(50)
    expect(getDailyBudgetUsd({ AI_DAILY_BUDGET_USD: 'x' })).toBe(10)
    expect(dailyLimitBody(400)).toEqual({ code: 'ai_daily_limit', error: '오늘 AI 사용량(400회)을 모두 사용했습니다. 내일 다시 이용해 주세요.' })
  })
  it('한국 시간 날짜·자정 계산', () => {
    expect(kstDayKey(Date.parse('2026-10-11T14:59:59Z'))).toBe('2026-10-11')
    expect(kstDayKey(Date.parse('2026-10-11T15:00:00Z'))).toBe('2026-10-12')
    expect(kstMidnightIso(Date.parse('2026-10-12T03:00:00Z'))).toBe('2026-10-11T15:00:00.000Z')
  })
})

describe('사용자별 하루 호출 수', () => {
  it('첫 요청에서 DB 값으로 초기화하고, 이후에는 메모리로 센다', async () => {
    const { budget, state, deps } = setup()
    state.dbCounts.set('u1', 1)
    expect((await budget.checkUser('u1')).ok).toBe(true) // 2
    expect((await budget.checkUser('u1')).ok).toBe(true) // 3
    const third = await budget.checkUser('u1')
    expect(third).toEqual({ ok: false, status: 429, body: dailyLimitBody(3) })
    expect(deps.countUserCallsSince).toHaveBeenCalledTimes(1)
    expect(deps.countUserCallsSince).toHaveBeenCalledWith('u1', '2026-10-11T15:00:00.000Z')
  })

  it('한국 시간 자정이 지나면 다시 DB로 초기화한다', async () => {
    const { budget, state, deps } = setup()
    state.dbCounts.set('u2', 3)
    expect((await budget.checkUser('u2')).ok).toBe(false)
    state.now = Date.parse('2026-10-12T15:00:01Z') // 다음 날 00:00:01 KST
    state.dbCounts.set('u2', 0)
    expect((await budget.checkUser('u2')).ok).toBe(true)
    expect(deps.countUserCallsSince).toHaveBeenCalledTimes(2)
    expect(deps.countUserCallsSince).toHaveBeenLastCalledWith('u2', '2026-10-12T15:00:00.000Z')
  })

  it('관리자는 사용자 상한·전체 상한 모두 제외', async () => {
    const { budget, state, deps } = setup()
    state.admins.add('boss')
    state.dbCounts.set('boss', 999)
    state.cost = 50
    expect((await budget.checkUser('boss')).ok).toBe(true)
    expect(deps.countUserCallsSince).not.toHaveBeenCalled()
  })

  it('release는 한 번만 1을 되돌린다', async () => {
    const { budget, state } = setup()
    state.dbCounts.set('u3', 2)
    const r = await budget.checkUser('u3') // 3
    r.release(); r.release()
    expect((await budget.checkUser('u3')).ok).toBe(true) // 다시 3
    expect((await budget.checkUser('u3')).ok).toBe(false)
  })

  it('DB 조회가 실패하면 막지 않고 0부터 센다(경고만)', async () => {
    const { budget } = setup({ countUserCallsSince: vi.fn(async () => { throw new Error('db down') }) })
    expect((await budget.checkUser('u4')).ok).toBe(true)
  })
})

describe('서비스 전체 하루 비용', () => {
  it('오늘 비용이 한도 이상이면 모두 429 ai_budget_exceeded, 경고 로그', async () => {
    const logger = { warn: vi.fn() }
    const { budget, state } = setup({ logger })
    state.cost = 10.01
    expect(await budget.checkUser('u1')).toEqual({ ok: false, status: 429, body: { ...BUDGET_EXCEEDED_BODY } })
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('한도'))
  })

  it('합계는 60초 캐시한다', async () => {
    const { budget, state, deps } = setup()
    state.cost = 1
    await budget.checkUser('a')
    await budget.checkUser('b')
    expect(deps.sumCostSince).toHaveBeenCalledTimes(1)
    state.now += 61_000
    await budget.checkUser('c')
    expect(deps.sumCostSince).toHaveBeenCalledTimes(2)
  })

  it('관리자 화면 상태: 오늘 비용·한도·초과 여부', async () => {
    const { budget, state } = setup()
    state.cost = 12.3456
    expect(await budget.status()).toMatchObject({ enabled: true, today_cost_usd: 12.3456, budget_usd: 10, exceeded: true, user_daily_limit: 3 })
  })

  it('Supabase가 없으면(로컬 인메모리) 통과', async () => {
    const { budget, state } = setup({ enabled: () => false })
    state.cost = 100
    expect((await budget.checkUser('u1')).ok).toBe(true)
    expect((await budget.status()).enabled).toBe(false)
  })
})

describe('미들웨어', () => {
  function appWith(budget, routeStatus = 200) {
    const app = express()
    app.use('/api', budget.middleware)
    app.post('/api/chat/message', (req, res) => res.status(routeStatus).json({ ok: true }))
    app.post('/api/chat/teacher', (req, res) => res.json({ ok: true }))
    return app
  }

  it('한도를 넘으면 라우트 전에 429와 안내 문구를 돌려준다', async () => {
    const { budget, state } = setup()
    state.dbCounts.set('u1', 3)
    const res = await request(appWith(budget)).post('/api/chat/message').set('Authorization', 'Bearer tok-u1')
    expect(res.status).toBe(429)
    expect(res.body).toEqual(dailyLimitBody(3))
  })

  it('대상이 아닌 경로·토큰 없음·승인 대기는 판단하지 않고 넘긴다', async () => {
    const { budget, state, deps } = setup()
    state.cost = 100
    const app = appWith(budget)
    expect((await request(app).post('/api/chat/teacher').set('Authorization', 'Bearer tok-u1')).status).toBe(200)
    expect((await request(app).post('/api/chat/message')).status).toBe(200)
    expect((await request(app).post('/api/chat/message').set('Authorization', 'Bearer tok-pending-user')).status).toBe(200)
    expect(deps.sumCostSince).not.toHaveBeenCalled()
  })

  it('라우트가 요청을 거절하면(4xx) 센 것을 되돌린다', async () => {
    const { budget, state } = setup()
    state.dbCounts.set('u5', 2)
    const rejecting = appWith(budget, 403)
    const r1 = await request(rejecting).post('/api/chat/message').set('Authorization', 'Bearer tok-u5')
    expect(r1.status).toBe(403)
    // 거절된 요청은 세지 않았으므로 한 번 더 통과한다
    const ok = appWith(budget, 200)
    expect((await request(ok).post('/api/chat/message').set('Authorization', 'Bearer tok-u5')).status).toBe(200)
    expect((await request(ok).post('/api/chat/message').set('Authorization', 'Bearer tok-u5')).status).toBe(429)
  })
})
