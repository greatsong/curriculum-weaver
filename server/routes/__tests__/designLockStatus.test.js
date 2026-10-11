/**
 * PUT /api/projects/:projectId/designs/:procedureCode/status — 잠금 권한
 * 잠금 설정과 해제는 host/owner만. editor는 잠긴 보드의 상태를 바꿔 잠금을 풀 수 없다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({ role: 'editor', design: null }))

vi.mock('../../middleware/auth.js', async (original) => ({
  ...(await original()),
  requireAuth: (req, res, next) => { req.user = { id: 'teacher' }; next() },
}))
vi.mock('../../lib/supabaseService.js', async (original) => ({
  ...(await original()),
  getProject: vi.fn(async () => ({ id: 'p1', workspace_id: 'w1', status: 'active', title: '융합 수업' })),
  getMemberRole: vi.fn(async () => state.role),
  getProjectSkips: vi.fn(async () => []),
  getDesign: vi.fn(async () => state.design),
  updateDesignStatus: vi.fn(async (projectId, code, saveStatus) => ({ project_id: projectId, procedure_code: code, save_status: saveStatus })),
  logActivity: vi.fn(async () => null),
}))

const { default: designsRouter } = await import('../designs.js')
const { updateDesignStatus } = await import('../../lib/supabaseService.js')

const app = express()
app.use(express.json())
app.use('/api', designsRouter)

const statusUrl = '/api/projects/p1/designs/T-1-1/status'

beforeEach(() => {
  vi.mocked(updateDesignStatus).mockClear()
  state.role = 'editor'
  state.design = { procedure_code: 'T-1-1', save_status: 'locked' }
})

describe('잠금 해제 권한', () => {
  it.each(['draft', 'confirmed'])('editor는 잠긴 보드를 %s로 바꿀 수 없다 (403)', async (next) => {
    const res = await request(app).put(statusUrl).send({ save_status: next })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('잠금 해제')
    expect(updateDesignStatus).not.toHaveBeenCalled()
  })

  it.each(['host', 'owner'])('%s는 잠금을 풀 수 있다', async (role) => {
    state.role = role
    const res = await request(app).put(statusUrl).send({ save_status: 'draft' })
    expect(res.status).toBe(200)
    expect(updateDesignStatus).toHaveBeenCalledWith('p1', 'T-1-1', 'draft')
  })

  it('editor는 잠기지 않은 보드의 상태는 바꿀 수 있다', async () => {
    state.design = { procedure_code: 'T-1-1', save_status: 'draft' }
    const res = await request(app).put(statusUrl).send({ save_status: 'confirmed' })
    expect(res.status).toBe(200)
  })

  it('editor는 잠금 설정도 할 수 없다(기존 정책 유지)', async () => {
    state.design = { procedure_code: 'T-1-1', save_status: 'draft' }
    const res = await request(app).put(statusUrl).send({ save_status: 'locked' })
    expect(res.status).toBe(403)
  })

  it('viewer는 상태를 바꿀 수 없다', async () => {
    state.role = 'viewer'
    const res = await request(app).put(statusUrl).send({ save_status: 'draft' })
    expect(res.status).toBe(403)
  })
})
