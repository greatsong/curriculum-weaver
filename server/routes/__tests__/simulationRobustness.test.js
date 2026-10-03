/** 시뮬레이션 강건성 회귀 테스트. 외부 호출 없음. */
import { beforeEach, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { BOARD_TYPES } from 'curriculum-weaver-shared/constants.js'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
const state = vi.hoisted(() => ({ user: 0, projects: [], role: 'owner', empty: false, saveFailures: false, disconnect: false, response: null }))
vi.mock('../../middleware/auth.js', () => ({ requireAuth: (req, res, next) => { req.user = { id: `audit-${state.user}` }; next() } }))
vi.mock('../../lib/standardsValidator.js', () => ({ getStandardsForSubjects: () => ({ standards: [] }) }))
vi.mock('../../lib/supabaseService.js', async original => ({
  ...(await original()),
  getMemberRole: vi.fn(async () => state.role),
  getProject: vi.fn(async () => ({ id: 'source', workspace_id: 'w', title: '감사 원본', subjects: ['국어', '과학'], grade: '고1', current_procedure: 'A-2-2', status: 'active' })),
  getSimulationsBySource: vi.fn(async () => []), getProjectSkips: vi.fn(async () => []),
  getDesignsByProject: vi.fn(async () => [{ procedure_code: 'A-2-2', content: { integratedObjectives: ['근거로 제안한다'] } }]),
  getMessages: vi.fn(async () => []), getMaterialRowsByProject: vi.fn(async () => []), getStandardsByProject: vi.fn(async () => []),
  createProject: vi.fn(async (workspace_id, data) => { const p = { ...data, workspace_id, id: `audit-project-${state.projects.length}` }; state.projects.push(p); return p }),
  updateProject: vi.fn(async (id, patch) => Object.assign(state.projects.find(p => p.id === id), patch)),
  upsertDesign: vi.fn(async (id, code) => { if (state.saveFailures && !['prep','T-1-1','T-1-2','T-2-1','T-2-2'].includes(code)) throw new Error('저장 오류') }),
  createMessage: vi.fn(async () => ({})),
}))
vi.mock('../../lib/anthropicClient.js', () => ({ getAnthropic: () => ({ messages: { stream(options) {
  if (state.disconnect) { state.response.emit('close'); throw new Error('AI 공급자 오류') }
  const input = Object.fromEntries(options.tools[0].input_schema.required.map(code => {
    const board = Object.fromEntries(BOARD_SCHEMAS[BOARD_TYPES[code]].fields.map(f => {
      const value = `시험 데이터 ${f.label}`
      if (f.columns) return [f.name, [Object.fromEntries(f.columns.map(c => [c.name, value]))]]
      if (f.itemSchema) return [f.name, [Object.fromEntries(Object.keys(f.itemSchema).map(k => [k, value]))]]
      if (['list', 'tags'].includes(f.type)) return [f.name, [value]]
      if (f.type === 'number') return [f.name, 28]
      return [f.name, value]
    }))
    return [code, { board: state.empty ? {} : board, conversation: [] }]
  }))
  return { async *[Symbol.asyncIterator]() {}, async finalMessage() { return { content: [{ type: 'tool_use', name: 'save_boards', input }] } } }
} } }) }))
const { demoRouter } = await import('../demo.js')
const { createProject, getSimulationsBySource, getMemberRole } = await import('../../lib/supabaseService.js')
const app = express(); app.use(express.json()); app.use('/api/demo', (req, res, next) => { state.response = res; next() }, demoRouter)
const input = { workspaceId: 'w', grade: '고1', subjects: ['국어', '과학'], topic: '기후' }
const events = r => r.text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)))
const generate = (body = input) => request(app).post('/api/demo/generate').send(body)
const resume = () => request(app).post('/api/demo/continue').send({ projectId: 'source' })
beforeEach(() => { vi.clearAllMocks(); state.user++; state.projects = []; state.role = 'owner'; state.empty = false; state.saveFailures = false; state.disconnect = false })
it('정상 신규 생성은 19개 저장 후 완료된다', async () => {
  const result = await generate()
  expect(events(result).at(-1)).toMatchObject({ type: 'complete', savedBoards: 19 })
})
it('신규 생성에서 5개만 저장되면 완료로 표시하면 안 된다', async () => {
  state.saveFailures = true
  const result = await generate()
  expect(events(result).at(-1).type).toBe('partial_failure')
})
it('신규 생성에서 빈 보드 19개를 완료로 세면 안 된다', async () => {
  state.empty = true
  expect(events(await generate()).at(-1).type).toBe('partial_failure')
})
it('신규 생성도 연결 종료 뒤 AI 오류가 나면 failed로 끝나야 한다', async () => {
  state.disconnect = true
  await generate()
  expect(state.projects[0].status).toBe('failed')
})
it.each(['generate', 'continue'])('viewer는 %s로 프로젝트를 생성할 수 없어야 한다', async route => {
  state.role = 'viewer'
  const response = await (route === 'generate' ? generate() : resume())
  expect(response.status).toBe(403)
  expect(createProject).not.toHaveBeenCalled()
})
it('두 탭의 동시 이어서 요청은 하나만 생성해야 한다', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  let arrivals = 0
  const snapshot = async () => { arrivals++; if (arrivals === 2) release(); await gate; return [] }
  getSimulationsBySource.mockImplementationOnce(snapshot).mockImplementationOnce(snapshot)
  const results = await Promise.all([resume(), resume()])
  expect(results.map(r => r.status).sort()).toEqual([200, 409])
  expect(createProject).toHaveBeenCalledTimes(1)
})
it('일일 한도 직전의 동시 신규 생성도 10회까지만 허용해야 한다', async () => {
  for (let i = 0; i < 9; i++) await generate()
  let release
  const gate = new Promise(resolve => { release = resolve })
  let arrivals = 0
  const member = async () => { arrivals++; if (arrivals === 2) release(); await gate; return 'owner' }
  getMemberRole.mockImplementationOnce(member).mockImplementationOnce(member)
  const results = await Promise.all([generate({ ...input, topic: '기후1' }), generate({ ...input, topic: '기후2' })])
  expect(results.map(r => r.status).sort()).toEqual([200, 429])
})
it('학년·교과 메타데이터가 새 프로젝트에 보존되어야 한다', async () => {
  await generate()
  expect(state.projects[0]).toMatchObject({ grade: input.grade, subjects: input.subjects })
})
it.each([{ ...input, topic: 3 }, { ...input, subjects: '국어,과학' }])('잘못된 입력 자료형을 400으로 거절해야 한다: %j', async body => {
  expect((await generate(body)).status).toBe(400)
  expect(createProject).not.toHaveBeenCalled()
})
it('DB 복구 후에도 유효한 생성 중 복제본이 있으면 중복 생성을 차단한다', async () => {
  getSimulationsBySource.mockResolvedValueOnce([{ id: 'stale', status: 'generating', created_at: '2020-01-01T00:00:00Z' }])
  expect((await resume()).status).toBe(409)
  expect(createProject).not.toHaveBeenCalled()
})
