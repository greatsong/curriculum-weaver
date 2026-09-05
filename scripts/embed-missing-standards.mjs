#!/usr/bin/env node
/**
 * OpenAI 임베딩 캐시(server/data/openai-embeddings-cache.json) 부분 갱신.
 * 정본에 있는데 캐시에 없는 성취기준(신규·복원)만 text-embedding-3-small로 계산해 추가한다.
 * 임베딩 입력은 semanticSearch.js와 동일: subject_group | subject | area | content | keywords | explanation
 *
 * 사용: node scripts/embed-missing-standards.mjs [--cache <경로>] [--dry-run] [--prune]
 *   --prune  정본에 없는 캐시 항목 제거
 * env: OPENAI_API_KEY (server/.env 자동 로드)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'
import OpenAI from 'openai'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
dotenvConfig({ path: path.join(ROOT, 'server', '.env'), override: false })
const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const CACHE = opt('--cache') || path.join(ROOT, 'server', 'data', 'openai-embeddings-cache.json')
const DRY = args.includes('--dry-run'); const PRUNE = args.includes('--prune')
const { ALL_STANDARDS } = await import(path.join(ROOT, 'server', 'data', 'standards.js'))
const keyOf = (s) => s.key || s.code
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { model: 'text-embedding-3-small', embeddings: {} }
cache.embeddings ||= {}
const have = new Set(Object.keys(cache.embeddings))
const missing = ALL_STANDARDS.filter((s) => !have.has(keyOf(s)))
const canonKeys = new Set(ALL_STANDARDS.map(keyOf))
const stale = [...have].filter((k) => !canonKeys.has(k))
console.log(`정본 ${ALL_STANDARDS.length} | 캐시 ${have.size} | 누락 ${missing.length} | 잉여 ${stale.length}`)
if (DRY) process.exit(0)
if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY 없음'); process.exit(1) }
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const textOf = (s) => [s.subject_group, s.subject, s.area, s.content, (s.keywords || []).join(', '), s.explanation].filter(Boolean).join(' | ')
let tokens = 0
for (let i = 0; i < missing.length; i += 200) {
  const batch = missing.slice(i, i + 200)
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: batch.map(textOf) })
  res.data.forEach((item, idx) => { cache.embeddings[keyOf(batch[idx])] = item.embedding })
  tokens += res.usage?.total_tokens || 0
  process.stdout.write(`\r  ${Math.min(i + 200, missing.length)}/${missing.length}`)
}
process.stdout.write('\n')
if (PRUNE) for (const k of stale) delete cache.embeddings[k]
cache.model = 'text-embedding-3-small'; cache.count = Object.keys(cache.embeddings).length
cache.total_tokens = (cache.total_tokens || 0) + tokens; cache.updated_at = new Date().toISOString()
fs.writeFileSync(CACHE, JSON.stringify(cache))
console.log(`저장: ${CACHE} (항목 ${cache.count}, 이번 토큰 ${tokens})`)
