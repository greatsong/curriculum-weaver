#!/usr/bin/env node
/**
 * 완결성/귀속 오류 통합 수정 — 전부 교육부 원문 기준(추정 금지).
 *   ① explanation 심각절단/tail-stub → 원문 해설 완전본 복원(원문에 해설 없으면 빈값)
 *   ② application_notes 교차과목 내용체계 bleed + 절단 → 완전본 (나)로 교체 or 원문에서 이어붙임
 *   ③ 파편 → 완전본 or 빈값
 * content·code 불변. 백업 후 적용.
 * 사용: node scripts/fix-completeness-errors.mjs [--apply YYYYMMDD]
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANONICAL = path.join(__dirname, '..', 'server', 'data', 'standards.js')
const RES = path.join(__dirname, 'results')
const APPLY = process.argv.includes('--apply')
const stamp = process.argv.find((a) => /^\d{8}$/.test(a)) || 'completeness'
const BOOKS_DIR = '/Users/greatsong/Downloads/outputs'

const norm = (t) => (t || '').replace(/\s/g, '').replace(/[⋅·․]/g, '')
const haeseol = JSON.parse(readFileSync(path.join(RES, 'haeseol-merged.json'), 'utf8'))
const guidance = JSON.parse(readFileSync(path.join(RES, 'guidance-map.json'), 'utf8'))
const errs = JSON.parse(readFileSync(path.join(RES, 'completeness-errors.json'), 'utf8'))
// 별책 원본 텍스트(라이트 정규화: 공백 1개로 축약해 위치 정렬 유지)
const books = readdirSync(BOOKS_DIR).filter((x) => /^2022_개정_교육과정_별책\d+\.json$/.test(x))
  .map((f) => { try { return JSON.parse(readFileSync(path.join(BOOKS_DIR, f), 'utf8'))['페이지별_원문'].map((p) => p.text).join('\n') } catch { return '' } })
const booksLite = books.map((b) => b.replace(/[⋅·․]/g, '').replace(/\s+/g, ' '))

const PUA = /[\u{E000}-\u{F8FF}]/u
const CS = /가\s*\.\s*내용\s*체계/
const endsClean = (t) => { const e = (t || '').replace(/["'’”)\]』」]+$/, '').trim(); return /[.?!]$|다$|음$|함$|기$|라$|것$|점$|임$|됨$/.test(e) }
// 러닝푸터 전량 제거 — 문미/문중. subject-aware + 별책 러닝제목 여러 형태.
const stripSubjFooter = (t, subj) => {
  if (subj) { const s = subj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'); t = t.replace(new RegExp('\\s*\\d{0,3}\\s*(진로|일반|융합)\\s*선택\\s*과목\\s*[-–—]\\s*' + s + '\\s*', 'g'), ' ') }
  return t
    .replace(/\s*\d{1,3}\s*실과\s*\([^)]*\)\s*\/?\s*정보과\s*교육과정\s*/g, ' ') // 133 실과(기술⋅가정)/정보과 교육과정
    .replace(/\s*\d{1,3}\s*선택\s*중심\s*교육과정\s*[–—\-]\s*[가-힣]+\s*(선택\s*)?과목\s*[–—\-]?\s*/g, ' ') // 212 선택 중심 교육과정 – 융합 선택 과목 -
    .replace(/\s*[–—\-]\s*생활\s*[가-힣]{2,6}\s*$/g, '') // - 생활 러시아어/아랍어 (별책 러닝제목)
    .replace(/\s*\d{1,3}\s*[가-힣][가-힣()⋅·/ ]{0,15}(교과|계열\s*선택\s*과목)\s*교육과정\s*/g, ' ')
    .replace(/\s*\d{1,3}\s*[가-힣]{1,8}과\s*교육과정\s*/g, ' ') // N 사회과 교육과정
    .replace(/\s{2,}/g, ' ').trim()
}

