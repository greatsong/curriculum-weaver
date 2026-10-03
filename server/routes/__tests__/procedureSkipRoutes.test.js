/**
 * 절차 건너뛰기 API(POST/DELETE /projects/:id/procedures/:code/skip) 회귀 테스트
 *
 * 핵심 절차(UNSKIPPABLE_PROCEDURES)는 건너뛸 수 없지만, 이미 남아 있는 생략 기록은 해제(DELETE)할 수 있어야 한다.
 * 핵심 절차 목록이 바뀌면 바꾸기 전에 생략한 기록이 갇히지 않게 하는 고정 테스트다.
 * 목록에서 파생하므로 목록이 바뀌어도 그대로 유지한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { UNSKIPPABLE_PROCEDURES, getProcedureLabel } from 'curriculum-weaver-shared/constants.js'

const state = vi.hoisted(() => ({ project: null, skips: [], role: 'owner' }))

vi.mock('../../middleware/auth.js', async (original) => ({
  ...(await original()),
  requireAuth: (req, res, next) => { req.user = { id: 'teacher' }; next() },
}))
vi.mock('../../lib/supabaseService.js', async (original) => ({
  ...(await original()),
  getProject: vi.fn(async () => state.project),
  getMemberRole: vi.fn(async () => state.role),
  getProjectSkips: vi.fn(async () => state.skips),
  addProjectSkip: vi.fn(async (projectId, code, userId, reason) => {
    const row = { procedure_code: code, reason: reason || null, skipped_by: userId }
    if (!state.skips.some((s) => s.procedure_code === code)) state.skips = [...state.skips, row]
    return row
  }),
  removeProjectSkip: vi.fn(async (projectId, code) => {
    const before = state.skips.length
    state.skips = state.skips.filter((s) => s.procedure_code !== code)
    return state.skips.length !== before
  }),
  updateProject: vi.fn(async (id, patch) => { Object.assign(state.project, patch); return state.project }),
  logActivity: vi.fn(async () => null),
}))

const { default: designsRouter } = await import('../designs.js')
const { addProjectSkip, removeProjectSkip, updateProject } = await import('../../lib/supabaseService.js')

const app = express()
app.use(express.json())
app.use('/api', designsRouter)

beforeEach(() => {
  vi.clearAllMocks()
  state.project = { id: 'p1', workspace_id: 'w1', status: 'active', title: '융합 수업', current_procedure: 'A-1-1' }
  state.skips = []
  state.role = 'owner'
})

const skipUrl = (code) => `/api/projects/p1/procedures/${code}/skip`

describe('핵심 절차 건너뛰기 차단과 남아 있는 생략 기록 해제 (목록과 무관하게 유지)', () => {
  it.each(UNSKIPPABLE_PROCEDURES)('핵심 절차 %s 건너뛰기는 403, 문구는 표시 코드만 쓴다', async (code) => {
    const res = await request(app).post(skipUrl(code)).send({})
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('핵심 절차')
    expect(res.body.error).toContain(getProcedureLabel(code))
    expect(res.body.error).not.toContain(code)
    expect(addProjectSkip).not.toHaveBeenCalled()
  })

  it.each(UNSKIPPABLE_PROCEDURES)('목록 변경 전에 생략된 핵심 절차 %s도 해제할 수 있다 (기록은 해제 요청 때만 지운다)', async (code) => {
    state.skips = [{ procedure_code: code, reason: '목록 변경 전 생략', skipped_by: 'teacher' }]
    const res = await request(app).delete(skipUrl(code))
    expect(res.status).toBe(200)
    expect(removeProjectSkip).toHaveBeenCalledWith('p1', code)
    expect(res.body.skips).toEqual([])
  })

  it('일반 절차 건너뛰기도 편집자(editor)에게는 막혀 있다 (host/owner 전용)', async () => {
    state.role = 'editor'
    const res = await request(app).post(skipUrl('T-2-2')).send({})
    expect(res.status).toBe(403)
    expect(addProjectSkip).not.toHaveBeenCalled()
    expect(updateProject).not.toHaveBeenCalled()
  })
})

// ⚠️ 교사 연수 한정 임시 설정 (2026-10-03): T-2 수업설계 방향(T-1-2)은 핵심, T-3 역할 배분(T-2-1)은 생략 가능.
// 되돌릴 때 이 describe를 지운다(커밋 되돌리기로 함께 빠진다). 원래 목록은 위 describe가 그대로 검사한다.
// (docs/임시설정-건너뛰기-핵심절차-20261003.md)
describe('연수 한정 핵심 절차 (2026-10-03): T-2 방향은 핵심, T-3 역할은 생략 가능', () => {
  it('T-1-2(T-2 수업설계 방향 설정) 건너뛰기는 403이고 기록하지 않는다', async () => {
    const res = await request(app).post(skipUrl('T-1-2')).send({ reason: '방향은 이미 정함' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('핵심 절차')
    // 사용자에게 보이는 문구는 표시 코드(T-2)만 쓴다. 내부 코드(T-1-2)는 노출하지 않는다.
    expect(res.body.error).toContain('T-2 수업설계 방향 설정')
    expect(res.body.error).not.toContain('T-1-2')
    expect(addProjectSkip).not.toHaveBeenCalled()
  })

  it('T-2-1(T-3 역할 배분) 건너뛰기는 허용되고 사유와 함께 기록된다', async () => {
    const res = await request(app).post(skipUrl('T-2-1')).send({ reason: '역할은 교무 분장으로 정해짐' })
    expect(res.status).toBe(200)
    expect(addProjectSkip).toHaveBeenCalledWith('p1', 'T-2-1', 'teacher', '역할은 교무 분장으로 정해짐')
    expect(res.body.skips.map((s) => s.procedure_code)).toEqual(['T-2-1'])
    // 팀 커서가 다른 절차에 있으면 건드리지 않는다
    expect(res.body.current_procedure).toBe('A-1-1')
    expect(updateProject).not.toHaveBeenCalled()
  })

  it('팀 커서가 T-2-1 위에 있으면 다음 활성 절차(T-4 팀 규칙)로 옮긴다', async () => {
    state.project.current_procedure = 'T-2-1'
    const res = await request(app).post(skipUrl('T-2-1')).send({})
    expect(res.status).toBe(200)
    expect(res.body.current_procedure).toBe('T-2-2')
    expect(updateProject).toHaveBeenCalledWith('p1', { current_procedure: 'T-2-2' })
  })

  it('T-2-1 건너뛰기도 편집자(editor)에게는 막혀 있다 (host/owner 전용)', async () => {
    state.role = 'editor'
    const res = await request(app).post(skipUrl('T-2-1')).send({})
    expect(res.status).toBe(403)
    expect(addProjectSkip).not.toHaveBeenCalled()
  })
})
