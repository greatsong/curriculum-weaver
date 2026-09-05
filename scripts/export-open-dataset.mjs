#!/usr/bin/env node
/**
 * 오픈소스 데이터셋(k-curriculum-2022) 수출 — 정본 성취기준 + curriculum_links를
 * 공개 스키마로 내보낸다.
 *
 *   node scripts/export-open-dataset.mjs --out ../k-curriculum-2022/data
 *
 * 규칙:
 *  - 성취기준은 server/data/standards.js(정본) 전체. 식별자 `key`(= s.key || s.code)를
 *    모든 행에 실어, 같은 code가 두 과목에 쓰인 11건([12심독…]·[12스문…])을 구분한다.
 *  - 링크는 Supabase curriculum_links가 정본. status별로 published/candidate 파일로 나누고
 *    id·타임스탬프·reviewed_by 같은 운영 필드는 싣지 않는다(공개 스키마 유지).
 *  - 링크 끝점(source_code/target_code)은 DB 값 그대로 = key 형식. 소비자는 standards의 `key`로 조인한다.
 *  - 출력은 결정적(정렬 고정)이라 diff로 변경분을 볼 수 있다.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config as dotenvConfig } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: path.join(__dirname, '..', 'server', '.env'), override: true })

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
if (outIdx < 0 || !args[outIdx + 1]) {
  console.error('사용법: node scripts/export-open-dataset.mjs --out <k-curriculum-2022/data 경로>')
  process.exit(1)
}
const OUT = path.resolve(args[outIdx + 1])

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || url.includes('placeholder')) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요'); process.exit(1) }
const supabase = createClient(url, key)

const STANDARD_FIELDS = ['code', 'key', 'subject_group', 'subject', 'grade_group', 'school_level', 'curriculum_category', 'area', 'domain', 'content', 'keywords', 'explanation', 'application_notes']
const LINK_FIELDS = ['source_code', 'target_code', 'link_type', 'rationale', 'integration_theme', 'lesson_hook', 'semantic_score', 'quality_score', 'generation_method']

const { ALL_STANDARDS } = await import('../server/data/standards.js')
const standards = ALL_STANDARDS
  .map((s) => { const row = {}; for (const f of STANDARD_FIELDS) row[f] = f === 'key' ? (s.key || s.code) : (s[f] ?? (Array.isArray(s[f]) ? [] : '')); return row })
  .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
const keys = new Set(standards.map((s) => s.key))

async function fetchLinks(status) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('curriculum_links')
      .select(LINK_FIELDS.join(', '))
      .eq('status', status)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < 1000) break
  }
  const dangling = rows.filter((l) => !keys.has(l.source_code) || !keys.has(l.target_code))
  if (dangling.length) console.warn(`  ⚠️ ${status}: 정본에 없는 끝점 ${dangling.length}건 제외`)
  return rows.filter((l) => keys.has(l.source_code) && keys.has(l.target_code))
    .sort((a, b) => (a.source_code + a.target_code < b.source_code + b.target_code ? -1 : 1))
}

const published = await fetchLinks('published')
const candidate = await fetchLinks('candidate')

fs.mkdirSync(OUT, { recursive: true })
const write = (name, data) => { fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + '\n'); console.log(`  ${name}: ${data.length}건`) }
console.log(`📦 수출 → ${OUT}`)
write('standards.json', standards)
write('links.published.json', published)
write('links.candidate.json', candidate)

// README·KNOWN_ISSUES 갱신에 필요한 통계
const avg = (xs) => (xs.reduce((a, x) => a + x, 0) / xs.length)
const isVoc = (k) => !ALL_STANDARDS.find((s) => (s.key || s.code) === k)?.school_level
const stdByKey = new Map(ALL_STANDARDS.map((s) => [s.key || s.code, s]))
const vocPair = (l) => !stdByKey.get(l.source_code)?.school_level && !stdByKey.get(l.target_code)?.school_level
console.log('\n📊 통계')
console.log(`  성취기준 ${standards.length} · 과목 ${new Set(standards.map((s) => s.subject)).size} · 교과군 ${new Set(standards.map((s) => s.subject_group)).size}`)
console.log(`  code 중복(과목 다름) ${standards.length - new Set(standards.map((s) => s.code)).size}건 → key로 구분`)
console.log(`  school_level 빈값 ${standards.filter((s) => !s.school_level).length} · grade_group 값: ${[...new Set(standards.map((s) => s.grade_group))].join(', ')}`)
console.log(`  published ${published.length} (quality 평균 ${avg(published.map((l) => l.quality_score ?? 0)).toFixed(2)}, 최소 ${Math.min(...published.map((l) => l.quality_score ?? 1))}, 전문↔전문 ${published.filter(vocPair).length})`)
console.log(`  candidate ${candidate.length} (전문↔전문 ${candidate.filter(vocPair).length})`)