// 원문에서 절단된 현재 텍스트를 찾아, "미종결 문장을 다음 '다.'까지만" 완성(과확장 방지, 최대 +400자).
function extendFromOriginal(current) {
  const curLite = current.replace(/[⋅·․]/g, '').replace(/\s+/g, ' ').trim()
  const head = curLite.slice(0, 28)
  for (const b of booksLite) {
    const gi = b.indexOf(head)
    if (gi < 0) continue
    // 현재 텍스트 길이만큼 + 완성분(다음 '다.'까지, 상한 400자)
    let window = b.slice(gi, gi + curLite.length + 400)
    // 다음 성취기준 목록(• [실제코드] 본문) 전까지로 먼저 상한. "[전자통관시스템…]" 같은 비코드 대괄호는 제외.
    const nextStd = /[•·]?\s*\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \-·]*?[0-9]{1,2}-[0-9]{2}\]\s*[가-힣]|\d\s*\.\s*교수/.exec(window.slice(Math.max(0, curLite.length - 10)))
    if (nextStd) window = window.slice(0, Math.max(0, curLite.length - 10) + nextStd.index)
    // "다." 또는 "다 ."(PDF 공백) 위치 중 현재 길이 이후 첫 번째
    let cut = -1
    const re = /다\s*\./g; let mm
    while ((mm = re.exec(window))) { if (mm.index + mm[0].length >= curLite.length - 5) { cut = mm.index + mm[0].length; break } }
    if (cut < 0) continue
    const seg = window.slice(0, cut).replace(/다\s*\./g, '다.').replace(/\s+/g, ' ').trim()
    if (endsClean(seg) && !CS.test(seg) && seg.length >= curLite.length - 3 && seg.length <= curLite.length + 400 && !PUA.test(seg)) return seg
  }
  return null
}
const inOriginal = (t) => { const n = norm(t).slice(5, 45); return n.length < 20 || booksLite.some((b) => b.replace(/\s/g, '').includes(n)) }

// ── explanation 절단 대상: 원문 대조 60% 미만 ──
const explFix = []
for (const s of ALL_STANDARDS) {
  const e = s.explanation || ''; if (!e.trim()) continue
  const h = haeseol[s.code]; if (!h) continue
  if (norm(h.text).length > 40 && norm(e).length < norm(h.text).length * 0.6 && !PUA.test(h.text)) {
    const cleaned = stripSubjFooter(h.text, s.subject)
    if (endsClean(cleaned) && !CS.test(cleaned) && cleaned.length > norm(e).length) explFix.push({ code: s.code, subject: s.subject, field: 'explanation', old: e, val: cleaned })
  }
}
// tail-stub 중 원문 해설 없는 것 → 빈값
for (const code of errs.tail_stub) { if (explFix.find((f) => f.code === code)) continue; const s = ALL_STANDARDS.find((x) => x.code === code); if (s && !haeseol[code]) explFix.push({ code, subject: s.subject, field: 'explanation', old: s.explanation, val: '' }) }

// ── application_notes 대상 ──
const anCodes = [...new Set([...errs.cross_subject, ...errs.appnotes_truncation, ...errs.fragment])]
const anFix = []
for (const code of anCodes) {
  const s = ALL_STANDARDS.find((x) => x.code === code); if (!s) continue
  let val = null
  if (guidance[code] && endsClean(guidance[code]) && !CS.test(guidance[code])) val = guidance[code] // 완전본 (나) 맵
  else val = extendFromOriginal(s.application_notes || '') // 원문에서 이어붙임
  if (val && val !== s.application_notes && endsClean(val) && !CS.test(val)) anFix.push({ code, subject: s.subject, field: 'application_notes', old: s.application_notes, val })
}

console.log('완결성 수정:')
console.log(`  explanation: ${explFix.length} (복원 ${explFix.filter((f) => f.val).length} + 빈값 ${explFix.filter((f) => !f.val).length})`)
console.log(`  application_notes: ${anFix.length} / 대상 ${anCodes.length} (원문복원 실패 ${anCodes.length - anFix.length}는 소스절단, 보류)`)
console.log('── 샘플 ──')
for (const f of [...explFix.slice(0, 2), ...anFix.slice(0, 3)]) console.log(`  [${f.code}] ${f.field}: …${(f.val || '(빈값)').slice(-55)}`)

const all = [...explFix, ...anFix]
writeFileSync(path.join(RES, 'completeness-fixes.json'), JSON.stringify({ mode: APPLY ? 'applied' : 'dry-run', count: all.length, fixes: all }, null, 1))
console.log(`\n저장: scripts/results/completeness-fixes.json (${all.length})`)

if (APPLY) {
  const byCode = new Map(); for (const f of all) { if (!byCode.has(f.code)) byCode.set(f.code, {}); byCode.get(f.code)[f.field] = f.val }
  let patched = 0
  const next = ALL_STANDARDS.map((s) => { const f = byCode.get(s.code); if (!f) return s; patched++; return { ...s, ...f } })
  const bd = path.join(__dirname, '..', 'server', 'data', `backup_${stamp}_completeness`); mkdirSync(bd, { recursive: true }); copyFileSync(CANONICAL, path.join(bd, 'standards.js'))
  const src = readFileSync(CANONICAL, 'utf8'); const mk = 'export const ALL_STANDARDS = '; const he = src.indexOf(mk)
  writeFileSync(CANONICAL, src.slice(0, he) + mk + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n✅ 적용: ${patched} code (${all.length} 필드) — content·code 불변 (백업 ${path.relative(path.join(__dirname, '..'), bd)})`)
}
