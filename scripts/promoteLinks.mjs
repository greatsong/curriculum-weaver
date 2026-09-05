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
 *   node scripts/promoteLinks.mjs --vocational-min-quality 0.85          # 전문↔전문만 더 높은 문턱으로 승격
 *   node scripts/promoteLinks.mjs --vocational-min-quality 0.85 --demote-vocational --dry-run
 *   node scripts/promoteLinks.mjs --no-vocational-pairs --demote-vocational  # 전문↔전문 전면 비게시
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
// 전문↔전문(양쪽 다 산업수요 맞춤형 전문교과) 링크에만 적용하는 별도 승격 문턱.
// 배경: 2026-09-05 신규 성취기준이 대부분 경영·금융 전문교과라 전문↔전문 published가
// 하루 만에 154 → 320으로 늘었다. 172개 과목쌍에 최대 6건씩 고르게 퍼져 있어
// 과목쌍 상한으로는 잡히지 않고, 총량을 누르려면 문턱을 올리는 쪽이 맞다.
// 보통↔전문은 대상이 아니다 — 일반 교과 교사가 실제로 쓰는 다리라 남긴다.
// --no-vocational-pairs: 전문↔전문을 아예 게시하지 않는다. 서비스 대상이 일반고라
// 양쪽 다 특성화고 전용 과목인 링크는 쓸 교사가 없다는 판단(2026-09-05).
// quality_score는 최대 1.0이므로 그보다 높은 문턱을 두어 전량을 걸러낸다.
const NO_VOC_PAIRS = flag('--no-vocational-pairs')
const VOC_MIN_QUALITY = NO_VOC_PAIRS ? 1.01
  : args.includes('--vocational-min-quality')
  ? Number(opt('--vocational-min-quality', 0.85)) : null
// 위 문턱을 기존 published 전문↔전문에도 소급 적용해 미달분을 candidate로 되돌린다.
const DEMOTE_VOCATIONAL = flag('--demote-vocational')
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
 * 전문↔전문 판별 — 양쪽 성취기준이 모두 산업수요 맞춤형 전문교과인 링크.
 * 전문교과는 코드 접두가 한글 약어라 school_level이 비어 있다(정본 규약).
 * 정본에 없는 코드가 낀 링크는 판별할 수 없으므로 대상에서 제외한다(false).
 */
async function makeVocationalPairTest() {
  const { ALL_STANDARDS } = await import('../server/data/standards.js')
  const byKey = new Map(ALL_STANDARDS.map((s) => [s.key || s.code, s]))
  return (r) => {
    const a = byKey.get(r.source_code)
    const b = byKey.get(r.target_code)
    if (!a || !b) return false
    return !a.school_level && !b.school_level
  }
}

async function main() {
  // 대상 조회 (페이지네이션)
  const demoting = DEMOTE_BELOW != null || DEMOTE_VOCATIONAL
  const targets = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('curriculum_links').select('id, quality_score, link_type, source_code, target_code')
    q = demoting
      ? DEMOTE_VOCATIONAL
        // 전문↔전문 소급 적용: published 전체를 받아 아래에서 계열·문턱으로 거른다
        ? q.eq('status', 'published').not('quality_score', 'is', null)
        : q.eq('status', 'published').lt('quality_score', DEMOTE_BELOW).not('quality_score', 'is', null)
      : q.eq('status', 'candidate').gte('quality_score', MIN_QUALITY)
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(error.message)
    targets.push(...data)
    if (data.length < 1000) break
  }

  // 전문↔전문 문턱 적용
  if (VOC_MIN_QUALITY != null) {
    const isVocPair = await makeVocationalPairTest()
    const before = targets.length
    const kept = DEMOTE_VOCATIONAL
      // 강등: 전문↔전문이면서 문턱 미달인 것만 남긴다(= 내릴 대상)
      ? targets.filter(t => isVocPair(t) && t.quality_score < VOC_MIN_QUALITY)
      // 승격: 전문↔전문은 문턱을 넘어야 통과, 나머지는 그대로
      : targets.filter(t => !isVocPair(t) || t.quality_score >= VOC_MIN_QUALITY)
    targets.length = 0
    targets.push(...kept)
    const bar = NO_VOC_PAIRS ? '전면 비게시' : `문턱 ${VOC_MIN_QUALITY}`
    console.log(
      DEMOTE_VOCATIONAL
        ? `전문↔전문 소급 적용 (${bar}): published ${before}건 중 ${targets.length}건 → 강등 대상`
        : `전문↔전문 ${bar}: ${before - targets.length}건 보류 (보통↔전문·보통↔보통은 제한 없음)`
    )
  } else if (DEMOTE_VOCATIONAL) {
    console.error('--demote-vocational은 --vocational-min-quality와 함께 써야 합니다')
    process.exit(1)
  }

  const byType = {}
  targets.forEach(t => byType[t.link_type] = (byType[t.link_type] || 0) + 1)
  const targetStatus = demoting ? 'candidate' : TO_STATUS
  if (demoting) {
    console.log(DEMOTE_VOCATIONAL
      ? `대상: published 전문↔전문 ${NO_VOC_PAIRS ? '전량' : `중 quality < ${VOC_MIN_QUALITY}`} → candidate 강등`
      : `대상: published 중 quality < ${DEMOTE_BELOW} → candidate 강등 (quality null은 제외)`)
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
