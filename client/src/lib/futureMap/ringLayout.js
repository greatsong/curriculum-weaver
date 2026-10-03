/**
 * 미래 보기 연결 그래프 배치 — 과목 원, 둘레의 키워드, 과목 사이를 가로지르는 키워드 연결.
 *
 * 설계 요지
 * - 과목 하나 = 큰 원 하나. 원 안에 과목 이름과 그 과목에서 고른 성취기준 코드를 적는다(같은 과목은 한 원, 모든 원은 같은 크기).
 *   성취기준이 여럿이면 코드마다 표식 모양(●◆▲■)을 달리하고, 키워드도 자기 성취기준의 표식을 단다(소속이 늘 보인다).
 * - 키워드는 원 둘레에 짧은 선으로 매달린다. 연결된 키워드(알약)는 상대 과목 쪽, 나머지는 바깥쪽에 둔다.
 * - 과목 원들은 화면 중심 둘레 360° 바깥 링에 대등하게 놓이고, 연결된 과목끼리 멀리 마주 본다. 가운데는 연결선만 가로지른다.
 * - 같은 입력(성취기준 집합·연결·폭)이면 입력 순서와 관계없이 같은 좌표(결정적 난수, Math.random 미사용).
 * - 글자 폭은 measure(text, font)로 주입한다(화면은 캔버스, 테스트는 근사치).
 */

export const FONTS = {
  name: "800 15px 'Nanum Gothic'",
  code: "400 11px ui-monospace, Menlo, monospace",
  kw: "700 15.5px 'Nanum Gothic'",
  sat: "400 13.5px 'Nanum Gothic'",
  cap: "700 13px 'Nanum Gothic'",
  iso: "400 11.5px 'Nanum Gothic'",
}
export const SHAPES = ['circle', 'diamond', 'triangle', 'square']
export const ISOLATED_LABEL = '연결된 키워드 없음'
export const LAYOUT = {
  pad: 18, gap: 26, pillH: 32, pillPadX: 12, pillDot: 16, satH: 18, satGap: 9, capH: 20,
  spokes: [24, 40, 56], pillSpokes: [26, 42], limX: 250, limY: 170,
}
const DEG = Math.PI / 180

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
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const shift = (b, x, y) => [b[0] + x, b[1] + y, b[2] + x, b[3] + y]
const union = (boxes, m = 0) => [Math.min(...boxes.map((b) => b[0])) - m, Math.min(...boxes.map((b) => b[1])) - m, Math.max(...boxes.map((b) => b[2])) + m, Math.max(...boxes.map((b) => b[3])) + m]
/** 상자 중심에서 (tx, ty)를 향한 선분이 상자 테두리와 만나는 점(+ 여유 g) */
const clipBox = (b, tx, ty, g = 2) => {
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, hw = (b[2] - b[0]) / 2 + g, hh = (b[3] - b[1]) / 2 + g
  const dx = tx - cx, dy = ty - cy
  const s = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9))
  return [cx + dx * s, cy + dy * s]
}

/**
 * @param {Array<{key, code, subject, subject_group}>} standards 고른 성취기준 2~6개
 * @param {{keywords?: Object<string,string[]>, concepts?: Array<{label, kind, strength, ends:[{key,word},{key,word}], why}>}|null} bridges
 * @param {number} W 패널 폭(px)
 * @param {(text:string, font:string) => number} measure 글자 폭 측정
 */
