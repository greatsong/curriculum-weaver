/**
 * 화면이 쓰는 /api/chat/stage-intro에도 약식 안내가 나간다(2026-10-03: /procedure-intro에만 연결돼
 * 실제 화면에는 약식 팀에도 긴 정식 안내가 나왔다).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'teacher' }; next() },
}))

const state = vi.hoisted(() => ({ workflowConfig: { briefMode: true }, fail: false }))
vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => ({ id, workspace_id: 'w1', title: '연수', status: 'active', learner_context: {} })),
  getMemberRole: vi.fn(async () => 'editor'),
  getProjectSkips: vi.fn(async () => []),
  getDesignsByProject: vi.fn(async () => []),
  getStandardsByProject: vi.fn(async () => []),
  createMessage: vi.fn(async (row) => ({ id: 'intro', ...row })),
  getWorkspaceWorkflowConfig: vi.fn(async () => { if (state.fail) throw new Error('조회 실패'); return state.workflowConfig }),
}))

const { chatRouter } = await import('../chat.js')
const app = express()
app.use(express.json())
app.use('/api/chat', chatRouter)

beforeEach(() => { state.workflowConfig = { briefMode: true }; state.fail = false })

const intro = async (path) => {
  const res = await request(app).post(path).send({ session_id: 'p1', procedure: 'T-2-1' })
  const text = res.text.split('\n').filter((l) => l.startsWith('data: {')).map((l) => JSON.parse(l.slice(6))).filter((e) => e.type === 'text').map((e) => e.content).join('')
  return { status: res.status, text }
}

describe('절차 안내 — 약식 기록', () => {
  it('화면 경로(/stage-intro): 약식 팀은 짧은 안내', async () => {
    const r = await intro('/api/chat/stage-intro')
    expect(r.status).toBe(200)
    expect(r.text).toContain('약식 기록')
    expect(r.text).toContain('필수 입력')
    expect(r.text.length).toBeLessThan(600)
  })

  it('예전 경로(/procedure-intro)도 같은 짧은 안내', async () => {
    const r = await intro('/api/chat/procedure-intro')
    expect(r.text).toContain('약식 기록')
  })

  it('약식이 아니거나 설정 조회에 실패하면 종전 정식 안내', async () => {
    state.workflowConfig = {}
    const normal = await intro('/api/chat/stage-intro')
    expect(normal.text).not.toContain('약식 기록')
    expect(normal.text).toContain('절차에 진입했습니다')
    state.fail = true
    const failed = await intro('/api/chat/stage-intro')
    expect(failed.text).toContain('절차에 진입했습니다')
  })
})
