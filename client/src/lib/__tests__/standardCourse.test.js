import { describe, it, expect } from 'vitest'
import { courseLabel, normalizeStandardText, findSameTextAdded } from '../standardCourse'

describe('courseLabel — 묶인 교과를 코드 번호로 가른다', () => {
  it('공통영어1·2를 코드로 공통영어1/2로 나눈다', () => {
    expect(courseLabel({ subject: '공통영어1·2', code: '[10공영1-02-04]' })).toBe('공통영어1')
    expect(courseLabel({ subject: '공통영어1·2', code: '[10공영2-02-04]' })).toBe('공통영어2')
    expect(courseLabel({ subject: '기본영어1·2', code: '[10기영2-01-01]' })).toBe('기본영어2')
  })
  it('묶인 교과가 아니면 이름 그대로(가운뎃점이 원래 이름인 교과 포함)', () => {
    expect(courseLabel({ subject: '기술·가정(고등 일반선택)', code: '[12기가06-01]' })).toBe('기술·가정(고등 일반선택)')
    expect(courseLabel({ subject: '인공지능 기초(진로선택)', code: '[12인기02-06]' })).toBe('인공지능 기초(진로선택)')
  })
  it('코드 번호가 맞지 않거나 값이 없으면 원래 이름', () => {
    expect(courseLabel({ subject: '공통영어1·2', code: '[10공영3-01-01]' })).toBe('공통영어1·2')
    expect(courseLabel({ subject: '공통영어1·2' })).toBe('공통영어1·2')
    expect(courseLabel(null)).toBe('')
  })
})

describe('같은 문장 판정', () => {
  const entry = (code, content) => ({ curriculum_standards: { code, subject: '공통영어1·2', content } })
  const key = (e) => e.curriculum_standards.code
  it('공백·끝 마침표 차이는 같은 문장으로 본다', () => {
    expect(normalizeStandardText(' 자신의 생각이나  의견을 표현한다. ')).toBe('자신의 생각이나 의견을 표현한다')
  })
  it('담은 것과 문장이 같고 코드가 다르면 그 성취기준을 돌려준다', () => {
    const added = [entry('[10공영1-02-04]', '자신의 생각이나 의견, 감정, 감상 등을 표현한다.')]
    const std = { code: '[10공영2-02-04]', content: '자신의 생각이나 의견, 감정, 감상 등을 표현한다.' }
    expect(findSameTextAdded(std, added, key, '[10공영2-02-04]')?.code).toBe('[10공영1-02-04]')
  })
  it('같은 코드 자신이나 다른 문장은 null', () => {
    const added = [entry('[10공영2-02-04]', '같은 문장')]
    expect(findSameTextAdded({ code: '[10공영2-02-04]', content: '같은 문장' }, added, key, '[10공영2-02-04]')).toBeNull()
    expect(findSameTextAdded({ code: '[10공영2-02-06]', content: '다른 문장' }, added, key, '[10공영2-02-06]')).toBeNull()
    expect(findSameTextAdded({ code: 'x' }, added, key, 'x')).toBeNull()
  })
})
