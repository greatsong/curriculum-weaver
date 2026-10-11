/**
 * 관리자 가입 승인 API (routes/adminUsers.js)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'

const db = vi.hoisted(() => ({ authUsers: new Map(), roles: new Map(), isAdminCaller: true }))

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: '00000000-0000-4000-8000-0000000000aa' }; next() },
  requireAdmin: (req, res, next) => (db.isAdminCaller ? next() : res.status(403).json({ error: '관리자 전용 기능입니다.' })),
}))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: () => ({
      select() { return this },
      in: async (_k, ids) => ({ data: ids.map((id) => ({ id, role: db.roles.get(id) || 'teacher' })), error: null }),
    }),
    auth: {
      admin: {
        listUsers: async ({ page, perPage }) => ({ data: { users: [...db.authUsers.values()].slice((page - 1) * perPage, page * perPage) }, error: null }),
        getUserById: async (id) => ({ data: { user: db.authUsers.get(id) || null }, error: null }),
        updateUserById: async (id, attrs) => {
          const next = { ...db.authUsers.get(id), app_metadata: attrs.app_metadata }
          db.authUsers.set(id, next)
          return { data: { user: next }, error: null }
        },
      },
    },
  },
}))

const { adminUsersRouter } = await import('../adminUsers.js')
const app = express()
app.use(express.json())
app.use('/api/admin/users', adminUsersRouter)

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function add(n, extra = {}) {
  const user = { id: uid(n), email: `t${n}@school.kr`, created_at: '2026-10-12T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { display_name: `교사${n}` }, ...extra }
  db.authUsers.set(user.id, user)
  return user
}

beforeEach(() => {
  db.authUsers.clear()
  db.roles.clear()
  db.isAdminCaller = true
})

describe('GET /api/admin/users/pending', () => {
  it('기준 시각 이후 가입 + 미승인 + 미거절 + 관리자 아님만 오래된 순으로', async () => {
    add(1, { created_at: '2026-10-01T00:00:00Z' })                 // 기존 가입자
    add(2, { app_metadata: { approved: true } })                   // 승인됨
    add(3, { app_metadata: { rejected: true } })                   // 거절됨
    add(4); db.roles.set(uid(4), 'admin')                          // 관리자
    add(5, { created_at: '2026-10-12T02:00:00Z', app_metadata: { provider: 'google' } })
    add(6, { created_at: '2026-10-12T01:00:00Z', email_confirmed_at: '2026-10-12T01:05:00Z' })
    const res = await request(app).get('/api/admin/users/pending')
    expect(res.status).toBe(200)
    expect(res.body.pending.map((u) => u.id)).toEqual([uid(6), uid(5)])
    expect(res.body.pending[0]).toMatchObject({ email: 't6@school.kr', name: '교사6', provider: 'email', email_confirmed: true })
    expect(res.body.pending[1]).toMatchObject({ provider: 'google' })
    expect(res.body.total_users).toBe(6)
  })

  it('관리자가 아니면 403', async () => {
    db.isAdminCaller = false
    expect((await request(app).get('/api/admin/users/pending')).status).toBe(403)
  })
})

describe('승인·거절', () => {
  it('승인하면 app_metadata에 approved·approved_via=admin·approved_by가 남는다', async () => {
    add(7)
    const res = await request(app).post(`/api/admin/users/${uid(7)}/approve`)
    expect(res.status).toBe(200)
    expect(db.authUsers.get(uid(7)).app_metadata).toMatchObject({ provider: 'email', approved: true, approved_via: 'admin', approved_by: '00000000-0000-4000-8000-0000000000aa' })
  })

  it('거절하면 rejected=true가 남고 대기 목록에서 빠진다', async () => {
    add(8)
    expect((await request(app).post(`/api/admin/users/${uid(8)}/reject`)).status).toBe(200)
    expect(db.authUsers.get(uid(8)).app_metadata.rejected).toBe(true)
    const list = await request(app).get('/api/admin/users/pending')
    expect(list.body.pending).toHaveLength(0)
  })

  it('형식이 틀린 id는 400, 없는 사용자는 404', async () => {
    expect((await request(app).post('/api/admin/users/not-a-uuid/approve')).status).toBe(400)
    expect((await request(app).post(`/api/admin/users/${uid(99)}/approve`)).status).toBe(404)
  })

  it('자기 계정은 거절할 수 없다', async () => {
    expect((await request(app).post('/api/admin/users/00000000-0000-4000-8000-0000000000aa/reject')).status).toBe(400)
  })
})
