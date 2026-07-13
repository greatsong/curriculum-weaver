#!/usr/bin/env node
/**
 * Round 1 — content 실오류 원문 복원 (비파괴). explanation·appnotes·code 불변.
 * 각 fix의 new_content는 교육부 고시 원문(별책 JSON) verbatim substring.
 * 사용: node scripts/reconcile/apply-content-fixes.mjs [--apply]
 */
import { ALL_STANDARDS } from '../../server/data/standards.js'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const CANONICAL = path.join(__dirname, '..', '..', 'server', 'data', 'standards.js')

// 원문 대조로 확정된 content 오류 (전수 1:1 대조 Round 1 산출)
const FIXES = [
  {
    code: '[12심독01-03]',
    new_content: '글의 구성 방식을 고려하여 논리적 관계를 추론한다.',
    source: '별책14 p189 (심화 영어 독해와 작문, 나.성취기준 (1)독해)',
    reason: '저장본이 엉뚱한 듣기 성취기준. explanation(해설)은 정상.',
  },
  {
    code: '[원지 02-04-03]',
    new_content: 'FTA BOM상의 항목별 입증 서류 구비를 통하여 BOM의 완성도를 높일 수 있다.',
    source: '별책23 p508 (원산지 관리, 원문은 02-04-02로 오번호)',
    reason: '저장본 content가 (가)해설 텍스트와 동일(bleed). 원문 성취기준 목록에서 복원.',
  },
  {
    code: '[12스경02-03]',
    new_content: '스포츠 행정 및 경영 분야의 관리 사례를 탐색하며 기초적인 실무를 경험한다.',
    source: '별책21 p95 (스포츠 행정 및 경영, 원문은 02-02로 오번호)',
    reason: '저장본 content가 (가)해설 텍스트와 동일(bleed). 원문 성취기준 목록에서 복원.',
  },
]

const byCode = new Map(ALL_STANDARDS.map((s) => [s.code, s]))
console.log('=== Round 1 content 복원 대상 ===')
for (const f of FIXES) {
  const s = byCode.get(f.code)
  if (!s) { console.error(`✗ 코드 없음: ${f.code}`); process.exit(1) }
  console.log(`\n[${f.code}] ${s.subject}`)
  console.log(`  기존: ${s.content.slice(0, 80)}`)
  console.log(`  복원: ${f.new_content}`)
  console.log(`  출처: ${f.source}`)
}

if (!APPLY) { console.log('\n(dry-run — --apply로 적용)'); process.exit(0) }

const fixMap = new Map(FIXES.map((f) => [f.code, f.new_content]))
let patched = 0
const next = ALL_STANDARDS.map((s) => {
  if (!fixMap.has(s.code)) return s
  patched++
  return { ...s, content: fixMap.get(s.code) }
})
const backupDir = path.join(__dirname, '..', '..', 'server', 'data', 'backup_20260713_reconcile_content')
mkdirSync(backupDir, { recursive: true })
copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
const src = readFileSync(CANONICAL, 'utf8')
const marker = 'export const ALL_STANDARDS = '
const he = src.indexOf(marker)
writeFileSync(CANONICAL, src.slice(0, he) + marker + JSON.stringify(next, null, 2) + ';\n')
console.log(`\n✅ 적용: ${patched}건 content 복원 (백업 server/data/backup_20260713_reconcile_content) — explanation·appnotes·code 불변`)
