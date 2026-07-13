#!/usr/bin/env node
/**
 * explanation 앞절단(front-truncation) 원문 복원. 저장본이 해설 앞부분을 잃은 케이스를
 * 원문 완전 해설(GT)로 교체. explanation만 변경(content·(나)·code 불변).
 * 가드: 새 값이 원문 substring·기존 저장본(꼬리)을 포함·footer/PUA/코드bleed 없음·정상 종결.
 * 사용: node scripts/reconcile/apply-expl-fixes.mjs [--apply]
 */
import { ALL_STANDARDS } from '../../server/data/standards.js'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const CANONICAL = path.join(__dirname, '..', '..', 'server', 'data', 'standards.js')
const GTE = JSON.parse(readFileSync(path.join(__dirname, 'results', 'groundtruth-expl.json'), 'utf8'))

const nk = (c) => c.replace(/\s+/g, '').replace(/–/g, '-')
const gteByNk = {}; for (const [k, v] of Object.entries(GTE)) gteByNk[nk(k)] = v
const PUA = /[\u{E000}-\u{F8FF}]/u
const FOOT = /선택\s*중심|계열\s*선택\s*과목\s*교육과정|[가-힣0-9]{1,10}과\s*교육과정|(일반|진로|융합)\s*선택\s*[-–—]/
const CC = /\[[0-9가-힣][0-9가-힣 \-·]*?[0-9]{1,2}-[0-9]{2}\]/
const norm = (s) => String(s || '').replace(/[\u{E000}-\u{F8FF}]/gu, '').replace(/[‘’＇]/g, "'").replace(/[“”]/g, '"').replace(/[⋅·․•]/g, '·').replace(/[–—]/g, '-').replace(/\s+/g, '')
// GT footer/코드 정리(compose와 동일 취지, 간소판)
function clean(t) {
  return String(t || '')
    .replace(new RegExp('^\\s*~?\\s*(\\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \\-·–]*?[0-9]{1,2}[-–][0-9]{2}\\]\\s*[~,]?\\s*)+\\s*(에서는|은|는|이|가|에서|,)?\\s*'), '')
    .replace(/[]/g, '•')
    .replace(/\d{1,4}\s*선택\s*중심\s*교육과정\s*[–—\-]\s*[가-힣]+(\s*[가-힣]+)?\s*과목\s*[–—\-]?/g, ' ')
    .replace(/\d{1,4}\s*[가-힣0-9]{1,10}과\s*교육과정/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

const fixes = []
for (const s of ALL_STANDARDS) {
  const stored = s.explanation || ''
  const gt = gteByNk[nk(s.code)]?.haeseol
  if (!stored || !gt) continue
  if (PUA.test(gt)) continue
  // 저장본이 이미 정상 문두("이 성취기준"·"이 성취")면 앞절단 아님 → 스킵
  if (/^이\s*성취기준|^이\s*성취/.test(stored.trim())) continue
  const newExpl = clean(gt)
  const a = norm(stored).replace(/·+$/, ''), b = norm(newExpl)
  if (!a || a.length < 5) continue
  // 앞절단: 정리된 GT가 저장본(꼬리)으로 끝나고 앞에서 ≥8자 더 김
  if (!(b.endsWith(a) && b.length - a.length >= 8)) continue
  // 가드
  if (PUA.test(newExpl) || FOOT.test(newExpl)) continue
  if (norm(newExpl).length < norm(stored).length) continue // 축소 방지
  if (!norm(newExpl).endsWith(norm(stored).replace(/·+$/, ''))) continue // 기존 꼬리 포함 확인
  fixes.push({ code: s.code, subject: s.subject, old: stored, new: newExpl })
}

console.log(`explanation 앞절단 복원 대상: ${fixes.length}`)
const bySubj = {}; for (const f of fixes) bySubj[f.subject] = (bySubj[f.subject] || 0) + 1
console.log('과목별:', JSON.stringify(bySubj))
for (const f of fixes.slice(0, 3)) { console.log(`\n[${f.code}] ${f.subject}`); console.log(`  기존: ${f.old.slice(0, 60)}`); console.log(`  복원: ${f.new.slice(0, 90)}`) }

if (!APPLY) { console.log('\n(dry-run — --apply로 적용)'); process.exit(0) }
const fixMap = new Map(fixes.map((f) => [f.code, f.new]))
const next = ALL_STANDARDS.map((s) => fixMap.has(s.code) ? { ...s, explanation: fixMap.get(s.code) } : s)
const backupDir = path.join(__dirname, '..', '..', 'server', 'data', 'backup_20260713_expl_fronttrunc')
mkdirSync(backupDir, { recursive: true }); copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
const src = readFileSync(CANONICAL, 'utf8'); const marker = 'export const ALL_STANDARDS = '; const he = src.indexOf(marker)
writeFileSync(CANONICAL, src.slice(0, he) + marker + JSON.stringify(next, null, 2) + ';\n')
console.log(`\n✅ ${fixes.length}건 explanation 복원 (백업 backup_20260713_expl_fronttrunc) — content·(나)·code 불변`)
