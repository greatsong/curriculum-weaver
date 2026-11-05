import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../auth.js', () => ({
  verifyTokenCached: vi.fn(async (t) => ({ id: JSON.parse(Buffer.from(t.split('.')[1], 'base64url')).sub })),
}))

const jwt = (sub) => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${enc({ alg: 'HS256' })}.${enc({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`
}

describe('inviteLimiter', () => {
  it('사용자별로 10분에 20회까지 받고 다른 사용자는 영향이 없다', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
    const { inviteLimiter } = await import('../rateLimit.js')
    const app = express()
    app.use('/api/workspaces/:id/invite', inviteLimiter)
    app.post('/api/workspaces/:id/invite', (req, res) => res.json({ ok: true }))
    app.get('/api/workspaces/:id', (req, res) => res.json({ ok: true }))

    for (let i = 0; i < 20; i++) {
      const r = await request(app).post('/api/workspaces/w/invite').set('Authorization', `Bearer ${jwt('user-a')}`)
      expect(r.status).toBe(200)
    }
    const blocked = await request(app).post('/api/workspaces/w/invite').set('Authorization', `Bearer ${jwt('user-a')}`)
    expect(blocked.status).toBe(429)
    const other = await request(app).post('/api/workspaces/w/invite').set('Authorization', `Bearer ${jwt('user-b')}`)
    expect(other.status).toBe(200)
    const unrelated = await request(app).get('/api/workspaces/w').set('Authorization', `Bearer ${jwt('user-a')}`)
    expect(unrelated.status).toBe(200)
  })
})
