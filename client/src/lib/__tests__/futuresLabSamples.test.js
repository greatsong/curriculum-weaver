import { describe, expect, it } from 'vitest'
import { ALL_STANDARDS } from '../../../../server/data/standards.js'
import { FUTURES_LAB_SAMPLES } from '../futuresLabSamples'
import { resolvePracticeSet } from '../futures2Practice'
import { groupFutureStandards } from '../futures2GraphLayout'

const catalog = ALL_STANDARDS.map(s => ({ ...s, key: `${s.code}|${s.subject}` }))
describe('실험실 학년별 샘플의 실제 성취기준', () => {
  it.each(FUTURES_LAB_SAMPLES)('$grade · $label은 중복·모호함 없이 실제 3과목 6개로 해석된다', preset => {
    const { standards, missing } = resolvePracticeSet(catalog, preset)
    expect(missing).toEqual([])
    expect(new Set(standards.map(s => s.key)).size).toBe(6)
    const groups = groupFutureStandards(standards)
    expect(groups).toHaveLength(3)
    expect(groups.every(g => g.indices.length === 2)).toBe(true)
    expect(standards.every(s => s.school_level === '고등학교' && s.content.length > 10)).toBe(true)
    expect(standards.every(s => s.code.startsWith(preset.grade === '고1' ? '[10' : '[12'))).toBe(true)
  })
  it('고1은 국어·통합과학·영어 두 주제, 고2–3은 요청한 조합 각각 한 주제다', () => {
    const first = FUTURES_LAB_SAMPLES.filter(p => p.grade === '고1')
    expect(first).toHaveLength(2)
    for (const p of first) {
      const { standards } = resolvePracticeSet(catalog, p)
      expect(new Set(standards.map(s => s.subject_group))).toEqual(new Set(['국어', '과학', '영어']))
      expect(standards.filter(s => s.subject_group === '과학').every(s => s.subject.startsWith('통합과학'))).toBe(true)
    }
    expect(FUTURES_LAB_SAMPLES.filter(p => p.grade === '고2–3').map(p => p.subjects)).toEqual(['국어 · 음악 · 수학', '미술 · 영어 · 정보'])
    expect(new Set(FUTURES_LAB_SAMPLES.map(p => p.criteria.map(c => c.code).sort().join(','))).size).toBe(4)
  })
})
