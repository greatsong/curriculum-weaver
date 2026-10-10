/**
 * 채팅 공급자 선택·OpenAI(루나) 어댑터 단위 테스트 (외부 호출 없음, 가짜 클라이언트)
 */
import { describe, it, expect, vi } from 'vitest'
import {
  resolveChatProvider, isChatFallbackEnabled, buildOpenAIMessages,
  normalizeOpenAIUsage, normalizeAnthropicUsage, streamOpenAIChat, DEFAULT_LUNA_MODEL,
} from '../llmProvider.js'

describe('resolveChatProvider', () => {
  it('env가 없으면 Anthropic(지금과 같음)', () => {
    expect(resolveChatProvider({ aiModel: 'fast', env: {} })).toEqual({ provider: 'anthropic' })
  })
  it('CHAT_PROVIDER=openai면 루나, 모델·추론 강도는 env', () => {
    expect(resolveChatProvider({ env: { CHAT_PROVIDER: 'openai' } })).toEqual({ provider: 'openai', model: DEFAULT_LUNA_MODEL })
    expect(resolveChatProvider({ env: { CHAT_PROVIDER: 'openai', LUNA_MODEL: 'gpt-5.6-luna', LUNA_REASONING_EFFORT: 'low' } }))
      .toEqual({ provider: 'openai', model: 'gpt-5.6-luna', effort: 'low' })
  })
  it('정밀 모드는 언제나 Anthropic', () => {
    expect(resolveChatProvider({ aiModel: 'precise', env: { CHAT_PROVIDER: 'openai' } })).toEqual({ provider: 'anthropic' })
  })
  it('CHAT_PROVIDER_WORKSPACES가 있으면 그 워크스페이스만 루나(CHAT_PROVIDER와 무관)', () => {
    const env = { CHAT_PROVIDER_WORKSPACES: 'w1, w2', CHAT_PROVIDER: 'anthropic' }
    expect(resolveChatProvider({ workspaceId: 'w2', env }).provider).toBe('openai')
    expect(resolveChatProvider({ workspaceId: 'w3', env }).provider).toBe('anthropic')
    expect(resolveChatProvider({ workspaceId: null, env }).provider).toBe('anthropic')
    expect(resolveChatProvider({ workspaceId: 'w3', env: { ...env, CHAT_PROVIDER: 'openai' } }).provider).toBe('anthropic')
  })
  it('대체 호출은 기본 켬, off로 끈다', () => {
    expect(isChatFallbackEnabled({})).toBe(true)
    expect(isChatFallbackEnabled({ CHAT_FALLBACK: 'off' })).toBe(false)
  })
})

describe('buildOpenAIMessages', () => {
  it('순서: 공통 → 문맥 → 이력 → 현재 발화 → 매 턴 문맥(캐시가 다음 턴에 이어지도록)', () => {
    const out = buildOpenAIMessages(
      { common: 'C', context: 'X', tail: 'T' },
      [{ role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: '지금' }],
    )
    expect(out).toEqual([
      { role: 'system', content: 'C' }, { role: 'system', content: 'X' },
      { role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' },
      { role: 'user', content: '지금' }, { role: 'system', content: 'T' },
    ])
  })

  it('다음 턴 요청은 앞 턴 요청의 [공통·문맥·이력·발화]를 그대로 앞부분으로 가진다', () => {
    const parts1 = { common: 'C', context: 'X', tail: 'T1' }
    const parts2 = { common: 'C', context: 'X', tail: 'T2' }
    const turn1 = buildOpenAIMessages(parts1, [{ role: 'user', content: 'q1' }])
    const turn2 = buildOpenAIMessages(parts2, [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }])
    const written = turn1.slice(0, -1) // 캐시는 마지막 사용자 메시지 끝까지 쓰인다
    expect(turn2.slice(0, written.length)).toEqual(written)
  })
  it('빈 부분은 넣지 않는다', () => {
    expect(buildOpenAIMessages({ common: 'C', context: '', tail: '' }, [{ role: 'user', content: 'q' }]))
      .toEqual([{ role: 'system', content: 'C' }, { role: 'user', content: 'q' }])
  })
})

describe('usage 정규화', () => {
  it('OpenAI: 캐시·추론 토큰', () => {
    expect(normalizeOpenAIUsage({
      prompt_tokens: 1000, completion_tokens: 300,
      prompt_tokens_details: { cached_tokens: 800, cache_write_tokens: 197 }, completion_tokens_details: { reasoning_tokens: 120 },
    })).toEqual({ input_tokens: 1000, cache_read_tokens: 800, cache_write_tokens: 197, output_tokens: 300, reasoning_tokens: 120 })
  })
  it('Anthropic: 입력은 캐시 포함 합계', () => {
    expect(normalizeAnthropicUsage({ input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 40 }))
      .toEqual({ input_tokens: 1050, cache_read_tokens: 900, cache_write_tokens: 50, output_tokens: 40, reasoning_tokens: null })
  })
  it('없으면 null', () => {
    expect(normalizeOpenAIUsage(null)).toBeNull()
    expect(normalizeAnthropicUsage(undefined)).toBeNull()
  })
})

