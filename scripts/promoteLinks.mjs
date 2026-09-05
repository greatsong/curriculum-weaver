#!/usr/bin/env node
/**
 * 링크 상태 일괄 승격 스크립트
 *
 * curriculum_links의 candidate 중 quality_score가 임계값 이상인 링크를
 * published(또는 reviewed)로 승격한다.
 *
 * 사용법:
 *   node scripts/promoteLinks.mjs --dry-run              # 대상 통계만 출력
 *   node scripts/promoteLinks.mjs                        # quality>=0.8 → published
 *   node scripts/promoteLinks.mjs --min-quality 0.7 --to reviewed
 *   node scripts/promoteLinks.mjs --demote-below 0.7 --dry-run  # published 중 quality<0.7 → candidate 강등
 *   node scripts/promoteLinks.mjs --max-per-pair 20 --dry-run    # 과목쌍당 published 상한을 두고 승격
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { config as dotenvConfig } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: path.join(__dirname, '..', 'server', '.env'), override: true })

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n, def) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : def }

const DRY_RUN = flag('--dry-run')
const MIN_QUALITY = Number(opt('--min-quality', 0.8))
const TO_STATUS = opt('--to', 'published')
// 강등 모드: published 중 quality가 임계값 미만(재판정 완료분만 — null은 건드리지 않음) → candidate
const DEMOTE_BELOW = args.includes('--demote-below') ? Number(opt('--demote-below', 0.7)) : null
// 과목쌍 상한: 한 과목쌍(예: 과학 ↔ 환경)에 published 링크가 N개를 넘지 않도록 승격을 멈춘다.
// 기존 published를 건드리지 않고 "이번에 몇 개를 더 얹을지"만 제한하며, 남은 자리에는
// quality_score가 높은 것부터 채운다. 특정 교과를 겨냥하지 않는 계열 중립 상한이다.
// (배경: 성취기준 수가 많은 교과쌍일수록 후보도 많아 한 쌍만 두꺼워지는 쏠림이 생긴다.)
const MAX_PER_PAIR = args.includes('--max-per-pair') ? Number(opt('--max-per-pair', 20)) : null
if (!['reviewed', 'published'].includes(TO_STATUS)) {
  console.error(`잘못된 대상 상태: ${TO_STATUS} (reviewed|published)`)
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || url.includes('placeholder')) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  process.exit(1)
}
const supabase = createClient(url, key)

/**
 * 과목쌍 상한 적용 — 한 과목쌍의 published 링크가 MAX_PER_PAIR를 넘지 않게 승격 대상을 줄인다.
 * 이미 published인 링크는 건드리지 않고, 남은 자리에 quality_score가 높은 것부터 채운다.
 * 정본에 없는 코드가 낀 링크는 과목을 알 수 없으므로 상한 대상에서 제외하고 그대로 통과시킨다.
 */
async function applyPairCap(targets) {
  const { ALL_STANDARDS } = await import('../server/data/standards.js')
  const byKey = new Map(ALL_STANDARDS.map((s) => [s.key || s.code, s]))
  const pairOf = (r) => {
    const a = byKey.get(r.source_code)?.subject
    const b = byKey.get(r.target_code)?.subject
    if (!a || !b) return null
    return a < b ? `${a} ↔ ${b}` : `${b} ↔ ${a}`
  }

  // 과목쌍별 현재 published 개수
  const current = new Map()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('curriculum_links')
      .select('source_code, target_code')
      .eq('status', 'published')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data) {
      const p = pairOf(r)
      if (p) current.set(p, (current.get(p) || 0) + 1)
    }
    if (data.length < 1000) break
  }

  const kept = []
  const capped = new Map()
  for (const t of [...targets].sort((x, y) => (y.quality_score ?? 0) - (x.quality_score ?? 0))) {
    const p = pairOf(t)
    if (!p) { kept.push(t); continue }
    const n = current.get(p) || 0
    if (n >= MAX_PER_PAIR) { capped.set(p, (capped.get(p) || 0) + 1); continue }
    current.set(p, n + 1)
    kept.push(t)
  }
  return { kept, capped }
}

async function main() {
  // 대상 조회 (페이지네이션)
  const demoting = DEMOTE_BELOW != null
  const targets = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('curriculum_links').select('id, quality_score, link_type, source_code, target_code')
    q = demoting
      ? q.eq('status', 'published').lt('quality_score', DEMOTE_BELOW).not('quality_score', 'is', null)
      : q.eq('status', 'candidate').gte('quality_score', MIN_QUALITY)
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(error.message)
    targets.push(...data)
    if (data.length < 1000) break
  }

  // 과목쌍 상한 (승격 모드 전용 — 강등은 대상이 이미 published라 무관)
  let cappedPairs = null
  if (!demoting && MAX_PER_PAIR != null) {
    const before = targets.length
    const { kept, capped } = await applyPairCap(targets)
    cappedPairs = capped
    targets.length = 0
    targets.push(...kept)
    const cut = before - targets.length
    console.log(`과목쌍 상한 ${MAX_PER_PAIR}: ${cut}건 보류 (과목쌍 ${capped.size}개가 상한 도달)`)
    if (cut > 0) {
      ;[...capped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .forEach(([p, n]) => console.log(`  보류 ${String(n).padStart(3)}  ${p}`))
    }
  }

  const byType = {}
  targets.forEach(t => byType[t.link_type] = (byType[t.link_type] || 0) + 1)
  const targetStatus = demoting ? 'candidate' : TO_STATUS
  if (demoting) {
    console.log(`대상: published 중 quality < ${DEMOTE_BELOW} → candidate 강등 (quality null은 제외)`)
  } else {
    console.log(`대상: candidate 중 quality >= ${MIN_QUALITY} → ${TO_STATUS}`)
  }
  console.log(`  ${targets.length}개 | 유형별:`, byType)

  if (DRY_RUN) { console.log('🏁 dry-run 종료 (변경 없음)'); return }
  if (targets.length === 0) { console.log('대상 없음'); return }

  const reviewedAt = new Date().toISOString()
  const patch = demoting ? { status: 'candidate' } : { status: targetStatus, reviewed_at: reviewedAt }
  let updated = 0
  for (let i = 0; i < targets.length; i += 500) {
    const ids = targets.slice(i, i + 500).map(t => t.id)
    const { error } = await supabase.from('curriculum_links')
      .update(patch)
      .in('id', ids)
    if (error) throw new Error(`${demoting ? '강등' : '승격'} 실패 (배치 ${i / 500}): ${error.message}`)
    updated += ids.length
    console.log(`  ...${updated}/${targets.length}`)
  }
  console.log(`✅ ${updated}개 ${demoting ? '강등' : '승격'} 완료 (${targetStatus})`)
  console.log('ℹ️ 서버 재시작(재하이드레이션) 시 그래프에 반영됩니다')
}

main().catch(e => { console.error('실행 실패:', e.message); process.exit(1) })
