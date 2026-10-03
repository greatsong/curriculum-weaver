/**
 * GET /api/standards/semantic-search — 사용할 수 없는 이유를 code로 구분하고, 공급자 오류 메시지는 로그에 남기지 않는다
 * (키 일부가 섞일 수 있음). 2026-10-03 검토.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({ mode: 'null', reason: 'no_api_key' }))
vi.mock('../../services/semanticSearch.js', async (importOriginal) => ({
  ...(await importOriginal()),
  semanticSearch: vi.fn(async () => {
    if (state.mode === 'throw') throw Object.assign(new Error('Incorrect API key provided: sk-proj-****abcd'), { status: 401, code: 'invalid_api_key' })
    if (state.mode === 'ok') return [{ code: '[A]', _similarity: 0.5 }]
    return null
  }),
  semanticUnavailableReason: vi.fn(() => state.reason),
}))

const { standardsRouter } = await import('../standards.js')
const app = express()
app.use('/api/standards', standardsRouter)

beforeEach(() => { state.mode = 'null'; state.reason = 'no_api_key' })

describe('의미 검색 오류 구분', () => {
  it('키가 없으면 503 no_api_key', async () => {
    const res = await request(app).get('/api/standards/semantic-search').query({ q: '기후변화' })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('no_api_key')
  })

  it('색인이 준비되지 않았으면 503 index_not_ready', async () => {
    state.reason = 'index_not_ready'
    const res = await request(app).get('/api/standards/semantic-search').query({ q: '기후변화' })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('index_not_ready')
  })

  it('공급자 오류는 500 provider_error이고 로그에 오류 메시지(키 일부)를 남기지 않는다', async () => {
    state.mode = 'throw'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(app).get('/api/standards/semantic-search').query({ q: '기후변화' })
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('provider_error')
    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).toContain('status=401')
    expect(logged).not.toContain('sk-proj')
    spy.mockRestore()
  })

  it('정상이면 결과 배열', async () => {
    state.mode = 'ok'
    const res = await request(app).get('/api/standards/semantic-search').query({ q: '기후변화' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })
})
