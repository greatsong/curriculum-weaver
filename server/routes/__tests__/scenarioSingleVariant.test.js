/**
 * POST /api/standards/links/scenario — 조합마다 기본 한 장면(variant 0)만 제공한다.
 * 예전의 '다른 아이디어'(variant 1~5)는 제거했다. 0이 아닌 variant는 400으로 거절하고,
 * 캐시된 기본 장면은 같은 키로 그대로 돌려준다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'teacher' }; next() },
}))

const state = vi.hoisted(() => ({ keys: [], create: null }))

vi.mock('../../lib/standardsValidator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  validateCode: (code) => ({ valid: true, matched: { code, subject: '과목', content: `${code} 내용` } }),
}))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_col, key) => ({
          maybeSingle: async () => {
            state.keys.push(key)
            return { data: { scenario: { title: '캐시된 기본 장면' } } }
          },
        }),
      }),
    }),
  },
}))

vi.mock('../../lib/anthropicClient.js', () => ({
  getAnthropic: () => ({ messages: { create: (...args) => state.create?.(...args) } }),
}))

const { standardsRouter, isDefaultScenarioVariant } = await import('../standards.js')
const app = express()
app.use(express.json())
app.use('/api/standards', standardsRouter)

const body = { concept_code: '[10공수1-01-01]', context_codes: ['[10통과1-01-01]'] }

beforeEach(() => {
  state.keys = []
  state.create = vi.fn(() => { throw new Error('캐시가 있으면 AI를 부르지 않아야 한다') })
})

describe('isDefaultScenarioVariant', () => {
  it('값이 없거나 0이면 기본 장면이다', () => {
    for (const v of [undefined, null, '', 0, '0']) expect(isDefaultScenarioVariant(v)).toBe(true)
  })
  it('0이 아닌 값은 기본 장면이 아니다', () => {
    for (const v of [1, '1', 5, -1, 'abc', true]) expect(isDefaultScenarioVariant(v)).toBe(false)
  })
})

describe('POST /api/standards/links/scenario — 한 장면만', () => {
  it('variant 없이 요청하면 캐시된 기본 장면을 돌려준다', async () => {
    const res = await request(app).post('/api/standards/links/scenario').send(body)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ scenario: { title: '캐시된 기본 장면' }, cached: true })
    // 예전 variant 0과 같은 캐시 키(접미사 없음)
    expect(state.keys).toEqual(['[10공수1-01-01]|[10통과1-01-01]'])
    expect(state.create).not.toHaveBeenCalled()
  })

  it('variant 0도 같은 캐시 키로 기본 장면을 돌려준다', async () => {
    const res = await request(app).post('/api/standards/links/scenario').send({ ...body, variant: 0 })
    expect(res.status).toBe(200)
    expect(state.keys).toEqual(['[10공수1-01-01]|[10통과1-01-01]'])
  })

  it.each([1, 5, '2'])('variant %s 요청은 캐시·AI를 거치지 않고 400으로 거절한다', async (variant) => {
    const res = await request(app).post('/api/standards/links/scenario').send({ ...body, variant })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('기본 한 장면')
    expect(state.keys).toEqual([])
    expect(state.create).not.toHaveBeenCalled()
  })
})
