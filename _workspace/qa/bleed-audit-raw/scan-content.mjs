import { ALL_STANDARDS } from '../../../server/data/standards.js'
import { classifyStandardQuality } from '../../../server/lib/standardsQuality.js'
import { writeFileSync } from 'node:fs'

const PUA_RE = /[\u{E000}-\u{F8FF}]/u
const HEADLESS_RE = /^(은|는|을|를|와|과|이|가|에|도|의|로|만|께|와서)\s/ // 조사로 시작
const STRICT_HEADLESS_RE = /^(은|는|을|를|와|과)\s/ // quality.js와 동일
const EXPLAIN_RE = /(이\s*성취기준은|본\s*성취기준은|여기서는|위의\s*성취기준)/
const PAGE_TAG_RE = /\d+\s*[가-힣]*\s*(교육과정|편제와|시간 배당)/
const NEXT_CODE_RE = /\[(\d{1,2}[가-힣]{1,4}\d?[-–][^\]]+|[가-힣]{2,4}\d[-–]\d)/ // 다른 성취기준 코드 침범 (대괄호 코드)
const CODE_INLINE_RE = /\[\d{2}[가-힣]{2,3}\d{2}[-–]\d{2}\]/ // 표준 성취기준 코드 패턴
const TRAILING_CLOSERS_RE = /["'’”)\]』」>]+$/

const rows = ALL_STANDARDS.map((s, i) => ({ i, ...s }))

const buckets = {
  pua: [],
  headless_strict: [],
  headless_loose_only: [], // loose 조사인데 strict 아님
  explanation: [],
  page_footer: [],
  truncated: [],
  empty_or_tiny: [], // <5자
  short: [], // 5~14자
  code_intrusion: [], // content 안에 성취기준 코드 존재
  no_terminal_punct: [], // 종결부호 없음(길이>15) — quality의 truncated와 유사
}

const codeCount = new Map()
for (const s of rows) codeCount.set(s.code, (codeCount.get(s.code) || 0) + 1)
const dupCodes = [...codeCount.entries()].filter(([, n]) => n > 1)

const mismatches = []
let flagCounts = { ok: 0 }

for (const s of rows) {
  const raw = s.content == null ? '' : String(s.content)
  const c = raw.trim()
  const ex = { code: s.code, subject_group: s.subject_group, subject: s.subject, content: raw.slice(0, 200) }

  if (PUA_RE.test(c)) {
    const chars = [...c].filter((ch) => PUA_RE.test(ch)).map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase())
    buckets.pua.push({ ...ex, pua_chars: [...new Set(chars)] })
  }
  if (!c || c.length < 5) buckets.empty_or_tiny.push({ ...ex, len: c.length })
  else if (c.length < 15) buckets.short.push({ ...ex, len: c.length })

  if (STRICT_HEADLESS_RE.test(c)) buckets.headless_strict.push(ex)
  else if (HEADLESS_RE.test(c)) buckets.headless_loose_only.push(ex)

  if (EXPLAIN_RE.test(c)) buckets.explanation.push(ex)
  if (PAGE_TAG_RE.test(c)) buckets.page_footer.push(ex)
  if (CODE_INLINE_RE.test(c)) buckets.code_intrusion.push(ex)

  const stripped = c.replace(TRAILING_CLOSERS_RE, '')
  if (stripped.length > 15 && !/[.?!]$/.test(stripped)) buckets.no_terminal_punct.push({ ...ex, tail: c.slice(-30) })

  // classifyStandardQuality 대조
  const flag = classifyStandardQuality(raw)
  flagCounts[flag] = (flagCounts[flag] || 0) + 1
}

// subject_group 분포 (no_terminal_punct 기준 — 가장 큰 버킷 예상)
function groupDist(bucket) {
  const m = {}
  for (const x of bucket) m[x.subject_group] = (m[x.subject_group] || 0) + 1
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]))
}

const summary = {
  total: rows.length,
  dup_codes: dupCodes.map(([code, n]) => ({ code, n })),
  dup_codes_count: dupCodes.length,
  counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
  classify_flag_counts: flagCounts,
  dist_no_terminal_punct: groupDist(buckets.no_terminal_punct),
  dist_pua: groupDist(buckets.pua),
  dist_empty_or_tiny: groupDist(buckets.empty_or_tiny),
  dist_short: groupDist(buckets.short),
}

writeFileSync(new URL('./content-summary.json', import.meta.url), JSON.stringify(summary, null, 2))
writeFileSync(new URL('./content-buckets.json', import.meta.url), JSON.stringify(buckets, null, 2))
console.log(JSON.stringify(summary, null, 2))
