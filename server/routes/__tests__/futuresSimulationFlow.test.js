/** 실제 라우트/프롬프트/보고서 경로를 실행하며 DB와 AI 공급자만 대체한다. */
import { beforeEach, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { ALL_STANDARDS } from '../../data/standards.js'
import { Standards } from '../../lib/store.js'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import { PROCEDURE_LIST, BOARD_TYPES } from 'curriculum-weaver-shared/constants.js'
const state = vi.hoisted(() => ({ projects: {}, designs: {}, standards: {}, prompts: [], failCopy: false, failLink: false, failSave: false, extraBoard: false, emptyBoard: false, disconnect: false, response: null, user: 0 }))
vi.mock('../../middleware/auth.js', () => ({ requireAuth: (req, res, next) => { req.user = { id: `teacher-${state.user}` }; next() } }))
vi.mock('../../lib/supabaseService.js', async original => ({
  ...(await original()),
  getProject: vi.fn(async id => state.projects[id]),
  getMemberRole: vi.fn(async () => 'owner'),
  getSimulationsBySource: vi.fn(async () => []),
  getProjectSkips: vi.fn(async () => []),
  getMessages: vi.fn(async () => []), getMaterialRowsByProject: vi.fn(async () => []),
  getDesignsByProject: vi.fn(async id => Object.entries(state.designs[id] || {}).map(([procedure_code, content]) => ({ procedure_code, content }))),
  getStandardsByProject: vi.fn(async id => state.standards[id] || []),
  createProject: vi.fn(async (workspace_id, data) => { state.designs.clone = {}; return state.projects.clone = { ...data, workspace_id, id: 'clone' } }),
  updateProject: vi.fn(async (id, patch) => Object.assign(state.projects[id], patch)),
  upsertDesign: vi.fn(async (id, code, content) => {
    if (state.failCopy && code === 'A-2-1') throw new Error('분석 보드 복제 실패')
    if (state.failSave && code === 'Ds-1-1') throw new Error('평가 보드 저장 실패')
    state.designs[id][code] = structuredClone(content)
  }),
  addStandardToProject: vi.fn(async (id, standard_id) => {
    if (state.failLink) throw new Error('성취기준 연결 실패')
    const entry = state.standards.source.find(s => s.standard_id === standard_id) || { standard_id, curriculum_standards: Standards.getByCode('[10통과2-01-01]') }
    ;(state.standards[id] ||= []).push(structuredClone(entry))
  }),
  resolveStandardId: vi.fn(async () => 'new-standard'),
  createMaterialRowsBulk: vi.fn(async () => []), createMessagesBulk: vi.fn(async () => 0),
  createMessage: vi.fn(async () => ({})),
}))
vi.mock('../../lib/anthropicClient.js', () => ({ getAnthropic: () => ({ messages: { stream(options) {
  if (state.disconnect) { state.response.emit('close'); throw new Error('공급자 연결 실패') }
  state.prompts.push(options.system[0].text)
  const codes = options.tools[0].input_schema.required
  const input = Object.fromEntries(codes.map(code => {
    const board = Object.fromEntries(BOARD_SCHEMAS[BOARD_TYPES[code]].fields.map(f => {
      const value = `에너지 현장 조사: ${f.label}`
      if (f.columns) return [f.name, [Object.fromEntries(f.columns.map(c => [c.name, value]))]]
      if (f.itemSchema) return [f.name, [Object.fromEntries(Object.keys(f.itemSchema).map(k => [k, value]))]]
      if (['list', 'tags'].includes(f.type)) return [f.name, [value]]
      return [f.name, value]
    }))
    return [code, { board, conversation: [{ speaker: 'AI 공동설계자', message: '앞서 검토한 연결과 목표를 이어갑니다.' }] }]
  }))
  if (state.extraBoard) input['A-2-1'] = { board: { duplicateCheck: '모델이 임의로 다시 쓴 분석' } }
  if (state.emptyBoard && codes.includes('Ds-1-1')) input['Ds-1-1'] = { board: {} }
  return { async *[Symbol.asyncIterator]() {}, async finalMessage() { return { content: [{ type: 'tool_use', name: 'save_boards', input }] } } }
} } }) }))
const { demoRouter } = await import('../demo.js')
const { collectReportData, generateHTML, generateMarkdown } = await import('../../services/reportGenerator.js')
const { upsertDesign, updateProject, getMessages, getMaterialRowsByProject, getStandardsByProject, createMaterialRowsBulk, createMessagesBulk } = await import('../../lib/supabaseService.js')
const app = express(); app.use(express.json()); app.use('/api/demo', (req, res, next) => { state.response = res; next() }, demoRouter)
const codes = ['[10공국2-02-01]', '[10공국2-03-03]', '[10통과2-02-03]', '[10통과2-02-06]', '[10공영2-01-07]', '[10공영2-02-02]']
beforeEach(() => {
  Standards.addBulk(ALL_STANDARDS.filter(s => s.code === '[10통과2-01-01]'))
  vi.clearAllMocks(); state.user++; state.prompts = []; state.failCopy = false; state.failLink = false; state.failSave = false; state.extraBoard = false; state.emptyBoard = false; state.disconnect = false
  state.projects = { source: { id: 'source', title: '미래보기 기후·에너지 제안', workspace_id: 'w', subjects: ['국어','과학','영어'], grade: '고1', current_procedure: 'A-2-2', status: 'active' } }
  state.standards = { source: codes.map((code, i) => ({ standard_id: `std${i}`, curriculum_standards: { code, content: '성취기준 원문', subject: ['국어','과학','영어'][Math.floor(i / 2)] } })) }
  state.designs = { source: Object.fromEntries(PROCEDURE_LIST.slice(0, 10).map(p => [p.code, { note: '기존 설계' }])) }
  state.designs.source['A-2-1'] = {
    standards: codes.map((code, i) => ({ code, subject: ['국어','과학','영어'][Math.floor(i / 2)], content: '성취기준 원문 '.repeat(60), knowledge: '핵심 지식', process: '자료 검토', values: '근거 존중' })),
    duplicateCheck: '미래보기에서 검토한 연결: 근거의 신뢰성',
    restructuredStandards: ['교내 에너지 자료를 비판적으로 읽고 사실적 영어 요약을 포함한 공동 제안서를 작성한다.'],
  }
  state.designs.source['A-2-2'] = { coreIdea: '신뢰할 수 있는 근거가 지역 의사결정을 돕는다.', inquiryQuestions: ['에너지 사용을 어떻게 개선할까?'], subObjectives: codes.map(code => ({ subject: code, objective: '긴 교과별 목표 '.repeat(90) })), integratedObjectives: ['자료의 근거를 비교해 개선안을 제안한다.'], alignment: '국어·과학·영어 연결과 정합'  }
})
async function run() {
  const response = await request(app).post('/api/demo/continue').send({ projectId: 'source' })
  expect(response.status).toBe(200)
  return response.text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)))
}
it('A-3와 A-4를 보존하고 남은 9절차 생성 후 보고서까지 연결한다', async () => {
  const before = structuredClone({ project: state.projects.source, boards: state.designs.source, standards: state.standards.source })
  const events = await run()
  expect(events.find(e => e.type === 'started').remaining).toHaveLength(9)
  expect(events.at(-1).type).toBe('complete')
  expect(state.designs.clone['A-2-1']).toEqual(before.boards['A-2-1'])
  expect(state.standards.clone).toHaveLength(6)
  expect({ project: state.projects.source, boards: state.designs.source, standards: state.standards.source }).toEqual(before)
  expect(upsertDesign.mock.calls.every(([id]) => id === 'clone')).toBe(true)
  expect(updateProject.mock.calls.every(([id]) => id === 'clone')).toBe(true)
  const data = await collectReportData('clone')
  expect(data.confirmedCount).toBe(19)
  for (const report of [generateHTML(data), generateMarkdown(data)]) {
    expect(report).toContain('미래보기에서 검토한 연결')
    expect(report).toContain('사실적 영어 요약')
    expect(report).toContain('에너지 현장 조사: 평가 설계표')
    for (const code of codes) expect(report).toContain(code)
  }
})
it('긴 성취기준 표 뒤의 통합·재구조화 결과도 생성 프롬프트에 전달한다', async () => {
  await run()
  expect(state.prompts[0]).toContain(state.designs.source['A-2-1'].duplicateCheck)
  expect(state.prompts[0]).toContain(state.designs.source['A-2-1'].restructuredStandards[0])
  expect(state.prompts[0]).toContain(state.designs.source['A-2-2'].integratedObjectives[0])
})
it('A-3 복제 실패를 완성된 시뮬레이션으로 보고하지 않는다', async () => {
  state.failCopy = true
  const events = await run()
  expect(events.some(e => e.type === 'complete')).toBe(false)
  expect(state.projects.clone.status).toBe('failed')
  expect(state.prompts).toHaveLength(0)
})
it('성취기준 연결 실패 시 원본 기준이 빠진 시뮬레이션 생성을 중단한다', async () => {
  state.failLink = true
  const events = await run()
  expect(events.some(e => e.type === 'complete')).toBe(false)
  expect(state.projects.clone.status).toBe('failed')
  expect(state.prompts).toHaveLength(0)
})
it('남은 단계 하나라도 저장 실패하면 부분 실패로 알린다', async () => {
  state.failSave = true
  const events = await run()
  expect(events.some(e => e.type === 'complete')).toBe(false)
  expect(events.at(-1).type).toBe('partial_failure')
  expect(state.projects.clone.status).toBe('failed')
})

