/**
 * POST /api/chat/message — 모델이 거절(refusal)하면 부분 응답을 AI 메시지로 저장하지 않고,
 * 안내 문구(ERROR)와 [DONE]으로 스트림을 끝낸다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'teacher' }; next() },
}))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => ({ id, workspace_id: 'w1', title: '거절 테스트', status: 'active' })),
  getMemberRole: vi.fn(async () => 'editor'),
  createMessage: vi.fn(async (row) => ({ id: 'saved-1', ...row })),
}))

vi.mock('../../services/aiAgent.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildAIResponse: vi.fn(),
}))

const { chatRouter } = await import('../chat.js')
const { createMessage } = await import('../../lib/supabaseService.js')
const { buildAIResponse, REFUSAL_MESSAGE } = await import('../../services/aiAgent.js')

const app = express()
app.use(express.json())
app.use('/api/chat', chatRouter)

beforeEach(() => vi.clearAllMocks())

describe('채팅 거절 처리', () => {
  it('거절이면 AI 메시지를 저장하지 않고 안내 문구와 [DONE]을 보낸다', async () => {
    buildAIResponse.mockImplementation(async (_context, { onText, onError }) => {
      onText('부분 응답')
      onError(REFUSAL_MESSAGE)
      return { refused: true }
    })
    const res = await request(app).post('/api/chat/message').send({ session_id: 'p1', content: '질문', procedure: 'T-1-1' })
    expect(res.status).toBe(200)
    expect(res.text).toContain(REFUSAL_MESSAGE)
    expect(res.text).toContain('data: [DONE]')
    expect(createMessage).not.toHaveBeenCalledWith(expect.objectContaining({ sender_type: 'ai' }))
  })

  it('정상 응답은 종전대로 AI 메시지를 저장한다', async () => {
    buildAIResponse.mockImplementation(async (_context, { onText }) => {
      onText('정상 응답입니다.')
    })
    const res = await request(app).post('/api/chat/message').send({ session_id: 'p1', content: '질문', procedure: 'T-1-1' })
    expect(res.status).toBe(200)
    expect(res.text).toContain('data: [DONE]')
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ sender_type: 'ai', content: '정상 응답입니다.' }))
  })
})
