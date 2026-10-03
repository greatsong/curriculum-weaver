/**
 * POST /api/standards/project/:projectId/bulk — 항목별 결과를 돌려준다(2026-10-03 검토).
 * 예전에는 조회·저장 실패를 조용히 건너뛰고 늘 ok:true를 돌려줘, 화면이 일부 누락을 알 수 없었다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'teacher' }; next() },
}))

const state = vi.hoisted(() => ({ role: 'editor', failSave: new Set(), failResolve: new Set(), unknown: new Set() }))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => ({ id, workspace_id: 'w1' })),
  getMemberRole: vi.fn(async () => state.role),
  resolveStandardId: vi.fn(async ({ code }) => {
    if (state.failResolve.has(code)) throw new Error('DB 조회 실패')
    if (state.unknown.has(code)) return null
    return `id-${code}`
  }),
  addStandardToProject: vi.fn(async (_p, id) => {
    if (state.failSave.has(id)) throw new Error('DB 저장 실패')
  }),
}))

const { standardsRouter } = await import('../standards.js')
const app = express()
app.use(express.json())
app.use('/api/standards', standardsRouter)

beforeEach(() => {
  state.role = 'editor'
  state.failSave = new Set()
  state.failResolve = new Set()
  state.unknown = new Set()
})

const post = (codes) => request(app).post('/api/standards/project/p1/bulk').send({ standard_codes: codes })

describe('일괄 저장 항목별 결과', () => {
  it('모두 저장되면 ok:true와 saved 결과', async () => {
    const res = await post(['A', 'B'])
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ ok: true, added: 2, total: 2, failed: 0, unresolved: 0 })
    expect(res.body.results).toEqual([{ key: 'A', status: 'saved' }, { key: 'B', status: 'saved' }])
  })

  it('저장 실패·조회 실패·코드 없음을 나눠 돌려준다(HTTP는 201 유지)', async () => {
    state.failSave.add('id-B')
    state.failResolve.add('C')
    state.unknown.add('D')
    const res = await post(['A', 'B', 'C', 'D'])
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(false)
    expect(res.body.added).toBe(1)
    expect(res.body.failed).toBe(2)
    expect(res.body.unresolved).toBe(1)
    expect(res.body.results).toEqual([
      { key: 'A', status: 'saved' },
      { key: 'B', status: 'failed' },
      { key: 'C', status: 'failed' },
      { key: 'D', status: 'unresolved' },
    ])
  })

  it('열람자는 403(종전과 같음)', async () => {
    state.role = 'viewer'
    const res = await post(['A'])
    expect(res.status).toBe(403)
  })
})
