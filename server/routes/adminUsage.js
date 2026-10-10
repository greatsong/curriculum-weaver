/**
 * 관리자 AI 사용량 조회 — GET /api/admin/ai-usage?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * ai_usage(00030)를 기간으로 읽어 일자(한국 시간)·공급자·모델·경로별로 합산한다.
 * 비용은 lib/aiPricing.js 단가표로 계산한 추정치이며, 실제 청구액의 정본은 각 사 콘솔이다.
 * 기간은 최대 31일, 행은 최대 50,000개까지 읽는다.
 */
import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { estimateCost } from '../lib/aiPricing.js'

export const adminUsageRouter = Router()

const DAY_MS = 86_400_000
const MAX_DAYS = 31
const MAX_ROWS = 50_000

const kstDay = (iso) => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10)

function quantile(values, p) {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!s.length) return null
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}

/** 행 목록 → 합계 묶음 */
export function summarizeUsage(rows) {
  const groups = {}
  const add = (key, base, r) => {
    const g = (groups[key] ||= { ...base, calls: 0, errors: 0, fallbacks: 0, input_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0, reasoning_tokens: 0, cost: 0, unpriced: 0, latencies: [], firstTokens: [] })
    g.calls++
    if (r.error_code) g.errors++
    if (r.fallback_used) g.fallbacks++
    for (const f of ['input_tokens', 'cache_read_tokens', 'cache_write_tokens', 'output_tokens', 'reasoning_tokens']) g[f] += r[f] || 0
    const c = estimateCost(r)
    if (c == null) g.unpriced++
    else g.cost += c
    if (r.latency_ms != null) g.latencies.push(r.latency_ms)
    if (r.first_token_ms != null) g.firstTokens.push(r.first_token_ms)
  }
  for (const r of rows) {
    add(`day|${kstDay(r.created_at)}`, { kind: 'day', day: kstDay(r.created_at) }, r)
    add(`model|${r.provider}|${r.model}|${r.route}`, { kind: 'model', provider: r.provider, model: r.model, route: r.route }, r)
    add('total', { kind: 'total' }, r)
  }
  return Object.values(groups).map(({ latencies, firstTokens, ...g }) => ({
    ...g,
    cost: Number(g.cost.toFixed(4)),
    error_rate: g.calls ? Number((g.errors / g.calls).toFixed(4)) : 0,
    fallback_rate: g.calls ? Number((g.fallbacks / g.calls).toFixed(4)) : 0,
    cache_read_ratio: g.input_tokens ? Number((g.cache_read_tokens / g.input_tokens).toFixed(4)) : 0,
    latency_p50: quantile(latencies, 0.5), latency_p95: quantile(latencies, 0.95),
    first_token_p50: quantile(firstTokens, 0.5), first_token_p95: quantile(firstTokens, 0.95),
  }))
}

adminUsageRouter.get('/', requireAuth, requireAdmin, async (req, res) => {
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59+09:00`) : new Date()
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00+09:00`) : new Date(to.getTime() - 7 * DAY_MS)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return res.status(400).json({ error: '기간 형식이 올바르지 않습니다. from·to는 YYYY-MM-DD로 보내 주세요.' })
  }
  if (to.getTime() - from.getTime() > MAX_DAYS * DAY_MS) {
    return res.status(400).json({ error: `한 번에 ${MAX_DAYS}일까지 조회할 수 있습니다.` })
  }
  try {
    const rows = []
    for (let off = 0; off < MAX_ROWS; off += 1000) {
      const { data, error } = await supabaseAdmin.from('ai_usage').select('*')
        .gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
        .order('created_at', { ascending: true }).range(off, off + 999)
      if (error) throw error
      rows.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    res.json({ from: from.toISOString(), to: to.toISOString(), rows: rows.length, truncated: rows.length >= MAX_ROWS, summary: summarizeUsage(rows) })
  } catch (error) {
    console.error('[admin/ai-usage] 조회 실패:', error?.message || error)
    res.status(500).json({ error: '사용량을 불러오지 못했습니다.' })
  }
})
