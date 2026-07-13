#!/usr/bin/env node
/**
 * Phase 1 — content 1:1 대조 (READ-ONLY).
 * 정본 4,856 × content vs groundtruth-content.json.
 * 정규화(공백제거·PUA제거·따옴표통일) 후 정확 비교.
 * 버킷: match / mismatch / no_source / gt_missing_code
 */
import { ALL_STANDARDS } from '../../server/data/standards.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GT = JSON.parse(readFileSync(path.join(__dirname, 'results', 'groundtruth-content.json'), 'utf8'))

// 정규화: 비교 목적. 공백 전부 제거(PDF wrap 무해화), PUA 제거, 따옴표/구두점 통일.
const PUA = /[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu
function norm(s) {
  return String(s || '')
    .replace(PUA, '')
    .replace(/[‘’＇´`]/g, "'")
    .replace(/[“”＂]/g, '"')
    .replace(/[⋅·․•∙]/g, '·')
    .replace(/[–—―]/g, '-')
    .replace(/\s+/g, '')
    .trim()
}
// 코드 정규화(공백 차이): 정본과 GT 코드 키 매칭용
const normCode = (c) => c.replace(/\s+/g, ' ').trim()
const gtByNorm = {}
for (const [k, v] of Object.entries(GT)) gtByNorm[normCode(k)] = v

const buckets = { match: [], mismatch: [], no_source: [], pua_in_stored: [] }
for (const s of ALL_STANDARDS) {
  const gt = gtByNorm[normCode(s.code)]
  if (!gt) { buckets.no_source.push({ code: s.code, subject: s.subject, subject_group: s.subject_group }); continue }
  const a = norm(s.content), b = norm(gt.content)
  if (a === b) { buckets.match.push(s.code); continue }
  // 저장본에 PUA(수식 복원 케이스) → 원문이 PUA라 불일치 가능. 별도 표시.
  const storedHasPua = /[\u{E000}-\u{F8FF}]/u.test(s.content)
  const gtHasPua = /[\u{E000}-\u{F8FF}]/u.test(gt.content)
  // 포함관계 진단
  const rel = a.includes(b) ? 'stored⊃gt' : b.includes(a) ? 'gt⊃stored' : 'disjoint'
  buckets.mismatch.push({
    code: s.code, subject: s.subject, subject_group: s.subject_group,
    rel, storedHasPua, gtHasPua,
    lenStored: a.length, lenGt: b.length,
    stored: s.content, gt: gt.content, byeolchaek: gt.byeolchaek, page: gt.page,
  })
}

const total = ALL_STANDARDS.length
console.log('=== content 대조 결과 ===')
console.log(`총 정본: ${total}`)
console.log(`  ✓ 일치(match): ${buckets.match.length}`)
console.log(`  ✗ 불일치(mismatch): ${buckets.mismatch.length}`)
console.log(`  ? 원문소스 없음(no_source): ${buckets.no_source.length}`)

// no_source subject_group 분포
const nsGroup = {}
for (const r of buckets.no_source) nsGroup[r.subject_group] = (nsGroup[r.subject_group] || 0) + 1
console.log('\n[원문소스 없는 코드의 subject_group 분포]')
for (const [g, n] of Object.entries(nsGroup).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)} ${g}`)

// mismatch 진단 요약
const mmRel = {}, mmPua = { storedPua: 0, gtPua: 0 }
for (const r of buckets.mismatch) {
  mmRel[r.rel] = (mmRel[r.rel] || 0) + 1
  if (r.storedHasPua) mmPua.storedPua++
  if (r.gtHasPua) mmPua.gtPua++
}
console.log('\n[불일치 포함관계]')
for (const [k, n] of Object.entries(mmRel)) console.log(`  ${k}: ${n}`)
console.log(`[불일치 중 저장본 PUA: ${mmPua.storedPua} / 원문 PUA: ${mmPua.gtPua}]`)

writeFileSync(path.join(__dirname, 'results', 'content-compare.json'), JSON.stringify(buckets, null, 1))
console.log('\n저장: scripts/reconcile/results/content-compare.json')
