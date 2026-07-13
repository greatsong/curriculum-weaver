#!/usr/bin/env node
/**
 * (나) 적용 시 고려 사항 원문 복원 → application_notes 채우기 (영역 공통 → 영역 내 모든 코드 중복 부여).
 * 사용자 결정(2026-07-13): 영역-(나)를 그 영역 내 모든 성취기준에 중복 부여.
 *
 * 원문(별책 JSON)에서 "(나) 성취기준 적용 시 고려 사항" 블록을 추출하고,
 * 블록 직전 해설 불릿의 코드로 영역((subject, area))을 식별해 그 영역 코드 전체에 부여.
 * 대상: application_notes가 비어 있는 성취기준만(기존 값 보존).
 *
 * 사용: node scripts/restore-guidance-from-original.mjs [--apply YYYYMMDD]
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const stamp = args.find((a) => /^\d{8}$/.test(a)) || 'guidance'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANONICAL = path.join(__dirname, '..', 'server', 'data', 'standards.js')
const BYEOLCHAEK_DIR = '/Users/greatsong/Downloads/outputs'

const CODE_G = /\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \-·]*?[0-9]{2}-[0-9]{2}\]/g
const RUNNING_FOOTER = /\s*\d{1,3}\s*(선택\s*중심\s*교육과정\s*[–—\-]\s*[가-힣]+\s*과목\s*[–—\-]?|[가-힣]{2,10}\s*계열\s*선택\s*과목\s*교육과정|[가-힣]{2,8}\s*교과\s*교육과정|[가-힣]{1,8}과\s*교육과정|[가-힣]{0,10}\s*공통\s*교육과정)\s*/g
// "N 진로/일반/융합 선택 과목 - <과목명>" 러닝푸터(문중 삽입) 제거 — 과목명은 짧게 바운드
const SELECT_FOOTER = /\s*\d{1,3}\s*(진로|일반|융합)\s*선택\s*과목\s*[-–—]\s*[가-힣][가-힣\s]{0,8}?(?=\s|$)/g
function clean(t) {
  return (t || '')
    .replace(/\n[ \t]*\d{1,3}[ \t]*\n[ \t]*[^\n]*?(교육과정|계열\s*선택\s*과목|선택\s*중심\s*교육과정)[^\n]*/g, '\n')
    .replace(/[ \t]+/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n')
    .replace(RUNNING_FOOTER, ' ').replace(SELECT_FOOTER, ' ').replace(/(\d{1,2}-\d학년군)/g, ' ').replace(/\s+/g, ' ').trim()
}
// 적용 안전 게이트: PUA·외래코드·미해결 러닝푸터 있으면 스킵(원문 대조/교사 트랙)
const PUA = /[\u{E000}-\u{F8FF}]/u
const RESIDUAL = /진로\s*선택\s*과목\s*[-–—]|계열\s*선택\s*과목\s*교육과정|선택\s*중심\s*교육과정/
function guidanceIsClean(t) {
  if (PUA.test(t)) return false
  if (new RegExp(CODE_G.source).test(t)) return false
  if (RESIDUAL.test(t)) return false
  return true
}

// 영역 프리픽스 = 코드에서 끝 "-NN]" 제거 (예: [10통사1-02-01]→[10통사1-02, [12고대02-05]→[12고대02)
const areaPrefix = (code) => code.replace(/\s+/g, ' ').replace(/-\d+\]$/, '')
// 정본: 영역프리픽스 → 그 영역의 모든 코드
const codesByPrefix = new Map()
for (const s of ALL_STANDARDS) {
  const p = areaPrefix(s.code)
  if (!codesByPrefix.has(p)) codesByPrefix.set(p, [])
  codesByPrefix.get(p).push(s.code)
}

