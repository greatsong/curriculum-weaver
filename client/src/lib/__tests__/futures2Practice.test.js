import { describe, expect, it } from 'vitest'
import { ALL_STANDARDS } from '../../../../server/data/standards.js'
import { FUTURE_PRACTICE_SETS, resolvePracticeSet } from '../futures2Practice'
import { buildFutureGraphLayout, groupFutureStandards } from '../futures2GraphLayout'

const catalog = ALL_STANDARDS.map(s => ({ ...s, key: `${s.code}|${s.subject}` }))

describe('실제 성취기준 연습 세트와 배치', () => {
  it.each(FUTURE_PRACTICE_SETS)('$label 세트는 고등학교 정본의 3과목 6개로 구성된다', preset => {
    const { standards, missing } = resolvePracticeSet(catalog, preset)
    expect(missing).toEqual([])
    expect(standards).toHaveLength(6)
    expect(groupFutureStandards(standards)).toHaveLength(3)
    expect(standards.every(s => s.school_level === '고등학교' && s.content.length > 10)).toBe(true)
    expect(new Set(standards.map(s => s.key)).size).toBe(6)
  })

  it('정본 항목이 없거나 모호하면 세트를 잘못된 코드로 대체하지 않는다', () => {
    const preset = FUTURE_PRACTICE_SETS[0]
    expect(resolvePracticeSet([], preset).missing).toHaveLength(6)
    const first = catalog.find(s => s.code === preset.criteria[0].code)
    expect(resolvePracticeSet([...catalog, { ...first, key: 'collision' }], preset).missing).toContain(first.code)
  })

  it.each([false, true])('성취기준 7개를 과목 3개로 묶고 영역을 충분히 띄운다 (세로 %s)', compact => {
    const six = resolvePracticeSet(catalog, FUTURE_PRACTICE_SETS[0]).standards
    const seven = [...six, catalog.find(s => s.code === '[12음03-01]')]
    const layout = buildFutureGraphLayout(seven, { compact })
    expect(layout.groups).toHaveLength(3)
    expect(layout.groups[0].indices).toEqual([0, 1, 6])
    expect(layout.positions).toHaveLength(7)
    for (const [i, a] of layout.positions.entries()) {
      expect(a.x).toBeGreaterThan(180)
      expect(a.x).toBeLessThan(layout.width - 180)
      expect(a.y).toBeGreaterThan(180)
      expect(a.y).toBeLessThan(layout.height - 90)
      for (const b of layout.positions.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(310)
    }
    expect(layout.positions[0].groupIndex).toBe(layout.positions[6].groupIndex)
    if (compact) expect(layout.width).toBe(420)
  })

  it('같은 교과군의 서로 다른 고등 과목은 실제 과목명으로 구분한다', () => {
    const standards = [{ subject: '공통수학1', subject_group: '수학' }, { subject: '공통수학2', subject_group: '수학' }, { subject: '공통수학1', subject_group: '수학' }]
    expect(groupFutureStandards(standards).map(g => g.indices)).toEqual([[0, 2], [1]])
  })
})
