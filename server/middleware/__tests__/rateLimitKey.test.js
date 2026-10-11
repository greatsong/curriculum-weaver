/**
 * rate limit 사용자 키 — 검증된 사용자 id로만 사용자 버킷을 만든다
 * - 서명 검증을 통과한 토큰만 u:<id> 키, 무효·만료·형식 오류 토큰은 IP 키
 * - 학교 NAT(같은 IP 30명)에서도 사용자마다 독립 버킷
 * - 같은 토큰의 동시 요청은 검증 한 번을 공유하고, 무효 토큰은 잠시 기억해 다시 부르지 않는다
 * - 인증 서버 장애(예외)에서는 학급 전체가 IP 버킷 하나로 몰리지 않게 임시 키를 쓴다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const verifyMock = vi.hoisted(() => vi.fn())
vi.mock('../auth.js', () => ({ verifyTokenCached: (...a) => verifyMock(...a) }))

const { apiLimiter, _internal } = await import('../rateLimit.js')

function makeJwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.signature`
}
const future = () => Math.floor(Date.now() / 1000) + 3600

function reqWith(token, ip = '203.0.113.7') {
  return { ip, headers: token ? { authorization: `Bearer ${token}` } : {} }
}

const savedEnv = {}
beforeEach(() => {
  verifyMock.mockReset()
  _internal.resetCaches()
  savedEnv.url = process.env.SUPABASE_URL
  savedEnv.key = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
})
afterEach(() => {
  if (savedEnv.url === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = savedEnv.url
  if (savedEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key
})

describe('userKey — 검증된 사용자 id만 사용자 버킷', () => {
  it('검증된 토큰은 검증 결과의 id로 키를 만든다 (토큰에 적힌 sub를 믿지 않는다)', async () => {
    const token = makeJwt({ sub: 'claimed-sub', exp: future() })
    verifyMock.mockResolvedValue({ id: 'verified-user' })
    expect(await _internal.userKey(reqWith(token))).toBe('u:verified-user')
    expect(verifyMock).toHaveBeenCalledWith(token)
  })

  it('검증에 실패한 토큰(서명 위조 등)은 IP 키로 둔다', async () => {
    const token = makeJwt({ sub: 'someone-else', exp: future() })
    verifyMock.mockResolvedValue(null)
    expect(await _internal.userKey(reqWith(token))).toBe('ip:203.0.113.7')
  })

  it('무효 토큰은 잠시 기억해 같은 토큰으로 인증 서버를 반복 호출하지 않는다', async () => {
    const token = makeJwt({ sub: 'x', exp: future() })
    verifyMock.mockResolvedValue(null)
    await _internal.userKey(reqWith(token))
    await _internal.userKey(reqWith(token))
    await _internal.userKey(reqWith(token))
    expect(verifyMock).toHaveBeenCalledTimes(1)
  })

  it('토큰이 없으면 IP 키', async () => {
    expect(await _internal.userKey(reqWith(null))).toBe('ip:203.0.113.7')
    expect(verifyMock).not.toHaveBeenCalled()
  })

  it('JWT 모양이 아니거나 sub가 없거나 만료된 토큰은 인증 서버를 부르지 않고 IP 키', async () => {
    const expired = makeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 10 })
    const noSub = makeJwt({ exp: future() })
    for (const token of ['not-a-jwt', noSub, expired, 'a.b']) {
      expect(await _internal.userKey(reqWith(token))).toBe('ip:203.0.113.7')
    }
    expect(verifyMock).not.toHaveBeenCalled()
  })

  it('인증 서버 장애(예외)면 임시 키(s:)를 써서 학급이 IP 버킷 하나로 몰리지 않는다', async () => {
    const token = makeJwt({ sub: 'teacher-7', exp: future() })
    verifyMock.mockRejectedValue(new Error('network down'))
    expect(await _internal.userKey(reqWith(token))).toBe('s:teacher-7')
  })

  it('Supabase 미설정(로컬 placeholder)에서는 검증하지 않고 IP 키', async () => {
    delete process.env.SUPABASE_URL
    const token = makeJwt({ sub: 'u1', exp: future() })
    expect(await _internal.userKey(reqWith(token))).toBe('ip:203.0.113.7')
    expect(verifyMock).not.toHaveBeenCalled()
  })

  it('앞 단계에서 인증된 req.user가 있으면 그 id를 쓴다', async () => {
    const req = { ...reqWith(null), user: { id: 'already-authed' } }
    expect(await _internal.userKey(req)).toBe('u:already-authed')
  })

  it('같은 토큰의 동시 요청은 검증 한 번을 함께 기다린다', async () => {
    const token = makeJwt({ sub: 'u-burst', exp: future() })
    let resolve
    verifyMock.mockImplementation(() => new Promise((r) => { resolve = r }))
    const keys = Promise.all(Array.from({ length: 8 }, () => _internal.userKey(reqWith(token))))
    await new Promise((r) => setTimeout(r, 10))
    resolve({ id: 'u-burst' })
    expect(new Set(await keys)).toEqual(new Set(['u:u-burst']))
    expect(verifyMock).toHaveBeenCalledTimes(1)
  })

  it('IPv6는 /56 대역으로 묶고, IPv4 매핑 주소는 IPv4로 정규화한다', () => {
    expect(_internal.safeIp({ ip: '::ffff:198.51.100.4' })).toBe('198.51.100.4')
    const a = _internal.safeIp({ ip: '2001:db8:1234:5601::1' })
    const b = _internal.safeIp({ ip: '2001:db8:1234:56ff::abcd' })
    expect(a).toBe(b)
  })
})

describe('apiLimiter — 학교 NAT(같은 IP 30명)', () => {
  it('같은 IP의 교사 30명이 각자 9번씩(총 270회, 한도 240 초과) 요청해도 막히지 않는다', async () => {
    const tokens = Array.from({ length: 30 }, (_, i) => makeJwt({ sub: `t${i}`, exp: future() }))
    verifyMock.mockImplementation(async (token) => {
      const i = tokens.indexOf(token)
      return i >= 0 ? { id: `teacher-${i}` } : null
    })
    const app = express()
    app.set('trust proxy', false)
    app.use('/api', apiLimiter)
    app.get('/api/ping', (req, res) => res.json({ ok: true }))

    const statuses = []
    for (let round = 0; round < 9; round++) {
      const batch = await Promise.all(tokens.map((t) => request(app).get('/api/ping').set('Authorization', `Bearer ${t}`)))
      statuses.push(...batch.map((r) => r.status))
    }
    expect(statuses).toHaveLength(270)
    expect(statuses.every((s) => s === 200)).toBe(true)
  })

  it('위조 토큰을 바꿔 가며 보내도 IP 버킷 하나로 묶여 한도에 걸린다', async () => {
    verifyMock.mockResolvedValue(null)
    const app = express()
    app.use('/api', apiLimiter)
    app.get('/api/ping', (req, res) => res.json({ ok: true }))

    let limited = 0
    for (let i = 0; i < 250; i++) {
      const forged = makeJwt({ sub: `forged-${i}`, exp: future() })
      const r = await request(app).get('/api/ping').set('Authorization', `Bearer ${forged}`)
      if (r.status === 429) limited++
    }
    expect(limited).toBeGreaterThan(0)
  })
})
