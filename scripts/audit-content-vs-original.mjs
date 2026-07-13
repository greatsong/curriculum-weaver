#!/usr/bin/env node
/**
 * content 전수 오류 탐색 — 저장 content vs 교육부 원문 성취기준 대조 (READ-ONLY).
 * 원문 성취기준 목록의 "[code] <성취기준>"을 추출해 저장 content와 앞부분 비교.
 * 불일치 = content 손상 의심. 결과 scripts/results/content-audit.json.
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIR = '/Users/greatsong/Downloads/outputs'
const norm = (t) => (t || '').replace(/\s/g, '').replace(/[⋅·․’'"”‘()（）]/g, '')
const books = readdirSync(DIR).filter((x) => /^2022_개정_교육과정_별책\d+\.json$/.test(x))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8'))['페이지별_원문'].map((p) => p.text).join('\n'))
const booksNorm = books.map((b) => norm(b))

let checked = 0, matched = 0
const mismatches = []
for (const s of ALL_STANDARDS) {
  const c = (s.content || '').trim()
  if (!c || c.length < 8) continue
  checked++
  // 저장 content 앞 24자가 원문 어디에든 존재하면 매치(성취기준은 원문에 그대로 있음)
  const probe = norm(c).slice(0, 24)
  if (probe.length < 12) { matched++; continue }
  const inOrig = booksNorm.some((b) => b.includes(probe))
  if (inOrig) { matched++; continue }
  // 앞이 안 맞으면 중간 조각도 시도(경미한 앞부분 차이 배제)
  const mid = norm(c).slice(Math.floor(norm(c).length / 3), Math.floor(norm(c).length / 3) + 24)
  if (mid.length >= 12 && booksNorm.some((b) => b.includes(mid))) { matched++; continue }
  mismatches.push({ code: s.code, subject: s.subject, content: c.slice(0, 70) })
}
console.log(`content 대조: ${checked}건 검사 / 원문 일치 ${matched} / 불일치 ${mismatches.length}`)
console.log('')
const bySub = {}
for (const m of mismatches) bySub[m.subject] = (bySub[m.subject] || 0) + 1
console.log('불일치 과목분포:', Object.entries(bySub).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' '))
console.log('\n불일치 샘플:')
mismatches.slice(0, 20).forEach((m) => console.log(`  ${m.code} [${m.subject}]: ${JSON.stringify(m.content)}`))
writeFileSync(path.join(__dirname, 'results', 'content-audit.json'), JSON.stringify({ checked, matched, mismatches }, null, 1))
console.log(`\n저장: scripts/results/content-audit.json (${mismatches.length} 불일치)`)
