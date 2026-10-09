/**
 * 미래 보기 2 — 화면 공용 순수 함수 (URL 상태, 성취기준 검색·코드 여러 개 붙여 넣기)
 */
export const FUTURE_MIN = 2
export const FUTURE_MAX = 7
export const FUTURE_TIPS = 8 // 별의 꼭지 = 관점 8개 (서버 FUTURE_LENSES와 같은 순서)

export const FUTURE_MODEL_OPTIONS = [
  { id: 'fast', label: '빠른', model: 'Sonnet 5.5' },
  { id: 'precise', label: '정밀', model: 'Opus 5.5' },
]

/** ?codes=k1,k2&model=precise → { keys, model } (중복 제거, 최대 7개) */
export function parseFuturesSearch(search) {
  const params = new URLSearchParams(search || '')
  const value = params.get('codes') || ''
  let candidates = value.split(',')
  // 충돌 키의 과목명에 쉼표가 있을 수 있다. 새 URL은 이 경우만 JSON 배열로 보존한다.
  if (value.startsWith('["')) {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) candidates = parsed } catch { /* 기존 쉼표 URL 처리 */ }
  }
  const keys = []
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue
    const key = raw.trim()
    if (key && !keys.includes(key)) keys.push(key)
    if (keys.length === FUTURE_MAX) break
  }
  return { keys, model: params.get('model') === 'precise' ? 'precise' : 'fast' }
}

/** { keys, model } → '?codes=...&model=...' (빠른 모드는 생략) */
export function buildFuturesSearch(keys, model) {
  const params = new URLSearchParams()
  if (keys.length) params.set('codes', keys.some(key => key.includes(',')) ? JSON.stringify(keys) : keys.join(','))
  if (model === 'precise') params.set('model', 'precise')
  const s = params.toString()
  return s ? `?${s}` : ''
}

/** 서버 목록({ fields, rows }) → 성취기준 객체 배열 */
export function catalogFromBody(body) {
  const fields = body?.fields || []
  return (body?.rows || []).map((row) => Object.fromEntries(fields.map((f, i) => [f, row[i]])))
}

/** 코드 비교용 정규화: 대괄호·공백·하이픈·점 제거, 소문자 — "12 생과 01-05" = "[12생과01-05]" */
export const normCode = (s) => String(s ?? '').toLowerCase().replace(/[[\]\s\-–—_.]/g, '')
const squash = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '')

/**
 * 성취기준 검색 — 코드를 아는 교사가 빨리 찾도록 코드 일치를 맨 앞에 둔다.
 * 띄어쓰기는 무시하고(개인정보 = 개인 정보), 낱말이 여럿이면 모두 들어 있어야 한다.
 */
/** subject = 교과군(subject_group) 일치, subjectExact = 과목(subject) 정확 일치. 교과군은 40개 제한에 뒤 과목이 가려지므로 과목 선택을 함께 둔다(2026-10-09). */
export function searchStandards(list, query, { level = '', subject = '', subjectExact = '', exclude = new Set(), limit = 60 } = {}) {
  const q = String(query || '').trim().toLowerCase()
  if (!q && !subject && !subjectExact) return []
  const tokens = q.split(/\s+/).filter(Boolean).map(squash)
  const qCode = normCode(q)
  const scored = []
  for (const s of list || []) {
    if (exclude.has(s.key)) continue
    if (level && s.school_level !== level) continue
    if (subject && (s.subject_group || s.subject) !== subject) continue
    if (subjectExact && s.subject !== subjectExact) continue
    if (!q) { scored.push([0, s]); continue }
    const nc = normCode(s.code), sub = squash(s.subject), con = squash(s.content)
    let score
    if (nc === qCode) score = -1 // 코드 정확 일치
    else if (qCode.length >= 3 && nc.includes(qCode)) score = 0 // 코드 일부 일치
    else {
      const all = `${nc}|${sub}|${con}`
      if (!tokens.every((tk) => all.includes(tk) || all.includes(normCode(tk)))) continue
      if (q.length < 2) continue // 한 글자 낱말 검색은 너무 넓다
      score = nc.includes(normCode(tokens[0])) ? 0 : sub.includes(tokens[0]) ? 1 : 2
    }
    scored.push([score, s])
  }
  scored.sort((a, b) => a[0] - b[0] || String(a[1].code).localeCompare(String(b[1].code)))
  return scored.slice(0, limit).map(([, s]) => s)
}

/** 붙여 넣은 글에서 코드 후보를 나눈다 — 대괄호 코드가 둘 이상이면 그것들, 아니면 쉼표·줄바꿈·세미콜론·탭으로 */
export function codesIn(text) {
  const many = String(text || '').match(/\[[^\]]+\]/g)
  if (many && many.length >= 2) return many
  return String(text || '').split(/[,\n;\t]+|\s{2,}/).map((c) => c.trim()).filter(Boolean)
}

/**
 * 코드 여러 개를 한꺼번에 찾는다. 같은 코드가 여러 과목에 있으면(충돌 코드) 첫 항목.
 * @returns {{ found: object[], missing: string[] }}
 */
export function resolveCodes(list, chunks) {
  const byCode = new Map()
  for (const s of list || []) { const k = normCode(s.code); if (!byCode.has(k)) byCode.set(k, s) }
  const found = [], missing = []
  for (const c of chunks) {
    const hit = byCode.get(normCode(c))
    if (hit) { if (!found.includes(hit)) found.push(hit) } else missing.push(`[${String(c).replace(/[[\]]/g, '').trim()}]`)
  }
  return { found, missing }
}

/** 여러 코드 입력 결과. 이미 고른 코드와 한도 초과를 구분해 교사에게 안내한다. */
export function mergeStandardCodes(list, text, selectedKeys = []) {
  const { found, missing } = resolveCodes(list, codesIn(text))
  const selected = [...new Set(selectedKeys)].slice(0, FUTURE_MAX)
  const candidates = found.filter(s => !selected.includes(s.key))
  const added = candidates.slice(0, FUTURE_MAX - selected.length)
  return {
    keys: [...selected, ...added.map(s => s.key)], added: added.length,
    duplicates: found.length - candidates.length, overflow: candidates.length - added.length,
    missing: [...new Set(missing)],
  }
}