it('모델이 요청 밖 A-3를 반환해도 복제한 교사 분석을 덮어쓰지 않는다', async () => {
  state.extraBoard = true
  const before = structuredClone(state.designs.source['A-2-1'])
  const events = await run()
  expect(events.at(-1).type).toBe('complete')
  expect(events.at(-1).generated).toBe(9)
  expect(state.designs.clone['A-2-1']).toEqual(before)
})
it('빈 생성 보드를 성공한 절차로 세지 않는다', async () => {
  state.emptyBoard = true
  const events = await run()
  expect(events.at(-1).type).toBe('partial_failure')
  expect(events.at(-1).generated).toBe(8)
  expect(state.projects.clone.status).toBe('failed')
})
it('클라이언트 연결이 끊긴 후 AI 오류가 나도 생성중 상태로 남지 않는다', async () => {
  state.disconnect = true
  await run()
  expect(state.projects.clone.status).toBe('failed')
  expect(state.projects.source.status).toBe('active')
})

it('탐색 후 A-3에 추가한 기준은 시뮬레이션의 기준 목록과 보고서에 포함된다', async () => {
  const added = Standards.getByCode('[10통과2-01-01]')
  expect(added).toBeTruthy()
  state.designs.source['A-2-1'].standards.push({ code: added.code, subject: added.subject, content: added.content, knowledge: '변화', process: '증거 조사', values: '근거 존중' })
  await run()
  expect(state.standards.source).toHaveLength(6)
  expect(state.standards.clone).toHaveLength(7)
  expect(state.prompts[0].split('사용 가능한 성취기준 목록').at(-1)).toContain(added.content)
  const report = await collectReportData('clone')
  expect(report.standards).toHaveLength(7)
})

