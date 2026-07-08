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

async function main() {
  // 대상 조회 (페이지네이션)
  const demoting = DEMOTE_BELOW != null
  const targets = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('curriculum_links').select('id, quality_score, link_type')
    q = demoting
      ? q.eq('status', 'published').lt('quality_score', DEMOTE_BELOW).not('quality_score', 'is', null)
      : q.eq('status', 'candidate').gte('quality_score', MIN_QUALITY)
    const { data, error } = await q.range(from, from + 999)
    if (error) throw new Error(error.message)
    targets.push(...data)
    if (data.length < 1000) break
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
