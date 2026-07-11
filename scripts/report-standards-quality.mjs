#!/usr/bin/env node
/**
 * 성취기준 정본(server/data/standards.js) 품질 리포트
 *
 * store.js와 동일한 기준(server/lib/standardsQuality.js 단일 소스)으로
 * 제거 대상 / 품질 플래그를 분류해 유형별·과목별 분포를 표로 출력한다.
 * 시드/재파싱 후 품질 게이트로 사용할 수 있다.
 *
 * 실행 예시:
 *   node scripts/report-standards-quality.mjs                  # 리포트만 출력
 *   node scripts/report-standards-quality.mjs --max-flagged 50 # 플래그 총계 > 50이면 exit 1
 *   node scripts/report-standards-quality.mjs --samples 5      # 유형별 샘플 5건씩 출력
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import {
  QUALITY_FLAGS,
  shouldRemoveStandard,
  classifyStandardQuality,
} from '../server/lib/standardsQuality.js'

// ── CLI 옵션 ──
const args = process.argv.slice(2)
function optValue(name) {
  const i = args.indexOf(name)
  if (i === -1) return null
  const v = args[i + 1]
  if (v === undefined || v.startsWith('--')) {
    console.error(`옵션 ${name}에는 숫자 값이 필요합니다.`)
    process.exit(2)
  }
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) {
    console.error(`옵션 ${name} 값이 올바르지 않습니다: ${v}`)
    process.exit(2)
  }
  return n
}
const maxFlagged = optValue('--max-flagged')
const sampleCount = optValue('--samples') ?? 0

// ── 분류 (store.js initStore와 동일한 순서: 코드 dedup → 제거 → 플래그) ──
const seenCodes = new Set()
let duplicateCount = 0
let removedCount = 0
const flagCounts = Object.fromEntries(QUALITY_FLAGS.map((f) => [f, 0]))
const bySubject = new Map() // subject_group -> { total, ok, removed, <flag>: n }
const samples = Object.fromEntries(QUALITY_FLAGS.map((f) => [f, []]))
let okCount = 0

function subjectBucket(s) {
  const key = s.subject_group || s.subject || '(미분류)'
  if (!bySubject.has(key)) {
    const init = { total: 0, ok: 0, removed: 0 }
    for (const f of QUALITY_FLAGS) init[f] = 0
    bySubject.set(key, init)
  }
  return bySubject.get(key)
}

for (const s of ALL_STANDARDS) {
  if (seenCodes.has(s.code)) { duplicateCount++; continue }
  seenCodes.add(s.code)
  const bucket = subjectBucket(s)
  bucket.total++

  if (shouldRemoveStandard(s.content)) {
    removedCount++
    bucket.removed++
    continue
  }

  const quality = classifyStandardQuality(s.content)
  if (quality === 'ok') {
    okCount++
    bucket.ok++
  } else {
    flagCounts[quality]++
    bucket[quality]++
    if (samples[quality].length < sampleCount) {
      samples[quality].push(s)
    }
  }
}

const totalFlagged = Object.values(flagCounts).reduce((a, b) => a + b, 0)
const totalLoaded = okCount + totalFlagged

// ── 출력 ──
function padEnd(str, width) {
  // 한글은 표시 폭 2로 계산해 표 정렬 유지
  const displayWidth = [...String(str)].reduce(
    (w, ch) => w + (/[가-힣]/.test(ch) ? 2 : 1), 0)
  return String(str) + ' '.repeat(Math.max(0, width - displayWidth))
}

console.log('━━━ 성취기준 품질 리포트 (정본: server/data/standards.js) ━━━')
console.log(`원본 항목: ${ALL_STANDARDS.length} (중복 code ${duplicateCount}개 제외 → ${ALL_STANDARDS.length - duplicateCount})`)
console.log(`로드 대상: ${totalLoaded} (제거 ${removedCount}) / 정상 ${okCount} / 플래그 ${totalFlagged}`)
console.log('')

console.log('── 유형별 분포 ──')
console.log(padEnd('유형', 26) + '건수')
for (const f of QUALITY_FLAGS) {
  console.log(padEnd(f, 26) + flagCounts[f])
}
console.log(padEnd('(removed)', 26) + removedCount)
console.log(padEnd('합계(플래그)', 26) + totalFlagged)
console.log('')

console.log('── 과목별 분포 (플래그 또는 제거가 있는 과목만) ──')
const header =
  padEnd('교과군', 14) + padEnd('전체', 6) + padEnd('정상', 6) +
  padEnd('headless', 10) + padEnd('explan', 8) + padEnd('pagetag', 9) +
  padEnd('trunc', 7) + padEnd('제거', 6)
console.log(header)
console.log('-'.repeat(66))
const rows = [...bySubject.entries()]
  .filter(([, b]) => b.total - b.ok > 0)
  .sort((a, b) => (b[1].total - b[1].ok) - (a[1].total - a[1].ok))
for (const [subj, b] of rows) {
  console.log(
    padEnd(subj, 14) + padEnd(b.total, 6) + padEnd(b.ok, 6) +
    padEnd(b.headless_explanation, 10) + padEnd(b.explanation_as_content, 8) +
    padEnd(b.page_tag_mixed, 9) + padEnd(b.truncated, 7) + padEnd(b.removed, 6)
  )
}
if (rows.length === 0) console.log('(오염 없음)')
console.log('')

if (sampleCount > 0) {
  console.log(`── 유형별 샘플 (최대 ${sampleCount}건) ──`)
  for (const f of QUALITY_FLAGS) {
    if (samples[f].length === 0) continue
    console.log(`[${f}]`)
    for (const s of samples[f]) {
      const preview = (s.content || '').slice(0, 80).replace(/\n/g, ' ')
      console.log(`  ${s.code} ${preview}${(s.content || '').length > 80 ? '…' : ''}`)
    }
  }
  console.log('')
}

// ── 품질 게이트 ──
if (maxFlagged !== null) {
  if (totalFlagged > maxFlagged) {
    console.error(`품질 게이트 실패: 플래그 총계 ${totalFlagged} > 허용치 ${maxFlagged}`)
    process.exit(1)
  }
  console.log(`품질 게이트 통과: 플래그 총계 ${totalFlagged} <= 허용치 ${maxFlagged}`)
}
