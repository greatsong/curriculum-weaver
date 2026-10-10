/**
 * AI 호출 사용량 기록 (ai_usage 테이블, supabase/migrations/00030_ai_usage.sql).
 *
 * - 모든 AI 호출(채팅·시연 인트로·자료 분석·교과 연결 시나리오·성취기준 추천)이 한 행씩 남긴다.
 * - 기록 실패는 응답 경로를 깨지 않는다. 경고만 남기고 넘어간다(fire-and-forget).
 * - Supabase가 없거나 placeholder 주소면 서버 로그 한 줄만 남긴다(로컬 시험).
 * - 서버 로그에도 같은 내용을 한 줄로 남긴다([ai-usage] JSON). DB 장애 때 Railway 로그로 복구할 수 있게.
 */
import { supabaseAdmin } from './supabaseAdmin.js'

const INT_FIELDS = ['current_step', 'input_tokens', 'cache_write_tokens', 'cache_read_tokens', 'output_tokens', 'reasoning_tokens', 'latency_ms', 'first_token_ms']
const TEXT_FIELDS = ['provider', 'route', 'model', 'effort', 'procedure_code', 'finish_reason', 'error_code', 'request_id']
const UUID_FIELDS = ['project_id', 'workspace_id', 'user_id']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function dbEnabled() {
  const url = process.env.SUPABASE_URL || ''
  return Boolean(url && process.env.SUPABASE_SERVICE_ROLE_KEY && !/placeholder/i.test(url))
}

/** 입력값을 테이블 형식으로 정리(알 수 없는 키는 버린다) */
export function toUsageRow(input = {}) {
  const row = {}
  for (const f of TEXT_FIELDS) {
    if (input[f] != null && input[f] !== '') row[f] = String(input[f]).slice(0, 120)
  }
  for (const f of INT_FIELDS) {
    const v = Number(input[f])
    if (input[f] != null && Number.isFinite(v)) row[f] = Math.round(v)
  }
  for (const f of UUID_FIELDS) {
    if (typeof input[f] === 'string' && UUID_RE.test(input[f])) row[f] = input[f]
  }
  row.fallback_used = input.fallback_used === true
  if (!row.provider) row.provider = 'unknown'
  if (!row.route) row.route = 'unknown'
  return row
}

/**
 * 사용량 한 건 기록. 호출자는 기다리지 않아도 된다(반환 프라미스는 실패해도 reject하지 않는다).
 * @param {object} input - { provider, route, model, effort, project_id, workspace_id, procedure_code,
 *   current_step, user_id, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens,
 *   reasoning_tokens, finish_reason, latency_ms, first_token_ms, fallback_used, error_code, request_id }
 * @returns {Promise<boolean>} DB에 썼으면 true
 */
export async function recordUsage(input) {
  let row
  try {
    row = toUsageRow(input)
    console.log('[ai-usage]', JSON.stringify(row))
  } catch (error) {
    console.warn('[ai-usage] 기록 준비 실패(무시):', error?.message)
    return false
  }
  if (!dbEnabled()) return false
  try {
    const { error } = await supabaseAdmin.from('ai_usage').insert(row)
    if (error) throw error
    return true
  } catch (error) {
    console.warn('[ai-usage] DB 기록 실패(무시):', error?.message || error)
    return false
  }
}

/** Anthropic 비스트리밍 응답(usage)을 공통 형식 필드로 */
export function anthropicUsageFields(usage) {
  if (!usage) return {}
  const read = usage.cache_read_input_tokens || 0
  const write = usage.cache_creation_input_tokens || 0
  return {
    input_tokens: (usage.input_tokens || 0) + read + write,
    cache_read_tokens: read,
    cache_write_tokens: write,
    output_tokens: usage.output_tokens ?? null,
  }
}
