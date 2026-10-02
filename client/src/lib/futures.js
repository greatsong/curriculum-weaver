/**
 * 미래 보기 — 화면 공용 순수 함수 (URL 상태, 성취기준 검색·코드 여러 개 붙여 넣기)
 */
export const FUTURE_MIN = 2
export const FUTURE_MAX = 6
export const FUTURE_TIPS = 8 // 별의 꼭지 = 관점 8개 (서버 FUTURE_LENSES와 같은 순서)

export const FUTURE_MODEL_OPTIONS = [
  { id: 'fast', label: '빠른', model: 'Sonnet 5.5' },
  { id: 'precise', label: '정밀', model: 'Opus 5.5' },
]

/** ?codes=k1,k2&model=precise → { keys, model } (중복 제거, 최대 6개) */
export function parseFuturesSearch(search) {
  const params = new URLSearchParams(search || '')
  const keys = []
  for (const raw of (params.get('codes') || '').split(',')) {
    const key = raw.trim()
    if (key && !keys.includes(key)) keys.push(key)
    if (keys.length === FUTURE_MAX) break
  }
  return { keys, model: params.get('model') === 'precise' ? 'precise' : 'fast' }
}

/** { keys, model } → '?codes=...&model=...' (빠른 모드는 생략) */
export function buildFuturesSearch(keys, model) {
  const params = new URLSearchParams()
  if (keys.length) params.set('codes', keys.join(','))
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
export function searchStandards(list, query, { level = '', exclude = new Set(), limit = 60 } = {}) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const tokens = q.split(/\s+/).filter(Boolean).map(squash)
  const qCode = normCode(q)
  const scored = []
  for (const s of list || []) {
    if (exclude.has(s.key)) continue
    if (level && s.school_level !== level) continue
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

// ── 화면 공용 상수 ──
// 꼭지 순서 = 서버 FUTURE_LENSES 순서
export const LENS_SHORT = ['지역 문제', '학교 생활', '데이터 탐구', '과학 탐구', '창작 프로젝트', '역사적 관점', '진로·직업', '지구적 문제']
// 별 꼭지만 엔드게임의 여섯 스톤 색 — 마주 보는 두 쌍(지역·창작=리얼리티, 과학·지구=스페이스)이 같은 색. 나머지는 초록.
const STONE = { space: '#3D8BFF', mind: '#FFD23F', reality: '#FF3D52', power: '#A55BFF', time: '#2BF59B', soul: '#FF8A2B' }
export const TIP_STONE = [STONE.reality, STONE.power, STONE.mind, STONE.space, STONE.reality, STONE.time, STONE.soul, STONE.space]
// 3×3 마방진: 가운데는 별, 둘레 8칸이 관점 8개. 왼쪽 위에서 시계 방향 — 꼭지 k는 자기 칸을 가리킨다(-135° + 45°×k)
export const SQUARE_AREAS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']
export const tipAngle = (k) => -135 + 45 * k
export const GROUP_COLORS = {
  '국어': '#F87171', '수학': '#60A5FA', '영어': '#818CF8', '과학': '#4ADE80', '사회': '#FACC15', '도덕': '#FB923C', '정보': '#22D3EE',
  '기술·가정': '#C084FC', '체육': '#A3E635', '음악': '#A78BFA', '미술': '#F472B6', '한문': '#2DD4BF', '제2외국어': '#38BDF8', '교양': '#94A3B8',
}
export const colorOfStandard = (s) => GROUP_COLORS[s?.subject_group] || '#9CA3AF'
export const shortSubject = (s) => String(s?.subject || '').replace(/\(.*\)/, '').split(',')[0].trim()

// ── 키워드 성운 배치 (viewBox 1000×560) ──
export const NEBULA_VIEW = { w: 1000, h: 560 }
const textWidth = (t, size) => [...String(t)].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? size * .56 : size * .98), 0)

/**
 * 성취기준 성운·키워드 별·만나는 연결의 좌표를 계산한다(결정적).
 * @param {object[]} standards 고른 성취기준({ key, ... })
 * @param {object|null} bridges 서버 연결 지도 { keywords: {key: [word]}, concepts: [{label, ends: [{key, word}], why}] }
 */
