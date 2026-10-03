/**
 * 약식 기록(연수 모드) — 제안 수락 뒤 동작을 고정한다.
 * - 약식 절차: 수락 뒤 AI를 다시 부르지 않고, 제안의 빈 칸이 보드의 기존 내용을 지우지 않는다.
 * - 핵심 절차(정식 진행, 기본 켜짐)와 기존 팀: 종전처럼 "✓ AI 제안을 … 반영했어요" 안내를 보내고 병합 규칙도 그대로다.
 * 약식 절차 예시는 핵심 절차가 될 일이 없는 Ds-1을 쓴다(연수 뒤 핵심 절차 목록을 되돌려도 영향 없음).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(async () => ({})),
  apiPost: vi.fn(async (url, body) => (url === '/api/chat/teacher' ? { id: 't1', sender_type: 'teacher', content: body.content } : {})),
  apiPut: vi.fn(async (_url, body) => ({ content: body?.content ?? {} })),
  apiPatch: vi.fn(), apiDelete: vi.fn(), apiUploadFile: vi.fn(),
  apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
  apiStreamPost: vi.fn(async (_url, _body, { onDone } = {}) => { onDone?.() }),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

const store = new Map()
vi.stubGlobal('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
})

import { useChatStore } from '../chatStore.js'
import { useProcedureStore } from '../procedureStore.js'
import { useWorkspaceStore } from '../workspaceStore.js'
import { apiStreamPost } from '../../lib/api'

function setTeam(workflowConfig) {
  useWorkspaceStore.setState({ currentWorkspace: { id: 'w1', workflow_config: workflowConfig } })
}

/** 약식 절차 Ds-1(평가 설계) — 정합성 칸에 이미 적어 둔 내용이 있다 */
function seedBrief() {
  useProcedureStore.setState({
    currentProcedure: 'Ds-1-1',
    boards: { assessment_plan: { board_type: 'assessment_plan', content: { objectiveAlignmentCheck: '이미 적어 둔 점검' } } },
  })
  useChatStore.setState({
    messages: [], streaming: false, _acceptedBoardsInBatch: [],
    pendingSuggestions: [{
      id: 's1', status: 'pending', procedureCode: 'Ds-1-1',
      value: { assessments: [{ target: '영어 해석문', element: '근거 제시' }], objectiveAlignmentCheck: '' },
    }],
  })
}

/** 핵심 절차 T-1(공동 비전) */
function seedCore() {
  useProcedureStore.setState({
    currentProcedure: 'T-1-1',
    boards: { team_vision: { board_type: 'team_vision', content: { commonVisionCandidates: ['후보 A'], commonVision: '' } } },
  })
  useChatStore.setState({
    messages: [], streaming: false, _acceptedBoardsInBatch: [],
    pendingSuggestions: [{
      id: 's1', status: 'pending', procedureCode: 'T-1-1',
      value: { commonVision: '함께 표현하는 학습자', commonVisionCandidates: [] },
    }],
  })
}

const aiCalled = () => vi.mocked(apiStreamPost).mock.calls.some(([url]) => url === '/api/chat/message')

beforeEach(() => {
  vi.mocked(apiStreamPost).mockClear()
  vi.spyOn(useProcedureStore.getState(), 'updateBoard').mockResolvedValue({})
  vi.spyOn(useProcedureStore.getState(), 'loadBoardSummaries').mockResolvedValue()
})

describe('약식 절차의 제안 수락', () => {
  it('수락 뒤 AI를 다시 부르지 않는다', async () => {
    setTeam({ briefMode: true })
    seedBrief()
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    // 정식 경로는 이 시간 안에 AI를 부른다(아래 테스트). 약식 절차는 끝까지 부르지 않아야 한다.
    await new Promise((r) => setTimeout(r, 300))
    expect(aiCalled()).toBe(false)
  })

  it('제안의 빈 칸이 이미 적어 둔 칸을 지우지 않는다', async () => {
    setTeam({ briefMode: true })
    seedBrief()
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    const content = useProcedureStore.getState().boards.assessment_plan.content
    expect(content.assessments).toEqual([{ target: '영어 해석문', element: '근거 제시' }])
    expect(content.objectiveAlignmentCheck).toBe('이미 적어 둔 점검')
  })
})

describe('정식으로 진행하는 경우는 종전 동작', () => {
  it('약식 팀의 핵심 절차(정식 진행 기본 켜짐)는 수락 뒤 AI에게 알리고 병합 규칙도 그대로다', async () => {
    setTeam({ briefMode: true })
    seedCore()
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    await vi.waitFor(() => expect(aiCalled()).toBe(true), { timeout: 2000 })
    expect(useProcedureStore.getState().boards.team_vision.content.commonVisionCandidates).toEqual([])
  })

  it('핵심 절차 정식 진행을 끄면 핵심 절차도 약식으로 처리한다', async () => {
    setTeam({ briefMode: true, briefCoreFormal: false })
    seedCore()
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    await new Promise((r) => setTimeout(r, 300))
    expect(aiCalled()).toBe(false)
    expect(useProcedureStore.getState().boards.team_vision.content.commonVisionCandidates).toEqual(['후보 A'])
  })

  it('기존 팀은 수락 뒤 AI에게 반영 사실을 알린다', async () => {
    setTeam({})
    seedBrief()
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    await vi.waitFor(() => expect(aiCalled()).toBe(true), { timeout: 2000 })
    const aiCall = vi.mocked(apiStreamPost).mock.calls.find(([url]) => url === '/api/chat/message')
    expect(aiCall[1].content).toContain('보드에 반영했어요')
  })
})
