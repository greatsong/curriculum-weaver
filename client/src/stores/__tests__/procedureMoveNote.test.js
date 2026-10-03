/**
 * 절차 이동 기록 — 화면 쪽 반영 (2026-10-04)
 * - 서버가 지운 지난 기록·안내를 화면에서도 지운다. 이 화면에서 임시 id로 붙인 안내는 문구로 찾는다.
 * - 팀원 화면은 message_removed 소켓으로 같은 정리를 받는다.
 * - 이동 기록은 절차 안내로 치지 않는다(첫 안내가 막히지 않게).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers = vi.hoisted(() => ({}))
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(),
  apiUploadFile: vi.fn(), apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
  apiStreamPost: vi.fn(async () => {}),
}))
vi.mock('../../lib/socket', () => ({
  socket: {
    on: vi.fn((event, fn) => { handlers[event] = fn }),
    off: vi.fn((event) => { delete handlers[event] }),
    emit: vi.fn(),
    connected: true,
  },
}))

import { apiGet, apiPost, apiStreamPost } from '../../lib/api'
import { useChatStore } from '../chatStore.js'
import { useProjectStore } from '../projectStore.js'

const note = (id, to, content = '이동 기록') => ({ id, sender_type: 'ai', sender_name: 'procedure_move', procedure_context: to, content })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  useProjectStore.setState({ currentProject: { id: 'p1', status: 'active', title: 't' } })
  useChatStore.setState({ streaming: false, messages: [], introCache: {} })
})

describe('recordProcedureMove', () => {
  it('받은 이동 기록을 대화 끝에 붙인다', async () => {
    apiPost.mockResolvedValueOnce({ message: note('n1', 'E-2-1', 'E-1 단계는 생략하시는 거죠?'), removedMessages: [] })
    await useChatStore.getState().recordProcedureMove('p1', 'E-1-1', 'E-2-1', { visited: false })
    expect(apiPost).toHaveBeenCalledWith('/api/chat/procedure-move', { session_id: 'p1', from: 'E-1-1', to: 'E-2-1', visited: false })
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['n1'])
  })

  it('지운 기록은 id로, 임시 id로 붙은 안내는 문구로 찾아 지우고 안내 캐시에서도 뺀다', async () => {
    useChatStore.setState({
      messages: [
        { id: 'a1', sender_type: 'ai', procedure_context: 'E-1-1', content: 'E-1 안내' },
        note('n1', 'E-2-1'),
        { id: 'intro-123', sender_type: 'ai', stage_context: 'E-2-1', content: 'E-2 안내' },
      ],
      introCache: { 'E-1-1': 'E-1 안내', 'E-2-1': 'E-2 안내' },
    })
    apiPost.mockResolvedValueOnce({
      message: note('n2', 'E-1-1', 'E-1 단계로 돌아왔습니다.'),
      removedMessages: [
        { id: 'n1', procedure_context: 'E-2-1', content: '이동 기록' },
        { id: 'db-intro', procedure_context: 'E-2-1', content: 'E-2 안내' },
      ],
    })
    await useChatStore.getState().recordProcedureMove('p1', 'E-2-1', 'E-1-1')
    const state = useChatStore.getState()
    expect(state.messages.map((m) => m.id)).toEqual(['a1', 'n2'])
    expect(state.introCache).toEqual({ 'E-1-1': 'E-1 안내' })
  })

  it('기록에 실패해도 오류를 던지지 않는다(이동은 막지 않는다)', async () => {
    apiPost.mockRejectedValueOnce(new Error('네트워크'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(useChatStore.getState().recordProcedureMove('p1', 'E-1-1', 'E-2-1')).resolves.toBeUndefined()
    expect(useChatStore.getState().messages).toEqual([])
  })

  it('소켓으로 먼저 받은 같은 기록은 두 번 붙이지 않는다', async () => {
    useChatStore.setState({ messages: [note('n1', 'E-2-1')] })
    apiPost.mockResolvedValueOnce({ message: note('n1', 'E-2-1'), removedMessages: [] })
    await useChatStore.getState().recordProcedureMove('p1', 'E-1-1', 'E-2-1')
    expect(useChatStore.getState().messages).toHaveLength(1)
  })
})

describe('팀원 화면 — message_removed 소켓', () => {
  it('지워진 기록과 안내를 화면에서 지운다', () => {
    useChatStore.getState().subscribe('p1')
    useChatStore.setState({
      messages: [note('n1', 'E-2-1'), { id: 'intro-9', sender_type: 'ai', procedure_context: 'E-2-1', content: 'E-2 안내' }],
      introCache: { 'E-2-1': 'E-2 안내' },
    })
    handlers.message_removed({ id: 'n1', procedure_context: 'E-2-1', content: '이동 기록' })
    handlers.message_removed({ id: 'db-intro', procedure_context: 'E-2-1', content: 'E-2 안내' })
    expect(useChatStore.getState().messages).toEqual([])
    expect(useChatStore.getState().introCache).toEqual({})
    useChatStore.getState().unsubscribe()
    expect(handlers.message_removed).toBeUndefined()
  })
})

describe('이동 기록은 절차 안내로 치지 않는다', () => {
  it('도착 절차에 이동 기록만 있으면 첫 안내를 요청한다', async () => {
    useChatStore.setState({ messages: [note('n1', 'E-2-1')] })
    await useChatStore.getState().requestProcedureIntro('p1', 'E-2-1')
    expect(apiStreamPost).toHaveBeenCalledTimes(1)
  })

  it('대화를 불러올 때 이동 기록을 그 절차의 안내로 복원하지 않는다', async () => {
    apiGet.mockResolvedValueOnce([note('n1', 'E-2-1'), { id: 'a1', sender_type: 'ai', procedure_context: 'E-1-1', content: 'E-1 안내' }])
    await useChatStore.getState().loadMessages('p1')
    expect(useChatStore.getState().introCache).toEqual({ 'E-1-1': 'E-1 안내' })
  })
})