export function nebulaLayout(standards, bridges) {
  const C = { x: 500, y: 280 }
  const n = standards.length
  const centers = standards.map((_, i) => {
    if (n === 1) return { ...C }
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n % 2 === 0 ? Math.PI / n : 0)
    return { x: C.x + (n === 2 ? 270 : 330) * Math.cos(a), y: C.y + (n === 2 ? 0 : 172) * Math.sin(a) }
  })
  const indexOf = new Map(standards.map((s, i) => [s.key, i]))
  const concepts = (bridges?.concepts || []).filter((c) => c.ends?.length >= 2 && c.ends.every((e) => indexOf.has(e.key)))
  const hitWords = new Set(concepts.flatMap((c) => c.ends.map((e) => `${e.key}|${e.word}`)))
  const keywords = []
  standards.forEach((s, i) => {
    const list = bridges?.keywords?.[s.key] || []
    if (!list.length) return
    // 다른 성운과 만나는 키워드는 그쪽을 향한 자리에
    const prefer = new Map()
    for (const c of concepts) {
      const mine = c.ends.find((e) => e.key === s.key)
      if (!mine) continue
      const v = prefer.get(mine.word) || [0, 0]
      for (const e of c.ends) {
        if (e.key === s.key) continue
        const j = indexOf.get(e.key)
        v[0] += centers[j].x - centers[i].x; v[1] += centers[j].y - centers[i].y
      }
      prefer.set(mine.word, v)
    }
    const m = list.length, step = (2 * Math.PI) / m
    const base = Math.atan2(C.y - centers[i].y, C.x - centers[i].x) + step / 2
    const slots = list.map((_, k) => base + k * step)
    const free = new Set(slots.map((_, k) => k))
    const order = [...list].sort((a, b) => (prefer.has(b) ? 1 : 0) - (prefer.has(a) ? 1 : 0))
    for (const w of order) {
      let best = [...free][0]
      if (prefer.has(w)) {
        const [vx, vy] = prefer.get(w), want = Math.atan2(vy, vx)
        let bd = Infinity
        for (const k of free) { const d = Math.abs(Math.atan2(Math.sin(slots[k] - want), Math.cos(slots[k] - want))); if (d < bd) { bd = d; best = k } }
      }
      free.delete(best)
      const a = slots[best], r = 104
      const x = centers[i].x + r * Math.cos(a), y = centers[i].y + r * .82 * Math.sin(a)
      const c = Math.cos(a)
      keywords.push({ key: s.key, word: w, x, y, anchor: c > .35 ? 'start' : c < -.35 ? 'end' : 'middle', below: Math.sin(a) > 0, hit: hitWords.has(`${s.key}|${w}`), i })
    }
  })
  const kwAt = new Map(keywords.map((k) => [`${k.key}|${k.word}`, k]))
  // 연결 이름표가 키워드 글자·성취기준 이름을 가리지 않게: 선 위의 여러 자리 가운데 겹치지 않는 곳을 고른다
  const boxes = keywords.map((k) => {
    const w = textWidth(k.word, k.hit ? 17 : 15) + 12
    const x0 = k.anchor === 'start' ? k.x - 6 : k.anchor === 'end' ? k.x - w + 6 : k.x - w / 2
    const ty = k.anchor === 'middle' ? (k.below ? k.y + 22 : k.y - 12) : k.y + 5
    return [x0, ty - 17, x0 + w, ty + 6]
  }).concat(centers.map((c, i) => { const w = textWidth(shortSubject(standards[i]), 17) + 16; return [c.x - w / 2, c.y + 4, c.x + w / 2, c.y + 46] }))
  const placed = []
  const overlap = (b) => boxes.concat(placed).reduce((t, o) => t + Math.max(0, Math.min(b[2], o[2]) - Math.max(b[0], o[0])) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[1], o[1])), 0)
  const links = concepts.map((c, n2) => {
    const ends = c.ends.map((e) => kwAt.get(`${e.key}|${e.word}`)).filter(Boolean)
    if (ends.length < 2) return null
    const w = Math.max(70, textWidth(c.label, 14) + 26)
    let paths, spots
    if (ends.length === 2) {
      const [a, b] = ends, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      const cx = mx + (C.x - mx) * .25, cy = my + (C.y - my) * .25
      paths = [`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`]
      spots = [.5, .4, .6, .3, .7, .25, .75].map((t) => [(1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * b.x, (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * b.y])
    } else {
      const hx = ends.reduce((t, e) => t + e.x, 0) / ends.length, hy = ends.reduce((t, e) => t + e.y, 0) / ends.length
      paths = ends.map((e) => `M${e.x},${e.y} L${hx},${hy}`)
      spots = [[hx, hy]]
    }
    let best = spots[0], bestCost = Infinity
    for (const [x, y] of spots) {
      const cost = overlap([x - w / 2, y - 14, x + w / 2, y + 14])
      if (cost < bestCost) { best = [x, y]; bestCost = cost }
      if (cost === 0) break
    }
    placed.push([best[0] - w / 2, best[1] - 14, best[0] + w / 2, best[1] + 14])
    return { label: c.label, why: c.why || '', words: c.ends.map((e) => e.word), paths, hx: best[0], hy: best[1], w, n: n2 }
  }).filter(Boolean)
  return { centers, keywords, links }
}
