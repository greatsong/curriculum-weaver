#!/usr/bin/env node
/**
 * 영향 레코드를 단일 주(主)버킷으로 확정 분류 → 일관 총계 + 레퍼런스 CSV (READ-ONLY)
 *
 * 우선순위:
 *   1) content_lost   — 본문 유실(헤더 스텁 "성취기준 해설", 또는 잔재 절단 후 본문<5자)
 *   2) hard_bleed     — 외래코드/페이지푸터/번호헤더 침범 (자명 제거, (나)결정 무관)
 *   3) guidance_only  — (나) 적용 시 고려 사항 / (가)(나) 열거헤더만 (경계판정 대상)
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { writeFileSync } from 'node:fs'

const OWN = /\[[0-9]{2}[가-힣A-Za-z]{1,6}[0-9]{2}-[0-9]{2}\]/g
const FOOT = [/(진로|일반|융합)\s*선택\s*과목/, /[가-힣]{2,10}\s*계열\s*선택\s*과목/, /선택\s*중심\s*교육과정/, /공통\s*교육과정/, /과목\s*교육과정/, /\d+\s*[가-힣]{0,12}\s*교육과정/]
const GUID = /적용\s*시\s*고려\s*사항/
const NUM = /\n\s*\(\s*\d+\s*\)\s*[가-힣]/
const ENUM = /(^|\n)\s*\([가-하]\)\s*[가-힣]/
const HEADER_ONLY = (t) => /성취기준\s*해설/.test(t) && t.replace(/\s|성취기준|해설/g, '').length < 3

function firstHard(t, own) {
  const idx = []; const re = new RegExp(OWN.source, 'g'); let m
  while ((m = re.exec(t))) { if (m[0] !== own) { idx.push(m.index); break } }
  for (const f of FOOT) { const mm = f.exec(t); if (mm) idx.push(mm.index) }
  const nm = NUM.exec(t); if (nm) idx.push(nm.index + 1)
  return idx.length ? Math.min(...idx) : -1
}

const rows = []
const counts = { content_lost: 0, hard_bleed: 0, guidance_only: 0 }
const bySubject = {}
for (const s of ALL_STANDARDS) {
  const e = s.explanation || '', a = s.application_notes || ''
  const hard = firstHard(e, s.code)
  const guid = GUID.test(e) || ENUM.test(e)
  const stub = HEADER_ONLY(e)
  const compoundLoss = hard > 0 && e.slice(0, hard).replace(/[\s,~·]/g, '').length < 4
  if (!stub && hard < 0 && !guid) continue // 무오염
  let bucket
  if (stub || compoundLoss) bucket = 'content_lost'
  else if (hard >= 0) bucket = 'hard_bleed'
  else bucket = 'guidance_only'
  counts[bucket]++
  const subj = s.subject_group || '(미분류)'
  bySubject[subj] = bySubject[subj] || { content_lost: 0, hard_bleed: 0, guidance_only: 0 }
  bySubject[subj][bucket]++
  rows.push({
    code: s.code, subject: subj, bucket,
    cut_index: hard, expl_len: e.length,
    has_guidance: guid, appnotes_empty: !a.trim(),
    expl_preview: e.slice(0, 120).replace(/\n/g, '⏎'),
  })
}

const pad = (s, w) => { const dw = [...String(s)].reduce((x, c) => x + (/[가-힣]/.test(c) ? 2 : 1), 0); return String(s) + ' '.repeat(Math.max(0, w - dw)) }
console.log('━━━ 단일 주버킷 확정 분류 ━━━')
console.log(`총 영향 레코드: ${rows.length}`)
for (const [k, v] of Object.entries(counts)) console.log(`  ${pad(k, 16)} ${v}`)
console.log('')
console.log('── 과목군별 (영향 있는 곳만, 오염 많은 순) ──')
console.log(pad('교과군', 16) + pad('본문유실', 10) + pad('하드bleed', 11) + pad('(나)블록', 10))
for (const [subj, b] of Object.entries(bySubject).sort((a, c) => (c[1].content_lost + c[1].hard_bleed + c[1].guidance_only) - (a[1].content_lost + a[1].hard_bleed + a[1].guidance_only))) {
  console.log(pad(subj, 16) + pad(b.content_lost, 10) + pad(b.hard_bleed, 11) + pad(b.guidance_only, 10))
}

// CSV
const csv = ['code,subject,bucket,cut_index,expl_len,has_guidance,appnotes_empty,expl_preview',
  ...rows.map((r) => `"${r.code}","${r.subject}",${r.bucket},${r.cut_index},${r.expl_len},${r.has_guidance},${r.appnotes_empty},"${r.expl_preview.replace(/"/g, "'")}"`)].join('\n')
writeFileSync(new URL('./results/bleed-classified.csv', import.meta.url).pathname, csv)
writeFileSync(new URL('./results/bleed-classified.json', import.meta.url).pathname, JSON.stringify({ counts, bySubject, rows }, null, 1))
console.log('\n저장: scripts/results/bleed-classified.{csv,json}')
