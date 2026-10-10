/**
 * 메인 채팅의 루나 경로(buildAIResponse) — 공급자 선택, 대체 호출, 사용량 보고, 거절·시간 초과
 * 그리고 시스템 프롬프트 세 부분(common·context·tail)의 안정성.
 * 외부 호출 없음(가짜 OpenAI·Anthropic 클라이언트).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

process.env.AI_STREAM_TIMEOUT_MS = '200' // 모듈 로드 시 읽는다

const { anthropicStream } = vi.hoisted(() => ({ anthropicStream: vi.fn() }))
vi.mock('../../lib/anthropicClient.js', () => ({
  getAnthropic: () => ({ messages: { stream: anthropicStream } }),
}))

let agent
let provider
beforeAll(async () => {
  agent = await import('../aiAgent.js')
  provider = await import('../llmProvider.js')
})

function fakeAnthropic(text, finalMessage = { stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 3 } }) {
  return {
    async *[Symbol.asyncIterator]() { yield { type: 'content_block_delta', delta: { text } } },
    finalMessage: async () => finalMessage,
  }
}

function fakeOpenAI({ chunks = [], error, hang = false }) {
  const create = vi.fn(async (_params, { signal } = {}) => {
    if (error) throw error
    return {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c
        if (hang) {
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, 5000)
            signal?.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'APIUserAbortError' })) }, { once: true })
          })
        }
      },
    }
  })
  return { chat: { completions: { create } }, create }
}
const text = (t) => ({ choices: [{ delta: { content: t }, finish_reason: null }] })
const stop = (r = 'stop') => ({ choices: [{ delta: {}, finish_reason: r }] })
const usage = { choices: [], usage: { prompt_tokens: 900, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 700 }, completion_tokens_details: { reasoning_tokens: 20 } } }

const baseContext = {
  session: { id: 'p1', title: '테스트 프로젝트' }, procedure: 'T-1-1', userMessage: '질문',
  recentMessages: [], boards: [], standards: [], materials: [], workspaceId: 'w1',
}

const savedEnv = {}
beforeEach(() => {
  anthropicStream.mockReset()
  for (const k of ['CHAT_PROVIDER', 'CHAT_PROVIDER_WORKSPACES', 'CHAT_FALLBACK', 'LUNA_MODEL']) savedEnv[k] = process.env[k]
  process.env.CHAT_PROVIDER = 'openai'
  delete process.env.CHAT_PROVIDER_WORKSPACES
  delete process.env.CHAT_FALLBACK
  delete process.env.LUNA_MODEL
})
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
})

describe('buildAIResponse — 루나 경로', () => {
  it('루나로 응답하고 usage를 보고한다(Anthropic 호출 없음)', async () => {
    const client = fakeOpenAI({ chunks: [text('안녕'), stop(), usage] })
    provider._setOpenAIClientForTest(client)
    const texts = []
    const usages = []
    const result = await agent.buildAIResponse(baseContext, { onText: (t) => texts.push(t), onError: vi.fn(), onUsage: (u) => usages.push(u) })
    expect(result).toBeUndefined()
    expect(texts.join('')).toBe('안녕')
    expect(anthropicStream).not.toHaveBeenCalled()
    expect(usages[0]).toMatchObject({ provider: 'openai', model: 'gpt-6-luna', input_tokens: 900, cache_read_tokens: 700, output_tokens: 50, reasoning_tokens: 20, finish_reason: 'stop', fallback_used: false })
    const params = client.create.mock.calls[0][0]
    expect(params.prompt_cache_key).toBe('cw-chat:p1:T-1-1')
    expect(params.messages.at(-2)).toEqual({ role: 'user', content: '질문' })
    expect(params.messages.at(-1).role).toBe('system') // 매 턴 문맥은 발화 뒤
    expect(params.messages[0].role).toBe('system')
  })

  it('첫 글자 전에 실패하면 소넷으로 한 번 대체한다', async () => {
    provider._setOpenAIClientForTest(fakeOpenAI({ error: Object.assign(new Error('rate'), { status: 429 }) }))
    anthropicStream.mockReturnValue(fakeAnthropic('소넷 답'))
    const texts = []
    const usages = []
    const onError = vi.fn()
    await agent.buildAIResponse(baseContext, { onText: (t) => texts.push(t), onError, onUsage: (u) => usages.push(u) })
    expect(texts.join('')).toBe('소넷 답')
    expect(onError).not.toHaveBeenCalled()
    expect(anthropicStream.mock.calls[0][0].model).toBe('claude-sonnet-5-5')
    expect(usages.map((u) => [u.provider, u.fallback_used, u.error_code || null])).toEqual([
      ['openai', true, 'http_429'],
      ['anthropic', true, null],
    ])
  })

  it('CHAT_FALLBACK=off면 대체하지 않고 오류 안내만 보낸다', async () => {
    process.env.CHAT_FALLBACK = 'off'
    provider._setOpenAIClientForTest(fakeOpenAI({ error: Object.assign(new Error('down'), { status: 500 }) }))
    const onError = vi.fn()
    await agent.buildAIResponse(baseContext, { onText: vi.fn(), onError })
    expect(anthropicStream).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('콘텐츠 필터면 거절 안내 + { refused: true }', async () => {
    provider._setOpenAIClientForTest(fakeOpenAI({ chunks: [stop('content_filter')] }))
    const onError = vi.fn()
    const result = await agent.buildAIResponse(baseContext, { onText: vi.fn(), onError })
    expect(result).toEqual({ refused: true })
    expect(onError).toHaveBeenCalledWith(agent.REFUSAL_MESSAGE)
  })

  it('시간 초과면 시간 초과 안내(대체 호출 없음)', async () => {
    provider._setOpenAIClientForTest(fakeOpenAI({ chunks: [text('일부')], hang: true }))
    const onError = vi.fn()
    await agent.buildAIResponse(baseContext, { onText: vi.fn(), onError })
    expect(onError).toHaveBeenCalledWith(agent.STREAM_TIMEOUT_MESSAGE)
    expect(anthropicStream).not.toHaveBeenCalled()
  })

  it('정밀 모드는 CHAT_PROVIDER=openai여도 소넷', async () => {
    const client = fakeOpenAI({ chunks: [text('x'), stop()] })
    provider._setOpenAIClientForTest(client)
    anthropicStream.mockReturnValue(fakeAnthropic('정밀'))
    await agent.buildAIResponse({ ...baseContext, aiModel: 'precise' }, { onText: vi.fn(), onError: vi.fn() })
    expect(client.create).not.toHaveBeenCalled()
    expect(anthropicStream.mock.calls[0][0].model).toBe('claude-sonnet-5-5')
  })

  it('워크스페이스 목록이 있으면 목록 밖 워크스페이스는 소넷', async () => {
    process.env.CHAT_PROVIDER_WORKSPACES = 'w9'
    const client = fakeOpenAI({ chunks: [text('x'), stop()] })
    provider._setOpenAIClientForTest(client)
    anthropicStream.mockReturnValue(fakeAnthropic('소넷'))
    await agent.buildAIResponse(baseContext, { onText: vi.fn(), onError: vi.fn() })
    expect(client.create).not.toHaveBeenCalled()
    expect(anthropicStream).toHaveBeenCalledTimes(1)
  })

  it('historyMessages가 있으면 그것을 이력으로 보낸다', async () => {
    const client = fakeOpenAI({ chunks: [text('x'), stop()] })
    provider._setOpenAIClientForTest(client)
    const historyMessages = [{ sender_type: 'teacher', content: '창 이력' }, { sender_type: 'ai', content: '답' }]
    await agent.buildAIResponse({ ...baseContext, recentMessages: [{ sender_type: 'teacher', content: '옛 목록' }], historyMessages }, { onText: vi.fn(), onError: vi.fn() })
    const contents = client.create.mock.calls[0][0].messages.map((m) => m.content)
    expect(contents).toContain('창 이력')
    expect(contents).not.toContain('옛 목록')
  })
})

describe('시스템 프롬프트 세 부분', () => {
  const ctx = (over = {}) => ({
    session: { id: 'p1', title: '융합 프로젝트', subjects: ['과학', '정보'] },
    procedure: 'A-1-1', currentStep: 2, userMessage: '질문',
    recentMessages: [], standards: [], materials: [],
    boards: [
      { board_type: 'learner_context', procedure_code: 'prep', content: { grade: '고1', studentCount: '26명' } },
      { board_type: 'team_vision', procedure_code: 'T-1-1', content: { commonVision: '함께 탐구' } },
    ],
    now: new Date('2026-10-12T01:00:00Z'),
    ...over,
  })

  it('같은 팀의 연속 턴: 스텝·질문·날짜가 달라도 common·context는 바이트 단위로 같다', () => {
    const a = agent.buildSystemPromptParts(ctx({ currentStep: 1, userMessage: '첫 질문' }))
    const b = agent.buildSystemPromptParts(ctx({ currentStep: 3, userMessage: '둘째 질문', now: new Date('2026-10-12T05:00:00Z') }))
    expect(a.common).toBe(b.common)
    expect(a.context).toBe(b.context)
    expect(a.tail).not.toBe(b.tail)
  })

  it('날짜·현재 스텝 상세·대화 프로토콜은 tail에만 있다', () => {
    const p = agent.buildSystemPromptParts(ctx())
    for (const marker of ['[오늘 날짜]', '[현재 스텝 상세]', '[대화 프로토콜']) {
      expect(p.tail).toContain(marker)
      expect(p.common).not.toContain(marker)
      expect(p.context).not.toContain(marker)
    }
  })

  it('스텝 목록은 common에, 현재 스텝 표시(→)는 없다', () => {
    const p = agent.buildSystemPromptParts(ctx())
    expect(p.common).toContain('[절차 스텝 목록')
    expect(p.common).not.toMatch(/\n→ \d+\./)
  })

  it('학습자 맥락·팀 비전은 context에 있다', () => {
    const p = agent.buildSystemPromptParts(ctx())
    expect(p.context).toContain('[학습자 맥락]')
    expect(p.context).toContain('[팀 비전')
  })

  it('buildSystemPrompt는 세 부분을 이은 문자열과 같다', () => {
    const c = ctx()
    expect(agent.buildSystemPrompt(c)).toBe(agent.joinPromptParts(agent.buildSystemPromptParts(c)))
  })

  it('강조 블록은 켤 때만 tail 끝에 붙는다', () => {
    expect(agent.buildSystemPromptParts(ctx()).tail).not.toContain('[답하기 전에 확인할 사실]')
    const p = agent.buildSystemPromptParts(ctx({ reinforceTail: true }))
    expect(p.tail).toContain('[답하기 전에 확인할 사실]')
    expect(p.tail).toContain('학생 수: 26명')
  })
})
