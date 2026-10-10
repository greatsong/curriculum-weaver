/**
 * 채팅 공급자 선택과 OpenAI(루나) 스트리밍 어댑터.
 *
 * - 기본 공급자는 Anthropic이다(지금과 같다). 머지만으로는 트래픽이 바뀌지 않고, env로 켠다.
 *   - CHAT_PROVIDER_WORKSPACES(쉼표 구분)가 비어 있지 않으면 그 워크스페이스만 루나(단계적 전환)
 *   - 비어 있으면 CHAT_PROVIDER=openai일 때 전체 루나
 * - 정밀 모드는 항상 Anthropic이다(PRECISE_MODEL, aiAgent.js).
 * - 루나 호출이 첫 글자를 보내기 전에 실패하면 호출자(aiAgent.buildAIResponse)가 소넷으로 한 번 대체한다.
 *
 * 파라미터 이름은 openai SDK 6.33 타입 정의로 확인했다(max_completion_tokens, reasoning_effort,
 * prompt_cache_key, stream_options.include_usage, usage.prompt_tokens_details.cached_tokens,
 * usage.completion_tokens_details.reasoning_tokens).
 *
 * aiAgent.js를 import하지 않는다(순환 방지). 큐와 시간 제한은 호출자가 넘긴다.
 */
import OpenAI from 'openai'

export const DEFAULT_LUNA_MODEL = 'gpt-6-luna'

let openaiClient = null

/** OpenAI 클라이언트(지연 생성). 키는 기존 임베딩과 같은 OPENAI_API_KEY. */
export function getOpenAI() {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1 })
  return openaiClient
}

/** 테스트 전용: 가짜 클라이언트 주입 */
export function _setOpenAIClientForTest(client) {
  openaiClient = client
}

function parseList(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * 이번 채팅 요청의 공급자를 정한다.
 * @param {{ aiModel?: string, workspaceId?: string|null, env?: object }} opts
 * @returns {{ provider: 'anthropic' } | { provider: 'openai', model: string, effort?: string }}
 */
export function resolveChatProvider({ aiModel, workspaceId, env = process.env } = {}) {
  if (aiModel === 'precise') return { provider: 'anthropic' }
  const allow = parseList(env.CHAT_PROVIDER_WORKSPACES)
  const useOpenAI = allow.length > 0
    ? workspaceId != null && allow.includes(String(workspaceId))
    : String(env.CHAT_PROVIDER || 'anthropic').toLowerCase() === 'openai'
  if (!useOpenAI) return { provider: 'anthropic' }
  const effort = String(env.LUNA_REASONING_EFFORT || '').trim()
  return {
    provider: 'openai',
    model: String(env.LUNA_MODEL || '').trim() || DEFAULT_LUNA_MODEL,
    ...(effort ? { effort } : {}),
  }
}

/** 루나 실패 시 소넷 대체 호출 여부(기본 켬) */
export function isChatFallbackEnabled(env = process.env) {
  return String(env.CHAT_FALLBACK || 'on').toLowerCase() !== 'off'
}

/**
 * 프롬프트 세 부분 + Anthropic 형식 메시지 → OpenAI 메시지.
 * 순서: [공통 지시] [팀·절차 문맥] ...이력 [매 턴 문맥] [현재 교사 발화]
 * 앞부분(공통·문맥·이력)이 매 턴 같아야 OpenAI 자동 프롬프트 캐시가 적중한다.
 *
 * @param {{ common: string, context: string, tail: string }} parts
 * @param {{ role: 'user'|'assistant', content: string }[]} messages - buildMessages 결과(마지막이 현재 발화)
 */
export function buildOpenAIMessages(parts, messages) {
  const list = Array.isArray(messages) ? messages : []
  const history = list.slice(0, -1)
  const current = list[list.length - 1]
  const out = []
  if (parts?.common) out.push({ role: 'system', content: parts.common })
  if (parts?.context) out.push({ role: 'system', content: parts.context })
  for (const m of history) out.push({ role: m.role, content: m.content })
  if (parts?.tail) out.push({ role: 'system', content: parts.tail })
  if (current) out.push({ role: current.role, content: current.content })
  return out
}

/** OpenAI usage → 공통 형식(input_tokens는 캐시 포함 전체 입력) */
export function normalizeOpenAIUsage(usage) {
  if (!usage) return null
  return {
    input_tokens: usage.prompt_tokens ?? null,
    cache_read_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    cache_write_tokens: 0,
    output_tokens: usage.completion_tokens ?? null,
    reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
  }
}

/** Anthropic usage → 공통 형식(input_tokens는 캐시 포함 전체 입력, 추론 토큰은 따로 집계되지 않음) */
export function normalizeAnthropicUsage(usage) {
  if (!usage) return null
  const read = usage.cache_read_input_tokens || 0
  const write = usage.cache_creation_input_tokens || 0
  return {
    input_tokens: (usage.input_tokens || 0) + read + write,
    cache_read_tokens: read,
    cache_write_tokens: write,
    output_tokens: usage.output_tokens ?? null,
    reasoning_tokens: null,
  }
}

/**
 * 루나 스트리밍 호출. 텍스트 조각을 onText로 흘리고, 시간 초과·외부 중단 시 스트림을 실제로 끊는다.
 * 중단은 예외로 던지지 않고 플래그로 알린다(runGuardedStream과 같은 의미). 그 밖의 오류는 던지되,
 * 이미 텍스트를 보냈는지 error.emittedText로 알려 호출자가 대체 호출 여부를 정하게 한다.
 *
 * @returns {Promise<{ text: string, finishReason: string|null, refused: boolean, truncated: boolean,
 *   usage: object|null, firstTokenMs: number|null, latencyMs: number, timedOut: boolean, aborted: boolean }>}
 */
export async function streamOpenAIChat({
  model, effort, messages, maxTokens, cacheKey, onText, signal, timeoutMs, client,
}) {
  const started = Date.now()
  const base = { text: '', finishReason: null, refused: false, truncated: false, usage: null, firstTokenMs: null }
  if (signal?.aborted) return { ...base, latencyMs: 0, timedOut: false, aborted: true }

  const controller = new AbortController()
  let timedOut = false
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  let text = ''
  let refusal = ''
  let finishReason = null
  let usage = null
  let firstTokenMs = null
  const interrupted = () => ({
    ...base, text, usage, firstTokenMs, latencyMs: Date.now() - started, timedOut, aborted: !timedOut,
  })

  try {
    const params = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: maxTokens,
    }
    if (effort) params.reasoning_effort = effort
    if (cacheKey) params.prompt_cache_key = cacheKey
    const stream = await (client || getOpenAI()).chat.completions.create(params, { signal: controller.signal })
    for await (const chunk of stream) {
      const choice = chunk?.choices?.[0]
      const delta = choice?.delta
      if (delta?.content) {
        if (firstTokenMs == null) firstTokenMs = Date.now() - started
        text += delta.content
        onText(delta.content)
      }
      if (delta?.refusal) refusal += delta.refusal
      if (choice?.finish_reason) finishReason = choice.finish_reason
      if (chunk?.usage) usage = chunk.usage
    }
    if (controller.signal.aborted) return interrupted()
    return {
      text,
      finishReason,
      refused: refusal.length > 0 || finishReason === 'content_filter',
      truncated: finishReason === 'length',
      usage,
      firstTokenMs,
      latencyMs: Date.now() - started,
      timedOut: false,
      aborted: false,
    }
  } catch (error) {
    if (controller.signal.aborted) return interrupted()
    if (error && typeof error === 'object') error.emittedText = text.length > 0
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}
