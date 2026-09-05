import { describe, it, expect } from 'vitest'
import { standardKey, projectStandardKey, codeFromKey, subjectFromKey, pairId } from '../standardKey'

describe('standardKey — (code, 과목) 복합 키', () => {
  it('서버가 key를 주면 key를, 없으면 code로 폴백한다', () => {
    expect(standardKey({ key: '[12심독01-01]|심화 독일어', code: '[12심독01-01]' })).toBe('[12심독01-01]|심화 독일어')
    expect(standardKey({ code: '[10통과2-02-04]' })).toBe('[10통과2-02-04]')
    expect(standardKey(null)).toBeNull()
    expect(standardKey({})).toBeNull()
  })

  it('충돌 코드 두 과목은 서로 다른 키를 가진다', () => {
    const a = { key: '[12심독01-01]|심화 영어 독해와 작문', code: '[12심독01-01]' }
    const b = { key: '[12심독01-01]|심화 독일어', code: '[12심독01-01]' }
    expect(a.code).toBe(b.code)
    expect(standardKey(a)).not.toBe(standardKey(b))
    expect(new Set([standardKey(a), standardKey(b)]).size).toBe(2)
  })

  it('프로젝트 성취기준 행(curriculum_standards 중첩)도 풀어서 키를 뽑는다', () => {
    expect(projectStandardKey({ id: 'row', curriculum_standards: { key: '[12스문01-01]|스페인어권 문화', code: '[12스문01-01]' } }))
      .toBe('[12스문01-01]|스페인어권 문화')
    expect(projectStandardKey({ code: '[12스문01-01]' })).toBe('[12스문01-01]')
  })

  it('codeFromKey는 "|과목" 접미를 떼고 표시용 코드만 돌려준다', () => {
    expect(codeFromKey('[12심독01-01]|심화 독일어')).toBe('[12심독01-01]')
    expect(codeFromKey('[12심독01-01]')).toBe('[12심독01-01]')
    expect(codeFromKey(undefined)).toBe('')
  })

  it('subjectFromKey는 접미 과목명을 돌려준다', () => {
    expect(subjectFromKey('[12심독01-01]|심화 독일어')).toBe('심화 독일어')
    expect(subjectFromKey('[12심독01-01]')).toBeNull()
  })

  it('pairId는 순서 무관이며 "|"가 포함된 키끼리도 충돌하지 않는다', () => {
    const k1 = '[12심독01-01]|심화 독일어'
    const k2 = '[12인기01-01]'
    expect(pairId(k1, k2)).toBe(pairId(k2, k1))
    expect(pairId(k1, k2)).not.toBe(pairId('[12심독01-01]', k2))
    expect(pairId('[12심독01-01]', '심화 독일어|[12인기01-01]')).not.toBe(pairId(k1, k2))
  })
})
