import { describe, expect, it } from 'vitest'
import { inferProjectGradeFromStandardKeys, PROJECT_GRADE_OPTIONS } from '../../../shared/constants.js'

describe('inferProjectGradeFromStandardKeys — 담아 온 성취기준으로 학년 미리 고르기', () => {
  it('고1 공통과목과 고등 선택과목은 고등학교', () => {
    expect(inferProjectGradeFromStandardKeys(['[10공국2-02-01]', '[10통과2-02-03]', '[12생과01-05]|생명과학'])).toBe('고등학교')
  })
  it('중학교와 초등 학년군을 구분한다', () => {
    expect(inferProjectGradeFromStandardKeys(['[9수01-01]', '[9과02-03]'])).toBe('중학교')
    expect(inferProjectGradeFromStandardKeys(['[4국01-01]'])).toBe('초등학교 3-4학년')
    expect(inferProjectGradeFromStandardKeys(['[6사01-01]', '[6과02-01]'])).toBe('초등학교 5-6학년')
  })
  it('학교급이 섞이거나 선택지에 없는 학년군이면 비운다', () => {
    expect(inferProjectGradeFromStandardKeys(['[9수01-01]', '[10공수1-01-01]'])).toBe('')
    expect(inferProjectGradeFromStandardKeys(['[2바01-01]', '[2슬01-01]'])).toBe('')
    expect(inferProjectGradeFromStandardKeys([])).toBe('')
  })
  it('숫자 없는 전문교과 코드는 판단에서 뺀다', () => {
    expect(inferProjectGradeFromStandardKeys(['[공관 01-01]', '[12정보01-01]'])).toBe('고등학교')
    expect(inferProjectGradeFromStandardKeys(['[공관 01-01]'])).toBe('')
  })
  it('추정값은 항상 선택지 안에 있다', () => {
    const values = new Set(PROJECT_GRADE_OPTIONS.map(o => o.value))
    for (const k of ['[4a]', '[6a]', '[9a]', '[10a]', '[12a]']) expect(values.has(inferProjectGradeFromStandardKeys([k]))).toBe(true)
  })
})
