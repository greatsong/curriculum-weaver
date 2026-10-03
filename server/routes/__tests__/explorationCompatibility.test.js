import { beforeEach, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({ project: null, skips: [], design: null }))
vi.mock('../../middleware/auth.js', async original => ({ ...(await original()), requireAuth: (req, res, next) => { req.user = { id: 'teacher' }; next() } }))
vi.mock('../../lib/supabaseService.js', async original => ({
  ...(await original()),
  getProject: vi.fn(async () => state.project),
  getMemberRole: vi.fn(async () => 'owner'),
  getSimulationsBySource: vi.fn(async () => []),
  getProjectSkips: vi.fn(async () => state.skips),
  getDesign: vi.fn(async () => state.design),
  createProject: vi.fn(), updateProject: vi.fn(), upsertDesign: vi.fn(), addProjectSkip: vi.fn(),
}))
const { demoRouter } = await import('../demo.js')
const { default: designsRouter } = await import('../designs.js')
const { createProject, updateProject, upsertDesign, addProjectSkip } = await import('../../lib/supabaseService.js')
const app = express(); app.use(express.json()); app.use('/api/demo', demoRouter); app.use('/api', designsRouter)
beforeEach(() => {
  vi.clearAllMocks()
  state.project = { id: 'p1', workspace_id: 'w1', status: 'active', title: '원래 프로젝트', current_procedure: 'A-2-1' }
  state.skips = []; state.design = { content: { duplicateCheck: '원래 분석' }, save_status: 'draft' }
})
function unchanged() { expect(createProject).not.toHaveBeenCalled(); expect(updateProject).not.toHaveBeenCalled(); expect(upsertDesign).not.toHaveBeenCalled(); expect(addProjectSkip).not.toHaveBeenCalled() }

it.each(['simulation', 'generating', 'failed'])('%s 프로젝트는 A-3 저장과 이어서 시뮬레이션을 차단한다', async status => {
  state.project.status = status
  expect((await request(app).put('/api/projects/p1/designs/A-2-1').send({ content: { duplicateCheck: '탐색 초안' } })).status).toBe(403)
  expect((await request(app).post('/api/demo/continue').send({ projectId: 'p1' })).status).toBe(400)
  unchanged()
})
it('생략 단계가 있는 프로젝트의 이어서 시뮬레이션은 복제·저장 전에 차단한다', async () => {
  state.skips = [{ procedure_code: 'T-2-2' }]
  const result = await request(app).post('/api/demo/continue').send({ projectId: 'p1' })
  expect(result.status).toBe(400); expect(result.body.error).toContain('생략된 절차')
  unchanged()
})
it('A-3는 직접 API로도 건너뛸 수 없다', async () => {
  const result = await request(app).post('/api/projects/p1/procedures/A-2-1/skip').send({ reason: '아이디어 탐색 완료' })
  expect(result.status).toBe(403); expect(result.body.error).toContain('핵심 절차')
  unchanged()
})
it('잠긴 A-3를 탐색 결과로 덮어쓰지 못한다', async () => {
  state.design.save_status = 'locked'
  expect((await request(app).put('/api/projects/p1/designs/A-2-1').send({ content: { duplicateCheck: '탐색 초안' } })).status).toBe(423)
  unchanged()
})
it('과거에 생략된 A-3 데이터가 있어도 쓰기는 차단된다', async () => {
  state.skips = [{ procedure_code: 'A-2-1' }]
  expect((await request(app).put('/api/projects/p1/designs/A-2-1').send({ content: { duplicateCheck: '탐색 초안' } })).status).toBe(403)
  unchanged()
})
