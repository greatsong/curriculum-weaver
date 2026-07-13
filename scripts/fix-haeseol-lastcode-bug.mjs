#!/usr/bin/env node
/**
 * 해설 추출기가 "• [c1]은 …[c2]를 통해…" 불릿에서 마지막 코드 뒤 텍스트를 취해
 * 문두결손(를/을…로 시작)된 3건을 원문 첫 코드 뒤 전체 해설로 정확히 복구.
 * [c2]가 c1 해설에 언급만 되고 자기 불릿이 없으면 c2는 빈값(선별적 해설).
 * 사용: node scripts/fix-haeseol-lastcode-bug.mjs [--apply YYYYMMDD]
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANONICAL = path.join(__dirname, '..', 'server', 'data', 'standards.js')
const APPLY = process.argv.includes('--apply')
const stamp = process.argv.find((a) => /^\d{8}$/.test(a)) || 'lastcode'
const b22 = JSON.parse(readFileSync('/Users/greatsong/Downloads/outputs/2022_개정_교육과정_별책22.json', 'utf8'))['페이지별_원문'].map((p) => p.text).join('\n')
const clean = (t) => t.replace(/\s*\d{1,3}\s*[가-힣][가-힣()⋅·/ ]{0,15}(교과|계열\s*선택\s*과목)\s*교육과정\s*/g, ' ').replace(/\s+/g, ' ').trim()

function fullHaeseol(code) {
  const bare = code.replace(/[[\]]/g, '')
  const re = new RegExp('•\\s*\\[?' + bare + '\\][^•]*?(?=•\\s*\\[|\\(\\s*나\\s*\\)|가\\s*\\.\\s*내용\\s*체계|성취기준\\s*해설)', 's')
  const m = re.exec(b22)
  if (!m) return null
  let t = clean(m[0])
  // "• [code]은/는/이/에서는" 접두 제거
  t = t.replace(new RegExp('^•\\s*\\[?' + bare + '\\]?\\s*(은|는|이|가|에서는)?\\s*'), '').trim()
  return t.length > 15 ? t : null
}

const targets = { '[12사이01-01]': 'restore', '[12무제02-02]': 'restore', '[12사이01-02]': 'empty' }
const fixes = []
for (const [code, action] of Object.entries(targets)) {
  const s = ALL_STANDARDS.find((x) => x.code === code); if (!s) continue
  const val = action === 'empty' ? '' : fullHaeseol(code)
  if (val === null) { console.log(`${code}: 원문 추출 실패`); continue }
  fixes.push({ code, old: s.explanation, val })
}
console.log('타깃 복구:')
fixes.forEach((f) => console.log(`  [${f.code}] → ${JSON.stringify((f.val || '(빈값)').slice(0, 70))}`))

if (APPLY) {
  const byCode = new Map(fixes.map((f) => [f.code, f.val]))
  const next = ALL_STANDARDS.map((s) => byCode.has(s.code) ? { ...s, explanation: byCode.get(s.code) } : s)
  const bd = path.join(__dirname, '..', 'server', 'data', `backup_${stamp}_lastcode`); mkdirSync(bd, { recursive: true }); copyFileSync(CANONICAL, path.join(bd, 'standards.js'))
  const src = readFileSync(CANONICAL, 'utf8'); const mk = 'export const ALL_STANDARDS = '; const he = src.indexOf(mk)
  writeFileSync(CANONICAL, src.slice(0, he) + mk + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n✅ 적용: ${fixes.length}건`)
}
