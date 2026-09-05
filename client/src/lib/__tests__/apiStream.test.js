/**
 * apiStreamPost — SSE 수신 실패 경로 테스트
 *
 * 전제: 어떤 경로로 끝나든 throw하지 않고 onDone 또는 onError가 불린다.
 * (수신 도중 예외가 전파되면 chatStore의 streaming 플래그가 영원히 남는다)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

import { apiStreamPost } from '../api'

function sseResponse(frames, { failAfter } = {}) {
  const enc = new TextEncoder()
  let i = 0
  const body = new ReadableStream({
    pull(controller) {
      if (failAfter !== undefined && i >= failAfter) {
        controller.error(new Error('connection reset'))
        return
      }
      if (i >= frames.length) {
        controller.close()
        return
      }
      controller.enqueue(enc.encode(frames[i++]))
    },
  })
  return { ok: true, status: 200, body }
}

function callbacks() {
  return {
    onText: vi.fn(), onPrinciples: vi.fn(), onBoardSuggestions: vi.fn(), onStageAdvance: vi.fn(),
    onCoherenceCheck: vi.fn(), onMessageSaved: vi.fn(), onDone: vi.fn(), onError: vi.fn(),
  }
}

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

describe('apiStreamPost', () => {
  it('정상 스트림: 텍스트 전달 후 [DONE]에서 onDone 1회', async () => {
    globalThis.fetch.mockResolvedValue(sseResponse([
      'data: {"type":"text","content":"안"}\n\n',
      'data: {"type":"text","content":"녕"}\n\ndata: [DONE]\n\n',
    ]))
    const cb = callbacks()
    await apiStreamPost('/api/chat/message', {}, cb)
    expect(cb.onText.mock.calls.map((c) => c[0])).toEqual(['안', '녕'])
    expect(cb.onDone).toHaveBeenCalledTimes(1)
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('하트비트 주석 프레임(": ping")은 무시한다', async () => {
    globalThis.fetch.mockResolvedValue(sseResponse([
      ': ping\n\n',
      'data: {"type":"text","content":"a"}\n\n',
      ': ping\n\ndata: [DONE]\n\n',
    ]))
    const cb = callbacks()
    await apiStreamPost('/api/chat/message', {}, cb)
    expect(cb.onText).toHaveBeenCalledTimes(1)
    expect(cb.onDone).toHaveBeenCalledTimes(1)
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('수신 도중 연결이 끊기면 throw하지 않고 onError를 부른다', async () => {
    globalThis.fetch.mockResolvedValue(sseResponse([
      'data: {"type":"text","content":"부분"}\n\n',
    ], { failAfter: 1 }))
    const cb = callbacks()
    await expect(apiStreamPost('/api/chat/message', {}, cb)).resolves.toBeUndefined()
    expect(cb.onText).toHaveBeenCalledWith('부분')
    expect(cb.onError).toHaveBeenCalledTimes(1)
    expect(cb.onDone).not.toHaveBeenCalled()
  })

  it('fetch 자체가 실패해도 throw하지 않고 onError를 부른다', async () => {
    globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const cb = callbacks()
    await expect(apiStreamPost('/api/chat/message', {}, cb)).resolves.toBeUndefined()
    expect(cb.onError).toHaveBeenCalledTimes(1)
    expect(cb.onDone).not.toHaveBeenCalled()
  })

  it('HTTP 오류 응답은 서버 메시지로 onError', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: '너무 많음' }) })
    const cb = callbacks()
    await apiStreamPost('/api/chat/message', {}, cb)
    expect(cb.onError).toHaveBeenCalledWith('너무 많음')
  })
})