// ── 원문에서 (나)_i → 영역프리픽스 → 그 영역 전 코드에 부여 ──
// 영역프리픽스는 (나) 직전 해설/목록 코드에서 최빈값으로 도출(area 필드 불신, 코드구조 사용).
const guidanceByCode = new Map()
const GUIDE_HDR = /\(\s*나\s*\)\s*성취기준\s*적용\s*시\s*고려\s*사항/g
const SECTION_END = /\(\s*가\s*\)\s*성취기준\s*해설|\(\s*나\s*\)\s*성취기준\s*적용|\n\s*\(\s*\d+\s*\)\s*[가-힣]|성취기준\s*해설/
for (const f of readdirSync(BYEOLCHAEK_DIR).filter((x) => /^2022_개정_교육과정_별책\d+\.json$/.test(x))) {
  let j
  try { j = JSON.parse(readFileSync(path.join(BYEOLCHAEK_DIR, f), 'utf8')) } catch { continue }
  const full = (j['페이지별_원문'] || []).map((p) => p.text).join('\n')
  const hdr = new RegExp(GUIDE_HDR.source, 'g')
  let m
  while ((m = hdr.exec(full))) {
    const bodyStart = m.index + m[0].length
    const rest = full.slice(bodyStart)
    const endM = SECTION_END.exec(rest.slice(3))
    let body = clean(rest.slice(0, endM ? endM.index + 3 : 1800))
    const cm = new RegExp(CODE_G.source).exec(body)
    if (cm) body = body.slice(0, cm.index).trim()
    if (body.length < 15) continue
    // (나) 직전 900자(그 영역 해설/목록)의 코드 → 영역프리픽스 최빈값
    const before = full.slice(Math.max(0, m.index - 900), m.index)
    const codes = before.match(new RegExp(CODE_G.source, 'g')) || []
    if (!codes.length) continue
    const freq = {}
    for (const c of codes) { const p = areaPrefix(c); freq[p] = (freq[p] || 0) + 1 }
    const prefix = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
    // 그 영역 프리픽스의 정본 코드 전체에 부여(첫 (나) 우선)
    for (const real of codesByPrefix.get(prefix) || []) { if (!guidanceByCode.has(real)) guidanceByCode.set(real, body) }
  }
}

console.log(`(나) 매핑된 코드: ${guidanceByCode.size}`)

// ── 적용 대상: application_notes 비어있는 성취기준 ──
const fixes = []
let filled = 0, noGuide = 0, skippedDirty = 0
for (const s of ALL_STANDARDS) {
  if ((s.application_notes || '').trim()) continue // 기존값 보존
  const g = guidanceByCode.get(s.code)
  if (!g) { noGuide++; continue }
  if (!guidanceIsClean(g)) { skippedDirty++; continue } // PUA/코드/푸터 잔존 → 스킵
  fixes.push({ code: s.code, subject: s.subject, area: s.area, new_application_notes: g })
  filled++
}
console.log(`application_notes 빈값 중 채움: ${filled} / (나) 매핑 없음: ${noGuide} / 오염(나) 스킵: ${skippedDirty} (PUA·잔여footer 교사트랙)`)
console.log('── 샘플 ──')
for (const f of fixes.slice(0, 3)) console.log(`[${f.code}] ${f.subject}/${f.area}: ${f.new_application_notes.slice(0, 80)}…`)

writeFileSync(path.join(__dirname, 'results', 'guidance-restore-fixes.json'), JSON.stringify({ mode: APPLY ? 'applied' : 'dry-run', filled, mappedCodes: guidanceByCode.size, fixes }, null, 1))
console.log('\n저장: scripts/results/guidance-restore-fixes.json')

if (APPLY) {
  const byCode = new Map(fixes.map((f) => [f.code, f]))
  let patched = 0
  const next = ALL_STANDARDS.map((s) => {
    const f = byCode.get(s.code); if (!f) return s
    patched++; return { ...s, application_notes: f.new_application_notes }
  })
  const backupDir = path.join(__dirname, '..', 'server', 'data', `backup_${stamp}_guidance`)
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
  const src = readFileSync(CANONICAL, 'utf8')
  const marker = 'export const ALL_STANDARDS = '
  const he = src.indexOf(marker)
  writeFileSync(CANONICAL, src.slice(0, he) + marker + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n✅ 적용: ${patched}건 application_notes 채움 (백업 ${path.relative(path.join(__dirname, '..'), backupDir)}) — content·explanation·keywords 불변`)
}
