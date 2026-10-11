/**
 * AI 사용 상한(429) 안내 — 채팅 오류 알림에 서버 문구를 그대로 보여 준다(2026-10-11).
 * 정밀 모드 선택은 화면에서 뺐으므로 예전에 고른 값이 남아 있어도 fast로 보낸다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(async () => ([])),
  apiPost: vi.fn(async (url, body) => (url === '/api/chat/teacher' ? { id: 't1', sender_type: 'teacher', content: body.content } : {})),
  apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiUploadFile: vi.fn(),
  apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
  apiStreamPost: vi.fn(async () => {}),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))
vi.mock('../toastStore', () => ({ pushToast: vi.fn() }))
const store = new Map([['cw_ai_model', 'precise']])
vi.stubGlobal('localStorage', { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() })

import { useChatStore } from '../chatStore.js'
import { apiStreamPost } from '../../lib/api'
import { pushToast } from '../toastStore'

const LIMIT_MESSAGE = '오늘 AI 사용량(400회)을 모두 사용했습니다. 내일 다시 이용해 주세요.'

beforeEach(() => {
  vi.mocked(apiStreamPost).mockReset()
  vi.mocked(pushToast).mockClear()
  useChatStore.setState({ messages: [], streaming: false, streamingText: '', pendingSuggestions: [], _streamSeq: 0 })
})

describe('AI 사용 상한 안내', () => {
  it('429 ai_daily_limit이면 서버 문구를 그대로 알린다', async () => {
    vi.mocked(apiStreamPost).mockImplementation(async (_path, _body, handlers) => {
      handlers.onError(LIMIT_MESSAGE, { status: 429, code: 'ai_daily_limit' })
    })
    await useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: LIMIT_MESSAGE }))
    expect(useChatStore.getState().streaming).toBe(false)
  })

  it('전체 한도(ai_budget_exceeded)도 서버 문구 그대로', async () => {
    const msg = '오늘 서비스 전체 AI 사용량이 한도에 도달했습니다. 관리자에게 문의해 주세요.'
    vi.mocked(apiStreamPost).mockImplementation(async (_p, _b, h) => h.onError(msg, { status: 429, code: 'ai_budget_exceeded' }))
    await useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ message: msg }))
  })

  it('그 밖의 오류는 종전처럼 앞에 안내를 붙인다', async () => {
    vi.mocked(apiStreamPost).mockImplementation(async (_p, _b, h) => h.onError('연결 끊김'))
    await useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'AI 응답을 받지 못했습니다. 연결 끊김' }))
  })

  it('예전에 정밀 모드를 골라 두었어도 fast로 보낸다', async () => {
    await useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    expect(vi.mocked(apiStreamPost).mock.calls[0][1].aiModel).toBe('fast')
  })
})
