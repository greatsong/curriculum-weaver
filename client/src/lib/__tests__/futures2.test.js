import { describe, it, expect } from 'vitest'
import {
  parseFuturesSearch, buildFuturesSearch, catalogFromBody, normCode, searchStandards, codesIn, resolveCodes, mergeStandardCodes,
} from '../futures2'

// 고등학교 일반 과목 위주 (충돌 코드 key 하나 포함)
const list = [
  { key: '[12확통01-01]', code: '[12확통01-01]', subject: '확률과 통계', content: '경우의 수를 이해한다.', school_level: '고등학교' },
  { key: '[12생과01-05]', code: '[12생과01-05]', subject: '생명과학', content: '대사성 질환을 예방하기 위한 생활 습관을 토의한다.', school_level: '고등학교' },
  { key: '[12운건01-01]', code: '[12운건01-01]', subject: '운동과 건강', content: '운동이 질환 예방에 미치는 효과를 파악한다.', school_level: '고등학교' },
  { key: '[12정01-01]|정보', code: '[12정01-01]', subject: '정보', content: '개인 정보 보호와 데이터 분석', school_level: '고등학교' },
  { key: '[9수01-01]', code: '[9수01-01]', subject: '수학', content: '소인수분해', school_level: '중학교' },
]

describe('URL 상태', () => {
  it('과목 이름에 쉼표가 들어가는 충돌 키도 새로고침과 공유에서 보존한다', () => {
    const keys = ['[10공수1-03-01]|공통수학1, 공통수학2', '[12음02-01]']
    expect(parseFuturesSearch(buildFuturesSearch(keys, 'fast'))).toEqual({ keys, model: 'fast' })
  })
  it('codes와 model을 읽고 중복을 없애며 최대 7개로 자른다', () => {
    const r = parseFuturesSearch('?codes=a,b,a,c,d,e,f,g,h&model=precise')
    expect(r.keys).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(r.model).toBe('precise')
    expect(parseFuturesSearch('').model).toBe('fast')
  })
  it('충돌 코드 key(코드|과목)를 그대로 오간다', () => {
    const search = buildFuturesSearch(['[12정01-01]|정보', '[12확통01-01]'], 'precise')
    expect(parseFuturesSearch(search)).toEqual({ keys: ['[12정01-01]|정보', '[12확통01-01]'], model: 'precise' })
    expect(buildFuturesSearch([], 'fast')).toBe('')
  })
})

describe('목록', () => {
  it('fields·rows를 객체로 바꾼다', () => {
    expect(catalogFromBody({ fields: ['key', 'code'], rows: [['k', 'c']] })).toEqual([{ key: 'k', code: 'c' }])
    expect(catalogFromBody(null)).toEqual([])
  })
})

describe('성취기준 검색', () => {
  it('대괄호·띄어쓰기·하이픈 없이 쳐도 코드를 찾는다', () => {
    expect(normCode('[12생과01-05]')).toBe(normCode('12 생과 0105'))
    expect(searchStandards(list, '12생과0105')[0].key).toBe('[12생과01-05]')
    expect(searchStandards(list, '생과01')[0].key).toBe('[12생과01-05]')
  })
  it('코드 정확 일치가 맨 앞, 학교급·제외 목록을 반영한다', () => {
    expect(searchStandards(list, '[12확통01-01]').map((s) => s.key)).toEqual(['[12확통01-01]'])
    expect(searchStandards(list, '01-01', { level: '고등학교' }).map((s) => s.key)).toEqual(['[12운건01-01]', '[12정01-01]|정보', '[12확통01-01]'])
    expect(searchStandards(list, '01-01', { level: '고등학교', exclude: new Set(['[12확통01-01]']) }).map((s) => s.key)).not.toContain('[12확통01-01]')
  })
  it('낱말 검색은 띄어쓰기를 무시하고 여러 낱말을 모두 만족해야 한다', () => {
    expect(searchStandards(list, '개인정보').map((s) => s.key)).toEqual(['[12정01-01]|정보'])
    expect(searchStandards(list, '질환 예방').map((s) => s.key)).toEqual(['[12생과01-05]', '[12운건01-01]'])
    expect(searchStandards(list, '질환 확률')).toHaveLength(0)
  })
  it('빈 검색어와 한 글자 낱말은 결과가 없다', () => {
    expect(searchStandards(list, '')).toHaveLength(0)
    expect(searchStandards(list, '수')).toHaveLength(0)
  })
})

describe('코드 여러 개 붙여 넣기', () => {
  it('이미 담긴 코드와 중복 입력은 한도 초과로 보고하지 않는다', () => {
    const selected = list.map(s => s.key)
    const repeated = mergeStandardCodes(list, '[12생과01-05], [12생과01-05]', selected)
    expect(repeated).toMatchObject({ added: 0, duplicates: 1, overflow: 0, missing: [] })
  })
  it('7개 제한을 넘는 새 코드와 찾지 못한 코드를 각각 안내한다', () => {
    const selected = ['a', 'b', 'c', 'd', 'e', list[0].key]
    expect(mergeStandardCodes(list, '[12생과01-05], [12운건01-01], [12없음99-99]', selected)).toEqual({
      keys: [...selected, list[1].key], added: 1, duplicates: 0, overflow: 1, missing: ['[12없음99-99]'],
    })
  })
  it('모든 코드가 잘못되어도 현재 선택을 보존하고 오류를 알려준다', () => {
    expect(mergeStandardCodes(list, '[12없음99-99], [12없음99-99]', [list[0].key])).toEqual({
      keys: [list[0].key], added: 0, duplicates: 0, overflow: 0, missing: ['[12없음99-99]'],
    })
  })
  it('쉼표·줄바꿈·붙은 대괄호를 모두 나눈다', () => {
    expect(codesIn('[12생과01-05], [12운건01-01]')).toEqual(['[12생과01-05]', '[12운건01-01]'])
    expect(codesIn('[12생과01-05]\n[12운건01-01]')).toHaveLength(2)
    expect(codesIn('[12생과01-05][12운건01-01]')).toHaveLength(2)
    expect(codesIn('[12생과01-05] [12운건01-01]')).toEqual(['[12생과01-05]', '[12운건01-01]'])
    expect(codesIn('확률')).toEqual(['확률'])
  })
  it('찾은 것과 못 찾은 코드를 나눈다', () => {
    const { found, missing } = resolveCodes(list, ['12생과01-05', '[12운건01-01]', '[12없음99-99]', '[12생과01-05]'])
    expect(found.map((s) => s.key)).toEqual(['[12생과01-05]', '[12운건01-01]'])
    expect(missing).toEqual(['[12없음99-99]'])
  })
})

describe('교과별 성취기준 목록', () => {
  it('검색어 없이 교과를 골라 목록을 보고 학교급·선택 제외를 적용한다', () => {
    const catalog = list.map(s => ({ ...s, subject_group: s.subject === '확률과 통계' || s.subject === '수학' ? '수학' : s.subject }))
    expect(searchStandards(catalog, '', { subject: '수학' }).map(s => s.key)).toEqual(['[12확통01-01]', '[9수01-01]'])
    expect(searchStandards(catalog, '', { subject: '수학', level: '중학교' }).map(s => s.key)).toEqual(['[9수01-01]'])
    expect(searchStandards(catalog, '', { subject: '수학', exclude: new Set(['[9수01-01]']) }).map(s => s.key)).toEqual(['[12확통01-01]'])
  })
})
