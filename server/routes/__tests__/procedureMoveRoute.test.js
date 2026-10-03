/**
 * POST /api/chat/procedure-move — 절차 이동 기록 API.
 * 권한·읽기 전용 차단, 지나친 이동 정리(삭제+소켓 전파), 동시 요청 직렬화.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'teacher' }; next() },
}))

const state = vi.hoisted(() => ({
  project: null, role: 'editor', messages: [], designs: [], skips: [], seq: 0, deleted: [],
}))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async () => state.project),
  getMemberRole: vi.fn(async () => state.role),
  getRecentMessages: vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 5)) // 동시 요청이 겹칠 틈을 만든다
    return state.messages.slice()
  }),
  getDesignsByProject: vi.fn(async () => state.designs),
  getProjectSkips: vi.fn(async () => state.skips),
  deleteMessage: vi.fn(async (_pid, id) => {
    const before = state.messages.length
    state.messages = state.messages.filter((m) => m.id !== id)
    state.deleted.push(id)
    return state.messages.length < before
  }),
  createMessage: vi.fn(async (row) => {
    const msg = { id: `n${++state.seq}`, created_at: new Date().toISOString(), ...row }
    state.messages.push(msg)
    return msg
  }),
}))

const { chatRouter } = await import('../chat.js')
const { createMessage } = await import('../../lib/supabaseService.js')

const emitted = []
const app = express()
app.use(express.json())
app.set('io', { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) })
app.use('/api/chat', chatRouter)

const move = (from, to, extra = {}) => request(app).post('/api/chat/procedure-move').send({ session_id: 'p1', from, to, ...extra })
const ago = (ms) => new Date(Date.now() - ms).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  emitted.length = 0
  state.project = { id: 'p1', workspace_id: 'w1', title: '연수', status: 'active', learner_context: {} }
  state.role = 'editor'
  state.messages = [{ id: 'i1', sender_type: 'ai', procedure_context: 'E-1-1', content: 'E-1 안내', created_at: ago(600_000) }]
  state.designs = []
  state.skips = []
  state.seq = 0
  state.deleted = []
})

describe('POST /api/chat/procedure-move', () => {
  it('이동 기록을 AI 메시지로 저장하고 팀에 전파한다', async () => {
    const res = await move('E-1-1', 'E-2-1')
    expect(res.status).toBe(200)
    expect(res.body.message).toMatchObject({ sender_type: 'ai', sender_name: 'procedure_move', procedure_context: 'E-2-1' })
    expect(res.body.message.content).toContain('생략하시는 거죠? 알겠습니다.')
    expect(emitted).toEqual([{ room: 'p1', event: 'message_added', payload: res.body.message }])
  })

  it('잘못 눌렀다가 돌아오면 지난 기록과 그때 생긴 안내를 지우고 삭제를 전파한다', async () => {
    const first = await move('E-1-1', 'E-2-1')
    state.messages.push({ id: 'i2', sender_type: 'ai', procedure_context: 'E-2-1', content: 'E-2 안내', created_at: new Date(Date.now() + 10).toISOString() })
    await new Promise((r) => setTimeout(r, 20))
    emitted.length = 0
    const back = await move('E-2-1', 'E-1-1')
    expect(back.status).toBe(200)
    expect(state.deleted).toEqual([first.body.message.id, 'i2'])
    expect(back.body.removedMessages).toEqual([
      { id: first.body.message.id, procedure_context: 'E-2-1', content: first.body.message.content },
      { id: 'i2', procedure_context: 'E-2-1', content: 'E-2 안내' },
    ])
    expect(emitted.map((e) => e.event)).toEqual(['message_removed', 'message_removed', 'message_added'])
    expect(back.body.message.content.startsWith('E-1 수업 성찰과 공동 개선 단계로 돌아왔습니다.')).toBe(true)
  })

  it('두 사람이 동시에 같은 이동을 눌러도 기록은 하나만 남는다', async () => {
    const [a, b] = await Promise.all([move('E-1-1', 'E-2-1'), move('E-1-1', 'E-2-1')])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(a.body.message.id).toBe(b.body.message.id)
    expect(emitted.filter((e) => e.event === 'message_added')).toHaveLength(1)
  })

  it('빠른 연속 이동도 차례로 처리해 마지막 기록 하나만 남는다', async () => {
    await Promise.all([move('E-1-1', 'E-2-1'), move('E-2-1', 'E-1-1')])
    const notes = state.messages.filter((m) => m.sender_name === 'procedure_move')
    expect(notes).toHaveLength(1)
    expect(notes[0].content.startsWith('E-1 수업 성찰과 공동 개선 단계로 돌아왔습니다.')).toBe(true)
  })

  it('잘못된 요청은 400', async () => {
    expect((await move('E-1-1', 'E-1-1')).status).toBe(400)
    expect((await move('없는절차', 'E-1-1')).status).toBe(400)
    expect((await request(app).post('/api/chat/procedure-move').send({ from: 'E-1-1', to: 'E-2-1' })).status).toBe(400)
  })

  it('보기 권한 팀원·시뮬레이션·시연 프로젝트에는 기록하지 않는다', async () => {
    state.role = 'viewer'
    expect((await move('E-1-1', 'E-2-1')).status).toBe(403)
    state.role = 'editor'
    state.project = { ...state.project, status: 'simulation' }
    expect((await move('E-1-1', 'E-2-1')).status).toBe(403)
    state.project = { ...state.project, status: 'active', learner_context: { demo: true } }
    expect((await move('E-1-1', 'E-2-1')).status).toBe(403)
    expect(createMessage).not.toHaveBeenCalled()
  })

  it('생략 표시된 절차로는 기록하지 않는다', async () => {
    state.skips = [{ procedure_code: 'E-2-1' }]
    const res = await move('E-1-1', 'E-2-1')
    expect(res.status).toBe(200)
    expect(res.body.message).toBeNull()
    expect(createMessage).not.toHaveBeenCalled()
  })

  it('다녀간 절차라는 화면의 신호가 있으면 현황 안내를 붙인다', async () => {
    const res = await move('E-1-1', 'T-1-1', { visited: true })
    expect(res.body.message.content).toContain('단계로 돌아왔습니다.')
    expect(res.body.message.content).toContain('보드는 아직 비어 있습니다.')
  })
})
