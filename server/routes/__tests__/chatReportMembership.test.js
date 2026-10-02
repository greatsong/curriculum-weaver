/**
 * 채팅 기록 조회·보고서 3종의 프로젝트 멤버십 검사 회귀 테스트
 *
 * 배경: 두 라우터가 멤버십 검사를 router.use()로 걸었는데, 라우터 수준 미들웨어에서는
 * req.params가 비어 있어 :sessionId/:projectId를 읽지 못하고 검사 없이 통과했다.
 * (POST는 본문 session_id로 검사되어 영향이 없었고, 본문이 없는 GET만 열려 있었다.)
 *
 * 모의 객체는 실제 supabaseService의 동작을 따른다.
 * - getProject: 행이 없으면 .single() 오류를 handleResult가 throw한다 (null을 반환하지 않음)
 * - getMemberRole: 조회 오류를 삼키고 null을 반환한다 (throw하지 않음)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const db = vi.hoisted(() => ({
  projects: new Map(),
  roles: new Map(),
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
  getProject: vi.fn(async (id) => {
    const project = db.projects.get(id)
    if (!project) throw new Error('프로젝트 조회 실패: JSON object requested, multiple (or no) rows returned')
    return project
  }),
  getMemberRole: vi.fn(async (workspaceId, userId) => db.roles.get(`${workspaceId}:${userId}`) || null),
  getRecentMessages: vi.fn(async () => [{ id: 'm1', project_id: 'p1', content: '안녕하세요', procedure_context: 'T-1-1' }]),
}))

vi.mock('../../services/reportGenerator.js', () => ({
  collectReportData: vi.fn(async () => ({ project: { title: '융합 수업' } })),
  generateHTML: vi.fn(() => '<html>보고서</html>'),
  generateMarkdown: vi.fn(() => '# 보고서'),
}))

const { chatRouter } = await import('../chat.js')
const { reportRouter } = await import('../report.js')
const { getRecentMessages } = await import('../../lib/supabaseService.js')
const { collectReportData } = await import('../../services/reportGenerator.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/chat', chatRouter)
  app.use('/api/report', reportRouter)
  return app
}

const app = buildApp()
const REPORT_FORMATS = ['html', 'md', 'preview']

beforeEach(() => {
  vi.clearAllMocks()
  db.projects.clear()
  db.roles.clear()
  db.projects.set('p1', { id: 'p1', workspace_id: 'w1', title: '융합 수업' })
  db.roles.set('w1:owner-user', 'owner')
  db.roles.set('w1:editor-user', 'editor')
  db.roles.set('w1:viewer-user', 'viewer')
})

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/chat/:sessionId 멤버십 검사', () => {
  it('비멤버는 403이고 메시지를 조회하지 않는다', async () => {
    const res = await request(app).get('/api/chat/p1').set('x-test-user', 'outsider')
    expect(res.status).toBe(403)
    expect(getRecentMessages).not.toHaveBeenCalled()
  })

  it.each(['owner-user', 'editor-user', 'viewer-user'])('멤버(%s)는 대화 기록을 받는다', async (user) => {
    const res = await request(app).get('/api/chat/p1').set('x-test-user', user)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].stage_context).toBe('T-1-1')
  })

  it('운영 DB에서 프로젝트 조회가 실패하면 503으로 막는다', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test')
    const res = await request(app).get('/api/chat/missing').set('x-test-user', 'owner-user')
    expect(res.status).toBe(503)
    expect(getRecentMessages).not.toHaveBeenCalled()
  })

  it('본문 session_id를 쓰는 POST 검사는 그대로 동작한다', async () => {
    const res = await request(app)
      .post('/api/chat/teacher')
      .set('x-test-user', 'outsider')
      .send({ session_id: 'p1', content: '질문' })
    expect(res.status).toBe(403)
  })
})

describe('GET /api/report/:projectId/* 멤버십 검사', () => {
  it.each(REPORT_FORMATS)('비멤버는 %s 보고서에서 403이고 데이터를 모으지 않는다', async (format) => {
    const res = await request(app).get(`/api/report/p1/${format}`).set('x-test-user', 'outsider')
    expect(res.status).toBe(403)
    expect(collectReportData).not.toHaveBeenCalled()
  })

  it.each(REPORT_FORMATS)('멤버는 %s 보고서를 받는다', async (format) => {
    const res = await request(app).get(`/api/report/p1/${format}`).set('x-test-user', 'viewer-user')
    expect(res.status).toBe(200)
    expect(collectReportData).toHaveBeenCalledWith('p1')
  })

  it.each(REPORT_FORMATS)('운영 DB에서 프로젝트 조회가 실패하면 %s 보고서도 503으로 막는다', async (format) => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test')
    const res = await request(app).get(`/api/report/missing/${format}`).set('x-test-user', 'owner-user')
    expect(res.status).toBe(503)
    expect(collectReportData).not.toHaveBeenCalled()
  })
})
