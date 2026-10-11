/**
 * 채팅 쓰기 가드 (2026-10-11)
 * - 열람자(viewer)는 AI 채팅·교사 메시지·절차 안내 저장·제안 수락/거부를 못 한다
 * - 제안 수락은 요청한 프로젝트의 저장된 메시지 제안만 쓰고, 읽기 전용·생략·잠금(423)을 막는다
 * - /chat/seed 삭제, 보낸 사람 이름은 서버 프로필 우선, 없는 프로젝트는 404
 * - 정밀 모드가 꺼져 있으면 precise 요청도 기본(fast) 모델로 간다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY

const state = vi.hoisted(() => ({
  projects: new Map(),
  roles: new Map(),     // `${workspaceId}:${userId}` → role
  messages: new Map(),
  skips: [],
  designs: new Map(),   // procedureCode → design
  profiles: new Map(),
}))

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, res, next) => {
    const id = req.get('x-test-user')
    if (!id) return res.status(401).json({ error: '인증이 필요합니다.' })
    req.user = { id }
    next()
  },
}))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => state.projects.get(id) || null),
  getMemberRole: vi.fn(async (ws, user) => state.roles.get(`${ws}:${user}`) || null),
  getMessage: vi.fn(async (id) => state.messages.get(id) || null),
  getProjectSkips: vi.fn(async () => state.skips),
  getDesign: vi.fn(async (_p, code) => state.designs.get(code) || null),
  getUser: vi.fn(async (id) => state.profiles.get(id) || null),
  upsertDesign: vi.fn(async (projectId, code, content) => ({ project_id: projectId, procedure_code: code, content })),
  createMessage: vi.fn(async (row) => ({ id: `msg-${Math.random()}`, ...row })),
  getRecentMessages: vi.fn(async () => []),
  getDesignsByProject: vi.fn(async () => []),
  getStandardsByProject: vi.fn(async () => []),
  getWorkspaceWorkflowConfig: vi.fn(async () => null),
  getProcedureMessages: vi.fn(async () => []),
  getMessagesBefore: vi.fn(async () => []),
}))

vi.mock('../../services/aiAgent.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildAIResponse: vi.fn(async (_context, { onText }) => { onText('답입니다.') }),
  buildProcedureIntroResponse: vi.fn(async () => {}),
}))

const { chatRouter } = await import('../chat.js')
const svc = await import('../../lib/supabaseService.js')
const { buildAIResponse } = await import('../../services/aiAgent.js')

const app = express()
app.use(express.json())
app.use('/api/chat', chatRouter)

const SUGGESTION = { type: 'board_update', procedure: 'T-1-1', step: '1', action: '', content: { vision: '저장된 제안' }, status: 'pending' }

beforeEach(() => {
  vi.clearAllMocks()
  state.projects.clear(); state.roles.clear(); state.messages.clear(); state.designs.clear(); state.profiles.clear()
  state.skips = []
  state.projects.set('p1', { id: 'p1', workspace_id: 'w1', title: '융합', status: 'active', learner_context: {} })
  state.projects.set('p2', { id: 'p2', workspace_id: 'w1', title: '다른 프로젝트', status: 'active', learner_context: {} })
  state.roles.set('w1:editor', 'editor')
  state.roles.set('w1:viewer', 'viewer')
  state.messages.set('m1', { id: 'm1', project_id: 'p1', ai_suggestions: [SUGGESTION] })
  state.messages.set('m-other', { id: 'm-other', project_id: 'p2', ai_suggestions: [SUGGESTION] })
  state.messages.set('m-empty', { id: 'm-empty', project_id: 'p1', ai_suggestions: null })
})
afterEach(() => vi.unstubAllEnvs())

const post = (path, user, body) => request(app).post(`/api/chat${path}`).set('x-test-user', user).send(body)

describe('열람자(viewer)는 쓰기를 못 한다', () => {
  it('AI 채팅 403, AI를 부르지 않는다', async () => {
    const res = await post('/message', 'viewer', { session_id: 'p1', content: '질문', procedure: 'T-1-1' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('열람 전용')
    expect(buildAIResponse).not.toHaveBeenCalled()
  })
  it('교사 메시지 저장 403', async () => {
    const res = await post('/teacher', 'viewer', { session_id: 'p1', content: '메모' })
    expect(res.status).toBe(403)
    expect(svc.createMessage).not.toHaveBeenCalled()
  })
  it('절차 안내(대화에 저장하는 경로) 403', async () => {
    expect((await post('/stage-intro', 'viewer', { session_id: 'p1', stage: 'T-1-1' })).status).toBe(403)
    expect((await post('/procedure-intro', 'viewer', { session_id: 'p1', procedure: 'T-1-1' })).status).toBe(403)
    expect(svc.createMessage).not.toHaveBeenCalled()
  })
  it('제안 수락·편집 수락·거부 403', async () => {
    expect((await post('/suggestion/m1/accept', 'viewer', { session_id: 'p1', procedure: 'T-1-1' })).status).toBe(403)
    expect((await post('/suggestion/m1/edit-accept', 'viewer', { session_id: 'p1', procedure: 'T-1-1', editedContent: { a: 1 } })).status).toBe(403)
    expect((await post('/suggestion/m1/reject', 'viewer', { session_id: 'p1' })).status).toBe(403)
    expect(svc.upsertDesign).not.toHaveBeenCalled()
  })
  it('편집자는 교사 메시지를 저장할 수 있다', async () => {
    expect((await post('/teacher', 'editor', { session_id: 'p1', content: '메모' })).status).toBe(201)
  })
})

describe('교사 메시지 보낸 사람 이름', () => {
  it('서버 프로필 이름을 쓰고 화면 값은 무시한다', async () => {
    state.profiles.set('editor', { id: 'editor', display_name: '김선생' })
    const res = await post('/teacher', 'editor', { session_id: 'p1', content: '메모', sender_name: '다른 사람' })
    expect(res.body.sender_name).toBe('김선생')
  })
  it('프로필이 없을 때만 화면 값(최대 50자)을 쓴다', async () => {
    const res = await post('/teacher', 'editor', { session_id: 'p1', content: '메모', sender_name: '가'.repeat(80) })
    expect(res.body.sender_name).toBe('가'.repeat(50))
  })
  it('둘 다 없으면 "교사"', async () => {
    const res = await post('/teacher', 'editor', { session_id: 'p1', content: '메모' })
    expect(res.body.sender_name).toBe('교사')
  })
})

describe('제안 수락 가드', () => {
  it('저장된 메시지의 제안 내용을 보드에 쓴다(본문의 suggestions는 무시)', async () => {
    const res = await post('/suggestion/m1/accept', 'editor', {
      session_id: 'p1', procedure: 'T-1-1', suggestionIndex: 0, suggestions: [{ content: { vision: '본문에서 바꿔치기' } }],
    })
    expect(res.status).toBe(200)
    expect(svc.upsertDesign).toHaveBeenCalledWith('p1', 'T-1-1', { vision: '저장된 제안' }, 'editor')
  })
  it('다른 프로젝트의 메시지는 404', async () => {
    const res = await post('/suggestion/m-other/accept', 'editor', { session_id: 'p1', procedure: 'T-1-1' })
    expect(res.status).toBe(404)
    expect(svc.upsertDesign).not.toHaveBeenCalled()
  })
  it('저장된 제안이 없으면 본문 suggestions가 있어도 404', async () => {
    const res = await post('/suggestion/m-empty/accept', 'editor', {
      session_id: 'p1', procedure: 'T-1-1', suggestions: [{ content: { x: 1 } }],
    })
    expect(res.status).toBe(404)
    expect(svc.upsertDesign).not.toHaveBeenCalled()
  })
  it('읽기 전용 프로젝트는 403', async () => {
    state.projects.set('p1', { ...state.projects.get('p1'), status: 'simulation' })
    expect((await post('/suggestion/m1/accept', 'editor', { session_id: 'p1', procedure: 'T-1-1' })).status).toBe(403)
  })
  it('생략된 절차는 403', async () => {
    state.skips = [{ procedure_code: 'T-1-1' }]
    const res = await post('/suggestion/m1/accept', 'editor', { session_id: 'p1', procedure: 'T-1-1' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('생략')
  })
  it('잠긴 보드는 423', async () => {
    state.designs.set('T-1-1', { save_status: 'locked' })
    expect((await post('/suggestion/m1/accept', 'editor', { session_id: 'p1', procedure: 'T-1-1' })).status).toBe(423)
    expect(svc.upsertDesign).not.toHaveBeenCalled()
  })
  it('편집 수락은 교사가 고친 내용을 쓰되, 이 프로젝트에 저장된 제안이 있어야 한다', async () => {
    const ok = await post('/suggestion/m1/edit-accept', 'editor', { session_id: 'p1', procedure: 'T-1-1', editedContent: { vision: '고친 내용' } })
    expect(ok.status).toBe(200)
    expect(svc.upsertDesign).toHaveBeenCalledWith('p1', 'T-1-1', { vision: '고친 내용' }, 'editor')
    expect((await post('/suggestion/m-other/edit-accept', 'editor', { session_id: 'p1', procedure: 'T-1-1', editedContent: { a: 1 } })).status).toBe(404)
    state.designs.set('T-1-1', { save_status: 'locked' })
    expect((await post('/suggestion/m1/edit-accept', 'editor', { session_id: 'p1', procedure: 'T-1-1', editedContent: { a: 1 } })).status).toBe(423)
  })
  it('제안 번호가 잘못되면 400', async () => {
    expect((await post('/suggestion/m1/accept', 'editor', { session_id: 'p1', procedure: 'T-1-1', suggestionIndex: -1 })).status).toBe(400)
  })
})

describe('기타 채팅 가드', () => {
  it('/chat/seed 경로는 없다', async () => {
    expect((await post('/seed', 'editor', { session_id: 'p1', sender_type: 'ai', content: 'x' })).status).toBe(404)
  })
  it('없는 프로젝트는 통과시키지 않고 404', async () => {
    const res = await post('/teacher', 'editor', { session_id: 'no-such-project', content: '메모' })
    expect(res.status).toBe(404)
    expect(svc.createMessage).not.toHaveBeenCalled()
  })
})

describe('정밀 모드 숨기기', () => {
  it('PRECISE_MODE_ENABLED가 없으면 precise 요청도 fast로 aiAgent에 넘긴다', async () => {
    const res = await post('/message', 'editor', { session_id: 'p1', content: '질문', procedure: 'T-1-1', aiModel: 'precise' })
    expect(res.status).toBe(200)
    expect(buildAIResponse.mock.calls[0][0].aiModel).toBe('fast')
  })
  it('PRECISE_MODE_ENABLED=true면 precise 그대로', async () => {
    vi.stubEnv('PRECISE_MODE_ENABLED', 'true')
    await post('/message', 'editor', { session_id: 'p1', content: '질문', procedure: 'T-1-1', aiModel: 'precise' })
    expect(buildAIResponse.mock.calls[0][0].aiModel).toBe('precise')
  })
})
