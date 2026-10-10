/**
 * AI 사용량 기록(lib/aiUsage.js)·단가(lib/aiPricing.js)·관리자 합계(routes/adminUsage.js summarizeUsage)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { insertMock } = vi.hoisted(() => ({ insertMock: vi.fn() }))
vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: { from: () => ({ insert: insertMock }) },
}))

const { recordUsage, toUsageRow, anthropicUsageFields } = await import('../aiUsage.js')
const { estimateCost } = await import('../aiPricing.js')
const { summarizeUsage } = await import('../../routes/adminUsage.js')

const UUID = '11111111-2222-3333-4444-555555555555'
const saved = {}
beforeEach(() => {
  insertMock.mockReset()
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) saved[k] = process.env[k]
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  vi.restoreAllMocks()
})

describe('toUsageRow', () => {
  it('알려진 필드만 남기고 형식을 맞춘다', () => {
    const row = toUsageRow({ provider: 'openai', route: 'chat', model: 'gpt-6-luna', project_id: UUID, user_id: 'not-uuid', input_tokens: '900.4', output_tokens: 50, extra: 'x', fallback_used: 1 })
    expect(row).toEqual({ provider: 'openai', route: 'chat', model: 'gpt-6-luna', project_id: UUID, input_tokens: 900, output_tokens: 50, fallback_used: false })
  })
  it('공급자·경로가 없으면 unknown', () => {
    expect(toUsageRow({})).toMatchObject({ provider: 'unknown', route: 'unknown', fallback_used: false })
  })
})

describe('recordUsage', () => {
  it('DB에 한 행을 쓴다', async () => {
    insertMock.mockResolvedValue({ error: null })
    await expect(recordUsage({ provider: 'anthropic', route: 'chat', input_tokens: 10 })).resolves.toBe(true)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', route: 'chat', input_tokens: 10 }))
  })
  it('DB 오류여도 던지지 않는다', async () => {
    insertMock.mockResolvedValue({ error: { message: 'relation "ai_usage" does not exist' } })
    await expect(recordUsage({ provider: 'openai', route: 'chat' })).resolves.toBe(false)
    insertMock.mockRejectedValue(new Error('network'))
    await expect(recordUsage({ provider: 'openai', route: 'chat' })).resolves.toBe(false)
  })
  it('placeholder 주소면 DB에 쓰지 않고 로그만 남긴다', async () => {
    process.env.SUPABASE_URL = 'https://placeholder.supabase.co'
    await expect(recordUsage({ provider: 'openai', route: 'chat' })).resolves.toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith('[ai-usage]', expect.any(String))
  })
})

describe('단가와 합계', () => {
  it('Anthropic usage 변환과 비용 추정', () => {
    const u = anthropicUsageFields({ input_tokens: 1000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0, output_tokens: 500 })
    expect(u).toEqual({ input_tokens: 10000, cache_read_tokens: 9000, cache_write_tokens: 0, output_tokens: 500 })
    // 1,000×$2 + 9,000×$0.2 + 500×$10 (백만 토큰당)
    expect(estimateCost({ model: 'claude-sonnet-5-5', ...u })).toBeCloseTo((2000 + 1800 + 5000) / 1e6, 10)
    expect(estimateCost({ model: 'gpt-6-luna', input_tokens: 12000, cache_read_tokens: 10000, output_tokens: 1800 })).toBeCloseTo((2000 * 0.1 + 10000 * 0.01 + 1800 * 0.5) / 1e6, 10)
    expect(estimateCost({ model: 'unknown-model', input_tokens: 1 })).toBeNull()
  })
  it('일자·모델·전체 합계와 비율·분위수', () => {
    const rows = [
      { created_at: '2026-10-11T01:00:00Z', provider: 'openai', model: 'gpt-6-luna', route: 'chat', input_tokens: 1000, cache_read_tokens: 500, output_tokens: 100, latency_ms: 1000, first_token_ms: 300 },
      { created_at: '2026-10-11T02:00:00Z', provider: 'openai', model: 'gpt-6-luna', route: 'chat', error_code: 'http_429', fallback_used: true, latency_ms: 200 },
      { created_at: '2026-10-11T03:00:00Z', provider: 'anthropic', model: 'claude-sonnet-5-5', route: 'chat', input_tokens: 2000, output_tokens: 200, fallback_used: true, latency_ms: 5000 },
    ]
    const s = summarizeUsage(rows)
    const total = s.find((g) => g.kind === 'total')
    expect(total).toMatchObject({ calls: 3, errors: 1, fallbacks: 2, input_tokens: 3000, latency_p50: 1000 })
    expect(total.error_rate).toBeCloseTo(1 / 3, 3)
    expect(s.filter((g) => g.kind === 'day').map((g) => g.day)).toEqual(['2026-10-11'])
    expect(s.filter((g) => g.kind === 'model')).toHaveLength(2)
  })
})
