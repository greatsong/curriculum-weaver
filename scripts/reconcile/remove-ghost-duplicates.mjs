#!/usr/bin/env node
/**
 * Round 1 — 공백변형 중복(유령) 레코드 제거. 정본 4,856 → 4,854.
 * 유령: 원문 (나)고려사항 섹션 코드를 파서가 성취기준으로 잘못 생성한 것.
 *   [수입   01-05-02](공백3, content=bleed) / [수입   01-05-04](공백3, content=bleed)
 * 각각 정상 단일공백 쌍둥이 존재. 정상본 content·explanation·appnotes는 원문 확정.
 * ⚠ [수입   01-05-04]는 Supabase curriculum_links 3건이 참조 → remap-ghost-links.mjs 병행 필수.
 * 사용: node scripts/reconcile/remove-ghost-duplicates.mjs [--apply]
 */
import { ALL_STANDARDS } from '../../server/data/standards.js'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const CANONICAL = path.join(__dirname, '..', '..', 'server', 'data', 'standards.js')

const GHOSTS = ['[수입   01-05-02]', '[수입   01-05-04]'] // 공백3 변형(원시 문자열 정확)

// 안전 검증: 각 유령에 대응하는 정상 단일공백본이 존재하고, 유령만 오염인지 확인
const byRaw = new Map(ALL_STANDARDS.map((s) => [s.code, s]))
const normSpace = (c) => c.replace(/\s+/g, ' ')
console.log('=== 유령 제거 대상 검증 ===')
for (const gc of GHOSTS) {
  const ghost = byRaw.get(gc)
  if (!ghost) { console.error(`✗ 유령 코드 없음(이미 제거?): ${JSON.stringify(gc)}`); process.exit(1) }
  const canonCode = normSpace(gc)
  const canon = byRaw.get(canonCode)
  if (!canon) { console.error(`✗ 정상본 없음: ${JSON.stringify(canonCode)} — 삭제 시 코드 소실 위험, 중단`); process.exit(1) }
  console.log(`\n유령 ${JSON.stringify(gc)}`)
  console.log(`  content: ${ghost.content.slice(0, 60)}`)
  console.log(`정상본 ${JSON.stringify(canonCode)}`)
  console.log(`  content: ${canon.content.slice(0, 60)}`)
}

const ghostSet = new Set(GHOSTS)
const next = ALL_STANDARDS.filter((s) => !ghostSet.has(s.code))
console.log(`\n정본: ${ALL_STANDARDS.length} → ${next.length} (제거 ${ALL_STANDARDS.length - next.length})`)
// 잔여 공백무시 중복 0 확인
const seen = new Set(), dups = []
for (const s of next) { const k = s.code.replace(/\s+/g, ''); if (seen.has(k)) dups.push(k); else seen.add(k) }
console.log(`제거 후 공백무시 중복: ${dups.length} ${dups.slice(0, 5).join(' ')}`)

if (!APPLY) { console.log('\n(dry-run — --apply로 적용)'); process.exit(0) }
if (dups.length) { console.error('✗ 잔여 중복 존재 — 중단'); process.exit(1) }

const backupDir = path.join(__dirname, '..', '..', 'server', 'data', 'backup_20260713_reconcile_dedup')
mkdirSync(backupDir, { recursive: true })
copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
const src = readFileSync(CANONICAL, 'utf8')
const marker = 'export const ALL_STANDARDS = '
const he = src.indexOf(marker)
writeFileSync(CANONICAL, src.slice(0, he) + marker + JSON.stringify(next, null, 2) + ';\n')
console.log(`\n✅ 적용: 유령 2건 제거, 정본 ${next.length} (백업 server/data/backup_20260713_reconcile_dedup)`)
console.log('⚠ 다음: node scripts/reconcile/remap-ghost-links.mjs --apply (Supabase 링크 3건 remap, 머지 승인 시점)')
