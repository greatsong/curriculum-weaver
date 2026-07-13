#!/usr/bin/env node
/**
 * 좁은 정규식이 놓친 잔재 bleed 정리 (프로덕션 실측으로 발견).
 * 누락 원인: ① 코드 정규식이 [0-9]{2} 요구 → 한자리코드 [9기가03-04]·[9정…] 미탐
 *           ② 푸터 목록에 "실과(기술⋅가정)/정보과 교육과정", "고등학교 교양 교과 교육과정" 없음
 *           ③ 산업수요 공백코드 일부 잔재
 * 처리: explanation에서 최초 잔재 마커 컷 + 페이지경계 러닝푸터 블록 전역제거.
 *      문장 종결로 안 끝나면 스킵(과잉컷 방지).
 *
 * 사용: node scripts/clean-residual-bleed.mjs [--apply YYYYMMDD]
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANONICAL = path.join(__dirname, '..', 'server', 'data', 'standards.js')
const APPLY = process.argv.includes('--apply')
const stamp = process.argv.find((a) => /^\d{8}$/.test(a)) || 'residual'

// 넓힌 코드 정규식(한자리 prefix·공백코드 포함)
const CODE_G = /\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \-·]*?[0-9]{1,2}-[0-9]{2}\]/g
// 러닝푸터 블록(문중/문미): 쪽번호 + 별책 러닝제목(…교육과정)
const FOOTER_BLOCK = /\s*\d{1,3}\s*\n*\s*(고등학교|중학교|초등학교)?\s*[가-힣][가-힣()⋅·/]{0,20}\s*(교과|정보과|과)\s*교육과정\s*/g
const FOOTER_INLINE = /\s*\d{1,3}\s*(고등학교|중학교)?\s*[가-힣][가-힣()⋅·/ ]{0,20}(교과|정보과)\s*교육과정\s*/
const ENUM_CODE = /\n\s*[가-하]\)\s*[가-힣]/           // "나) STP 전략"
const NEXT_NUM = /\n\s*\d+\)\s*[가-힣]/                // "2) …"

const stripFooterBlocks = (t) => (t || '').replace(FOOTER_BLOCK, ' ')
const normalize = (t) => (t || '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]*\n[ \t]*/g, ' ').replace(/\s{2,}/g, ' ').trim()
const endsClean = (t) => { const e = (t || '').replace(/["'’”)\]』」]+$/, ''); return e.length <= 20 || /[.?!]$|다$|음$|함$|기$|라$|것$|점$|임$|됨$/.test(e) }

function firstForeign(text, ownCode) {
  const own = ownCode.replace(/\s+/g, ' ')
  const r = new RegExp(CODE_G.source, 'g'); let m
  while ((m = r.exec(text))) {
    if (m[0].replace(/\s+/g, ' ') === own) continue
    // 정상 교차참조 배제: 코드 앞이 따옴표/'의'/'과목' 이거나, 코드 뒤가 '와/과 연계'면 bleed 아님
    const before = text.slice(Math.max(0, m.index - 6), m.index)
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8)
    if (/['’"의]\s*$|과목\s*$/.test(before)) continue
    if (/^\s*(와|과)\s*연계|^\s*[’']/.test(after)) continue
    // 다음 성취기준 bleed 시그니처: 코드 뒤에 성취기준 문장/‘이 성취기준’ 또는 줄머리 코드
    if (/^\s*(이\s*성취기준|[가-힣])/.test(after) || /\n\s*$/.test(before)) return m.index
  }
  return -1
}
function firstMarker(text, ownCode) {
  const idxs = []
  const fc = firstForeign(text, ownCode); if (fc >= 0) idxs.push(fc)
  for (const re of [ENUM_CODE, NEXT_NUM]) { const m = re.exec(text); if (m) idxs.push(m.index) }
  return idxs.length ? Math.min(...idxs) : -1
}

const fixes = []
let cut = 0, skipUnsafe = 0
for (const s of ALL_STANDARDS) {
  const raw = s.explanation || ''
  if (!raw.trim()) continue
  const hasFooter = FOOTER_INLINE.test(raw)
  const hasMarker = firstMarker(raw, s.code) >= 0
  if (!hasFooter && !hasMarker) continue
  // 1) 러닝푸터 블록 전역 제거(페이지경계 본문 이음), 2) 다음코드/enum에서 컷
  const stripped = stripFooterBlocks(raw)
  const cutIdx = firstMarker(stripped, s.code)
  const kept = normalize(cutIdx >= 0 ? stripped.slice(0, cutIdx) : stripped)
  if (kept === normalize(raw)) continue
  if (kept.replace(/[\s,~·]/g, '').length < 5) { skipUnsafe++; continue }
  if (!endsClean(kept)) { skipUnsafe++; continue }
  fixes.push({ code: s.code, subject: s.subject, old: raw, new_explanation: kept })
  cut++
}
console.log(`잔재 정리 대상: ${cut} / 불안전(문장중간·본문소실) 스킵: ${skipUnsafe}`)
for (const f of fixes.slice(0, 12)) console.log(`  [${f.code}] …${f.new_explanation.slice(-45)}`)
fs.writeFileSync(path.join(__dirname, 'results', 'residual-bleed-fixes.json'), JSON.stringify({ mode: APPLY ? 'applied' : 'dry-run', cut, skipUnsafe, fixes }, null, 1))

if (APPLY) {
  const byCode = new Map(fixes.map((f) => [f.code, f]))
  let patched = 0
  const next = ALL_STANDARDS.map((s) => { const f = byCode.get(s.code); if (!f) return s; patched++; return { ...s, explanation: f.new_explanation } })
  const backupDir = path.join(__dirname, '..', 'server', 'data', `backup_${stamp}_residual`)
  fs.mkdirSync(backupDir, { recursive: true }); fs.copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
  const src = fs.readFileSync(CANONICAL, 'utf8'); const marker = 'export const ALL_STANDARDS = '; const he = src.indexOf(marker)
  fs.writeFileSync(CANONICAL, src.slice(0, he) + marker + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n✅ 적용: ${patched}건 (백업 ${path.relative(path.join(__dirname, '..'), backupDir)})`)
}
