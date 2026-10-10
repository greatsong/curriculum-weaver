/**
 * Claude 5.5 모델 전환 회귀 테스트
 *
 * Sonnet 5.5·Opus 5.5는 다음 요청을 400으로 거부한다.
 * - 강제 도구 선택 tool_choice { type: 'tool' | 'any' }
 * - thinking { type: 'disabled' }, budget_tokens
 * 또한 안전 분류기가 넓어 드물게 stop_reason 'refusal'로 답변을 거절한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sdk = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() { this.messages = { create: sdk.create } }
  },
}))

vi.mock('../../lib/anthropicClient.js', () => ({
  getAnthropic: () => ({ messages: { stream: sdk.stream } }),
}))

const { _internal } = await import('../materialAnalyzer.js')
const { buildAIResponse, REFUSAL_MESSAGE } = await import('../aiAgent.js')

const here = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(here, '../..')

function listServerSources(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '__tests__', 'data'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listServerSources(full))
    else if (/\.(js|mjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

function fakeStream(events, finalMessage) {
  return {
    async *[Symbol.asyncIterator]() { for (const event of events) yield event },
    finalMessage: async () => finalMessage,
  }
}

beforeEach(() => {
  sdk.create.mockReset()
  sdk.stream.mockReset()
})

describe('5.5가 거부하는 요청 파라미터가 서버 코드에 없다', () => {
  const sources = listServerSources(serverRoot)
  const forbidden = [
    ['강제 도구 선택', /tool_choice\s*:\s*\{\s*type\s*:\s*['"](tool|any)['"]/],
    ['thinking 비활성화', /thinking\s*:\s*\{\s*type\s*:\s*['"]disabled['"]/],
    ['budget_tokens', /budget_tokens/],
  ]
  it.each(forbidden)('%s 없음', (_label, pattern) => {
    const hits = sources.filter((file) => pattern.test(fs.readFileSync(file, 'utf8')))
    expect(hits.map((file) => path.relative(serverRoot, file))).toEqual([])
  })

  it('구 모델 ID(claude-sonnet-5, claude-opus-5)를 런타임 코드가 쓰지 않는다', () => {
    const old = /['"]claude-(sonnet|opus)-5['"]/
    const hits = sources.filter((file) => old.test(fs.readFileSync(file, 'utf8')))
    expect(hits.map((file) => path.relative(serverRoot, file))).toEqual([])
  })
})

describe('자료 분석 요청', () => {
  const toolResponse = {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'submit_material_analysis', input: { summary: '요약' } }],
  }

  it('Sonnet 5.5에 자동 도구 선택으로 요청한다', async () => {
    sdk.create.mockResolvedValue(toolResponse)
    const input = await _internal.callClaudeAnalysis({ text: '자료 본문' })
    expect(input).toEqual({ summary: '요약' })
    const params = sdk.create.mock.calls[0][0]
    expect(params.model).toBe('claude-sonnet-5-5')
    expect(params.tool_choice).toEqual({ type: 'auto' })
    expect(params.tools[0].name).toBe('submit_material_analysis')
  })

  it('거절은 AI_REFUSAL로 구분한다', async () => {
    sdk.create.mockResolvedValue({ stop_reason: 'refusal', content: [] })
    await expect(_internal.callClaudeAnalysis({ text: '자료 본문' })).rejects.toThrow('AI_REFUSAL')
  })

  it('도구를 호출하지 않은 응답은 AI_SCHEMA_INVALID로 처리한다', async () => {
    sdk.create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '분석 결과입니다' }] })
    await expect(_internal.callClaudeAnalysis({ text: '자료 본문' })).rejects.toThrow('AI_SCHEMA_INVALID')
  })
})

describe('채팅 응답의 거절 처리', () => {
  const context = { session: { title: '테스트' }, procedure: 'T-1-1', userMessage: '질문', recentMessages: [], boards: [], standards: [], materials: [] }

  it('거절이면 안내 문구를 알리고 { refused: true }를 돌려준다', async () => {
    sdk.stream.mockReturnValue(fakeStream(
      [{ type: 'content_block_delta', delta: { text: '부분' } }],
      { stop_reason: 'refusal', stop_details: { category: 'general_harms' } },
    ))
    const onText = vi.fn()
    const onError = vi.fn()
    const result = await buildAIResponse(context, { onText, onError })
    expect(result).toEqual({ refused: true })
    expect(onError).toHaveBeenCalledWith(REFUSAL_MESSAGE)
    expect(sdk.stream.mock.calls[0][0].model).toBe('claude-sonnet-5-5')
  })

  // 2026-10-10 비용 결정: 정밀 모드는 Sonnet 5.5(메인은 루나로 전환). Opus를 쓰려면 env PRECISE_MODEL.
  // Sonnet 5.5는 thinking·effort를 보내지 않는다(종전 빠른 모드와 같은 요청).
  it('정밀 모드는 Sonnet 5.5에 종전 빠른 모드와 같은 요청을 보낸다', async () => {
    sdk.stream.mockReturnValue(fakeStream([], { stop_reason: 'end_turn', content: [] }))
    const result = await buildAIResponse({ ...context, aiModel: 'precise' }, { onText: vi.fn(), onError: vi.fn() })
    expect(result).toBeUndefined()
    const params = sdk.stream.mock.calls[0][0]
    expect(params.model).toBe('claude-sonnet-5-5')
    expect(params.thinking).toBeUndefined()
    expect(params.output_config).toBeUndefined()
    expect(params.max_tokens).toBe(12000)
  })
})
