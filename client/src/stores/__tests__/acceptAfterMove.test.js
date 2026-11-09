/**
 * 절차를 옮긴 뒤 이전 절차의 AI 제안을 수락해도 기존 보드 내용이 지워지지 않아야 한다.
 * loadBoards는 지금 절차의 보드만 메모리에 남긴다. 예전에는 이전 절차의 제안을 수락하면
 * 기존 내용 없이 "빈 보드 + 제안"이 통째로 저장되어 제안에 없던 칸이 사라졌다(2026-11-10 점검).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const api = vi.hoisted(() => ({ get: null, puts: [] }))
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn((path) => api.get(path)),
  apiPost: vi.fn(async (url, body) => (url === '/api/chat/teacher' ? { id: 't1', sender_type: 'teacher', content: body.content } : {})),
  apiPut: vi.fn(async (url, body) => { api.puts.push({ url, body }); return { content: body?.content ?? {} } }),
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

const DESIGN_URL = '/api/projects/p1/designs/T-1-1'

/** 팀은 T-2로 옮겨 갔고(T-1 보드는 메모리에 없음), 채팅에는 T-1 제안이 남아 있다 */
function seedMovedAway() {
  useWorkspaceStore.setState({ currentWorkspace: { id: 'w1', workflow_config: {} } })
  useProcedureStore.setState({
    currentProcedure: 'T-2-1', boards: {}, boardsLoadedFor: 'T-2-1', boardsLoadError: null, loading: false,
  })
  useChatStore.setState({
    messages: [], streaming: false, _acceptedBoardsInBatch: [],
    pendingSuggestions: [{ id: 's1', status: 'pending', procedureCode: 'T-1-1', value: { commonVision: '함께 정한 비전' } }],
  })
}

beforeEach(() => {
  api.puts.length = 0
  api.get = async () => ({})
  store.clear()
})

describe('절차를 옮긴 뒤 이전 절차의 제안 수락', () => {
  it('서버의 기존 보드를 먼저 받아 합친 뒤 저장한다', async () => {
    seedMovedAway()
    api.get = async (path) => (path === DESIGN_URL
      ? { procedure_code: 'T-1-1', content: { commonVisionCandidates: ['후보 A', '후보 B'], commonVision: '' } }
      : {})
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    const put = api.puts.find((p) => p.url === DESIGN_URL)
    expect(put).toBeTruthy()
    expect(put.body.content.commonVision).toBe('함께 정한 비전')
    expect(put.body.content.commonVisionCandidates).toEqual(['후보 A', '후보 B'])
  })

  it('기존 보드를 불러오지 못하면 저장하지 않고 제안을 대기 상태로 둔다', async () => {
    seedMovedAway()
    api.get = async (path) => { if (path === DESIGN_URL) throw new Error('연결 실패'); return {} }
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    expect(api.puts.find((p) => p.url === DESIGN_URL)).toBeUndefined()
    expect(useChatStore.getState().pendingSuggestions[0].status).toBe('pending')
  })

  it('편집해서 수락할 때도 기존 보드를 먼저 받는다', async () => {
    seedMovedAway()
    api.get = async (path) => (path === DESIGN_URL
      ? { procedure_code: 'T-1-1', content: { commonVisionCandidates: ['후보 A'], commonVision: '' } }
      : {})
    await useChatStore.getState().editAcceptSuggestion('s1', JSON.stringify({ commonVision: '고친 비전' }), 'p1')
    const put = api.puts.find((p) => p.url === DESIGN_URL)
    expect(put.body.content.commonVision).toBe('고친 비전')
    expect(put.body.content.commonVisionCandidates).toEqual(['후보 A'])
  })

  it('지금 절차를 정상으로 불러왔는데 보드가 비어 있으면 서버를 다시 부르지 않는다', async () => {
    seedMovedAway()
    useProcedureStore.setState({ currentProcedure: 'T-1-1', boardsLoadedFor: 'T-1-1' })
    let designGets = 0
    api.get = async (path) => { if (path === DESIGN_URL) designGets += 1; return {} }
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    expect(designGets).toBe(0)
    expect(api.puts.find((p) => p.url === DESIGN_URL)).toBeTruthy()
  })

  it('같은 제안을 연달아 눌러도 한 번만 저장한다', async () => {
    seedMovedAway()
    api.get = async (path) => (path === DESIGN_URL ? { procedure_code: 'T-1-1', content: { commonVisionCandidates: ['후보 A'] } } : {})
    await Promise.all([
      useChatStore.getState().acceptSuggestion('s1', 'p1'),
      useChatStore.getState().acceptSuggestion('s1', 'p1'),
    ])
    expect(api.puts.filter((p) => p.url === DESIGN_URL)).toHaveLength(1)
  })
})
