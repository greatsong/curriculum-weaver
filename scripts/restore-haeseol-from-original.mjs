#!/usr/bin/env node
/**
 * 원문 트랙 복원 — 교육부 고시 원문(별책 JSON)에서 추출한 해설로 explanation을 복원.
 * 대상: explanation bleed 원문트랙(header_stub·enum·foreign·pua 등, classifyExplanationQuality != ok).
 *
 * 규칙(추정 금지):
 *   - 원문에 해설 있음 → explanation = 원문 해설 (출처 별책 기록)
 *   - 원문에 해설 없음 → explanation = '' (2022개정 해설은 선별적, 없는 게 정상)
 *   - 원문 해설에도 PUA gap 잔존 → 건드리지 않음(교사 확정 트랙)
 *   - application_notes가 "적용 시 고려사항"/"성취기준 해설" 라벨 스텁이면 '' 로 정리
 *   content·keywords·기타 불변.
 *
 * 사용: node scripts/restore-haeseol-from-original.mjs [--apply YYYYMMDD]
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { classifyExplanationQuality } from '../server/lib/standardsQuality.js'
import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const stamp = args.find((a) => /^\d{8}$/.test(a)) || 'haeseol'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS = path.join(__dirname, 'results')
const CANONICAL = path.join(__dirname, '..', 'server', 'data', 'standards.js')
const PUA = /[\u{E000}-\u{F8FF}]/u

// ── 별책별 해설 병합 (출처 추적) ──
const 별책명 = {
  4: '국어과', 5: '도덕과', 6: '도덕과', 7: '사회과', 8: '수학과', 9: '과학과',
  10: '체육과', 11: '음악과', 12: '미술과', 13: '실과(기술·가정)/정보과', 14: '영어과',
  16: '제2외국어과', 17: '한문과', 19: '고등학교 교양 교과', 20: '과학 계열 선택 과목',
  21: '체육 계열 선택 과목', 22: '예술 계열 선택 교과', 23: '경영·금융 전문 교과',
}
const merged = {}
for (const f of readdirSync(RESULTS).filter((x) => /^haeseol-\d+\.json$/.test(x))) {
  const n = Number(f.match(/haeseol-(\d+)\.json/)[1])
  const m = JSON.parse(readFileSync(path.join(RESULTS, f), 'utf8'))
  for (const [k, v] of Object.entries(m)) {
    if (!merged[k]) merged[k] = { ...v, source: `교육부 고시 제2022-33호 [별책${n}] ${별책명[n] || ''}`.trim() }
  }
}

// ── 원문 트랙 계산 ──
const track = ALL_STANDARDS.filter((s) => classifyExplanationQuality(s.explanation, s.code) !== 'ok')
const STUB_APPNOTE = /^\s*(적용\s*시\s*고려\s*사항|성취기준\s*해설)\s*$/

// 러닝푸터 정밀 절단 — 과목명(record.subject)을 알고 있으므로 "N 진로/일반/융합 선택 과목 - <과목명>" 형태를 무손실 제거
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function stripSubjectFooter(text, subject) {
  if (!subject) return text
  const subj = escapeRe(subject).replace(/\s+/g, '\\s*')
  return text
    .replace(new RegExp('\\s*\\d{1,3}\\s*(진로|일반|융합)\\s*선택\\s*과목\\s*[-–—]\\s*' + subj + '\\s*', 'g'), ' ')
    .replace(/\s{2,}/g, ' ').trim()
}

const fixes = []
let restore = 0, empty = 0, holdTeacher = 0, appnotesCleaned = 0
for (const s of track) {
  const h = merged[s.code]
  const fix = { code: s.code, subject: s.subject_group, old_explanation: s.explanation, action: '', source: null }
  if (h && !PUA.test(h.text)) {
    fix.new_explanation = stripSubjectFooter(h.text, s.subject)
    fix.action = 'restore'
    fix.source = h.source
    restore++
  } else if (!h) {
    fix.new_explanation = ''
    fix.action = 'empty(원문 해설 없음)'
    empty++
  } else {
    // 원문 해설에도 PUA gap → 교사 트랙, 미변경
    holdTeacher++
    continue
  }
  // application_notes 라벨 스텁 정리
  if (STUB_APPNOTE.test(s.application_notes || '')) { fix.new_application_notes = ''; appnotesCleaned++ }
  fixes.push(fix)
}

console.log('━━━ 원문 해설 복원 ' + (APPLY ? '(적용)' : '(dry-run)') + ' ━━━')
console.log(`원문 트랙: ${track.length}`)
console.log(`  복원(원문 해설): ${restore}`)
console.log(`  빈값 정리(원문에 해설 없음): ${empty}`)
console.log(`  교사 트랙 보류(원문도 PUA gap): ${holdTeacher}`)
console.log(`  appnotes 라벨 스텁 정리: ${appnotesCleaned}`)
console.log('')
console.log('── 복원 샘플 ──')
for (const f of fixes.filter((x) => x.action === 'restore').slice(0, 4)) {
  console.log(`[${f.code}] ${f.subject}`)
  console.log(`  BEFORE: ${JSON.stringify((f.old_explanation || '').slice(0, 45))}`)
  console.log(`  AFTER : ${JSON.stringify(f.new_explanation.slice(0, 90))}`)
  console.log(`  출처  : ${f.source}`)
}

writeFileSync(path.join(RESULTS, 'haeseol-restore-fixes.json'), JSON.stringify({ mode: APPLY ? 'applied' : 'dry-run', counts: { restore, empty, holdTeacher, appnotesCleaned }, fixes }, null, 1))
console.log(`\n저장: scripts/results/haeseol-restore-fixes.json`)

if (APPLY) {
  const byCode = new Map(fixes.map((f) => [f.code, f]))
  let patched = 0
  const next = ALL_STANDARDS.map((s) => {
    const f = byCode.get(s.code)
    if (!f) return s
    const out = { ...s }
    out.explanation = f.new_explanation
    if (f.new_application_notes !== undefined) out.application_notes = f.new_application_notes
    patched++
    return out
  })
  const backupDir = path.join(__dirname, '..', 'server', 'data', `backup_${stamp}_haeseol`)
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
  const src = readFileSync(CANONICAL, 'utf8')
  const marker = 'export const ALL_STANDARDS = '
  const headerEnd = src.indexOf(marker)
  writeFileSync(CANONICAL, src.slice(0, headerEnd) + marker + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n✅ 적용: ${patched}건 (백업 ${path.relative(path.join(__dirname, '..'), backupDir)}) — content·keywords 불변`)
}
