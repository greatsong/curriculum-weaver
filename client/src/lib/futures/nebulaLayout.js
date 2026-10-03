/**
 * 미래 보기 연결 그래프 배치 — 행성(과목)과 위성(키워드), 키워드끼리의 연결.
 *
 * - 모든 과목을 가로로 넓은 바깥 링(화면 중심 둘레 360°)에 대등하게 두고 가운데는 비운다.
 *   연결된 과목끼리는 링에서 멀리 마주 보게 배정해 연결선이 가운데 공간을 가로지른다.
 * - 위성(키워드)은 행성 가까이 불규칙하게(황금각 나선 + 거리 흔들림) 놓고, 행성에서 위성으로 얇은 선을 긋는다.
 *   연결된 키워드는 알약으로 강조해 상대 과목을 향한 가장자리에 둔다.
 * - 같은 성취기준 집합·연결·폭이면 입력 순서와 관계없이 같은 좌표(결정적 난수, Math.random 미사용).
 * - 글자 폭은 measure(text, font)로 주입한다(화면은 캔버스, 테스트는 근사치).
 *
 * 근거: docs/미래보기-명세서.md 2부 §3-3(시안 probe/cluster.html에서 7개 자료로 검증한 알고리즘) + 최신 사용자 결정.
 */

export const FONTS = {
  sat: "400 13.5px 'Nanum Gothic'",
  kw: "700 16px 'Nanum Gothic'",
  cap: "700 13px 'Nanum Gothic'",
  name: "800 14px 'Nanum Gothic'",
  code: "400 11px ui-monospace, Menlo, monospace",
  iso: "400 12px 'Nanum Gothic'",
}
export const ISOLATED_LABEL = '연결된 키워드 없음'
export const LAYOUT = {
  pad: 22, gap: 44, pillH: 34, pillH2: 54, pillPadX: 13, pillMaxText: 168, starLimX: 205, starLimY: 104,
  planetR: 18, satR: 4.5, pillDot: 12,
}
/** 과목 이름은 괄호 앞까지(예: "기술·가정(고등 일반선택)" → "기술·가정") */
export const shortSubject = (s) => String(s?.subject || '').replace(/\(.*\)/, '').split(',')[0].trim()

