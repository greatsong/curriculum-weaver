/**
 * 미래 보기 라우트 테스트 — 인증 401, 입력 검증 400(1부 §6-7 문구), 응답 계약, 오류 상태 매핑(422·502·500),
 * 생성 요청(POST) 사용자당 분당 40회 제한(GET 제외). 생성기는 mock, 요청 검증은 실제 함수.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

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

vi.mock('../../services/futureMapGenerator.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, generateFuture: vi.fn((args) => gen.impl(args)), generateBridges: vi.fn((args) => bridge.impl(args)) }
})

const { futureMapRouter } = await import('../futureMap.js')
const { futuresLimiter } = await import('../../middleware/rateLimit.js')
const { FutureError, generateFuture, generateBridges } = await import('../../services/futureMapGenerator.js')
const { initStore, Standards } = await import('../../lib/store.js')
initStore()

const app = express()
app.use(express.json())
app.use('/api/future-map', futureMapRouter)

const keys = ['[12지구01-04]', '[12한탐04-02]', '[12인수01-03]', '[12화언01-09]'].map((c) => Standards.getByCode(c).key)
const post = (url, body, user = 'teacher') => {
  const r = request(app).post(url)
  return (user ? r.set('x-test-user', user) : r).send(body)
}
const get = (url, user = 'teacher') => { const r = request(app).get(url); return user ? r.set('x-test-user', user) : r }

// 응답 계약(3부 T2) 표본
const sampleBridges = {
  keywords: { [keys[0]]: ['집중호우', '대처 방안'], [keys[1]]: ['도시화'], [keys[2]]: ['빅데이터'], [keys[3]]: ['발표'] },
  concepts: [{ label: '도시 침수 위험', kind: 'same', strength: 3, ends: [{ key: keys[0], word: '집중호우' }, { key: keys[1], word: '도시화' }], why: '집중호우 기록과 도시화 지역을 지도에 겹쳐 비교한다.' }],
  isolated: [keys[2], keys[3]],
}
const sampleFuture = (index) => ({
  index, lens_label: '학교 생활', title: '교내 배수로 점검표와 건의문', activity: '집중호우 뒤 교내 배수로를 기록한다.',
  product: '학생회 건의문으로 낸다.', pitch: '집중호우 뒤 교내 배수로를 기록한다. 학생회 건의문으로 낸다.',
  axis: ['도시 침수 위험'], light_keys: [], model: 'claude-sonnet-5-5', keys,
})

beforeEach(() => {
  vi.clearAllMocks()
  gen.impl = async ({ index }) => ({ future: sampleFuture(index), cached: false })
  bridge.impl = async () => ({ bridges: sampleBridges, cached: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('인증', () => {
  it('로그인하지 않으면 세 경로 모두 401이고 생성하지 않는다', async () => {
    expect((await get('/api/future-map/catalog', null)).status).toBe(401)
    expect((await post('/api/future-map/bridges', { codes: keys }, null)).status).toBe(401)
    expect((await post('/api/future-map', { codes: keys, index: 0 }, null)).status).toBe(401)
    expect(generateFuture).not.toHaveBeenCalled()
    expect(generateBridges).not.toHaveBeenCalled()
  })
})

describe('GET /api/future-map/catalog', () => {
  it('전체 성취기준을 가벼운 행으로 주고 10분 캐시 헤더를 단다', async () => {
    const res = await get('/api/future-map/catalog')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('private, max-age=600')
    expect(res.body.fields).toEqual(['key', 'code', 'subject', 'subject_group', 'school_level', 'curriculum_category', 'content'])
    expect(res.body.rows).toHaveLength(Standards.list().length)
    const first = Standards.list()[0]
    expect(res.body.rows[0]).toEqual([first.key, first.code, first.subject, first.subject_group, first.school_level, first.curriculum_category || '', first.content])
  })
})

describe('POST /api/future-map/bridges', () => {
  it('검증 실패는 400과 §6-7 문구, 생성하지 않는다', async () => {
    const cases = [
      [{ codes: keys.slice(0, 1) }, '성취기준을 2~6개 골라 주세요.'],
      [{ codes: 'a' }, '성취기준 형식이 올바르지 않습니다.'],
      [{}, '성취기준 형식이 올바르지 않습니다.'],
      [{ codes: [keys[0], '[없는코드-99]'] }, '찾을 수 없는 성취기준입니다: [없는코드-99]'],
    ]
    for (const [body, message] of cases) {
      const res = await post('/api/future-map/bridges', body)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: message })
    }
    expect(generateBridges).not.toHaveBeenCalled()
  })
  it('번호 없이 성취기준만으로 요청하고, { bridges, cached } 계약(strength 포함)을 그대로 돌려준다', async () => {
    const res = await post('/api/future-map/bridges', { codes: keys })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ bridges: sampleBridges, cached: true })
    expect(res.body.bridges.concepts[0]).toEqual({ label: '도시 침수 위험', kind: 'same', strength: 3, ends: expect.any(Array), why: expect.any(String) })
    expect(generateBridges.mock.calls[0][0].standards.map((s) => s.key)).toEqual(keys)
  })
  it('생성기 오류 상태(422·502)와 문구를 그대로 전달한다', async () => {
    bridge.impl = async () => { throw new FutureError(422, 'AI가 이 조합의 키워드 연결을 만들지 않았습니다.') }
    let res = await post('/api/future-map/bridges', { codes: keys })
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('AI가 이 조합의 키워드 연결을 만들지 않았습니다.')
    bridge.impl = async () => { throw new FutureError(502, '키워드 연결을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.') }
    res = await post('/api/future-map/bridges', { codes: keys })
    expect(res.status).toBe(502)
  })
  it('그 밖의 오류는 500과 일반 문구(내부 메시지를 드러내지 않음)', async () => {
    bridge.impl = async () => { throw new Error('ENOTFOUND api.anthropic.com') }
    const res = await post('/api/future-map/bridges', { codes: keys })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: '키워드 연결을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.' })
  })
})

describe('POST /api/future-map', () => {
  it('검증 실패는 400과 §6-7 문구, 생성하지 않는다', async () => {
    const cases = [
      [{ codes: keys.slice(0, 1), index: 0 }, '성취기준을 2~6개 골라 주세요.'],
      [{ codes: keys, index: 30 }, '아이디어 번호는 0~29 사이여야 합니다.'],
      [{ codes: keys, index: -1 }, '아이디어 번호는 0~29 사이여야 합니다.'],
      [{ codes: keys }, '아이디어 번호는 0~29 사이여야 합니다.'],
      [{ codes: [keys[0], 7], index: 0 }, '성취기준 형식이 올바르지 않습니다.'],
      [{ codes: [keys[0], '[없는코드-99]'], index: 0 }, '찾을 수 없는 성취기준입니다: [없는코드-99]'],
    ]
    for (const [body, message] of cases) {
      const res = await post('/api/future-map', body)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: message })
    }
    expect(generateFuture).not.toHaveBeenCalled()
  })
  it('정상 요청은 { future, cached } 계약을 그대로 돌려준다', async () => {
    const res = await post('/api/future-map', { codes: keys, model: 'precise', index: 4 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ future: sampleFuture(4), cached: false })
    expect(generateFuture.mock.calls[0][0]).toMatchObject({ modelKey: 'precise', index: 4 })
  })
  it('모르는 모델 값은 빠른 모드, 번호 29까지 받는다', async () => {
    await post('/api/future-map', { codes: keys, model: 'gpt', index: 29 })
    expect(generateFuture.mock.calls[0][0]).toMatchObject({ modelKey: 'fast', index: 29 })
  })
  it('생성기 오류 상태(422·502)를 그대로 전달하고, 그 밖의 오류는 500과 일반 문구', async () => {
    gen.impl = async () => { throw new FutureError(422, 'AI가 이 조합으로는 수업 아이디어를 만들지 않았습니다. 다른 성취기준으로 시도해 주세요.') }
    expect((await post('/api/future-map', { codes: keys, index: 0 })).status).toBe(422)
    gen.impl = async () => { throw new FutureError(502, '수업 아이디어를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.') }
    expect((await post('/api/future-map', { codes: keys, index: 0 })).status).toBe(502)
    gen.impl = async () => { throw new Error('네트워크') }
    const res = await post('/api/future-map', { codes: keys, index: 0 })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: '수업 아이디어를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' })
  })
})

describe('생성 요청 제한 (3부 T4)', () => {
  it('POST는 사용자당 분당 40회, GET(목록)은 세지 않는다', async () => {
    const limited = express()
    limited.use(express.json())
    limited.use('/api/future-map', futuresLimiter, futureMapRouter)
    // limiter는 인증보다 먼저 돌아 JWT sub로 사용자를 구분한다(서명 검증 없음 — 버킷 키 전용)
    const token = (sub) => `Bearer x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`
    const as = (r, sub) => r.set('x-test-user', sub).set('authorization', token(sub))
    for (let i = 0; i < 3; i++) expect((await as(request(limited).get('/api/future-map/catalog'), 'u-limit')).status).toBe(200)
    let last
    for (let i = 0; i < 40; i++) {
      last = await as(request(limited).post('/api/future-map/bridges'), 'u-limit').send({ codes: keys })
      expect(last.status).toBe(200)
    }
    expect(last.headers['ratelimit-policy']).toBe('40;w=60')
    expect((await as(request(limited).post('/api/future-map'), 'u-limit').send({ codes: keys, index: 0 })).status).toBe(429)
    // 다른 사용자는 자기 버킷
    expect((await as(request(limited).post('/api/future-map/bridges'), 'u-other').send({ codes: keys })).status).toBe(200)
  })
})
