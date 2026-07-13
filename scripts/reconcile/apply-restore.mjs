#!/usr/bin/env node
/**
 * 조립된 누락 레코드를 정본 standards.js에 병합(append, 비파괴).
 * 무결성 게이트: 코드 충돌 0·공백무시 중복 0·필수필드·content 종결 확인 후에만 적용.
 * 사용: node scripts/reconcile/apply-restore.mjs --file composed-social [--apply]
 */
import { ALL_STANDARDS } from '../../server/data/standards.js'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d }
const FILE = arg('file'), APPLY = process.argv.includes('--apply')
const CANONICAL = path.join(__dirname, '..', '..', 'server', 'data', 'standards.js')
const add = JSON.parse(readFileSync(path.join(__dirname, 'results', FILE + '.json'), 'utf8'))
const nk = (c) => c.replace(/\s+/g, '').replace(/–/g, '-')

// ── 무결성 게이트 ──
const canonRaw = new Set(ALL_STANDARDS.map((s) => s.code))
const canonNk = new Set(ALL_STANDARDS.map((s) => nk(s.code)))
const errs = []
const seen = new Set()
const KEYS = ['code', 'subject_group', 'subject', 'grade_group', 'school_level', 'curriculum_category', 'area', 'domain', 'content', 'keywords', 'explanation', 'application_notes']
for (const r of add) {
  if (canonRaw.has(r.code) || canonNk.has(nk(r.code))) errs.push(`충돌(정본에 이미 존재): ${r.code}`)
  if (seen.has(nk(r.code))) errs.push(`배치 내 중복: ${r.code}`); seen.add(nk(r.code))
  if (!r.subject) errs.push(`subject 빈값: ${r.code}`)
  if (!r.content || r.content.length < 8) errs.push(`content 부실: ${r.code}`)
  if (!/[.?!]["'’”)\]]*$/.test((r.content || '').trim())) errs.push(`content 미종결: ${r.code}`)
  for (const key of KEYS) if (!(key in r)) errs.push(`필드 누락 ${key}: ${r.code}`)
}
console.log(`병합 대상: ${add.length} / 무결성 오류: ${errs.length}`)
if (errs.length) { errs.slice(0, 15).forEach((e) => console.error('  ✗ ' + e)); process.exit(1) }

const next = [...ALL_STANDARDS, ...add]
// 최종 중복 재확인
const dupCheck = new Set(), dups = []
for (const s of next) { const k = nk(s.code); if (dupCheck.has(k)) dups.push(k); else dupCheck.add(k) }
console.log(`병합 후 정본: ${next.length} / 공백무시 중복: ${dups.length}`)
if (dups.length) { console.error('중복:', dups.slice(0, 5)); process.exit(1) }

// 과목별 요약
const subs = {}; for (const r of add) subs[r.subject] = (subs[r.subject] || 0) + 1
console.log('추가 과목:', JSON.stringify(subs))

if (!APPLY) { console.log('\n(dry-run — --apply로 병합)'); process.exit(0) }
const backupDir = path.join(__dirname, '..', '..', 'server', 'data', `backup_20260713_restore_${FILE}`)
mkdirSync(backupDir, { recursive: true })
copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
const src = readFileSync(CANONICAL, 'utf8')
const marker = 'export const ALL_STANDARDS = '
const he = src.indexOf(marker)
writeFileSync(CANONICAL, src.slice(0, he) + marker + JSON.stringify(next, null, 2) + ';\n')
console.log(`\n✅ 병합: +${add.length}건, 정본 ${ALL_STANDARDS.length} → ${next.length} (백업 server/data/backup_20260713_restore_${FILE})`)
