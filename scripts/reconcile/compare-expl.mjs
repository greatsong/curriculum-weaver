#!/usr/bin/env node
/**
 * Phase 1 (explanation) — 정본 explanation vs groundtruth-expl.json 1:1 대조.
 * 버킷: match / both_empty / missing(stored빈·gt있음) / extra(stored있음·gt없음) / mismatch
 * 해설은 선별적이라 both_empty·missing은 정상 가능 — extra/mismatch가 오류 후보.
 */
import { ALL_STANDARDS } from '../../server/data/standards.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GT = JSON.parse(readFileSync(path.join(__dirname, 'results', 'groundtruth-expl.json'), 'utf8'))
const PUA = /[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu
const norm = (s) => String(s || '').replace(PUA, '').replace(/[‘’＇´`]/g, "'").replace(/[“”＂]/g, '"').replace(/[⋅·․•∙]/g, '·').replace(/[–—―]/g, '-').replace(/\s+/g, '').trim()
const normCode = (c) => c.replace(/\s+/g, ' ').replace(/–/g, '-').trim()
const gtByNorm = {}
for (const [k, v] of Object.entries(GT)) gtByNorm[normCode(k)] = v

const B = { match: 0, both_empty: 0, missing: [], extra: [], mismatch: [] }
for (const s of ALL_STANDARDS) {
  const gt = gtByNorm[normCode(s.code)]
  const storedN = norm(s.explanation)
  const gtN = gt ? norm(gt.haeseol) : ''
  if (!storedN && !gtN) { B.both_empty++; continue }
  if (storedN && gtN && storedN === gtN) { B.match++; continue }
  // 포함관계(부분 일치)면 사실상 정상(조사/꼬리 차이)
  if (storedN && gtN && (storedN.includes(gtN) || gtN.includes(storedN))) {
    const short = Math.min(storedN.length, gtN.length), long = Math.max(storedN.length, gtN.length)
    if (short / long > 0.85) { B.match++; continue }
  }
  const rec = { code: s.code, subject: s.subject, subject_group: s.subject_group, stored: s.explanation, gt: gt ? gt.haeseol : null, byeolchaek: gt?.byeolchaek, shared: gt?.shared, lenS: storedN.length, lenG: gtN.length }
  if (!storedN && gtN) B.missing.push(rec)
  else if (storedN && !gtN) B.extra.push(rec)
  else B.mismatch.push(rec)
}

console.log('=== explanation 대조 (정본 ' + ALL_STANDARDS.length + ') ===')
console.log(`  ✓ match: ${B.match}`)
console.log(`  ○ both_empty(정상가능): ${B.both_empty}`)
console.log(`  △ missing(stored빈, 원문해설있음→복원후보): ${B.missing.length}`)
console.log(`  ▲ extra(stored있음, 원문해설없음→bleed/추출누락 후보): ${B.extra.length}`)
console.log(`  ✗ mismatch(둘다있고 다름): ${B.mismatch.length}`)
const grp = (arr) => { const g = {}; for (const r of arr) g[r.subject_group] = (g[r.subject_group] || 0) + 1; return Object.entries(g).sort((a, b) => b[1] - a[1]) }
console.log('\n[extra subject_group]', JSON.stringify(grp(B.extra)))
console.log('[mismatch subject_group]', JSON.stringify(grp(B.mismatch)))
console.log('[missing subject_group]', JSON.stringify(grp(B.missing)))
writeFileSync(path.join(__dirname, 'results', 'expl-compare.json'), JSON.stringify(B, null, 1))
console.log('\n저장: scripts/reconcile/results/expl-compare.json')
