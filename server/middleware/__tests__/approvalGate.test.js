/**
 * 가입 승인 관문 — requireAuth의 403 approval_pending, 예외 경로(GET /api/auth/me·초대 수락),
 * 승인 처리 뒤 토큰 캐시 비우기.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'

const db = vi.hoisted(() => ({ tokens: new Map(), roles: new Map(), authUsers: new Map(), getUserCalls: 0 }))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: {
    auth: {
      getUser: async (token) => {
        db.getUserCalls++
        const id = db.tokens.get(token)
        const user = id ? db.authUsers.get(id) : null
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid' } }
      },
      admin: {
        getUserById: async (id) => ({ data: { user: db.authUsers.get(id) || null }, error: null }),
        updateUserById: async (id, attrs) => {
          const next = { ...db.authUsers.get(id), app_metadata: attrs.app_metadata }
          db.authUsers.set(id, next)
          return { data: { user: next }, error: null }
        },
      },
    },
    from: () => {
      const q = {
        _id: null,
        select() { return q },
        eq(_k, v) { q._id = v; return q },
        upsert: async () => ({ data: null, error: null }),
        async maybeSingle() {
          const role = db.roles.get(q._id)
          return { data: role ? { role } : null, error: null }
        },
      }
      return q
    },
  },
}))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getMemberRole: vi.fn(async () => null),
  getUser: vi.fn(async (id) => ({ id, email: `${id}@school.kr`, display_name: '프로필 이름', role: db.roles.get(id) || 'teacher' })),
}))

const { requireAuth, requireAuthAllowPending, APPROVAL_PENDING_BODY } = await import('../auth.js')
const { approveUser } = await import('../../lib/approval.js')
const authRouter = (await import('../../routes/auth.js')).default

const OLD = '2026-09-01T00:00:00Z'
const NEW = '2026-10-12T00:00:00Z'
function addUser(id, { created_at = NEW, app_metadata = {} } = {}) {
  db.authUsers.set(id, { id, email: `${id}@school.kr`, created_at, app_metadata, user_metadata: { display_name: id } })
  db.tokens.set(`tok-${id}`, id)
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRouter)
  app.get('/api/protected', requireAuth, (req, res) => res.json({ ok: true, user: req.user.id }))
  app.get('/api/pending-ok', requireAuthAllowPending, (req, res) => res.json({ approval: req.approval }))
  return app
}
const app = buildApp()

beforeEach(() => {
  db.tokens.clear()
  db.roles.clear()
  db.authUsers.clear()
  db.getUserCalls = 0
})

describe('requireAuth 승인 관문', () => {
  it('기준 시각 이후 가입 + 미승인 → 403 approval_pending', async () => {
    addUser('newbie')
    const res = await request(app).get('/api/protected').set('Authorization', 'Bearer tok-newbie')
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ ...APPROVAL_PENDING_BODY, approval_status: 'pending' })
    expect(res.body.error).toBe('관리자 승인을 기다리고 있습니다.')
  })

  it('기존 가입자(기준 시각 이전)는 통과', async () => {
    addUser('veteran', { created_at: OLD })
    const res = await request(app).get('/api/protected').set('Authorization', 'Bearer tok-veteran')
    expect(res.status).toBe(200)
  })

  it('app_metadata.approved=true면 통과', async () => {
    addUser('approved', { app_metadata: { approved: true } })
    const res = await request(app).get('/api/protected').set('Authorization', 'Bearer tok-approved')
    expect(res.status).toBe(200)
  })

  it('관리자(users.role=admin)는 미승인이어도 통과', async () => {
    addUser('boss')
    db.roles.set('boss', 'admin')
    const res = await request(app).get('/api/protected').set('Authorization', 'Bearer tok-boss')
    expect(res.status).toBe(200)
  })

  it('거절된 사용자는 계속 403', async () => {
    addUser('nope', { created_at: OLD, app_metadata: { rejected: true } })
    const res = await request(app).get('/api/protected').set('Authorization', 'Bearer tok-nope')
    expect(res.status).toBe(403)
    expect(res.body.approval_status).toBe('rejected')
  })

  it('토큰이 없으면 종전대로 401', async () => {
    const res = await request(app).get('/api/protected')
    expect(res.status).toBe(401)
  })
})

describe('예외 경로', () => {
  it('requireAuthAllowPending은 미승인 사용자도 통과시키고 req.approval을 채운다', async () => {
    addUser('waiting')
    const res = await request(app).get('/api/pending-ok').set('Authorization', 'Bearer tok-waiting')
    expect(res.status).toBe(200)
    expect(res.body.approval).toEqual({ approved: false, status: 'pending' })
  })

  it('GET /api/auth/me는 미승인 사용자에게도 approved=false로 응답한다', async () => {
    addUser('waiting2')
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer tok-waiting2')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 'waiting2', approved: false, approval_status: 'pending' })
  })

  it('GET /api/auth/me는 승인 사용자에게 approved=true', async () => {
    addUser('ok', { created_at: OLD })
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer tok-ok')
    expect(res.body).toMatchObject({ approved: true, approval_status: 'approved' })
  })

  it('PUT /api/auth/me(프로필 수정)는 승인된 사용자만', async () => {
    addUser('waiting3')
    const res = await request(app).put('/api/auth/me').set('Authorization', 'Bearer tok-waiting3').send({ display_name: 'x' })
    expect(res.status).toBe(403)
  })

  it('서버 경유 가입·로그인 경로는 없다', async () => {
    expect((await request(app).post('/api/auth/signup').send({})).status).toBe(404)
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(404)
  })
})

describe('승인 처리 뒤 토큰 캐시', () => {
  it('approveUser가 그 사용자 캐시를 비워 다음 요청부터 바로 통과한다', async () => {
    addUser('soon')
    const first = await request(app).get('/api/protected').set('Authorization', 'Bearer tok-soon')
    expect(first.status).toBe(403)
    // 캐시에 미승인 상태의 user가 남아 있어도 승인 직후 지워져야 한다
    await approveUser('soon', { via: 'admin', by: 'boss' })
    const second = await request(app).get('/api/protected').set('Authorization', 'Bearer tok-soon')
    expect(second.status).toBe(200)
    expect(db.getUserCalls).toBe(2) // 캐시가 비워져 Auth를 다시 조회했다
  })
})