/** chat.completions.create(stream:true)처럼 동작하는 가짜 클라이언트 */
function fakeClient({ chunks = [], delayMs = 1, hang = false, throwAt = -1, error } = {}) {
  const create = vi.fn(async (_params, { signal } = {}) => {
    const abortError = () => Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' })
    const wait = (ms) => new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError())
      const t = setTimeout(resolve, ms)
      signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()) }, { once: true })
    })
    if (throwAt === 0) throw error
    return {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < chunks.length; i++) {
          await wait(delayMs)
          if (throwAt === i + 1) throw error
          yield chunks[i]
        }
        if (hang) await wait(10_000)
      },
    }
  })
  return { chat: { completions: { create } }, create }
}
const textChunk = (t) => ({ choices: [{ delta: { content: t }, finish_reason: null }] })
const stopChunk = (reason = 'stop') => ({ choices: [{ delta: {}, finish_reason: reason }] })
const usageChunk = { choices: [], usage: { prompt_tokens: 50, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 40 } } }

describe('streamOpenAIChat', () => {
  const base = { model: 'gpt-6-luna', messages: [{ role: 'user', content: 'q' }], maxTokens: 100, timeoutMs: 1000 }

  it('텍스트를 흘리고 usage·종료 사유·첫 토큰 시간을 돌려준다', async () => {
    const client = fakeClient({ chunks: [textChunk('안'), textChunk('녕'), stopChunk(), usageChunk] })
    const texts = []
    const r = await streamOpenAIChat({ ...base, client, onText: (t) => texts.push(t), cacheKey: 'k', effort: 'low' })
    expect(texts.join('')).toBe('안녕')
    expect(r).toMatchObject({ text: '안녕', finishReason: 'stop', refused: false, truncated: false, timedOut: false, aborted: false })
    expect(r.usage.prompt_tokens).toBe(50)
    expect(r.firstTokenMs).toBeGreaterThanOrEqual(0)
    const params = client.create.mock.calls[0][0]
    expect(params).toMatchObject({
      model: 'gpt-6-luna', stream: true, stream_options: { include_usage: true },
      max_completion_tokens: 100, reasoning_effort: 'low', prompt_cache_key: 'k',
    })
  })

  it('길이 초과는 truncated, 콘텐츠 필터·거절은 refused', async () => {
    const len = await streamOpenAIChat({ ...base, client: fakeClient({ chunks: [textChunk('a'), stopChunk('length')] }), onText: () => {} })
    expect(len.truncated).toBe(true)
    const filt = await streamOpenAIChat({ ...base, client: fakeClient({ chunks: [stopChunk('content_filter')] }), onText: () => {} })
    expect(filt.refused).toBe(true)
    const ref = await streamOpenAIChat({ ...base, client: fakeClient({ chunks: [{ choices: [{ delta: { refusal: '거절' } }] }, stopChunk()] }), onText: () => {} })
    expect(ref.refused).toBe(true)
  })

  it('시간 초과면 스트림을 끊고 timedOut으로 알린다(예외 없음)', async () => {
    const r = await streamOpenAIChat({ ...base, timeoutMs: 30, client: fakeClient({ chunks: [textChunk('a')], hang: true }), onText: () => {} })
    expect(r).toMatchObject({ timedOut: true, aborted: false, text: 'a' })
  })

  it('외부 중단이면 aborted로 알린다', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 15)
    const r = await streamOpenAIChat({ ...base, signal: controller.signal, client: fakeClient({ chunks: [textChunk('a')], hang: true }), onText: () => {} })
    expect(r).toMatchObject({ timedOut: false, aborted: true })
  })

  it('오류는 던지되 이미 텍스트를 보냈는지 emittedText로 알린다', async () => {
    const err = Object.assign(new Error('rate limit'), { status: 429 })
    await expect(streamOpenAIChat({ ...base, client: fakeClient({ throwAt: 0, error: err }), onText: () => {} }))
      .rejects.toMatchObject({ status: 429, emittedText: false })
    const err2 = Object.assign(new Error('끊김'), { status: 500 })
    await expect(streamOpenAIChat({ ...base, client: fakeClient({ chunks: [textChunk('a'), textChunk('b')], throwAt: 2, error: err2 }), onText: () => {} }))
      .rejects.toMatchObject({ status: 500, emittedText: true })
  })
})
