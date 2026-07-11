/**
 * 수동 확보한 성취기준 원문을 정본·Supabase·임베딩 캐시에 일괄 적용 (2026-07-11)
 *
 * 입력: JSON 배열 [{ code, content, source, confidence }]
 *  - confidence가 "high"인 항목만 적용 (그 외는 건너뛰고 목록 출력)
 *  - content가 null이면 건너뜀
 *
 * 실행:
 *   node scripts/apply-manual-standard-fixes.mjs scripts/results/restore-manual-20260711.json --dry-run
 *   node scripts/apply-manual-standard-fixes.mjs scripts/results/restore-manual-20260711.json
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const require = createRequire(path.join(ROOT, 'server', 'index.js'))
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

const INPUT = process.argv[2]
const DRY = process.argv.includes('--dry-run')
if (!INPUT) { console.error('사용법: node scripts/apply-manual-standard-fixes.mjs <fixes.json> [--dry-run]'); process.exit(1) }

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'server', '.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const STOP_WORDS = new Set([
  '있다', '한다', '이해', '설명', '수', '것', '대한', '위해', '통해',
  '관련', '다양한', '활용', '과정', '바탕', '기반', '능력', '기르기',
  '위한', '대해', '등', '및', '또는', '이를', '함으로써', '하고',
  '하여', '하는', '것이다', '있는', '되는', '하기', '같은', '가지',
  '따라', '적절한', '적절히', '필요한', '중요한', '알고', '알아',
])
function extractKeywords(text, maxCount = 5) {
  if (!text) return []
  const tokens = text.match(/[가-힣]{2,}/g) || []
  const freq = {}
  tokens.filter(t => !STOP_WORDS.has(t)).forEach(t => { freq[t] = (freq[t] || 0) + 1 })
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, maxCount).map(([w]) => w)
}

const fixes = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
const applicable = fixes.filter(f => f.content && f.confidence === 'high')
const skipped = fixes.filter(f => !f.content || f.confidence !== 'high')
console.log(`입력 ${fixes.length}건 — 적용 대상(high) ${applicable.length}건 / 보류 ${skipped.length}건`)
skipped.forEach(f => console.log(`  보류: ${f.code} (${f.confidence}${f.note ? ' — ' + f.note : ''})`))
if (!applicable.length) process.exit(0)

// ── 1. 정본 standards.js 갱신 ──
const CANONICAL = path.join(ROOT, 'server', 'data', 'standards.js')
const { ALL_STANDARDS } = await import(CANONICAL)
const fixByCode = new Map(applicable.map(f => [f.code, f]))
let patched = 0
const next = ALL_STANDARDS.map(s => {
  const f = fixByCode.get(s.code)
  if (!f) return s
  const out = { ...s }
  const oldContent = (s.content || '').trim()
  // 기존 오염 content가 해설체였다면 explanation으로 보존 (비어 있을 때만)
  if (!(out.explanation || '').trim() && /^(이\s*)?성취기준은\s|^(은|는|을|를|와|과)\s/.test(oldContent)) {
    out.explanation = oldContent.replace(/^(은|는|을|를|와|과)\s+/, '').replace(/^성취기준은\s+/, '이 성취기준은 ')
  }
  out.content = f.content.trim()
  out.keywords = extractKeywords(out.content + ' ' + (out.area || ''))
  patched++
  console.log(`  ${s.code}: ${oldContent.slice(0, 30)}… → ${out.content.slice(0, 50)}`)
  return out
})
console.log(`[1] 정본 갱신: ${patched}건${DRY ? ' (dry-run, 미저장)' : ''}`)

if (!DRY) {
  const src = fs.readFileSync(CANONICAL, 'utf8')
  const headerEnd = src.indexOf('export const ALL_STANDARDS = ')
  const header = src.slice(0, headerEnd)
  fs.writeFileSync(CANONICAL, header + 'export const ALL_STANDARDS = ' + JSON.stringify(next, null, 2) + ';\n')
}

// ── 2. Supabase 동기화 ──
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
let dbUpdated = 0
for (const f of applicable) {
  const canon = next.find(s => s.code === f.code)
  if (!canon) continue
  if (!DRY) {
    const { error } = await db.from('curriculum_standards')
      .update({ content: canon.content, keywords: canon.keywords })
      .eq('code', f.code)
    if (error) { console.error(`  ${f.code} DB 실패:`, error.message); continue }
  }
  dbUpdated++
}
console.log(`[2] Supabase 동기화: ${dbUpdated}건${DRY ? ' (dry-run)' : ''}`)

// ── 3. 임베딩 재계산 ──
if (DRY) { console.log('[3] dry-run: 임베딩 생략'); process.exit(0) }
if (!env.OPENAI_API_KEY) { console.log('[3] OPENAI_API_KEY 없음 — 생략'); process.exit(0) }
const CACHE = path.join(ROOT, 'server', 'data', 'openai-embeddings-cache.json')
const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
const OpenAICtor = OpenAI.default || OpenAI
const openai = new OpenAICtor({ apiKey: env.OPENAI_API_KEY })
const targets = applicable.map(f => next.find(s => s.code === f.code)).filter(Boolean)
const embedText = (s) => {
  const parts = [s.subject_group, s.subject, s.area, s.content]
  if (s.keywords?.length) parts.push(s.keywords.join(', '))
  if (s.explanation) parts.push(s.explanation)
  return parts.filter(Boolean).join(' | ')
}
const res = await openai.embeddings.create({ model: cache.model || 'text-embedding-3-small', input: targets.map(embedText) })
res.data.forEach((item, idx) => { cache.embeddings[targets[idx].code] = item.embedding })
fs.writeFileSync(CACHE, JSON.stringify(cache))
console.log(`[3] 임베딩 재계산: ${targets.length}건 (${res.usage.total_tokens} 토큰)`)
console.log('\n적용 완료 — 서버 재시작 필요')
