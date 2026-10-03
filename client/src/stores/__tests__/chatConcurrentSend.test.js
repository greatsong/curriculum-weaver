/**
 * 같은 탭에서 두 전송이 겹치지 않는다(2026-10-03 운영 제보).
 * 예전에는 교사 메시지 저장이 끝난 뒤에 streaming을 켜서, 수락 후 자동 안내와 교사의 엔터가 58ms 차이로
 * 함께 통과했다. 두 AI 응답이 같은 streamingText에 섞여 제안 원문이 보이고 답이 중간부터 보였다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let resolveStream
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(async () => ([])),
  apiPost: vi.fn(async (url, body) => (url === '/api/chat/teacher' ? { id: `t-${body.content}`, sender_type: 'teacher', content: body.content } : {})),
  apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiUploadFile: vi.fn(),
  apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
  apiStreamPost: vi.fn(() => new Promise((r) => { resolveStream = r })),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))
const store = new Map()
vi.stubGlobal('localStorage', { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() })

import { useChatStore } from '../chatStore.js'
import { apiGet, apiPost, apiStreamPost } from '../../lib/api'

beforeEach(() => {
  vi.mocked(apiPost).mockClear(); vi.mocked(apiStreamPost).mockClear()
  useChatStore.setState({ messages: [], streaming: false, streamingText: '', pendingSuggestions: [], _streamSeq: 0 })
})

describe('동시 전송 잠금', () => {
  it('첫 전송이 저장 중일 때 두 번째 전송은 거절되고 하나만 나간다', async () => {
    const first = useChatStore.getState().sendMessage('p1', '✓ AI 제안을 반영했어요', 'Ds-2-1')
    // 보내는 즉시 잠긴다(저장이 끝나기 전)
    expect(useChatStore.getState().streaming).toBe(true)
    const second = await useChatStore.getState().sendMessage('p1', 'ds-4 단계를 끝낼 답을 주세요', 'Ds-2-1')
    expect(second).toBe(false)
    await vi.waitFor(() => expect(apiStreamPost).toHaveBeenCalledTimes(1))
    resolveStream()
    await first
    expect(vi.mocked(apiPost).mock.calls.filter(([u]) => u === '/api/chat/teacher')).toHaveLength(1)
    expect(useChatStore.getState().streaming).toBe(false)
  })

  it('교사 메시지 저장이 실패하면 잠금을 푼다', async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(new Error('network'))
    await expect(useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')).rejects.toThrow('network')
    expect(useChatStore.getState().streaming).toBe(false)
  })

  it('이전 요청 번호의 글자는 현재 답에 섞이지 않는다', async () => {
    const p = useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    await vi.waitFor(() => expect(apiStreamPost).toHaveBeenCalledTimes(1))
    const { onText } = vi.mocked(apiStreamPost).mock.calls[0][2]
    onText('현재 답 ')
    useChatStore.setState({ _streamSeq: 99 }) // 다른 요청이 시작된 상황을 흉내
    onText('섞이면 안 되는 글자')
    expect(useChatStore.getState().streamingText).toBe('현재 답 ')
    useChatStore.setState({ streaming: false })
    resolveStream(); await p
  })
})

describe('불러온 AI 메시지의 남은 제안 원문', () => {
  it('닫히지 않은 제안 원문과 짝 없는 닫는 태그를 지워 보여 준다', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce([
      { id: 'a1', sender_type: 'ai', content: '확인했습니다.\n\n<ai_suggestion type="board_update"> {"a":"공동 65분으' },
      { id: 'a2', sender_type: 'ai', content: '..."x"}\n</ai_suggestion>\n안내' },
      { id: 't1', sender_type: 'teacher', content: '<ai_suggestion> 교사가 쓴 글은 그대로' },
    ])
    await useChatStore.getState().loadMessages('p1')
    const [a1, a2, t1] = useChatStore.getState().messages
    expect(a1.content).toBe('확인했습니다.')
    expect(a2.content).not.toContain('</ai_suggestion>')
    expect(t1.content).toContain('<ai_suggestion>')
  })
})
