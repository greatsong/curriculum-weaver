#!/usr/bin/env node
/**
 * 오픈소스 데이터셋(k-curriculum-2022) 수출 — 정본 성취기준 + curriculum_links를
 * 공개 스키마로 내보낸다.
 *
 *   node scripts/export-open-dataset.mjs \
 *     --out-standards ../k-curriculum-2022/data \
 *     --out-links ../k-curriculum-2022-links/data --standards-release v3.0.0
 *
 * 2026-09-06부터 데이터셋은 두 리포로 나뉜다(사용자 결정: 성취기준은 공공재로 안정적으로,
 * 연결은 빠르게 실험). 성취기준 리포는 교육부 원문 verbatim만, 연결 리포는 성취기준의 특정
 * 릴리스 태그에 고정(pin)된 AI 생성 연결만 담는다. 둘 중 하나만 지정해도 된다.
 *
 * 규칙:
 *  - 성취기준은 server/data/standards.js(정본) 전체. 식별자 `key`(= s.key || s.code)를
 *    모든 행에 실어, 같은 code가 두 과목에 쓰인 11건([12심독…]·[12스문…])을 구분한다.
 *  - 링크는 Supabase curriculum_links가 정본. status별로 published/candidate 파일로 나누고
 *    id·타임스탬프·reviewed_by 같은 운영 필드는 싣지 않는다(공개 스키마 유지).
 *  - 링크 끝점(source_code/target_code)은 DB 값 그대로 = key 형식. 소비자는 standards의 `key`로 조인한다.
 *  - candidate에서 재판정 기각 표식(quality_score 0.2)은 뺀다 — "AI 제안"이 아니라 "판정에서 떨어진 것"이다.
 *  - `domain`은 정본에서 한 번도 채워진 적이 없어 공개 스키마에서 뺀다.
 *  - data/manifest.json에 스키마 버전·출처 커밋·건수·게시 정책을 기록해 소비자가 변경을 감지하게 한다.
 *  - 출력은 결정적(정렬 고정)이라 diff로 변경분을 볼 수 있다.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config as dotenvConfig } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: path.join(__dirname, '..', 'server', '.env'), override: true })

const args = process.argv.slice(2)
const optPath = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : null }
const OUT_STD = optPath('--out-standards')
const OUT_LINKS = optPath('--out-links')
const STANDARDS_RELEASE = (() => { const i = args.indexOf('--standards-release'); return i >= 0 && args[i + 1] ? args[i + 1] : null })()
if (!OUT_STD && !OUT_LINKS) {
  console.error('사용법: node scripts/export-open-dataset.mjs [--out-standards <dir>] [--out-links <dir> --standards-release <tag>]')
  process.exit(1)
}
if (OUT_LINKS && !STANDARDS_RELEASE) {
  console.error('--out-links에는 --standards-release <성취기준 리포 태그>가 필요합니다 (연결은 성취기준 릴리스에 고정)')
  process.exit(1)
}

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || url.includes('placeholder')) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요'); process.exit(1) }
const supabase = createClient(url, key)

const STANDARD_FIELDS = ['code', 'key', 'subject_group', 'subject', 'grade_group', 'school_level', 'curriculum_category', 'area', 'content', 'keywords', 'explanation', 'application_notes', 'source_book', 'source_doc']
const SCHEMA_VERSION = 3 // 1: code 단일 키 · 2: key 도입, domain 제거 · 3: 행 단위 출처(source_book·source_doc) 추가, 성취기준·연결 리포 분리
const REJECTED_MARK = 0.2 // 앱의 재판정 기각 표식 (promoteLinks/generateLinksV2 규약)
const LINK_FIELDS = ['source_code', 'target_code', 'link_type', 'rationale', 'integration_theme', 'lesson_hook', 'semantic_score', 'quality_score', 'generation_method']

const { ALL_STANDARDS } = await import('../server/data/standards.js')

// 행 단위 출처 — 결점 0 파이프라인의 별책별 구조화 원문(scripts/audit/data/official/별책N.json)에서
// (code, subject) → 별책 번호·원문 파일명을 붙인다. 공공 데이터셋 소비자가 각 행을 교육부 원문
// 어느 문서에서 대조해야 하는지 알게 하기 위함이다.
const OFFICIAL_DIR = path.join(__dirname, 'audit', 'data', 'official')
// 별책 번호 → 교육부 문서 제목. official JSON의 source_file은 작업 파일명(b8.pdf 같은 축약 포함)이라
// 공개용 제목은 여기서 고정한다. NCIC(https://ncic.re.kr)에서 같은 제목으로 열람할 수 있다.
const BOOK_TITLES = {
  별책2: '초등학교 교육과정', 별책5: '국어과 교육과정', 별책6: '도덕과 교육과정', 별책7: '사회과 교육과정',
  별책8: '수학과 교육과정', 별책9: '과학과 교육과정', 별책10: '실과(기술·가정)/정보과 교육과정',
  별책11: '체육과 교육과정', 별책12: '음악과 교육과정', 별책13: '미술과 교육과정', 별책14: '영어과 교육과정',
  별책16: '제2외국어과 교육과정', 별책17: '한문과 교육과정', 별책18: '중학교 선택 교과 교육과정',
  별책19: '고등학교 교양 교과 교육과정', 별책20: '과학 계열 선택 과목 교육과정',
  별책21: '체육 계열 선택 과목 교육과정', 별책22: '예술 계열 선택 교과 교육과정', 별책23: '경영·금융 전문 교과 교육과정',
}
const provenance = new Map() // "code\tsubject" -> { book, doc }
if (fs.existsSync(OFFICIAL_DIR)) {
  for (const f of fs.readdirSync(OFFICIAL_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(OFFICIAL_DIR, f), 'utf8'))
    if (!BOOK_TITLES[j.byeolchaek]) throw new Error(`BOOK_TITLES에 없는 별책: ${j.byeolchaek} (${f})`)
    const doc = `[${j.byeolchaek}] ${BOOK_TITLES[j.byeolchaek]}`
    for (const subj of j.subjects || []) for (const area of subj.areas || []) for (const c of area.codes || []) {
      const k = `${c.code}\t${subj.subject}`
      if (!provenance.has(k)) provenance.set(k, { book: j.byeolchaek, doc })
    }
  }
}
let unsourced = 0
const standards = ALL_STANDARDS
  .map((s) => {
    const row = {}
    for (const f of STANDARD_FIELDS) row[f] = f === 'key' ? (s.key || s.code) : (s[f] ?? (Array.isArray(s[f]) ? [] : ''))
    const pv = provenance.get(`${s.code}\t${s.subject}`) || [...provenance.entries()].find(([k]) => k.startsWith(`${s.code}\t`))?.[1]
    if (pv) { row.source_book = pv.book; row.source_doc = pv.doc } else { row.source_book = ''; row.source_doc = ''; unsourced++ }
    return row
  })
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

let sourceCommit = 'unknown'
try { sourceCommit = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..') }).toString().trim() } catch {}
const writeJson = (dir, name, data, pretty) => { fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, pretty ? 2 : 1) + '\n') }
const identity = { field: 'key', note: 'key === code 가 기본. 같은 code가 두 과목에 쓰인 11건만 "code|subject" 형식.' }

// ── 성취기준 리포 ──
if (OUT_STD) {
  fs.mkdirSync(OUT_STD, { recursive: true })
  writeJson(OUT_STD, 'standards.json', standards)
  writeJson(OUT_STD, 'manifest.json', {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source: { app: 'greatsong/curriculum-weaver', commit: sourceCommit, file: 'server/data/standards.js', origin: '교육부 고시 2022 개정 교육과정 별책(NCIC)' },
    counts: {
      standards: standards.length,
      subjects: new Set(standards.map((s) => s.subject)).size,
      subject_groups: new Set(standards.map((s) => s.subject_group)).size,
    },
    identity,
  }, true)
  console.log(`📦 성취기준 → ${OUT_STD}: standards.json ${standards.length}건, manifest.json`)
}

// ── 연결 리포 (성취기준 릴리스에 고정) ──
if (OUT_LINKS) {
  const published = await fetchLinks('published')
  const candidateAll = await fetchLinks('candidate')
  const candidate = candidateAll.filter((l) => l.quality_score == null || l.quality_score > REJECTED_MARK)
  console.log(`  candidate 중 기각 표식(≤${REJECTED_MARK}) ${candidateAll.length - candidate.length}건 제외`)
  fs.mkdirSync(OUT_LINKS, { recursive: true })
  writeJson(OUT_LINKS, 'links.published.json', published)
  writeJson(OUT_LINKS, 'links.candidate.json', candidate)
  writeJson(OUT_LINKS, 'manifest.json', {
    schema_version: 1, // 연결 리포 자체의 스키마 버전 (분리 시점 2026-09-06 = 1)
    generated_at: new Date().toISOString(),
    source: { app: 'greatsong/curriculum-weaver', commit: sourceCommit, table: 'supabase curriculum_links' },
    standards_release: { repo: 'greatsong/k-curriculum-2022', tag: STANDARDS_RELEASE, standards: standards.length },
    counts: { links_published: published.length, links_candidate: candidate.length },
    identity: { ...identity, note: identity.note + ' 링크 끝점(source_code/target_code)은 성취기준의 key 값.' },
    policy: {
      published_min_quality: 0.7,
      published_excludes_vocational_pairs: true,
      vocational_subject_group: '산업수요전문',
      candidate_excludes_rejected: true,
    },
  }, true)
  console.log(`📦 연결 → ${OUT_LINKS}: published ${published.length} · candidate ${candidate.length} · manifest(standards ${STANDARDS_RELEASE})`)
}

console.log(`\n📊 성취기준 ${standards.length} · 과목 ${new Set(standards.map((s) => s.subject)).size} · 교과군 ${new Set(standards.map((s) => s.subject_group)).size} · code 중복(과목 다름) ${standards.length - new Set(standards.map((s) => s.code)).size}건 → key로 구분 · 출처(별책) 미매핑 ${unsourced}건`)
console.log(`  별책별: ${Object.entries(standards.reduce((o, s) => { o[s.source_book || '(없음)'] = (o[s.source_book || '(없음)'] || 0) + 1; return o }, {})).sort().map(([k, v]) => k + ' ' + v).join(' · ')}`)
