/**
 * 약식 기록(연수 모드) — 제안 수락 뒤 동작을 고정한다.
 * - 약식 팀: 수락 뒤 AI를 다시 부르지 않고, 제안의 빈 칸이 보드의 기존 내용을 지우지 않는다.
 * - 기존 팀: 종전처럼 "✓ AI 제안을 … 반영했어요" 안내를 보내고, 병합 규칙도 그대로다.
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

function setTeam(briefMode) {
  useWorkspaceStore.setState({ currentWorkspace: { id: 'w1', workflow_config: briefMode ? { briefMode: true } : {} } })
}

function seed() {
  useProcedureStore.setState({
    currentProcedure: 'T-1-1',
    boards: { team_vision: { board_type: 'team_vision', content: { commonVisionCandidates: ['후보 A', '후보 B'], commonVision: '' } } },
  })
  useChatStore.setState({
    messages: [], streaming: false, _acceptedBoardsInBatch: [],
    pendingSuggestions: [{
      id: 's1', status: 'pending', procedureCode: 'T-1-1',
      value: { commonVision: '함께 표현하는 학습자', commonVisionCandidates: [] },
    }],
  })
}

beforeEach(() => {
  vi.mocked(apiStreamPost).mockClear()
  vi.spyOn(useProcedureStore.getState(), 'updateBoard').mockResolvedValue({})
  vi.spyOn(useProcedureStore.getState(), 'loadBoardSummaries').mockResolvedValue()
})

describe('약식 기록 팀의 제안 수락', () => {
  it('수락 뒤 AI를 다시 부르지 않는다', async () => {
    setTeam(true)
    seed()
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    // 기존 팀 경로는 이 시간 안에 AI를 부른다(아래 테스트). 약식 팀은 끝까지 부르지 않아야 한다.
    await new Promise((r) => setTimeout(r, 300))
    expect(vi.mocked(apiStreamPost).mock.calls.some(([url]) => url === '/api/chat/message')).toBe(false)
  })

  it('제안의 빈 칸이 이미 적어 둔 칸을 지우지 않는다', async () => {
    setTeam(true)
    seed()
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    const content = useProcedureStore.getState().boards.team_vision.content
    expect(content.commonVision).toBe('함께 표현하는 학습자')
    expect(content.commonVisionCandidates).toEqual(['후보 A', '후보 B'])
  })
})

describe('기존 팀은 종전 동작', () => {
  it('수락 뒤 AI에게 반영 사실을 알리고, 병합 규칙도 그대로다', async () => {
    setTeam(false)
    seed()
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    // 전체 테스트를 함께 돌리면 느려지므로 고정 대기 대신 호출이 올 때까지 기다린다
    await vi.waitFor(() => {
      expect(vi.mocked(apiStreamPost).mock.calls.some(([url]) => url === '/api/chat/message')).toBe(true)
    }, { timeout: 2000 })
    const aiCall = vi.mocked(apiStreamPost).mock.calls.find(([url]) => url === '/api/chat/message')
    expect(aiCall[1].content).toContain('보드에 반영했어요')
    expect(useProcedureStore.getState().boards.team_vision.content.commonVisionCandidates).toEqual([])
  })
})
