/**
 * 복원된 성취기준을 Supabase에 동기화 + 임베딩 부분 재계산 (2026-07-11)
 *
 * restore-standards-from-backup.mjs 실행 후 사용.
 *  1. 변경 코드(scripts/results/restore-changes-20260711.json)에 대해 Supabase
 *     curriculum_standards의 content·keywords를 정본 값으로 강제 교체,
 *     explanation은 DB가 비어 있을 때만 채움 (기존 rich 메타·id·embedding 컬럼 보존)
 *  2. DB 전체 keywords에서 불릿(•·▪ 등)·1글자 노이즈 항목 제거 (레거시 ETL 잔재)
 *  3. openai-embeddings-cache.json에서 변경 코드만 재임베딩 (text-embedding-3-small)
 *
 * 실행:
 *   node scripts/sync-restored-standards.mjs --dry-run
 *   node scripts/sync-restored-standards.mjs
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

const DRY = process.argv.includes('--dry-run')
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'server', '.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { ALL_STANDARDS } = await import(path.join(ROOT, 'server', 'data', 'standards.js'))
const byCode = new Map(ALL_STANDARDS.map(s => [s.code, s]))
const changes = JSON.parse(fs.readFileSync(path.join(__dirname, 'results', 'restore-changes-20260711.json'), 'utf8'))
const changedCodes = changes.map(c => c.code)
console.log(`변경 코드: ${changedCodes.length}건`)

// ── 1. 변경 코드 content/keywords/explanation 동기화 ──
let updated = 0, explFilled = 0, missing = 0
for (let i = 0; i < changedCodes.length; i += 100) {
  const batch = changedCodes.slice(i, i + 100)
  const { data: rows, error } = await db.from('curriculum_standards')
    .select('id, code, explanation').in('code', batch)
  if (error) { console.error('조회 실패:', error.message); process.exit(1) }
  const dbByCode = new Map(rows.map(r => [r.code, r]))
  for (const code of batch) {
    const canon = byCode.get(code)
    const row = dbByCode.get(code)
    if (!canon || !row) { missing++; continue }
    const patch = { content: canon.content, keywords: canon.keywords }
    if (!(row.explanation || '').trim() && (canon.explanation || '').trim()) {
      patch.explanation = canon.explanation
      explFilled++
    }
    if (!DRY) {
      const { error: uErr } = await db.from('curriculum_standards').update(patch).eq('id', row.id)
      if (uErr) { console.error(`  ${code} 업데이트 실패:`, uErr.message); continue }
    }
    updated++
  }
  process.stdout.write(`\r  동기화: ${Math.min(i + 100, changedCodes.length)}/${changedCodes.length}`)
}
console.log(`\n[1] content/keywords 교체 ${updated}건 (explanation 채움 ${explFilled}, DB에 없음 ${missing})`)

// ── 2. DB 전체 keywords 불릿/1글자 노이즈 제거 ──
let noiseFixed = 0, from = 0
while (true) {
  const { data, error } = await db.from('curriculum_standards')
    .select('id, code, keywords').range(from, from + 999)
  if (error) { console.error(error.message); break }
  if (!data?.length) break
  for (const r of data) {
    const kw = r.keywords || []
    const clean = kw.filter(k => typeof k === 'string' && k.trim().length > 1 && !/[•·▪‣∙◦]/.test(k))
    if (clean.length !== kw.length) {
      if (!DRY) await db.from('curriculum_standards').update({ keywords: clean }).eq('id', r.id)
      noiseFixed++
    }
  }
  if (data.length < 1000) break
  from += 1000
}
console.log(`[2] keywords 노이즈 정리: ${noiseFixed}행`)

// ── 3. 임베딩 부분 재계산 (변경 코드만) ──
const CACHE = path.join(ROOT, 'server', 'data', 'openai-embeddings-cache.json')
if (!env.OPENAI_API_KEY) {
  console.log('[3] OPENAI_API_KEY 없음 — 임베딩 재계산 생략')
} else if (DRY) {
  console.log(`[3] --dry-run: 임베딩 ${changedCodes.length}건 재계산 예정 (생략)`)
} else {
  const OpenAICtor = OpenAI.default || OpenAI
  const openai = new OpenAICtor({ apiKey: env.OPENAI_API_KEY })
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
  // semanticSearch.js의 ensureEmbeddingsCache와 동일한 텍스트 구성
  const embedText = (s) => {
    const parts = [s.subject_group, s.subject, s.area, s.content]
    if (s.keywords?.length) parts.push(s.keywords.join(', '))
    if (s.explanation) parts.push(s.explanation)
    return parts.filter(Boolean).join(' | ')
  }
  let tokens = 0
  for (let i = 0; i < changedCodes.length; i += 500) {
    const batch = changedCodes.slice(i, i + 500).map(c => byCode.get(c)).filter(Boolean)
    const res = await openai.embeddings.create({
      model: cache.model || 'text-embedding-3-small',
      input: batch.map(embedText),
    })
    tokens += res.usage.total_tokens
    res.data.forEach((item, idx) => { cache.embeddings[batch[idx].code] = item.embedding })
    console.log(`  임베딩 배치 ${Math.floor(i / 500) + 1}/${Math.ceil(changedCodes.length / 500)}`)
  }
  cache.created_at = new Date().toISOString()
  cache.total_tokens = (cache.total_tokens || 0) + tokens
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  console.log(`[3] 임베딩 재계산 완료: ${changedCodes.length}건, ${tokens} 토큰`)
}
console.log('\n동기화 완료')
