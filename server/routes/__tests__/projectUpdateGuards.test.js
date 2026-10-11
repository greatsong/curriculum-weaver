/**
 * 프로젝트 생성·수정 입력 검증
 * - status: 사용자 상태(active·completed·archived)만 허용, 시스템 전용(simulation·generating·failed)은 403
 * - learner_context: 시연 모드 표식(demo)·시뮬레이션 정보는 일반 경로로 켜거나 끌 수 없다(기존 값 유지)
 * - 제목: 문자열만, 읽기 전용 판정에 쓰이는 '[시뮬레이션]' 접두어는 받지 않는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const state = vi.hoisted(() => ({ project: null, role: 'editor', created: null }))

vi.mock('../../middleware/auth.js', async (original) => ({
  ...(await original()),
  requireAuth: (req, res, next) => { req.user = { id: 'teacher' }; next() },
}))
vi.mock('../../lib/supabaseService.js', async (original) => ({
  ...(await original()),
  getProject: vi.fn(async () => state.project),
  getMemberRole: vi.fn(async () => state.role),
  getProjectSkips: vi.fn(async () => []),
  getProjectsByWorkspace: vi.fn(async () => []),
  createProject: vi.fn(async (workspaceId, data) => {
    state.created = { id: 'new', workspace_id: workspaceId, status: 'active', ...data }
    return state.created
  }),
  updateProject: vi.fn(async (id, patch) => ({ ...state.project, ...patch })),
  logActivity: vi.fn(async () => null),
}))

const { default: projectsRouter, sanitizeLearnerContext } = await import('../projects.js')
const { updateProject, createProject } = await import('../../lib/supabaseService.js')

const app = express()
app.use(express.json())
app.use('/api', projectsRouter)

beforeEach(() => {
  vi.mocked(updateProject).mockClear()
  vi.mocked(createProject).mockClear()
  state.role = 'editor'
  state.created = null
  state.project = { id: 'p1', workspace_id: 'w1', status: 'active', title: '융합 수업', current_procedure: 'prep', learner_context: {} }
})

describe('PUT /projects/:id — status', () => {
  it.each(['active', 'completed', 'archived'])('사용자 상태 %s는 허용', async (status) => {
    const res = await request(app).put('/api/projects/p1').send({ status })
    expect(res.status).toBe(200)
    expect(updateProject).toHaveBeenCalledWith('p1', { status })
  })

  it.each(['simulation', 'generating', 'failed'])('시스템 전용 상태 %s는 403', async (status) => {
    const res = await request(app).put('/api/projects/p1').send({ status })
    expect(res.status).toBe(403)
    expect(updateProject).not.toHaveBeenCalled()
  })

  it.each(['deleted', '', 'ACTIVE', 1, null])('모르는 값 %j는 400', async (status) => {
    const res = await request(app).put('/api/projects/p1').send({ status })
    expect(res.status).toBe(400)
    expect(updateProject).not.toHaveBeenCalled()
  })
})

describe('PUT /projects/:id — learner_context 시연 모드 표식', () => {
  it('일반 프로젝트에 demo:true를 켤 수 없다 (다른 칸은 저장)', async () => {
    const res = await request(app).put('/api/projects/p1').send({ learner_context: { demo: true, grade: '고1' } })
    expect(res.status).toBe(200)
    expect(updateProject).toHaveBeenCalledWith('p1', { learner_context: { grade: '고1' } })
  })

  it('시연 프로젝트의 demo 표식을 끄거나 지울 수 없다', async () => {
    state.project.learner_context = { demo: true }
    await request(app).put('/api/projects/p1').send({ learner_context: { demo: false, grade: '중2' } })
    expect(updateProject).toHaveBeenLastCalledWith('p1', { learner_context: { grade: '중2', demo: true } })
    await request(app).put('/api/projects/p1').send({ learner_context: {} })
    expect(updateProject).toHaveBeenLastCalledWith('p1', { learner_context: { demo: true } })
  })

  it('simulation_meta도 사용자가 바꿀 수 없다', async () => {
    state.project.learner_context = { simulation_meta: { day: 1 } }
    await request(app).put('/api/projects/p1').send({ learner_context: { simulation_meta: { day: 99 } } })
    expect(updateProject).toHaveBeenLastCalledWith('p1', { learner_context: { simulation_meta: { day: 1 } } })
  })

  it.each([[[]], ['문자열'], [null], [5]])('객체가 아닌 learner_context %j는 400', async (value) => {
    const res = await request(app).put('/api/projects/p1').send({ learner_context: value })
    expect(res.status).toBe(400)
  })
})

describe('PUT /projects/:id — 제목', () => {
  it('문자열이 아닌 제목은 500이 아니라 400', async () => {
    const res = await request(app).put('/api/projects/p1').send({ title: 123 })
    expect(res.status).toBe(400)
  })

  it("'[시뮬레이션]'으로 시작하는 제목은 받지 않는다(되돌릴 수 없는 읽기 전용 방지)", async () => {
    const res = await request(app).put('/api/projects/p1').send({ title: '[시뮬레이션] 내 수업' })
    expect(res.status).toBe(400)
    expect(updateProject).not.toHaveBeenCalled()
  })

  it('일반 제목 수정은 그대로 된다', async () => {
    const res = await request(app).put('/api/projects/p1').send({ title: '  새 제목 ' })
    expect(res.status).toBe(200)
    expect(updateProject).toHaveBeenCalledWith('p1', { title: '새 제목' })
  })
})

describe('POST /workspaces/:id/projects — 생성', () => {
  it('일반 생성 경로로 시연 모드 표식을 붙일 수 없다', async () => {
    const res = await request(app).post('/api/workspaces/w1/projects').send({ title: '수업', learner_context: { demo: true, grade: '고2' } })
    expect(res.status).toBe(201)
    expect(createProject.mock.calls[0][1].learner_context).toEqual({ grade: '고2' })
  })

  it('learner_context 없이 만들면 빈 객체', async () => {
    await request(app).post('/api/workspaces/w1/projects').send({ title: '수업' })
    expect(createProject.mock.calls[0][1].learner_context).toEqual({})
  })

  it('형식이 틀린 learner_context·제목은 400', async () => {
    expect((await request(app).post('/api/workspaces/w1/projects').send({ title: '수업', learner_context: 'x' })).status).toBe(400)
    expect((await request(app).post('/api/workspaces/w1/projects').send({ title: ['수업'] })).status).toBe(400)
    expect((await request(app).post('/api/workspaces/w1/projects').send({ title: '[시뮬레이션] 수업' })).status).toBe(400)
    expect(createProject).not.toHaveBeenCalled()
  })
})

describe('sanitizeLearnerContext', () => {
  it('서버 전용 키는 기존 값으로, 나머지는 입력값으로', () => {
    expect(sanitizeLearnerContext({ demo: true, grade: 'old' }, { grade: 'new', demo: false })).toEqual({ grade: 'new', demo: true })
    expect(sanitizeLearnerContext(null, { demo: true })).toEqual({})
  })
})