it('원본 성취기준 조회 오류를 빈 목록으로 숨기지 않는다', async () => {
  getStandardsByProject.mockRejectedValueOnce(new Error('DB 조회 실패'))
  const events = await run()
  expect(events.at(-1).type).toBe('error')
  expect(state.projects.clone).toBeUndefined()
  expect(state.prompts).toHaveLength(0)
})
it('수동으로 가져온 대화 복제 실패 시 생성 성공으로 진행하지 않는다', async () => {
  getMessages.mockResolvedValueOnce([{ id: 'msg', project_id: 'source', content: '미래보기 A-3 검토 대화' }])
  createMessagesBulk.mockRejectedValueOnce(new Error('대화 저장 실패'))
  const events = await run()
  expect(events.at(-1).type).toBe('error')
  expect(state.projects.clone.status).toBe('failed')
  expect(state.prompts).toHaveLength(0)
})
it('자료 복제 오류도 누락을 숨기지 않고 실패로 알린다', async () => {
  getMaterialRowsByProject.mockResolvedValueOnce([{ id: 'material', project_id: 'source', file_name: '관찰 자료' }])
  createMaterialRowsBulk.mockRejectedValueOnce(new Error('자료 저장 실패'))
  const events = await run()
  expect(events.at(-1).type).toBe('error')
  expect(state.projects.clone.status).toBe('failed')
  expect(state.prompts).toHaveLength(0)
})
