/**
 * POST /api/chat/message — 화면이 먼저 저장한 현재 메시지가 AI 대화 기록에 다시 들어가지 않는다.
 * (2026-10-03 운영 제보: AI가 답마다 "같은 메시지가 두 번 들어와 한 번만 반영했습니다"라고 적음)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'teacher' }; next() },
}))

const HISTORY = [
  { id: 'a1', sender_type: 'ai', content: '안내', procedure_context: 'A-2-1', created_at: '2026-10-03T06:00:00Z' },
  { id: 'm1', sender_type: 'teacher', content: '추천해주세요. 주제에 맞는 성취기준', procedure_context: 'A-2-1', created_at: '2026-10-03T06:02:53Z' },
]

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => ({ id, workspace_id: 'w1', title: '중복 테스트', status: 'active' })),
  getMemberRole: vi.fn(async () => 'editor'),
  createMessage: vi.fn(async (row) => ({ id: 'saved-ai', ...row })),
  getRecentMessages: vi.fn(async () => HISTORY),
}))

vi.mock('../../services/aiAgent.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildAIResponse: vi.fn(async (_context, { onText }) => { onText('답입니다.') }),
}))

const { chatRouter } = await import('../chat.js')
const { buildAIResponse, buildMessages } = await import('../../services/aiAgent.js')

const app = express()
app.use(express.json())
app.use('/api/chat', chatRouter)

beforeEach(() => vi.clearAllMocks())

const send = (body) => request(app).post('/api/chat/message').send({ session_id: 'p1', procedure: 'A-2-1', content: '추천해주세요. 주제에 맞는 성취기준', ...body })
const userTurns = () => {
  const ctx = buildAIResponse.mock.calls[0][0]
  return buildMessages(ctx.recentMessages, ctx.userMessage).filter((m) => m.role === 'user').map((m) => m.content)
}

describe('채팅: 현재 메시지가 AI에게 한 번만 간다', () => {
  it('화면이 보낸 메시지 번호로 기록에서 뺀다', async () => {
    const res = await send({ teacher_message_id: 'm1' })
    expect(res.status).toBe(200)
    expect(buildAIResponse.mock.calls[0][0].recentMessages.map((m) => m.id)).toEqual(['a1'])
    expect(userTurns()).toEqual(['추천해주세요. 주제에 맞는 성취기준'])
  })

  it('번호가 없는 옛 탭도 내용으로 걸러 한 번만 간다', async () => {
    await send({})
    expect(userTurns()).toEqual(['추천해주세요. 주제에 맞는 성취기준'])
  })
})
