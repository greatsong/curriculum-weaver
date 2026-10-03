/**
 * POST /api/chat/message — 약식 기록 팀에서 교사가 "개입하지 마세요"라고 한 뒤의 양식 저장 알림은
 * AI를 부르지 않고 "저장했습니다."로 답한다. AI 지시문에만 맡기면 지시를 어기고 조언한 경우가 있었다
 * (2026-10-03 운영 DB 점검).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'teacher' }; next() },
}))

const state = vi.hoisted(() => ({ history: [], workflowConfig: { briefMode: true } }))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => ({ id, workspace_id: 'w1', title: '연수', status: 'active', learner_context: {} })),
  getMemberRole: vi.fn(async () => 'editor'),
  createMessage: vi.fn(async (row) => ({ id: 'saved-ai', ...row })),
  getRecentMessages: vi.fn(async () => state.history),
  getWorkspaceWorkflowConfig: vi.fn(async () => state.workflowConfig),
}))

vi.mock('../../services/aiAgent.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildAIResponse: vi.fn(async (_context, { onText }) => { onText('조언입니다.') }),
}))

const { chatRouter } = await import('../chat.js')
const { buildAIResponse } = await import('../../services/aiAgent.js')
const { createMessage } = await import('../../lib/supabaseService.js')

const app = express()
app.use(express.json())
app.use('/api/chat', chatRouter)

const SAVED = '[보드 저장] T-3 역할 배분 양식에 적은 내용을 보드에 저장했어요.'
const at = (min) => `2026-10-03T12:${String(min).padStart(2, '0')}:00Z`
const teacher = (id, content, min) => ({ id, sender_type: 'teacher', content, procedure_context: 'T-2-1', created_at: at(min) })

beforeEach(() => {
  vi.clearAllMocks()
  state.workflowConfig = { briefMode: true }
  state.history = []
})

const send = (content, id = 'cur') => request(app).post('/api/chat/message')
  .send({ session_id: 'p1', procedure: 'T-2-1', content, teacher_message_id: id })

describe('약식 기록 — 개입 금지 뒤 양식 저장 알림', () => {
  it('"개입하지 마세요" 뒤에는 AI를 부르지 않고 저장했습니다로 답한다', async () => {
    state.history = [teacher('t1', '이 절차는 개입하지 마세요.', 1), teacher('cur', SAVED, 3)]
    const res = await send(SAVED)
    expect(res.status).toBe(200)
    expect(res.text).toContain('저장했습니다.')
    expect(buildAIResponse).not.toHaveBeenCalled()
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ sender_type: 'ai', content: '저장했습니다.', procedure_context: 'T-2-1' }))
  })

  it('지시가 없으면 AI에게 조언을 청한다', async () => {
    state.history = [teacher('cur', SAVED, 3)]
    await send(SAVED)
    expect(buildAIResponse).toHaveBeenCalledTimes(1)
  })

  it('다시 도움을 청했으면 AI에게 조언을 청한다', async () => {
    state.history = [teacher('t1', '개입하지 마세요', 1), teacher('t2', '이제 조언해 주세요', 2), teacher('cur', SAVED, 3)]
    await send(SAVED)
    expect(buildAIResponse).toHaveBeenCalledTimes(1)
  })

  it('약식이 아닌 팀은 종전처럼 AI를 부른다', async () => {
    state.workflowConfig = {}
    state.history = [teacher('t1', '이 절차는 개입하지 마세요.', 1), teacher('cur', SAVED, 3)]
    await send(SAVED)
    expect(buildAIResponse).toHaveBeenCalledTimes(1)
  })

  it('저장 알림이 아닌 일반 메시지는 지시가 있어도 AI가 옮겨 적는다', async () => {
    state.history = [teacher('t1', '개입하지 마세요', 1), teacher('cur', '- 김 / 영어', 3)]
    await send('- 김 / 영어')
    expect(buildAIResponse).toHaveBeenCalledTimes(1)
  })
})
