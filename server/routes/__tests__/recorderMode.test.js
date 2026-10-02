/**
 * 팀 진행 방식(1인 기록 / 팀 채팅) 회귀 테스트
 * - 저장값이 없는 기존 팀은 팀 채팅(종전 동작)
 * - 1인 기록 팀만 시스템 프롬프트에 기록자 지시가 들어간다(시연 모드 제외)
 * - 채팅 라우트는 진행 방식을 클라이언트가 아니라 워크스페이스 설정에서 읽는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { resolveParticipationMode, PARTICIPATION_MODES, DEFAULT_PARTICIPATION_MODE_FOR_NEW_TEAM } from 'curriculum-weaver-shared/constants.js'

const ws = vi.hoisted(() => ({ config: null, fail: false }))

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'teacher' }; next() },
}))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => ({ id, workspace_id: 'w1', title: '진행 방식 테스트', status: 'active' })),
  getMemberRole: vi.fn(async () => 'editor'),
  createMessage: vi.fn(async (row) => ({ id: 'saved', ...row })),
  getWorkspaceWorkflowConfig: vi.fn(async () => {
    if (ws.fail) throw new Error('DB 장애')
    return ws.config
  }),
}))

vi.mock('../../services/aiAgent.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildAIResponse: vi.fn(async (_context, { onText }) => { onText('응답') }),
}))

const { chatRouter } = await import('../chat.js')
const { buildAIResponse } = await import('../../services/aiAgent.js')
const { buildSystemPrompt } = await vi.importActual('../../services/aiAgent.js')

const app = express()
app.use(express.json())
app.use('/api/chat', chatRouter)

const RECORDER_MARK = '[진행 방식 — 1인 기록 팀'
const baseContext = { session: { title: '테스트' }, procedure: 'T-1-1', boards: [], standards: [], materials: [], recentMessages: [] }

beforeEach(() => {
  vi.clearAllMocks()
  ws.config = null
  ws.fail = false
})

describe('진행 방식 기본값', () => {
  it('새 팀 기본값은 1인 기록이다', () => {
    expect(DEFAULT_PARTICIPATION_MODE_FOR_NEW_TEAM).toBe(PARTICIPATION_MODES.RECORDER)
  })
  it.each([[null], [{}], [{ aiRole: 'facilitator' }], [{ participationMode: 'unknown' }]])(
    '저장값이 없거나 알 수 없으면 팀 채팅이다 (%j)', (config) => {
      expect(resolveParticipationMode(config)).toBe(PARTICIPATION_MODES.TEAM_CHAT)
    })
  it('저장값이 recorder면 1인 기록이다', () => {
    expect(resolveParticipationMode({ participationMode: 'recorder' })).toBe(PARTICIPATION_MODES.RECORDER)
  })
})

describe('시스템 프롬프트 주입', () => {
  it('1인 기록 팀에는 기록자 지시가 들어간다', () => {
    const prompt = buildSystemPrompt({ ...baseContext, participationMode: 'recorder' })
    expect(prompt).toContain(RECORDER_MARK)
    expect(prompt).toContain('선생님별 의견을 따로 묻지 말고')
  })
  it('팀 채팅과 값 없음은 종전과 같다', () => {
    expect(buildSystemPrompt({ ...baseContext, participationMode: 'team_chat' })).not.toContain(RECORDER_MARK)
    expect(buildSystemPrompt(baseContext)).toBe(buildSystemPrompt({ ...baseContext, participationMode: 'team_chat' }))
  })
  it('시연 모드에는 넣지 않는다', () => {
    expect(buildSystemPrompt({ ...baseContext, procedure: 'demo-1', mode: 'demo', participationMode: 'recorder' })).not.toContain(RECORDER_MARK)
  })
})

describe('채팅 라우트는 워크스페이스 설정에서 진행 방식을 읽는다', () => {
  const send = (body = {}) => request(app).post('/api/chat/message').send({ session_id: 'p1', content: '질문', procedure: 'T-1-1', ...body })

  it('설정이 1인 기록이면 recorder로 전달한다', async () => {
    ws.config = { participationMode: 'recorder', aiRole: 'facilitator' }
    expect((await send()).status).toBe(200)
    expect(buildAIResponse.mock.calls[0][0].participationMode).toBe('recorder')
  })
  it('설정이 없으면 team_chat으로 전달한다', async () => {
    expect((await send()).status).toBe(200)
    expect(buildAIResponse.mock.calls[0][0].participationMode).toBe('team_chat')
  })
  it('설정 조회가 실패해도 채팅은 진행되고 team_chat으로 둔다', async () => {
    ws.fail = true
    expect((await send()).status).toBe(200)
    expect(buildAIResponse.mock.calls[0][0].participationMode).toBe('team_chat')
  })
  it('클라이언트가 보낸 값은 무시한다', async () => {
    expect((await send({ participationMode: 'recorder' })).status).toBe(200)
    expect(buildAIResponse.mock.calls[0][0].participationMode).toBe('team_chat')
  })
})
