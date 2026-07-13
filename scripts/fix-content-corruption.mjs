#!/usr/bin/env node
/**
 * content 손상 복원 — content가 성취기준이 아니라 교차참조 파편/교수학습 텍스트인 것.
 * 원문 성취기준 목록("[code] <성취기준>")과 해설을 정본값으로 복원. content·explanation 교체.
 * 사용: node scripts/fix-content-corruption.mjs [--apply YYYYMMDD]
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANONICAL = path.join(__dirname, '..', 'server', 'data', 'standards.js')
const APPLY = process.argv.includes('--apply')
const stamp = process.argv.find((a) => /^\d{8}$/.test(a)) || 'content'
const DIR = '/Users/greatsong/Downloads/outputs'
const books = readdirSync(DIR).filter((x) => /^2022_개정_교육과정_별책\d+\.json$/.test(x))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8'))['페이지별_원문'].map((p) => p.text).join('\n'))
const clean = (t) => t.replace(/\s*\d{1,3}\s*[가-힣][가-힣()⋅·/ ]{0,15}(교과|계열\s*선택\s*과목)\s*교육과정\s*/g, ' ').replace(/\s+/g, ' ').trim()

// 원문 성취기준 목록에서 "[code] <성취기준>" 추출 (다음 [code] 또는 (가)/(나) 전까지, 한 문장)
function origStandard(code) {
  const bare = code.replace(/[[\]]/g, '')
  const re = new RegExp('\\[?' + bare.replace(/\s+/g, '\\s*') + '\\]\\s*([^\\[]*?(?:다|음|함|기|셈)\\.)', 's')
  for (const b of books) { const m = re.exec(b); if (m && !/•|성취기준\s*해설/.test(m[1])) return clean(m[1]) }
  return null
}
// 원문 (가) 해설에서 "• [code]는/은 <해설>" 추출
function origHaeseol(code) {
  const bare = code.replace(/[[\]]/g, '')
  const re = new RegExp('•\\s*\\[?' + bare.replace(/\s+/g, '\\s*') + '\\][^•]*?(?=•\\s*\\[|\\(\\s*나\\s*\\)|가\\s*\\.\\s*내용\\s*체계|성취기준\\s*해설|$)', 's')
  for (const b of books) { const m = re.exec(b); if (m) { let t = clean(m[0]).replace(new RegExp('^•\\s*\\[?' + bare.replace(/\s+/g, '\\s*') + '\\]?\\s*(은|는|이|가|에서는)?\\s*'), '').trim(); if (t.length > 15) return t } }
  return null
}

const TARGETS = ['[12사표02-04]', '[수입   01-05-04]']
const fixes = []
for (const code of TARGETS) {
  const s = ALL_STANDARDS.find((x) => x.code === code); if (!s) { console.log(code, '없음'); continue }
  const oc = origStandard(code)
  const oh = origHaeseol(code)
  fixes.push({ code, oldContent: s.content, oldExpl: s.explanation, content: oc, explanation: oh })
}
console.log('content 손상 복원 대상:')
for (const f of fixes) {
  console.log(`[${f.code}]`)
  console.log(`  content  : ${JSON.stringify(f.oldContent?.slice(0, 40))} → ${JSON.stringify((f.content || '(추출실패)').slice(0, 55))}`)
  console.log(`  explanation → ${JSON.stringify((f.explanation || '(원문해설없음/유지)').slice(0, 55))}`)
}

if (APPLY) {
  const map = new Map(fixes.map((f) => [f.code, f]))
  let n = 0
  const next = ALL_STANDARDS.map((s) => {
    const f = map.get(s.code); if (!f || !f.content) return s
    n++
    const out = { ...s, content: f.content }
    if (f.explanation) out.explanation = f.explanation // 원문 해설 있으면 교체(사표), 없으면(수입 교수학습) 유지
    return out
  })
  const bd = path.join(__dirname, '..', 'server', 'data', `backup_${stamp}_content`); mkdirSync(bd, { recursive: true }); copyFileSync(CANONICAL, path.join(bd, 'standards.js'))
  const src = readFileSync(CANONICAL, 'utf8'); const mk = 'export const ALL_STANDARDS = '; const he = src.indexOf(mk)
  writeFileSync(CANONICAL, src.slice(0, he) + mk + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n✅ 적용: ${n}건 (content 복원)`)
}
