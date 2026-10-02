/**
 * POST /api/futures2 라우트 — 인증, 입력 검증, 오류 상태 매핑.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { futures2Limiter, aiChatLimiter } from '../../middleware/rateLimit.js'

const gen = vi.hoisted(() => ({ impl: null }))
const bridge = vi.hoisted(() => ({ impl: null }))

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, res, next) => {
    if (!req.get('x-test-user')) return res.status(401).json({ error: '인증이 필요합니다.' })
    req.user = { id: req.get('x-test-user') }
    next()
  },
}))

vi.mock('../../services/futures2Generator.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, generateFuture: vi.fn((args) => gen.impl(args)), generateBridges: vi.fn((args) => bridge.impl(args)) }
})

const { futures2Router } = await import('../futures2.js')
const { FutureError, generateFuture, generateBridges } = await import('../../services/futures2Generator.js')
const { initStore, Standards } = await import('../../lib/store.js')
initStore()

const app = express()
app.use(express.json())
app.use('/api/futures2', futures2Router)
const keys = Standards.list().slice(0, 3).map((s) => s.key)
const post = (body, user = 'teacher') => {
  const r = request(app).post('/api/futures2')
  return (user ? r.set('x-test-user', user) : r).send(body)
}

beforeEach(() => {
  vi.clearAllMocks()
  gen.impl = async ({ index }) => ({ future: { title: `미래 ${index}`, roles: [] }, cached: false })
})

describe('POST /api/futures2', () => {
  it('로그인하지 않으면 401', async () => {
    expect((await post({ codes: keys, index: 0 }, null)).status).toBe(401)
    expect(generateFuture).not.toHaveBeenCalled()
  })
  it('성취기준이 1개면 400이고 생성하지 않는다', async () => {
    const res = await post({ codes: keys.slice(0, 1), index: 0 })
    expect(res.status).toBe(400)
    expect(generateFuture).not.toHaveBeenCalled()
  })
  it('정상 요청은 미래를 돌려준다', async () => {
    const res = await post({ codes: keys, model: 'precise', index: 4 })
    expect(res.status).toBe(200)
    expect(res.body.future.title).toBe('미래 4')
    expect(generateFuture.mock.calls[0][0]).toMatchObject({ modelKey: 'precise', index: 4 })
  })
  it('생성기 오류 상태를 그대로 전달하고, 그 밖의 오류는 500', async () => {
    gen.impl = async () => { throw new FutureError(422, '거절') }
    expect((await post({ codes: keys, index: 0 })).status).toBe(422)
    gen.impl = async () => { throw new Error('네트워크') }
    const res = await post({ codes: keys, index: 0 })
    expect(res.status).toBe(500)
    expect(res.body.error).not.toContain('네트워크')
  })
})

describe('GET /api/futures2/catalog · POST /api/futures2/bridges', () => {
  const get = (url, user = 'teacher') => { const r = request(app).get(url); return user ? r.set('x-test-user', user) : r }
  it('로그인하지 않으면 401', async () => {
    expect((await get('/api/futures2/catalog', null)).status).toBe(401)
    expect((await request(app).post('/api/futures2/bridges').send({ codes: keys })).status).toBe(401)
  })
  it('목록은 전체 성취기준을 가벼운 행으로 준다', async () => {
    const res = await get('/api/futures2/catalog')
    expect(res.status).toBe(200)
    expect(res.body.fields[0]).toBe('key')
    expect(res.body.rows).toHaveLength(Standards.list().length)
    const first = Standards.list()[0]
    expect(res.body.rows[0]).toEqual([first.key, first.code, first.subject, first.subject_group, first.school_level, first.curriculum_category || '', first.content])
  })
  it('연결 찾기는 성취기준 2~6개를 검증하고 생성 결과를 돌려준다', async () => {
    const one = await request(app).post('/api/futures2/bridges').set('x-test-user', 't').send({ codes: keys.slice(0, 1) })
    expect(one.status).toBe(400)
    expect(generateBridges).not.toHaveBeenCalled()
    bridge.impl = async () => ({ bridges: { keywords: {}, concepts: [], isolated: keys }, cached: true })
    const ok = await request(app).post('/api/futures2/bridges').set('x-test-user', 't').send({ codes: keys })
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ bridges: { keywords: {}, concepts: [], isolated: keys }, cached: true })
    expect(generateBridges.mock.calls[0][0].standards.map((s) => s.key)).toEqual(keys)
  })
  it('연결 찾기 실패는 상태 코드를 지켜 전달한다', async () => {
    bridge.impl = async () => { throw new FutureError(502, '연결 개념을 그리지 못했습니다.') }
    const res = await request(app).post('/api/futures2/bridges').set('x-test-user', 't').send({ codes: keys })
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch('연결')
  })
})

describe('미래 보기 2 전용 요청 한도', () => {
  const limitedApp = express()
  limitedApp.use(express.json())
  limitedApp.use((req, _res, next) => { req.user = { id: req.get('x-test-user') }; next() })
  limitedApp.use('/api/futures2', futures2Limiter, futures2Router)
  limitedApp.post('/api/chat/message', aiChatLimiter, (_req, res) => res.json({ ok: true }))

  it('생성 40회 이후 제한하지만 다른 교사와 채팅 한도는 공유하지 않는다', async () => {
    for (let i = 0; i < 40; i++) {
      const res = await request(limitedApp).post('/api/futures2').set('x-test-user', 'limit-owner').send({ codes: keys, index: 0 })
      expect(res.status).toBe(200)
    }
    expect((await request(limitedApp).post('/api/futures2').set('x-test-user', 'limit-owner').send({ codes: keys, index: 0 })).status).toBe(429)
    expect((await request(limitedApp).post('/api/futures2').set('x-test-user', 'limit-peer').send({ codes: keys, index: 0 })).status).toBe(200)
    expect((await request(limitedApp).post('/api/chat/message').set('x-test-user', 'limit-owner').send({})).status).toBe(200)
  })

  it('목록 조회는 미래 생성 한도를 차감하지 않는다', async () => {
    for (let i = 0; i < 42; i++) {
      expect((await request(limitedApp).get('/api/futures2/catalog').set('x-test-user', 'catalog-owner')).status).toBe(200)
    }
    expect((await request(limitedApp).post('/api/futures2').set('x-test-user', 'catalog-owner').send({ codes: keys, index: 0 })).status).toBe(200)
  })
})