export const hash = (t) => { let h = 2166136261; for (const ch of String(t)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
export const rng = (seed) => () => {
  seed = (seed + 0x6D2B79F5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function permutations(a) {
  if (a.length <= 1) return [a.slice()]
  const out = []
  a.forEach((x, i) => permutations(a.filter((_, j) => j !== i)).forEach((p) => out.push([x, ...p])))
  return out
}
export const overlap = (a, b, g = 0) => a[0] < b[2] + g && a[2] + g > b[0] && a[1] < b[3] + g && a[3] + g > b[1]
/** 선분이 상자와 만나는가(Liang–Barsky) */
export const segHitsBox = (x1, y1, x2, y2, b) => {
  let t0 = 0, t1 = 1
  const dx = x2 - x1, dy = y2 - y1
  for (const [p, q] of [[-dx, x1 - b[0]], [dx, b[2] - x1], [-dy, y1 - b[1]], [dy, b[3] - y1]]) {
    if (p === 0) { if (q < 0) return false } else {
      const r = q / p
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r } else { if (r < t0) return false; if (r < t1) t1 = r }
    }
  }
  return true
}

/**
 * @param {Array<{key, code, subject}>} standards 2~6개
 * @param {{keywords?: Object<string,string[]>, concepts?: Array<{label, kind, strength, ends:[{key,word},{key,word}], why}>}|null} bridges
 * @param {number} W 패널 폭(px)
 * @param {(text:string, font:string) => number} measure
 */
export function nebulaLayout(standards, bridges, W, measure, { multiEndpoint = false } = {}) {
  const P = LAYOUT
  const tw = (t, font) => measure(String(t), font)
  const wrap = (t, font, maxW) => {
    if (tw(t, font) <= maxW) return [t]
    const parts = t.split(' ')
    if (parts.length > 1) {
      let best = null
      for (let i = 1; i < parts.length; i++) {
        const l1 = parts.slice(0, i).join(' '), l2 = parts.slice(i).join(' '), w = Math.max(tw(l1, font), tw(l2, font))
        if (!best || w < best.w) best = { w, lines: [l1, l2] }
      }
      return best.lines
    }
    const h = Math.ceil(t.length / 2)
    return [t.slice(0, h), t.slice(h)]
  }
  const seed = hash(standards.map((s) => s.key).sort().join('|'))
  // 0) 과목 노드: 같은 과목의 성취기준은 원 하나로 묶고, 원 안에 과목 이름과 성취기준 코드를 적는다
  const groups = new Map()
  for (const st of [...standards].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    const gk = String(st.subject || st.key)
    if (!groups.has(gk)) groups.set(gk, { key: gk, s: st, name: shortSubject(st), codes: [], keys: [] })
    groups.get(gk).codes.push(st.code); groups.get(gk).keys.push(st.key)
  }
  const nodeOf = new Map()
  for (const g of groups.values()) for (const k of g.keys) nodeOf.set(k, g.key)
  const keysSorted = [...groups.keys()].sort()
  const byKey = groups
  const keywords = {}
  for (const g of groups.values()) {
    const words = []
    for (const k of g.keys) for (const w of bridges?.keywords?.[k] || []) if (!words.includes(w)) words.push(w)
    keywords[g.key] = words
  }
  // 연결 끝을 과목 노드로 옮긴다(원래 성취기준 key는 stdKey로 보존). 같은 과목 안의 연결은 그래프 선에서 빼고 목록에만 남는다
  // 실험실의 다자 연결은 같은 이름의 가지로 표시한다. 원본 연결은 목록과 생성에 그대로 보존한다.
  const sourceConcepts = (bridges?.concepts || []).flatMap(c => {
    if (!multiEndpoint || c.ends?.length <= 2) return [c]
    const ends = c.ends
    const anchor = ends[0]
    return ends.slice(1).flatMap(end => {
      const from = nodeOf.get(anchor.key) === nodeOf.get(end.key) ? ends.find(e => nodeOf.get(e.key) !== nodeOf.get(end.key)) : anchor
      return from ? [{ ...c, src: c, ends: [from, end] }] : []
    })
  })
  const concepts = sourceConcepts
    .filter((c) => c.ends?.length === 2 && c.ends.every((e) => nodeOf.has(e.key)))
    .map((c) => ({ ...c, src: c.src || c, ends: c.ends.map((e) => ({ key: nodeOf.get(e.key), word: e.word, stdKey: e.key })) }))
    .filter((c) => c.ends[0].key !== c.ends[1].key)
  const n = groups.size
  // 원 반지름: 가장 긴 글자 묶음에 맞춰 모든 과목을 같은 크기로(연결 수와 무관하게 대등)
  // 긴 과목 이름·"연결된 키워드 없음"은 원 안에서 두 줄로(원을 키우지 않게). 이 표시는 실제로 이어지지 않은 과목에만
  const isoLines = wrap(ISOLATED_LABEL, FONTS.iso, 84)
  for (const g of groups.values()) {
    g.nameLines = tw(g.name, FONTS.name) > 84 ? wrap(g.name, FONTS.name, 84) : [g.name]
    g.iso = multiEndpoint
      ? (bridges?.concepts?.length || 0) > 0 && !bridges.concepts.some(c => c.ends.some(e => g.keys.includes(e.key)))
      : concepts.length > 0 && !concepts.some((c) => c.ends.some((e) => e.key === g.key))
    g.isoLines = g.iso ? isoLines : []
  }
  const blockOf = (g) => {
    const w = Math.max(...g.nameLines.map((l) => tw(l, FONTS.name)), ...g.codes.map((c) => tw(c, FONTS.code)), ...g.isoLines.map((l) => tw(l, FONTS.iso)))
    const h = 17 * g.nameLines.length + 2 + 14 * g.codes.length + 14 * g.isoLines.length
    return { w, h }
  }
  const RN = Math.max(40, ...[...groups.values()].map((g) => { const b = blockOf(g); return Math.hypot(b.w / 2 + 6, b.h / 2 + 4) }))
  let H = [0, 380, 440, 520, 580, 660, 700][n] || 700

  // 1) 각도 칸: 360°를 n등분하되 회전·각도·반지름을 시드로 흔든다
  const slotsFor = (h) => {
    const a = W / 2 - 165, b = h / 2 - 85, R = rng(seed ^ 0x9E3779B9)
    const th0 = n === 2 ? (212 + 12 * R()) * Math.PI / 180 : R() * 2 * Math.PI / Math.max(1, n) // 2과목은 대각선
    return Array.from({ length: n }, (_, i) => {
      const th = th0 + i * 2 * Math.PI / n + (R() - 0.5) * 0.44 * (2 * Math.PI / n)
      const rho = 0.86 + 0.14 * R()
      return { th, x: W / 2 + a * rho * Math.cos(th), y: h / 2 + b * rho * Math.sin(th) }
    })
  }
  // 2) 과목 → 칸 배정: 연결된 쌍은 멀리, 교차는 적게(전수, 동점이면 먼저 생성된 순열)
  const assign = (slots) => {
    let best = null
    const orient = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
    const cross = (p1, p2, p3, p4) => orient(p1, p2, p3) * orient(p1, p2, p4) < 0 && orient(p3, p4, p1) * orient(p3, p4, p2) < 0
    for (const perm of permutations(slots.map((_, i) => i))) {
      const at = new Map(keysSorted.map((k, i) => [k, slots[perm[i]]]))
      let d = 0, x = 0
      for (const c of concepts) d += Math.hypot(at.get(c.ends[0].key).x - at.get(c.ends[1].key).x, at.get(c.ends[0].key).y - at.get(c.ends[1].key).y)
      for (let i = 0; i < concepts.length; i++) for (let j = i + 1; j < concepts.length; j++) {
        const [a1, a2] = concepts[i].ends.map((e) => at.get(e.key)), [b1, b2] = concepts[j].ends.map((e) => at.get(e.key))
        if (a1 !== b1 && a1 !== b2 && a2 !== b1 && a2 !== b2 && cross(a1, a2, b1, b2)) x++
      }
      const score = d - 60 * x
      if (!best || score > best.score + 1e-6) best = { score, at }
    }
    return best.at
  }

  // 3) 연결된 키워드(알약): 같은 성취기준·같은 낱말은 하나로(연결 여러 개가 공유)
  const pillsOf = new Map()
  for (const c of concepts) for (const e of c.ends) {
    if (!pillsOf.has(e.key)) pillsOf.set(e.key, [])
    let p = pillsOf.get(e.key).find((q) => q.word === e.word)
    if (!p) {
      const lines = wrap(e.word, FONTS.kw, P.pillMaxText)
      p = { id: `${e.key}|${e.word}`, key: e.key, word: e.word, cs: [], lines, w: Math.max(...lines.map((l) => tw(l, FONTS.kw))) + 2 * P.pillPadX + P.pillDot, h: lines.length > 1 ? P.pillH2 : P.pillH }
      pillsOf.get(e.key).push(p)
    }
    p.cs.push(c)
  }

  // 상자(행성 기준 좌표)가 화면 가운데 타원(가로 f·W, 세로 f·H 반지름) 안에 걸리는가
  const inCenter = (center, b, h, f) => {
    const gx = Math.max(center.x + b[0], Math.min(W / 2, center.x + b[2])), gy = Math.max(center.y + b[1], Math.min(h / 2, center.y + b[3]))
    return ((gx - W / 2) / (W * f)) ** 2 + ((gy - h / 2) / (h * f)) ** 2 < 1
  }
  // 덩어리(행성 + 위성) 만들기. 좌표 원점 = 행성 중심
  const buildCluster = (k, center, pos, h) => {
    const g = byKey.get(k), s = g.s, R = rng(hash(g.codes.join('|')))
    const iso = g.iso
    const Rn = RN
    const boxes = [{ t: 'name', b: [-Rn, -Rn, Rn, Rn] }] // 원(과목 이름·코드가 안에 있음)
    const spokes = [] // 원 경계 → 위성(점·알약)까지의 선분
    const spokeFrom = (cx, cy) => { const L = Math.hypot(cx, cy) || 1; return [cx / L * (Rn + 1), cy / L * (Rn + 1)] }
    const spokeOk = (cx, cy, b) => { // 이 위성으로 가는 선이 다른 키워드 상자를 지나지 않고, 기존 선이 이 상자를 지나지 않는가
      const [sx, sy] = spokeFrom(cx, cy)
      if (Math.hypot(sx, sy) >= Math.hypot(cx, cy)) return false
      for (const o of boxes) { if (o.t === 'name') continue; if (segHitsBox(sx, sy, cx, cy, [o.b[0] - 2, o.b[1] - 2, o.b[2] + 2, o.b[3] + 2])) return false }
      for (const sp of spokes) if (segHitsBox(sp[0], sp[1], sp[2], sp[3], [b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2])) return false
      return true
    }
    const pills = (pillsOf.get(k) || []).map((p) => ({ ...p }))
    let ex = 0, ey = 0
    for (const p of pills) {
      let vx = 0, vy = 0
      for (const c of p.cs) {
        const o = c.ends.find((e) => e.key !== k).key, q = pos.get(o)
        const dx = q.x - center.x, dy = q.y - center.y, L = Math.hypot(dx, dy) || 1
        vx += dx / L; vy += dy / L
      }
      p.phi = Math.atan2(vy, vx); ex += Math.cos(p.phi); ey += Math.sin(p.phi)
    }
    pills.sort((a, b) => a.phi - b.phi || (a.word < b.word ? -1 : 1))
    for (const p of pills) {
      let placed = null
      for (let ring = 0; ring < 4 && !placed; ring++) for (const off of [0, 0.22, -0.22, 0.44, -0.44, 0.66, -0.66]) {
        const f = p.phi + off
        const rx = Rn + 22 + p.w / 2 + ring * 46, ry = Rn + 14 + p.h / 2 + ring * 40
        const cx = Math.cos(f) * rx, cy = Math.sin(f) * ry, b = [cx - p.w / 2, cy - p.h / 2, cx + p.w / 2, cy + p.h / 2]
        const own = Math.hypot(cx, cy)
        const nearer = [...pos].some(([o, q]) => o !== k && Math.hypot(center.x + cx - q.x, center.y + cy - q.y) < own + 24)
        if (inCenter(center, b, h, 0.16)) continue // 가운데 비움: 알약도 가운데 타원 안으로 들이지 않는다
        if (!nearer && !boxes.some((o) => overlap(b, o.b, 8)) && spokeOk(cx, cy, b)) { placed = { f, cx, cy, b }; break }
      }
      if (!placed) {
        const f = p.phi, cx = Math.cos(f) * (Rn + 22 + p.w / 2), cy = Math.sin(f) * (Rn + 14 + p.h / 2)
        placed = { f, cx, cy, b: [cx - p.w / 2, cy - p.h / 2, cx + p.w / 2, cy + p.h / 2], forced: true }
      }
      Object.assign(p, placed)
      boxes.push({ t: 'pill', b: p.b, id: p.id })
      const [sx, sy] = spokeFrom(p.cx, p.cy)
      // 알약 쪽 끝은 알약 경계까지
      const s2 = Math.min((p.w / 2 + 1) / Math.abs(p.cx || 1e-9), (p.h / 2 + 1) / Math.abs(p.cy || 1e-9))
      spokes.push([sx, sy, p.cx - p.cx * Math.min(1, s2), p.cy - p.cy * Math.min(1, s2), 'pill', p.id])
    }
    // 위성(연결 안 된 키워드): 연결 방향의 반대편부터 황금각 나선, 알약에서 바깥으로 나가는 통로는 비운다
    const rest = (keywords[k] || []).filter((w) => !pills.some((p) => p.word === w))
    const back = pills.length ? Math.atan2(ey, ex) + Math.PI : R() * 2 * Math.PI
    const stars = []
    let m = 0
    for (const w of rest) {
      const ww = tw(w, FONTS.sat)
      for (let tries = 0; tries < 600; tries++, m++) {
        const r = 16 + 11 * Math.sqrt(m + 1) * (0.8 + 0.4 * R()), th = back + m * 2.399963 // 원 경계에서 떨어진 거리·각도 모두 불규칙
        const cx = (Rn + r * 1.6) * Math.cos(th), cy = (Rn + r * 0.8) * Math.sin(th)
        const right = cx >= 0 // 글자는 행성에서 먼 쪽으로
        const b = right ? [cx - P.satR - 2, cy - 10, cx + P.satR + 7 + ww + 2, cy + 10] : [cx - P.satR - 7 - ww - 2, cy - 10, cx + P.satR + 2, cy + 10]
        if (Math.abs(cx) > Rn + P.starLimX - 18 || Math.abs(cy) > Rn + P.starLimY - 18) continue
        if (inCenter(center, b, h, 0.18)) continue // 가운데 비움: 위성 상자가 화면 가운데 타원 안으로 들어가면 버린다
        if (boxes.some((o) => overlap(b, o.b, 6))) continue
        if (pills.some((p) => segHitsBox(p.cx, p.cy, p.cx + Math.cos(p.f) * 260, p.cy + Math.sin(p.f) * 260, [b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4]))) continue
        if (!spokeOk(cx, cy, b)) continue
        boxes.push({ t: 'star', b })
        stars.push({ w, b, cx, cy, right })
        const [sx, sy] = spokeFrom(cx, cy), L = Math.hypot(cx, cy) || 1
        spokes.push([sx, sy, cx - cx / L * (P.satR + 1.5), cy - cy / L * (P.satR + 1.5), 'star', w])
        break
      }
    }
    const xs = boxes.flatMap((o) => [o.b[0], o.b[2]]), ys = boxes.flatMap((o) => [o.b[1], o.b[3]])
    return { key: k, s, node: g, name: g.name, nameLines: g.nameLines, codes: g.codes, iso, isoLines: g.isoLines, Rn, pills, stars, spokes, boxes, bb: [Math.min(...xs) - 12, Math.min(...ys) - 12, Math.max(...xs) + 12, Math.max(...ys) + 12] }
  }

  // 4) 바깥 링 배치: 모든 과목을 가로로 넓은 타원 둘레에 대등하게. 품질 조건을 못 채우면 높이를 키워 다시
  let pos, cls, text, chains, quality
  for (let grow = 0; grow < 7; grow++, H += 40) {
    const slots = slotsFor(H), at = assign(slots)
    const th = new Map(keysSorted.map((k) => [k, at.get(k).th]))
    const rho = new Map(keysSorted.map((k) => [k, 0.94 + 0.06 * rng(seed ^ hash(k))()]))
    pos = new Map(keysSorted.map((k) => [k, { x: at.get(k).x, y: at.get(k).y }]))
    const ringPlace = (k) => {
      const t = th.get(k), b = cls.get(k).bb, c = Math.cos(t), sn = Math.sin(t)
      const A = W / 2 - P.pad - (c >= 0 ? b[2] : -b[0]), B = H / 2 - P.pad - (sn >= 0 ? b[3] : -b[1])
      const p = pos.get(k); p.x = W / 2 + A * rho.get(k) * c; p.y = H / 2 + B * rho.get(k) * sn
    }
    const boxAt = (k) => { const p = pos.get(k), b = cls.get(k).bb; return [p.x + b[0], p.y + b[1], p.x + b[2], p.y + b[3]] }
    for (let round = 0; round < 3; round++) {
      cls = new Map(keysSorted.map((k) => [k, buildCluster(k, pos.get(k), pos, H)]))
      keysSorted.forEach(ringPlace)
      for (let it = 0; it < 400; it++) { // 겹치면 링을 따라 각도만 벌린다(안쪽으로 들이지 않는다)
        let moved = false
        for (let i = 0; i < keysSorted.length; i++) for (let j = i + 1; j < keysSorted.length; j++) {
          const ki = keysSorted[i], kj = keysSorted[j]
          if (!overlap(boxAt(ki), boxAt(kj), P.gap)) continue
          const d = Math.atan2(Math.sin(th.get(kj) - th.get(ki)), Math.cos(th.get(kj) - th.get(ki))) || 1e-3
          th.set(ki, th.get(ki) - 0.012 * Math.sign(d)); th.set(kj, th.get(kj) + 0.012 * Math.sign(d))
          ringPlace(ki); ringPlace(kj); moved = true
        }
        if (!moved) break
      }
    }
    let clusterOv = 0
    for (let i = 0; i < keysSorted.length; i++) for (let j = i + 1; j < keysSorted.length; j++) {
      if (overlap(boxAt(keysSorted[i]), boxAt(keysSorted[j]), 12)) clusterOv++
    }
    // 5) 절대 좌표
    text = []
    for (const k of keysSorted) {
      const p = pos.get(k), c = cls.get(k)
      c.x = p.x; c.y = p.y
      for (const o of c.boxes) text.push({ k, t: o.t, b: [p.x + o.b[0], p.y + o.b[1], p.x + o.b[2], p.y + o.b[3]], id: o.id || null })
      c.pills.forEach((q) => { q.ax = p.x + q.cx; q.ay = p.y + q.cy })
    }
    const pillAt = new Map()
    for (const k of keysSorted) for (const q of cls.get(k).pills) pillAt.set(q.id, q)
    // 6) 연결선: 알약 경계 → 알약 경계, 글자 위를 지나지 않는 휨 + 이름표는 선 가운데 부분에
    const clip = (q, tx, ty) => { const dx = tx - q.ax, dy = ty - q.ay; const s = Math.min((q.w / 2 + 2) / Math.abs(dx || 1e-9), (q.h / 2 + 2) / Math.abs(dy || 1e-9)); return [q.ax + dx * s, q.ay + dy * s] }
    const bez = (p0, p1, p2, t) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]]
    const caps = []
    chains = []
    const lenOf = (c) => { const [p, q] = c.ends.map((e) => pillAt.get(`${e.key}|${e.word}`)); return Math.hypot(p.ax - q.ax, p.ay - q.ay) }
    const order = [...concepts].sort((a, b) => lenOf(b) - lenOf(a) || (a.label < b.label ? -1 : 1))
    for (const c of order) {
      const [p, q] = c.ends.map((e) => pillAt.get(`${e.key}|${e.word}`))
      const a0 = clip(p, q.ax, q.ay), b0 = clip(q, p.ax, p.ay), L = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1
      const nx = -(b0[1] - a0[1]) / L, ny = (b0[0] - a0[0]) / L, mx = (a0[0] + b0[0]) / 2, my = (a0[1] + b0[1]) / 2
      const outward = Math.sign((mx - W / 2) * nx + (my - H / 2) * ny) || (hash(c.label) % 2 ? 1 : -1)
      const cw = tw(c.label, FONTS.cap) + 24, chH = 20
      let best = null
      for (const f of [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4]) {
        const ctl = [mx + nx * outward * f * L, my + ny * outward * f * L]
        const pts = Array.from({ length: 33 }, (_, i) => bez(a0, ctl, b0, i / 32))
        let lineHit = 0
        for (const o of text) {
          if (o.id === p.id || o.id === q.id) continue
          for (let i = 0; i < 32; i++) if (segHitsBox(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], [o.b[0] - 3, o.b[1] - 3, o.b[2] + 3, o.b[3] + 3])) { lineHit++; break }
        }
        for (const t of [0.5, 0.42, 0.58, 0.35, 0.65, 0.28, 0.72]) {
          const [x, y] = bez(a0, ctl, b0, t), cb = [x - cw / 2, y - chH / 2, x + cw / 2, y + chH / 2]
          const capHit = text.filter((o) => overlap(cb, o.b, 3)).length + caps.filter((o) => overlap(cb, o, 4)).length
          const cost = lineHit * 10 + capHit * 100 + Math.abs(f) + Math.abs(t - 0.5)
          if (!best || cost < best.cost) best = { cost, ctl, x, y, cb, lineHit, capHit }
          if (capHit === 0) break
        }
        if (best.cost < 1.5) break
      }
      caps.push(best.cb)
      chains.push({ c, p, q, a0, b0, ctl: best.ctl, x: best.x, y: best.y, cw, lineHit: best.lineHit, capHit: best.capHit })
    }
    const forced = [...cls.values()].reduce((t, c) => t + c.pills.filter((q) => q.forced).length, 0)
    quality = { clusterOv, forced, lineHit: chains.reduce((t, c) => t + c.lineHit, 0), capHit: chains.reduce((t, c) => t + c.capHit, 0) }
    if (!clusterOv && !forced && !quality.lineHit && !quality.capHit) break
  }
  const RS = rng(seed ^ 0x51ED27)
  const dust = Array.from({ length: 46 }, () => ({ x: RS() * W, y: RS() * H, r: 0.5 + RS() * 0.8, a: 0.12 + RS() * 0.2 }))
  const ok = !quality.clusterOv && !quality.forced && !quality.lineHit && !quality.capHit
  return { W, H, ok, quality, clusters: keysSorted.map((k) => cls.get(k)), chains, text, dust, empty: !concepts.length }
}
