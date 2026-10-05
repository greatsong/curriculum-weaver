/**
 * AI 답·절차 안내를 저장한 직후 서버가 그 원문을 팀원 탭에 보낸다(2026-10-05 운영 사고 후속).
 * 예전에는 요청한 탭이 자기 화면 글(streamingText)을 ai_response_done으로 보내 서버가 그대로 중계해,
 * 한 탭에서 섞인 글이 팀원 화면에도 퍼졌다.
 * - 본문에 socket_id가 있으면 그 탭만 빼고(except) message_added로 저장 행을 보낸다
 * - 없으면(배포 전에 열린 옛 탭) 보내지 않는다 — 옛 탭은 ai_response_done 중계가 맡는다
 * - 저장에 실패하면 보내지 않는다. 방송이 실패해도 응답은 끝까지 간다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'teacher' }; next() },
}))

const state = vi.hoisted(() => ({ project: null, saveFails: false, workflowConfig: {}, history: [] }))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => state.project || ({ id, workspace_id: 'w1', title: '팀', status: 'active', learner_context: {} })),
  getMemberRole: vi.fn(async () => 'editor'),
  getProjectSkips: vi.fn(async () => []),
  getDesignsByProject: vi.fn(async () => []),
  getStandardsByProject: vi.fn(async () => []),
  getRecentMessages: vi.fn(async () => state.history),
  getWorkspaceWorkflowConfig: vi.fn(async () => state.workflowConfig),
  createMessage: vi.fn(async (row) => {
    if (state.saveFails) throw new Error('DB 저장 실패')
    return { id: `saved-${row.sender_type}`, created_at: '2026-10-05T00:00:00Z', ...row }
  }),
}))

vi.mock('../../services/aiAgent.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // 서버 후처리(내부 절차 코드 치환)가 반영되는지 보려고 내부 코드를 섞어 답한다
  buildAIResponse: vi.fn(async (_context, { onText }) => { onText('T-1-2 절차에서 '); onText('비전을 정리해 볼게요.') }),
  buildProcedureIntroResponse: vi.fn(async (_context, { onText }) => { onText('시연 코치 안내입니다.') }),
}))

const { chatRouter } = await import('../chat.js')
const { createMessage } = await import('../../lib/supabaseService.js')

const emitted = []
let emitThrows = false
const fakeIo = {
  to: (room) => ({
    except: (except) => ({
      emit: (event, payload) => {
        if (emitThrows) throw new Error('adapter down')
        emitted.push({ room, except, event, payload })
      },
    }),
  }),
}

const app = express()
app.use(express.json())
app.set('io', fakeIo)
app.use('/api/chat', chatRouter)

const events = (res) => res.text.split('\n').filter((l) => l.startsWith('data: {')).map((l) => JSON.parse(l.slice(6)))

beforeEach(() => {
  vi.clearAllMocks()
  emitted.length = 0
  emitThrows = false
  state.project = null
  state.saveFails = false
  state.workflowConfig = {}
  state.history = []
})

const sendMessage = (extra = {}) => request(app).post('/api/chat/message')
  .send({ session_id: 'p1', procedure: 'T-1-1', content: '비전을 같이 세워 주세요', teacher_message_id: 'cur', ...extra })

describe('/api/chat/message — 저장한 AI 답을 팀원 탭에 보낸다', () => {
  it('socket_id가 있으면 요청한 탭만 빼고 저장 원문을 보낸다', async () => {
    const res = await sendMessage({ socket_id: 'sockA' })
    expect(res.status).toBe(200)
    expect(emitted).toHaveLength(1)
    const [sent] = emitted
    expect(sent).toMatchObject({ room: 'p1', except: 'sockA', event: 'message_added' })
    // 화면 글이 아니라 서버가 저장한 원문(내부 코드 치환 반영본)이다
    const savedRow = createMessage.mock.calls.at(-1)[0]
    expect(sent.payload.content).toBe(savedRow.content)
    expect(sent.payload.content).not.toContain('T-1-2')
    expect(sent.payload).toMatchObject({ id: 'saved-ai', sender_type: 'ai', stage_context: 'T-1-1', session_id: 'p1' })
  })

  it('제안이 없어도 요청한 탭에 저장 번호(message_saved)를 알린다', async () => {
    const res = await sendMessage({ socket_id: 'sockA' })
    expect(events(res)).toContainEqual(expect.objectContaining({ type: 'message_saved', messageId: 'saved-ai', suggestionCount: 0 }))
    expect(res.text.trim().endsWith('data: [DONE]')).toBe(true)
  })

  it('socket_id가 없으면(옛 탭) 방송하지 않는다', async () => {
    const res = await sendMessage()
    expect(res.status).toBe(200)
    expect(createMessage).toHaveBeenCalled()
    expect(emitted).toHaveLength(0)
  })

  it('socket_id가 문자열이 아니면 방송하지 않는다', async () => {
    await sendMessage({ socket_id: { $gt: '' } })
    await sendMessage({ socket_id: 42 })
    expect(emitted).toHaveLength(0)
  })

  it('저장에 실패하면 방송하지 않는다', async () => {
    state.saveFails = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await sendMessage({ socket_id: 'sockA' })
    expect(emitted).toHaveLength(0)
    expect(events(res)).toContainEqual(expect.objectContaining({ type: 'error' }))
    expect(events(res).some((e) => e.type === 'message_saved')).toBe(false)
  })

  it('방송이 실패해도 응답은 끝까지 간다', async () => {
    emitThrows = true
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await sendMessage({ socket_id: 'sockA' })
    expect(res.status).toBe(200)
    expect(events(res)).toContainEqual(expect.objectContaining({ type: 'message_saved', messageId: 'saved-ai' }))
    expect(events(res).some((e) => e.type === 'error')).toBe(false)
    expect(res.text.trim().endsWith('data: [DONE]')).toBe(true)
  })

  it('약식 기록의 "저장했습니다." 즉시 답도 같은 규칙으로 보낸다', async () => {
    state.workflowConfig = { briefMode: true }
    const SAVED = '[보드 저장] T-3 역할 배분 양식에 적은 내용을 보드에 저장했어요.'
    state.history = [
      { id: 't1', sender_type: 'teacher', content: '이 절차는 개입하지 마세요.', procedure_context: 'T-2-1', created_at: '2026-10-05T00:01:00Z' },
      { id: 'cur', sender_type: 'teacher', content: SAVED, procedure_context: 'T-2-1', created_at: '2026-10-05T00:03:00Z' },
    ]
    const res = await request(app).post('/api/chat/message')
      .send({ session_id: 'p1', procedure: 'T-2-1', content: SAVED, teacher_message_id: 'cur', socket_id: 'sockA' })
    expect(res.text).toContain('저장했습니다.')
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({ room: 'p1', except: 'sockA', payload: { content: '저장했습니다.', stage_context: 'T-2-1' } })
    expect(events(res)).toContainEqual(expect.objectContaining({ type: 'message_saved', messageId: 'saved-ai' }))
  })
})

describe('절차 안내 — 저장한 안내를 팀원 탭에 보낸다', () => {
  it('/stage-intro: socket_id가 있으면 except로 보낸다', async () => {
    const res = await request(app).post('/api/chat/stage-intro').send({ session_id: 'p1', stage: 'T-2-1', socket_id: 'sockA' })
    expect(res.status).toBe(200)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({ room: 'p1', except: 'sockA', event: 'message_added', payload: { id: 'saved-ai', stage_context: 'T-2-1' } })
    expect(emitted[0].payload.content).toBe(createMessage.mock.calls.at(-1)[0].content)
    expect(events(res)).toContainEqual(expect.objectContaining({ type: 'message_saved', messageId: 'saved-ai' }))
  })

  it('/stage-intro: socket_id가 없으면 보내지 않는다', async () => {
    await request(app).post('/api/chat/stage-intro').send({ session_id: 'p1', stage: 'T-2-1' })
    expect(createMessage).toHaveBeenCalled()
    expect(emitted).toHaveLength(0)
  })

  it('/stage-intro: 저장에 실패하면 보내지 않는다', async () => {
    state.saveFails = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(app).post('/api/chat/stage-intro').send({ session_id: 'p1', stage: 'T-2-1', socket_id: 'sockA' })
    expect(emitted).toHaveLength(0)
    expect(events(res).some((e) => e.type === 'message_saved')).toBe(false)
  })

  it('/stage-intro 시연 안내: 저장하면 보내고, 저장에 실패하면 보내지 않는다', async () => {
    state.project = { id: 'p1', workspace_id: 'w1', title: '시연', status: 'active', learner_context: { demo: true } }
    await request(app).post('/api/chat/stage-intro').send({ session_id: 'p1', stage: 'demo_lesson_plan', socket_id: 'sockA' })
    expect(emitted).toHaveLength(1)
    expect(emitted[0].payload).toMatchObject({ content: '시연 코치 안내입니다.', stage_context: 'demo_lesson_plan' })

    emitted.length = 0
    state.saveFails = true
    const res = await request(app).post('/api/chat/stage-intro').send({ session_id: 'p1', stage: 'demo_lesson_plan', socket_id: 'sockA' })
    expect(res.status).toBe(200)
    expect(emitted).toHaveLength(0)
    expect(res.text.trim().endsWith('data: [DONE]')).toBe(true)
  })

  it('/procedure-intro(예전 경로)도 같은 규칙', async () => {
    await request(app).post('/api/chat/procedure-intro').send({ session_id: 'p1', procedure: 'T-2-1', socket_id: 'sockA' })
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({ except: 'sockA', payload: { stage_context: 'T-2-1' } })
    emitted.length = 0
    await request(app).post('/api/chat/procedure-intro').send({ session_id: 'p1', procedure: 'T-2-1' })
    expect(emitted).toHaveLength(0)
  })
})