export function ringLayout(standards, bridges, W, measure) {
  const P = LAYOUT
  const tw = (t, font) => measure(String(t), font)
  const wrap2 = (t, font, maxW) => { // 두 줄까지만, 공백에서 가장 고르게
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

  // ── 1) 과목 노드: 같은 과목의 성취기준은 원 하나. 코드마다 표식 모양 ──
  const sorted = [...standards].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const seed = hash(sorted.map((s) => s.key).join('|'))
  const nodes = new Map()
  for (const st of sorted) {
    const gk = String(st.subject || st.key)
    if (!nodes.has(gk)) nodes.set(gk, { key: gk, s: st, name: shortSubject(st), codes: [], keys: [] })
    const g = nodes.get(gk)
    g.codes.push({ code: st.code, key: st.key, shape: SHAPES[g.codes.length % SHAPES.length] })
    g.keys.push(st.key)
  }
  const nodeOf = new Map()
  for (const g of nodes.values()) for (const k of g.keys) nodeOf.set(k, g.key)
  const nodeKeys = [...nodes.keys()].sort()
  const n = nodeKeys.length

  // ── 2) 키워드(소속 성취기준 유지) ──
  for (const g of nodes.values()) {
    g.kws = []
    for (const c of g.codes) for (const w of bridges?.keywords?.[c.key] || []) {
      if (!g.kws.some((k) => k.word === w)) g.kws.push({ id: `${c.key}|${w}`, word: w, stdKey: c.key, shape: c.shape, linked: false, partners: [], cs: [] })
    }
  }
  // ── 3) 연결: 서로 다른 과목 사이만 그래프 선으로. 같은 과목 안의 연결은 목록에만 ──
  const all = (bridges?.concepts || []).filter((c) => c.ends?.length === 2 && c.ends.every((e) => nodeOf.has(e.key)))
  const concepts = [], innerConcepts = []
  for (const c of all) {
    const [a, b] = c.ends.map((e) => nodeOf.get(e.key))
    if (a === b) { innerConcepts.push(c); continue }
    const kw = c.ends.map((e) => nodes.get(nodeOf.get(e.key)).kws.find((k) => k.word === e.word))
    if (kw.some((k) => !k)) { innerConcepts.push(c); continue } // 키워드 목록에 없는 끝은 그릴 수 없다
    const cc = { ...c, src: c, nodeKeys: [a, b], kws: kw }
    kw[0].linked = true; kw[0].partners.push(b); kw[0].cs.push(cc)
    kw[1].linked = true; kw[1].partners.push(a); kw[1].cs.push(cc)
    concepts.push(cc)
  }
  for (const g of nodes.values()) g.iso = concepts.length > 0 && !g.kws.some((k) => k.linked)

  // ── 4) 원 크기: 가장 긴 글자 묶음에 맞춰 모든 과목이 같은 크기 ──
  for (const g of nodes.values()) g.nameLines = wrap2(g.name, FONTS.name, 96)
  const blockOf = (g) => {
    const w = Math.max(...g.nameLines.map((l) => tw(l, FONTS.name)), ...g.codes.map((c) => tw(c.code, FONTS.code) + 14), g.iso ? tw(ISOLATED_LABEL, FONTS.iso) : 0)
    const h = 18 * g.nameLines.length + 3 + 14 * g.codes.length + (g.iso ? 14 : 0)
    return { w, h }
  }
  const R = Math.max(46, ...[...nodes.values()].map((g) => { const b = blockOf(g); return Math.ceil(Math.hypot(b.w / 2, b.h / 2) + 9) }))
  for (const g of nodes.values()) g.block = blockOf(g)
  let H = [0, 360, 460, 470, 540, 620, 680][n] || 680 // 2과목은 대각선이 보이도록 조금 높게

  // ── 5) 링 칸과 배정: 연결된 쌍은 멀리, 선 교차는 적게 ──
  const slotsFor = (h) => {
    const a = W / 2 - 170, b = h / 2 - 95, Rn = rng(seed ^ 0x9E3779B9)
    const th0 = n === 2 ? (203 + 12 * Rn()) * DEG : Rn() * 2 * Math.PI / n // 2과목은 왼쪽 위 ↔ 오른쪽 아래 대각선
    return Array.from({ length: n }, (_, i) => {
      const th = th0 + i * 2 * Math.PI / n + (Rn() - 0.5) * 0.4 * (2 * Math.PI / n)
      return { th, x: W / 2 + a * Math.cos(th), y: h / 2 + b * Math.sin(th) }
    })
  }
  const assign = (slots) => {
    const orient = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
    const cross = (p1, p2, p3, p4) => orient(p1, p2, p3) * orient(p1, p2, p4) < 0 && orient(p3, p4, p1) * orient(p3, p4, p2) < 0
    let best = null
    for (const perm of permutations(slots.map((_, i) => i))) {
      const at = new Map(nodeKeys.map((k, i) => [k, slots[perm[i]]]))
      let d = 0, x = 0
      for (const c of concepts) { const [p, q] = c.nodeKeys.map((k) => at.get(k)); d += Math.hypot(p.x - q.x, p.y - q.y) }
      for (let i = 0; i < concepts.length; i++) for (let j = i + 1; j < concepts.length; j++) {
        const [a1, a2] = concepts[i].nodeKeys.map((k) => at.get(k)), [b1, b2] = concepts[j].nodeKeys.map((k) => at.get(k))
        if (a1 !== b1 && a1 !== b2 && a2 !== b1 && a2 !== b2 && cross(a1, a2, b1, b2)) x++
      }
      const score = d - 70 * x
      if (!best || score > best.score + 1e-6) best = { score, at }
    }
    return best.at
  }

  // ── 6) 덩어리: 원 둘레에 키워드 매달기(좌표 원점 = 원 중심) ──
  const labelBox = (dx, dy, th, w, h, pill) => {
    const c = Math.cos(th), s = Math.sin(th)
    if (c > 0.42) return { side: 'r', b: pill ? [dx - 10, dy - h / 2, dx - 10 + w, dy + h / 2] : [dx + P.satGap, dy - h / 2, dx + P.satGap + w, dy + h / 2] }
    if (c < -0.42) return { side: 'l', b: pill ? [dx + 10 - w, dy - h / 2, dx + 10, dy + h / 2] : [dx - P.satGap - w, dy - h / 2, dx - P.satGap, dy + h / 2] }
    if (s < 0) return { side: 't', b: pill ? [dx - w / 2, dy + 6 - h, dx + w / 2, dy + 6] : [dx - w / 2, dy - 7 - h, dx + w / 2, dy - 7] }
    return { side: 'b', b: pill ? [dx - w / 2, dy - 6, dx + w / 2, dy - 6 + h] : [dx - w / 2, dy + 7, dx + w / 2, dy + 7 + h] }
  }
  const buildCluster = (k, center, pos, h) => {
    const g = nodes.get(k), Rj = rng(hash(g.codes.map((c) => c.code).join('|')))
    const outward = Math.atan2(center.y - h / 2, center.x - W / 2)
    const boxes = [{ t: 'circle', b: [-R, -R, R, R], id: null }]
    const spokes = []
    const spokeOk = (ax, ay, b) => {
      const L = Math.hypot(ax, ay) || 1, sx = ax / L * (R + 1), sy = ay / L * (R + 1)
      for (const o of boxes) { if (o.t === 'circle') continue; if (segHitsBox(sx, sy, ax, ay, [o.b[0] - 2, o.b[1] - 2, o.b[2] + 2, o.b[3] + 2])) return false }
      for (const sp of spokes) if (segHitsBox(sp[0], sp[1], sp[2], sp[3], [b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2])) return false
      return true
    }
    const kws = g.kws.map((kw) => ({ ...kw }))
    for (const kw of kws) {
      if (kw.linked) {
        let vx = 0, vy = 0
        for (const o of kw.partners) { const q = pos.get(o); const dx = q.x - center.x, dy = q.y - center.y, L = Math.hypot(dx, dy) || 1; vx += dx / L; vy += dy / L }
        kw.want = Math.atan2(vy, vx)
        kw.w = tw(kw.word, FONTS.kw) + 2 * P.pillPadX + P.pillDot; kw.h = P.pillH
      } else {
        kw.w = tw(kw.word, FONTS.sat); kw.h = P.satH
      }
    }
    const linked = kws.filter((kw) => kw.linked).sort((a, b) => a.want - b.want || (a.word < b.word ? -1 : 1))
    const rest = kws.filter((kw) => !kw.linked)
    // 연결 안 된 키워드: 바깥 방향을 중심으로 부채꼴로 펼친다(연결 방향은 비워 둔다)
    const away = linked.length ? norm(Math.atan2(linked.reduce((t, kw) => t + Math.sin(kw.want), 0), linked.reduce((t, kw) => t + Math.cos(kw.want), 0)) + Math.PI) : outward
    const fan = Math.min(220, 70 + 34 * rest.length) * DEG
    rest.forEach((kw, i) => { kw.want = away + (rest.length > 1 ? (i / (rest.length - 1) - 0.5) * fan : 0) + (Rj() - 0.5) * 8 * DEG })
    const place = (kw, spokesList, forcedOk) => {
      const steps = [0]
      for (let d = 10; d <= 180; d += 10) steps.push(d, -d)
      for (const d of steps) for (const L of spokesList) {
        const th = kw.want + d * DEG, len = R + L + (kw.linked ? 0 : Rj() * 6)
        const ax = Math.cos(th) * len, ay = Math.sin(th) * len
        const { side, b } = labelBox(ax, ay, th, kw.w, kw.h, kw.linked)
        if (Math.abs(ax) > R + P.limX || Math.abs(ay) > R + P.limY) continue
        if (boxes.some((o) => overlap(b, o.b, o.t === 'circle' ? 4 : 6))) continue
        if (!spokeOk(ax, ay, b)) continue
        return { th, ax, ay, side, b, forced: false }
      }
      if (!forcedOk) return null
      const th = kw.want, ax = Math.cos(th) * (R + spokesList[0]), ay = Math.sin(th) * (R + spokesList[0])
      return { th, ax, ay, ...labelBox(ax, ay, th, kw.w, kw.h, kw.linked), forced: true }
    }
    const commit = (kw, got) => {
      Object.assign(kw, got)
      boxes.push({ t: kw.linked ? 'pill' : 'sat', b: kw.b, id: kw.id })
      const L = Math.hypot(kw.ax, kw.ay) || 1, sx = kw.ax / L * (R + 1), sy = kw.ay / L * (R + 1)
      const end = kw.linked ? clipBox(kw.b, 0, 0, 1) : [kw.ax - kw.ax / L * 5.5, kw.ay - kw.ay / L * 5.5]
      kw.anchor = [sx, sy]
      spokes.push([sx, sy, end[0], end[1], kw.id])
    }
    for (const kw of linked) commit(kw, place(kw, P.pillSpokes, true))
    for (const kw of rest) commit(kw, place(kw, P.spokes, true))
    const bb = union(boxes.map((o) => o.b), 10)
    return { key: k, s: g.s, name: g.name, nameLines: g.nameLines, codes: g.codes, keys: g.keys, iso: g.iso, block: g.block, R, kws, spokes, boxes, bb }
  }

  // ── 7) 바깥 링 배치: 품질 조건을 못 채우면 높이를 키워 다시 ──
  let pos, cls, text, chains, quality
  for (let grow = 0; grow < 8; grow++, H += 50) {
    const slots = slotsFor(H), at = assign(slots)
    const th = new Map(nodeKeys.map((k) => [k, at.get(k).th]))
    const rho = new Map(nodeKeys.map((k) => [k, 0.95 + 0.05 * rng(seed ^ hash(k))()]))
    pos = new Map(nodeKeys.map((k) => [k, { x: at.get(k).x, y: at.get(k).y }]))
    const ringPlace = (k) => {
      const t = th.get(k), b = cls.get(k).bb, c = Math.cos(t), sn = Math.sin(t)
      const A = W / 2 - P.pad - (c >= 0 ? b[2] : -b[0]), B = H / 2 - P.pad - (sn >= 0 ? b[3] : -b[1])
      const p = pos.get(k); p.x = W / 2 + Math.max(0, A) * rho.get(k) * c; p.y = H / 2 + Math.max(0, B) * rho.get(k) * sn
    }
    const boxAt = (k) => shift(cls.get(k).bb, pos.get(k).x, pos.get(k).y)
    for (let round = 0; round < 3; round++) {
      cls = new Map(nodeKeys.map((k) => [k, buildCluster(k, pos.get(k), pos, H)]))
      nodeKeys.forEach(ringPlace)
      for (let it = 0; it < 500; it++) { // 겹치면 링을 따라 각도만 벌린다(안쪽으로 들이지 않는다)
        let moved = false
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const ki = nodeKeys[i], kj = nodeKeys[j]
          if (!overlap(boxAt(ki), boxAt(kj), P.gap)) continue
          const d = norm(th.get(kj) - th.get(ki)) || 1e-3
          th.set(ki, th.get(ki) - 0.01 * Math.sign(d)); th.set(kj, th.get(kj) + 0.01 * Math.sign(d))
          ringPlace(ki); ringPlace(kj); moved = true
        }
        if (!moved) break
      }
    }
    let clusterOv = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (overlap(boxAt(nodeKeys[i]), boxAt(nodeKeys[j]), 8)) clusterOv++
    // ── 8) 절대 좌표 ──
    text = []
    const kwById = new Map()
    for (const k of nodeKeys) {
      const p = pos.get(k), c = cls.get(k)
      c.x = p.x; c.y = p.y
      c.bbAbs = shift(c.bb, p.x, p.y)
      for (const kw of c.kws) {
        kw.box = shift(kw.b, p.x, p.y); kw.x = p.x + kw.ax; kw.y = p.y + kw.ay; kw.nodeKey = k
        text.push({ t: kw.linked ? 'pill' : 'sat', b: kw.box, id: kw.id })
        kwById.set(kw.id, kw)
      }
      text.push({ t: 'circle', b: [p.x - R, p.y - R, p.x + R, p.y + R], id: null })
    }
    // ── 9) 연결선: 알약 테두리 → 알약 테두리. 글자 위를 지나지 않는 휨을 고르고 이름표는 선 가운데 부분에 ──
    const bez = (p0, p1, p2, t) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]]
    const caps = []
    chains = []
    const lenOf = (c) => { const [p, q] = c.kws.map((kw) => kwById.get(kw.id)); return Math.hypot(p.x - q.x, p.y - q.y) }
    const order = [...concepts].sort((a, b) => lenOf(b) - lenOf(a) || (a.label < b.label ? -1 : 1))
    for (const c of order) {
      const [p, q] = c.kws.map((kw) => kwById.get(kw.id))
      const pc = [(p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2], qc = [(q.box[0] + q.box[2]) / 2, (q.box[1] + q.box[3]) / 2]
      const a0 = clipBox(p.box, qc[0], qc[1], 2), b0 = clipBox(q.box, pc[0], pc[1], 2)
      const L = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1
      const nx = -(b0[1] - a0[1]) / L, ny = (b0[0] - a0[0]) / L, mx = (a0[0] + b0[0]) / 2, my = (a0[1] + b0[1]) / 2
      const outwardSign = Math.sign((mx - W / 2) * nx + (my - H / 2) * ny) || (hash(c.label) % 2 ? 1 : -1)
      // 이름표: 11자를 넘으면 두 줄(공백에서 가장 고르게). 선 위 가운데 부분을 먼저, 안 되면 선 옆으로 조금 비켜 놓는다
      const capLines = c.label.length > 11 ? wrap2(c.label, FONTS.cap, 118) : [c.label]
      const cw = Math.max(...capLines.map((l) => tw(l, FONTS.cap))) + 26, chH = capLines.length > 1 ? 34 : P.capH
      let best = null
      for (const f of [0, 0.08, -0.08, 0.16, -0.16, 0.26, -0.26, 0.36, -0.36]) {
        const ctl = [mx + nx * outwardSign * f * L, my + ny * outwardSign * f * L]
        const pts = Array.from({ length: 33 }, (_, i) => bez(a0, ctl, b0, i / 32))
        let lineHit = 0
        for (const o of text) {
          if (o.id === p.id || o.id === q.id) continue
          for (let i = 0; i < 32; i++) if (segHitsBox(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], [o.b[0] - 3, o.b[1] - 3, o.b[2] + 3, o.b[3] + 3])) { lineHit++; break }
        }
        for (const t of [0.5, 0.43, 0.57, 0.36, 0.64, 0.3, 0.7, 0.22, 0.78]) for (const off of [0, 16, -16, 30, -30]) {
          const [bx, by] = bez(a0, ctl, b0, t), x = bx + nx * off, y = by + ny * off, cb = [x - cw / 2, y - chH / 2, x + cw / 2, y + chH / 2]
          const capHit = text.filter((o) => overlap(cb, o.b, 3)).length + caps.filter((o) => overlap(cb, o, 4)).length
          const cost = lineHit * 10 + capHit * 100 + Math.abs(f) * 2 + Math.abs(t - 0.5) + Math.abs(off) / 40
          if (!best || cost < best.cost) best = { cost, ctl, x, y, cb, lineHit, capHit, off }
        }
        if (best.cost < 1) break
      }
      caps.push(best.cb)
      chains.push({ c, p, q, a0, b0, ctl: best.ctl, x: best.x, y: best.y, cw, ch: chH, capLines, off: best.off, lineHit: best.lineHit, capHit: best.capHit })
    }
    const forced = [...cls.values()].reduce((t, c) => t + c.kws.filter((kw) => kw.forced).length, 0)
    const outside = [...cls.values()].filter((c) => c.bbAbs[0] < 0 || c.bbAbs[2] > W || c.bbAbs[1] < 0 || c.bbAbs[3] > H).length
    quality = { clusterOv, forced, outside, lineHit: chains.reduce((t, c) => t + c.lineHit, 0), capHit: chains.reduce((t, c) => t + c.capHit, 0) }
    if (!clusterOv && !forced && !outside && !quality.lineHit && !quality.capHit) break
  }
  const RS = rng(seed ^ 0x51ED27)
  const dust = Array.from({ length: 46 }, () => ({ x: RS() * W, y: RS() * H, r: 0.5 + RS() * 0.8, a: 0.12 + RS() * 0.2 }))
  const ok = !quality.clusterOv && !quality.forced && !quality.outside && !quality.lineHit && !quality.capHit
  return { W, H, R, ok, quality, clusters: nodeKeys.map((k) => cls.get(k)), chains, innerConcepts, text, dust, empty: !concepts.length }
}
