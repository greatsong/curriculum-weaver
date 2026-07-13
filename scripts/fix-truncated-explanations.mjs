#!/usr/bin/env node
/**
 * 자동컷(clean-explanation-bleed) 과정에서 페이지 경계 푸터가 문장 중간에 떨어져
 * explanation이 문장 도중 절단된 레코드를 교육부 원문 완결 해설로 복구.
 * (문장종결 가드를 산업수요전문에만 적용했던 누락 보정)
 *
 * 대상: 컷 트랙 explanation 중 문장종결로 끝나지 않고, 원문 해설맵에 완결본이 있는 것.
 * 사용: node scripts/fix-truncated-explanations.mjs [--apply YYYYMMDD]
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANONICAL = path.join(__dirname, '..', 'server', 'data', 'standards.js')
const APPLY = process.argv.includes('--apply')
const stamp = process.argv.find((a) => /^\d{8}$/.test(a)) || 'trunc'

const merged = JSON.parse(fs.readFileSync(path.join(__dirname, 'results', 'haeseol-merged.json'), 'utf8'))
// restore-haeseol와 동일한 러닝푸터 정제 (해설맵에 잔존한 인라인 푸터 제거)
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function cleanHaeseol(text, subject) {
  let t = text || ''
  // "N 진로/일반/융합 선택 과목 - <subject>" 정밀 제거
  if (subject) {
    const subj = escapeRe(subject).replace(/\s+/g, '\\s*')
    t = t.replace(new RegExp('\\s*\\d{0,3}\\s*(진로|일반|융합)\\s*선택\\s*과목\\s*[-–—]\\s*' + subj + '\\s*', 'g'), ' ')
  }
  // "N 선택 중심 교육과정 – 일반/진로 선택 과목 -" 러닝푸터(문중)
  t = t.replace(/\s*\d{1,3}\s*선택\s*중심\s*교육과정\s*[–—\-]\s*[가-힣]+\s*(선택\s*)?과목\s*[–—\-]?\s*/g, ' ')
  // 잔편 "…택 과목 - <name>" (쪽번호+앞부분이 잘려나간 형태)
  t = t.replace(/\s*\d{0,3}\s*[가-힣]{0,3}\s*선택\s*과목\s*[-–—]\s*[가-힣][가-힣\s]{0,8}?(?=\s|$)/g, ' ')
    .replace(/\s*택\s*과목\s*[-–—]\s*[가-힣][가-힣\s]{0,8}?(?=\s)/g, ' ')
  return t.replace(/\s{2,}/g, ' ').trim()
}
const endsClean = (t) => {
  const e = (t || '').replace(/["'’”)\]』」]+$/, '')
  return e.length <= 20 || /[.?!]$|다$|음$|함$|기$|라$|것$|점$|임$|됨$/.test(e)
}
// 컷 트랙 코드
const autobleed = new Set()
try { for (const x of JSON.parse(fs.readFileSync(path.join(__dirname, 'results', 'explanation-bleed-fixes.json'), 'utf8')).fixes) if (x.new_explanation !== undefined) autobleed.add(x.code) } catch {}

const PUA = /[\u{E000}-\u{F8FF}]/u
const fixes = []
let noSource = 0
for (const s of ALL_STANDARDS) {
  if (!autobleed.has(s.code)) continue
  if (endsClean(s.explanation)) continue // 정상 종결 → 손대지 않음
  const h = merged[s.code]
  if (!h || PUA.test(h.text)) { noSource++; continue }
  const cleaned = cleanHaeseol(h.text, s.subject)
  if (!endsClean(cleaned) || cleaned.length < 15) { noSource++; continue } // 원문 완결본 없음 → 보류(교사)
  fixes.push({ code: s.code, subject: s.subject, old: s.explanation, new_explanation: cleaned, source: h.source || '교육부 고시 원문' })
}
console.log(`절단 explanation 원문복구 대상: ${fixes.length} / 원문 완결본 없음(보류): ${noSource}`)
for (const f of fixes.slice(0, 4)) {
  console.log(`[${f.code}] BEFORE …${(f.old || '').slice(-30)}`)
  console.log(`          AFTER  …${f.new_explanation.slice(-40)}`)
}
fs.writeFileSync(path.join(__dirname, 'results', 'truncation-fixes.json'), JSON.stringify({ mode: APPLY ? 'applied' : 'dry-run', count: fixes.length, noSource, fixes }, null, 1))

if (APPLY) {
  const byCode = new Map(fixes.map((f) => [f.code, f]))
  let patched = 0
  const next = ALL_STANDARDS.map((s) => {
    const f = byCode.get(s.code); if (!f) return s
    patched++; return { ...s, explanation: f.new_explanation }
  })
  const backupDir = path.join(__dirname, '..', 'server', 'data', `backup_${stamp}_trunc`)
  fs.mkdirSync(backupDir, { recursive: true })
  fs.copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
  const src = fs.readFileSync(CANONICAL, 'utf8')
  const marker = 'export const ALL_STANDARDS = '
  const he = src.indexOf(marker)
  fs.writeFileSync(CANONICAL, src.slice(0, he) + marker + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n✅ 적용: ${patched}건 원문 복구 (백업 ${path.relative(path.join(__dirname, '..'), backupDir)})`)
}
