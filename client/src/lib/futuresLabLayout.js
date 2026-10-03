import { groupFutureStandards } from './futures2GraphLayout'

export const LAB_COLORS = ['#c9b5f2', '#e4c893', '#9dcce9', '#efafbd', '#99d8ba', '#c2b8ee', '#d0d5a1']
export const keywordId = (key, word) => JSON.stringify([key, word])
const overlaps = (a, b, gap = 8) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y

/** 과목 묶음 안에서도 성취기준별 키워드의 고유 식별과 소속을 유지한다. */
export function normalizeLabGraph(standards, bridges) {
  const groups = groupFutureStandards(standards).map((g, i) => ({ ...g, id: i, color: LAB_COLORS[i % LAB_COLORS.length], standards: g.indices.map(j => standards[j]), words: [] }))
  const nodes = new Map()
  for (const group of groups) for (const standard of group.standards) {
    for (const word of [...new Set(bridges?.keywords?.[standard.key] || [])]) {
      if (typeof word !== 'string' || !word.trim()) continue
      const node = { id: keywordId(standard.key, word), key: standard.key, word, group: group.id, standard }
      group.words.push(node); nodes.set(node.id, node)
    }
  }
  const concepts = (bridges?.concepts || []).flatMap((concept, i) => {
    const ends = [...new Map((concept.ends || []).map(e => [keywordId(e.key, e.word), nodes.get(keywordId(e.key, e.word))])).values()]
    // 존재하지 않는 끝점을 일부만 제거해 연결 의미를 바꾸지 않는다.
    if (ends.length < 2 || ends.some(e => !e)) return []
    return [{ id: i, label: String(concept.label || '교과 연결'), why: String(concept.why || ''), ends }]
  }).slice(0, 7)
  return { groups, nodes, concepts }
}

/** 실제 픽셀 폭으로 배치한다. 좁은 화면은 글자를 축소하지 않고 과목별로 세로 재배치한다. */
export function layoutLabGraph(standards, bridges, width) {
  const graph = normalizeLabGraph(standards, bridges)
  const w = Math.max(280, width), desktop = w >= 1000, cols = desktop && graph.groups.length > 1 ? 2 : 1
  const obstacles = [], nodes = new Map(), groups = []
  let top = 28
  const rows = []
  if (desktop && graph.groups.length === 3) rows.push([graph.groups[0]], graph.groups.slice(1))
  else for (let i = 0; i < graph.groups.length; i += cols) rows.push(graph.groups.slice(i, i + cols))
  for (const row of rows) {
    let rowHeight = 0
    const boxes = row.map((group, column) => {
      const cellWidth = w / row.length, x = cellWidth * (column + .5)
      const radius = Math.max(94, 55 + group.standards.length * 12)
      const wordWidth = desktop ? 132 : Math.min(136, (w - 60) / 2)
      const lineCount = Math.max(1, ...group.words.map(n => Math.ceil([...n.word].length / Math.max(5, Math.floor(wordWidth / 15)))))
      const step = Math.max(78, lineCount * 21 + 34)
      const count = Math.ceil(group.words.length / 2)
      const height = desktop ? Math.max(radius * 2 + 140, count * step + 84) : radius * 2 + 110 + count * step
      rowHeight = Math.max(rowHeight, height)
      return { ...group, x, y: desktop ? top + height / 2 : top + radius + 10, radius, height, wordWidth, step }
    })
    for (const g of boxes) {
      groups.push(g)
      obstacles.push({ x: g.x - g.radius - 12, y: g.y - g.radius - 12, w: g.radius * 2 + 24, h: g.radius * 2 + 24 })
      const split = Math.ceil(g.words.length / 2)
      g.words.forEach((node, k) => {
        const side = desktop ? (k < split ? -1 : 1) : (k % 2 ? 1 : -1)
        const localIndex = desktop ? k % split : Math.floor(k / 2)
        const count = k < split ? split : g.words.length - split
        const x = desktop ? g.x + side * (g.radius + 78) : w / 2 + side * w / 4
        const y = desktop ? g.y + (localIndex - (count - 1) / 2) * g.step - 12 : g.y + g.radius + 58 + localIndex * g.step
        const standardIndex = g.standards.findIndex(s => s.key === node.key)
        const origin = { x: g.x + side * 58, y: g.y + 5 + (standardIndex - (g.standards.length - 1) / 2) * 25 }
        const textHeight = Math.ceil([...node.word].length / Math.max(5, Math.floor(g.wordWidth / 15))) * 21
        const placed = { ...node, x, y, origin, color: g.color, labelWidth: g.wordWidth, labelHeight: textHeight }
        nodes.set(node.id, placed)
        obstacles.push({ x: x - g.wordWidth / 2 - 4, y: y - 14, w: g.wordWidth + 8, h: textHeight + 40 })
      })
    }
    top += rowHeight + 124
  }
  let height = Math.max(320, top)
  const hubs = graph.concepts.map(concept => {
    const ends = concept.ends.map(e => nodes.get(e.id))
    const mean = { x: ends.reduce((s, e) => s + e.x, 0) / ends.length, y: ends.reduce((s, e) => s + e.y, 0) / ends.length }
    const labelWidth = Math.min(200, w - 44), labelHeight = Math.ceil([...concept.label].length / 12) * 20
    let best = null
    // 가까운 여백부터 후보를 찾는다. 이름표까지 포함한 상자를 확보한다.
    for (let r = 0; r < 8 && !best; r++) for (let a = 0; a < 12; a++) {
      const x = Math.max(labelWidth / 2 + 18, Math.min(w - labelWidth / 2 - 18, mean.x + Math.cos(a * Math.PI / 6) * r * 60))
      const y = Math.max(35, mean.y + Math.sin(a * Math.PI / 6) * r * 60)
      const box = { x: x - labelWidth / 2, y: y - 26, w: labelWidth, h: labelHeight + 72 }
      if (y + box.h > height || obstacles.some(o => overlaps(o, box))) continue
      best = { x, y, box }; break
    }
    if (!best) { best = { x: w / 2, y: height + 32, box: { x: w / 2 - labelWidth / 2, y: height + 6, w: labelWidth, h: labelHeight + 72 } }; height += labelHeight + 110 }
    obstacles.push(best.box)
    const paths = ends.map(end => {
      const choices = [
        { x: end.x, y: best.y }, { x: best.x, y: end.y },
        { x: 12, y: (end.y + best.y) / 2 }, { x: w - 12, y: (end.y + best.y) / 2 },
      ]
      const cost = c => Array.from({ length: 17 }, (_, i) => {
        const t = (i + 1) / 18, x = (1 - t) ** 2 * end.x + 2 * t * (1 - t) * c.x + t * t * best.x, y = (1 - t) ** 2 * end.y + 2 * t * (1 - t) * c.y + t * t * best.y
        return groups.some(g => Math.hypot(x - g.x, y - g.y) < g.radius + 8) ? 1 : 0
      }).reduce((a, b) => a + b, 0)
      const control = choices.reduce((a, b) => cost(a) <= cost(b) ? a : b)
      return { end, d: `M${end.x},${end.y} Q${control.x},${control.y} ${best.x},${best.y}` }
    })
    return { ...concept, ends, ...best, labelWidth, paths }
  })
  return { width: w, height: height + 32, groups, nodes, hubs }
}
