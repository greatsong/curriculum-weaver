#!/usr/bin/env node
/**
 * 복원 신규 코드 임베딩 생성 (text-embedding-3-small). 캐시에 없는 코드만.
 * embedText 형식은 기존 파이프라인과 동일: subject_group | subject | area | content | keywords | explanation
 * 사용: node scripts/reconcile/gen-embeddings-new.mjs [--apply]
 */
import { ALL_STANDARDS } from '../../server/data/standards.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'
import OpenAI from 'openai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')
dotenvConfig({ path: path.join(ROOT, 'server', '.env'), override: true })
const APPLY = process.argv.includes('--apply')
const CACHE = path.join(ROOT, 'server', 'data', 'openai-embeddings-cache.json')

const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
const have = new Set(Object.keys(cache.embeddings))
const missing = ALL_STANDARDS.filter((s) => !have.has(s.code))
console.log(`정본 ${ALL_STANDARDS.length} / 캐시 ${have.size} / 임베딩 없는 코드 ${missing.length}`)
if (!missing.length) { console.log('생성 대상 없음'); process.exit(0) }

const embedText = (s) => {
  const parts = [s.subject_group, s.subject, s.area, s.content]
  if (s.keywords?.length) parts.push(s.keywords.join(', '))
  if (s.explanation) parts.push(s.explanation)
  return parts.filter(Boolean).join(' | ')
}

if (!APPLY) {
  console.log('(dry-run) 샘플 embedText:')
  console.log('  ' + embedText(missing[0]).slice(0, 160))
  console.log(`--apply로 ${missing.length}건 생성 (예상 ~${Math.round(missing.length * 200 / 1000)}K 토큰, text-embedding-3-small)`)
  process.exit(0)
}

const openai = new (OpenAI.default || OpenAI)({ apiKey: process.env.OPENAI_API_KEY })
const BATCH = 100
let done = 0, tokens = 0
for (let i = 0; i < missing.length; i += BATCH) {
  const batch = missing.slice(i, i + BATCH)
  const res = await openai.embeddings.create({ model: cache.model || 'text-embedding-3-small', input: batch.map(embedText) })
  res.data.forEach((item, idx) => { cache.embeddings[batch[idx].code] = item.embedding })
  tokens += res.usage.total_tokens
  done += batch.length
  process.stdout.write(`\r  임베딩 ${done}/${missing.length} (${tokens} 토큰)`)
}
cache.count = Object.keys(cache.embeddings).length
cache.created_at = cache.created_at // 유지
fs.writeFileSync(CACHE, JSON.stringify(cache))
console.log(`\n✅ 임베딩 ${done}건 추가, 캐시 총 ${cache.count} (${tokens} 토큰)`)
