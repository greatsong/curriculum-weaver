/** 과목 수와 성취기준 수를 분리한다. 같은 과목은 한 영역, 각 성취기준은 독립된 스톤이다. */
export function subjectOfStandard(s) {
  const subject = String(s.subject || s.subject_group || '교과').replace(/\(.*\)/, '').trim()
  // 정본이 공통과목 1·2를 한 이름으로 저장한 경우 실제 코드의 과목을 표시한다.
  for (const [name, prefix] of [['공통수학', '공수'], ['공통국어', '공국'], ['공통영어', '공영']]) {
    const match = String(s.code || '').match(new RegExp(`${prefix}([12])-`))
    if (subject.startsWith(name) && match) return `${name}${match[1]}`
  }
  return subject
}

export function groupFutureStandards(standards) {
  const groups = []
  standards.forEach((s, index) => {
    const subject = subjectOfStandard(s)
    let group = groups.find(g => g.subject === subject)
    if (!group) { group = { subject, indices: [], colorIndex: groups.length }; groups.push(group) }
    group.indices.push(index)
  })
  return groups
}

/** 키워드와 이름을 포함한 스톤 영역을 겹치지 않게 배치한다. 모바일에서는 과목별로 세로 배치한다. */
export function buildFutureGraphLayout(standards, { compact = false } = {}) {
  const groups = groupFutureStandards(standards)
  const columns = compact ? 1 : Math.min(4, Math.max(1, groups.length))
  const cellWidth = 420, rowHeight = 310, headerHeight = 74, bottom = 120
  const positions = [], regions = []
  let top = 0
  for (let first = 0; first < groups.length; first += columns) {
    const row = groups.slice(first, first + columns)
    const height = headerHeight + Math.max(...row.map(g => g.indices.length)) * rowHeight
    row.forEach((g, column) => {
      const x = column * cellWidth
      regions.push({ ...g, x: x + 14, y: top + 12, width: cellWidth - 28, height: headerHeight + g.indices.length * rowHeight - 20 })
      g.indices.forEach((index, localIndex) => {
        positions[index] = { x: x + cellWidth / 2, y: top + headerHeight + 150 + localIndex * rowHeight, groupIndex: g.colorIndex }
      })
    })
    top += height + 34
  }
  const width = columns * cellWidth, height = Math.max(400, top + bottom)
  return { width, height, positions, regions, groups, center: { x: width / 2, y: Math.min(height / 2, 400) } }
}
