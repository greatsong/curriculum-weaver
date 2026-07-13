#!/usr/bin/env node
/**
 * explanation 복원으로 텍스트가 바뀐 성취기준의 OpenAI 임베딩 재계산.
 * (임베딩 입력 = subject_group|subject|area|content|keywords|explanation. appnotes 미포함이라
 *  (나) 복원분은 제외, explanation 변경분만 대상)
 *
 * 대상 코드 = explanation-bleed-fixes + haeseol-restore-fixes + industrial-bleed-fixes.
 * 텍스트 소스 = 이 워크트리의 복원된 standards.js(최종본).
 * 캐시 = 프로덕션 openai-embeddings-cache.json (기본: 메인 트리). --cache 로 지정 가능.
 * 키 = 메인 트리 server/.env 의 OPENAI_API_KEY.
 *
 * 사용: node scripts/recompute-embeddings-for-bleed.mjs [--apply]
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const MAIN = '/Users/greatsong/greatsong-project/curriculum-weaver'
const APPLY = process.argv.includes('--apply')
const require = createRequire(path.join(MAIN, 'server', 'index.js'))

// 대상 코드: explanation이 바뀐 3트랙
const RESULTS = path.join(__dirname, 'results')
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf8')) } catch { return { fixes: [] } } }
const codes = new Set()
for (const f of ['explanation-bleed-fixes.json', 'haeseol-restore-fixes.json', 'industrial-bleed-fixes.json']) {
  for (const fx of load(f).fixes) if (fx.new_explanation !== undefined) codes.add(fx.code)
}
const changedCodes = [...codes]
const byCode = new Map(ALL_STANDARDS.map((s) => [s.code, s]))
console.log(`explanation 변경 코드(임베딩 재계산 대상): ${changedCodes.length}`)

// env
const env = Object.fromEntries(
  fs.readFileSync(path.join(MAIN, 'server', '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const CACHE = path.join(MAIN, 'server', 'data', 'openai-embeddings-cache.json')
const embedText = (s) => {
  const parts = [s.subject_group, s.subject, s.area, s.content]
  if (s.keywords?.length) parts.push(s.keywords.join(', '))
  if (s.explanation) parts.push(s.explanation)
  return parts.filter(Boolean).join(' | ')
}

if (!APPLY) {
  console.log('[dry-run] 재계산 예정. 샘플 임베딩 텍스트:')
  console.log('  ' + embedText(byCode.get(changedCodes[0])).slice(0, 120))
  console.log('실행하려면 --apply')
  process.exit(0)
}
if (!env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY 없음'); process.exit(1) }

const OpenAI = require('openai')
const openai = new (OpenAI.default || OpenAI)({ apiKey: env.OPENAI_API_KEY })
const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
let tokens = 0, done = 0
for (let i = 0; i < changedCodes.length; i += 500) {
  const batch = changedCodes.slice(i, i + 500).map((c) => byCode.get(c)).filter(Boolean)
  const res = await openai.embeddings.create({ model: cache.model || 'text-embedding-3-small', input: batch.map(embedText) })
  tokens += res.usage.total_tokens
  res.data.forEach((item, idx) => { cache.embeddings[batch[idx].code] = item.embedding })
  done += batch.length
  console.log(`  배치 ${Math.floor(i / 500) + 1}/${Math.ceil(changedCodes.length / 500)} (${done}/${changedCodes.length})`)
}
cache.created_at = new Date().toISOString()
cache.total_tokens = (cache.total_tokens || 0) + tokens
fs.writeFileSync(CACHE, JSON.stringify(cache))
console.log(`✅ 임베딩 재계산: ${done}건, ${tokens} 토큰 → ${CACHE}`)
