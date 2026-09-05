/**
 * aiAgent — 스트림 중단 가드(runGuardedStream) 단위 테스트
 *
 * 검증 범위:
 *   - 정상 완주: 텍스트 델타 전달 + finalMessage 반환
 *   - 타임아웃: AI_STREAM_TIMEOUT_MS 초과 시 스트림에 넘긴 signal이 실제로 abort된다 (유령 스트림 없음)
 *   - 외부 abort: 사전 abort면 Anthropic 호출 자체를 하지 않고, 도중 abort면 스트림을 끊는다
 *   - buildProcedureIntroResponse / buildAIResponse: 타임아웃이 onError 안내 문구로 전달된다
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

// 모듈 import 전에 설정해야 반영된다 (모듈 로드 시 env를 읽는다)
process.env.AI_STREAM_TIMEOUT_MS = '80'

const { streamMock } = vi.hoisted(() => ({ streamMock: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    constructor() {}
    messages = { stream: streamMock, create: vi.fn() }
  },
}))

let mod
beforeAll(async () => {
  mod = await import('../aiAgent.js')
})

/** SDK MessageStream처럼 동작하는 가짜 스트림: abort되면 대기 중인 next()가 reject된다 */
function makeFakeStream({ chunks = [], delayMs = 5, hang = false }, signal) {
  const abortError = () => Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' })
  const wait = (ms) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()) }, { once: true })
  })
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of chunks) {
        await wait(delayMs)
        yield { type: 'content_block_delta', delta: { text } }
      }
      if (hang) await wait(60 * 60 * 1000)
    },
    async finalMessage() {
      if (signal?.aborted) throw abortError()
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: chunks.join('') }] }
    },
  }
}

function useScenario(scenario) {
  const seenSignals = []
  streamMock.mockImplementation((_params, opts) => {
    seenSignals.push(opts?.signal)
    return makeFakeStream(scenario, opts?.signal)
  })
  return seenSignals
}

beforeEach(() => {
  streamMock.mockReset()
})

describe('runGuardedStream', () => {
  it('정상 완주: 델타를 onText로 흘리고 finalMessage를 돌려준다', async () => {
    useScenario({ chunks: ['안녕', '하세요'] })
    const texts = []
    const result = await mod.runGuardedStream(
      (signal) => streamMock({}, { signal }),
      { onText: (t) => texts.push(t) },
    )
    expect(texts).toEqual(['안녕', '하세요'])
    expect(result.timedOut).toBe(false)
    expect(result.aborted).toBe(false)
    expect(result.finalMessage.stop_reason).toBe('end_turn')
  })

  it('타임아웃: 멈춘 스트림은 signal abort로 실제 중단되고 timedOut=true', async () => {
    const signals = useScenario({ chunks: ['첫'], delayMs: 5, hang: true })
    const texts = []
    const started = Date.now()
    const result = await mod.runGuardedStream(
      (signal) => streamMock({}, { signal }),
      { onText: (t) => texts.push(t) },
    )
    expect(Date.now() - started).toBeLessThan(2000)
    expect(texts).toEqual(['첫'])
    expect(result.timedOut).toBe(true)
    expect(result.aborted).toBe(false)
    expect(result.finalMessage).toBeNull()
    // Anthropic에 넘긴 signal이 abort되어야 유령 스트림이 남지 않는다
    expect(signals[0].aborted).toBe(true)
  })

  it('사전 abort: Anthropic 호출을 아예 하지 않는다', async () => {
    useScenario({ chunks: ['x'] })
    const controller = new AbortController()
    controller.abort()
    const result = await mod.runGuardedStream(
      (signal) => streamMock({}, { signal }),
      { onText: () => {}, signal: controller.signal },
    )
    expect(streamMock).not.toHaveBeenCalled()
    expect(result.aborted).toBe(true)
    expect(result.timedOut).toBe(false)
  })

  it('도중 abort: 외부 signal이 abort되면 스트림을 끊고 aborted=true', async () => {
    const signals = useScenario({ chunks: ['a', 'b', 'c', 'd'], delayMs: 20 })
    const controller = new AbortController()
    const texts = []
    setTimeout(() => controller.abort(), 30)
    const result = await mod.runGuardedStream(
      (signal) => streamMock({}, { signal }),
      { onText: (t) => texts.push(t), signal: controller.signal },
    )
    expect(texts.length).toBeLessThan(4)
    expect(result.aborted).toBe(true)
    expect(result.timedOut).toBe(false)
    expect(signals[0].aborted).toBe(true)
  })

  it('중단이 아닌 오류는 그대로 던진다', async () => {
    streamMock.mockImplementation(() => ({
      async *[Symbol.asyncIterator]() { throw new Error('overloaded_error') },
      async finalMessage() { return null },
    }))
    await expect(mod.runGuardedStream(
      (signal) => streamMock({}, { signal }),
      { onText: () => {} },
    )).rejects.toThrow('overloaded_error')
  })
})

describe('buildProcedureIntroResponse / buildAIResponse — 타임아웃 안내', () => {
  it('인트로: 타임아웃이면 onError에 안내 문구가 간다', async () => {
    useScenario({ chunks: ['안내'], hang: true })
    const texts = []
    const errors = []
    await mod.buildProcedureIntroResponse(
      { procedure: 'T-1-1', sessionTitle: '테스트', boards: [] },
      { onText: (t) => texts.push(t), onError: (e) => errors.push(e) },
    )
    expect(texts).toEqual(['안내'])
    expect(errors).toEqual([mod.STREAM_TIMEOUT_MESSAGE])
  })

  it('인트로: 정상 완주면 onError가 불리지 않는다', async () => {
    useScenario({ chunks: ['안', '내'] })
    const texts = []
    const errors = []
    await mod.buildProcedureIntroResponse(
      { procedure: 'T-1-1', sessionTitle: '테스트', boards: [] },
      { onText: (t) => texts.push(t), onError: (e) => errors.push(e) },
    )
    expect(texts.join('')).toBe('안내')
    expect(errors).toEqual([])
  })

  it('메인 대화: 외부 abort면 onError 없이 조용히 끝난다', async () => {
    useScenario({ chunks: ['a', 'b', 'c'], delayMs: 20 })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 25)
    const errors = []
    await mod.buildAIResponse(
      { session: { title: 't' }, standards: [], materials: [], boards: [], recentMessages: [], userMessage: '질문', procedure: 'T-1-1', currentStep: null },
      { onText: () => {}, onError: (e) => errors.push(e), signal: controller.signal },
    )
    expect(errors).toEqual([])
  })
})
