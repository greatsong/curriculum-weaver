/**
 * 선생님 메시지를 먼저 저장한 뒤 AI를 부를 때, 저장된 메시지 번호를 함께 보낸다.
 * 서버는 이 번호로 AI 대화 기록에서 현재 메시지를 빼 같은 말이 두 번 가지 않게 한다(2026-10-03 운영 제보).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(async () => ({})),
  apiPost: vi.fn(async (url, body) => (url === '/api/chat/teacher' ? { id: 'saved-teacher-1', sender_type: 'teacher', content: body.content } : {})),
  apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiUploadFile: vi.fn(),
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
import { apiPost, apiStreamPost } from '../../lib/api'

beforeEach(() => {
  vi.mocked(apiPost).mockClear()
  vi.mocked(apiStreamPost).mockClear()
  useChatStore.setState({ messages: [], streaming: false, pendingSuggestions: [] })
})

describe('sendMessage — 저장한 메시지 번호를 AI 요청에 싣는다', () => {
  it('교사 메시지를 먼저 저장하고, 그 번호를 /api/chat/message에 보낸다', async () => {
    await useChatStore.getState().sendMessage('p1', '추천해주세요. 주제에 맞는 성취기준', { procedureCode: 'A-2-1' })

    const saveCall = vi.mocked(apiPost).mock.calls.find(([url]) => url === '/api/chat/teacher')
    expect(saveCall).toBeTruthy()
    const aiCall = vi.mocked(apiStreamPost).mock.calls.find(([url]) => url === '/api/chat/message')
    expect(aiCall).toBeTruthy()
    expect(aiCall[1].teacher_message_id).toBe('saved-teacher-1')
    expect(aiCall[1].content).toBe('추천해주세요. 주제에 맞는 성취기준')
    // 저장이 AI 요청보다 먼저다(순서가 바뀌면 서버 쪽 내용 비교 안전장치에 기대게 된다)
    const saveOrder = vi.mocked(apiPost).mock.invocationCallOrder[vi.mocked(apiPost).mock.calls.indexOf(saveCall)]
    const aiOrder = vi.mocked(apiStreamPost).mock.invocationCallOrder[vi.mocked(apiStreamPost).mock.calls.indexOf(aiCall)]
    expect(saveOrder).toBeLessThan(aiOrder)
  })
})
