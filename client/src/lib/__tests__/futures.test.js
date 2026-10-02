import { describe, it, expect } from 'vitest'
import {
  parseFuturesSearch, buildFuturesSearch, catalogFromBody, normCode, searchStandards, codesIn, resolveCodes,
  nebulaLayout, NEBULA_VIEW, tipAngle, LENS_SHORT, TIP_STONE,
} from '../futures'

// 고등학교 일반 과목 위주 (충돌 코드 key 하나 포함)
const list = [
  { key: '[12확통01-01]', code: '[12확통01-01]', subject: '확률과 통계', content: '경우의 수를 이해한다.', school_level: '고등학교' },
  { key: '[12생과01-05]', code: '[12생과01-05]', subject: '생명과학', content: '대사성 질환을 예방하기 위한 생활 습관을 토의한다.', school_level: '고등학교' },
  { key: '[12운건01-01]', code: '[12운건01-01]', subject: '운동과 건강', content: '운동이 질환 예방에 미치는 효과를 파악한다.', school_level: '고등학교' },
  { key: '[12정01-01]|정보', code: '[12정01-01]', subject: '정보', content: '개인 정보 보호와 데이터 분석', school_level: '고등학교' },
  { key: '[9수01-01]', code: '[9수01-01]', subject: '수학', content: '소인수분해', school_level: '중학교' },
]

describe('URL 상태', () => {
  it('codes와 model을 읽고 중복을 없애며 최대 6개로 자른다', () => {
    const r = parseFuturesSearch('?codes=a,b,a,c,d,e,f,g&model=precise')
    expect(r.keys).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
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

describe('키워드 성운 배치', () => {
  const stds = [{ key: 'A' }, { key: 'B' }, { key: 'C' }]
  const bridges = {
    keywords: { A: ['태풍', '집중호우'], B: ['도시화', '하천'], C: ['발표'] },
    concepts: [{ label: '도시 재해 위험', ends: [{ key: 'A', word: '집중호우' }, { key: 'B', word: '도시화' }], why: '…' }],
  }
  it('성취기준마다 중심, 키워드마다 별, 만나는 키워드는 hit로 표시한다', () => {
    const { centers, keywords, links } = nebulaLayout(stds, bridges)
    expect(centers).toHaveLength(3)
    expect(keywords).toHaveLength(5)
    expect(keywords.filter((k) => k.hit).map((k) => k.word).sort()).toEqual(['도시화', '집중호우'])
    expect(links).toHaveLength(1)
    expect(links[0].words).toEqual(['집중호우', '도시화'])
    for (const k of keywords) { expect(k.x).toBeGreaterThan(0); expect(k.x).toBeLessThan(NEBULA_VIEW.w); expect(k.y).toBeGreaterThan(0); expect(k.y).toBeLessThan(NEBULA_VIEW.h) }
  })
  it('만나는 키워드는 상대 성운 쪽 자리에 놓인다', () => {
    const { centers, keywords } = nebulaLayout(stds, bridges)
    const a = keywords.find((k) => k.word === '집중호우'), other = keywords.find((k) => k.word === '태풍')
    const toB = Math.hypot(centers[1].x - a.x, centers[1].y - a.y), otherToB = Math.hypot(centers[1].x - other.x, centers[1].y - other.y)
    expect(toB).toBeLessThan(otherToB)
  })
  it('연결 지도가 없으면 중심만, 모르는 성취기준을 가리키는 연결은 버린다', () => {
    expect(nebulaLayout(stds, null)).toMatchObject({ keywords: [], links: [] })
    const bad = { ...bridges, concepts: [{ label: 'x', ends: [{ key: 'A', word: '태풍' }, { key: 'Z', word: '?' }] }] }
    expect(nebulaLayout(stds, bad).links).toHaveLength(0)
  })
  it('마방진 꼭지 k는 자기 칸(왼쪽 위부터 시계 방향)을 가리킨다', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(tipAngle)).toEqual([-135, -90, -45, 0, 45, 90, 135, 180])
    expect(LENS_SHORT).toHaveLength(8)
    expect(TIP_STONE).toHaveLength(8)
  })
})

describe('연결 이름표 자리', () => {
  it('이름표는 키워드 별 위에 놓이지 않는다(겹치지 않는 자리를 고른다)', () => {
    const stds = [{ key: 'A', subject: '지구과학' }, { key: 'B', subject: '한국지리 탐구' }, { key: 'C', subject: '인공지능 수학' }, { key: 'D', subject: '화법과 언어' }]
    const bridges = {
      keywords: { A: ['태풍', '집중호우', '악기상', '대처 방안'], B: ['도시화', '하천', '산지'], C: ['빅데이터', '인공지능'], D: ['발표', '비언어적 표현'] },
      concepts: [
        { label: '재해 대응 발표', ends: [{ key: 'A', word: '대처 방안' }, { key: 'D', word: '발표' }] },
        { label: '기상 빅데이터', ends: [{ key: 'A', word: '태풍' }, { key: 'C', word: '빅데이터' }] },
        { label: '개발 지역 침수 위험', ends: [{ key: 'A', word: '집중호우' }, { key: 'B', word: '도시화' }] },
      ],
    }
    const { keywords, links } = nebulaLayout(stds, bridges)
    for (const l of links) {
      for (const k of keywords) {
        const inside = Math.abs(k.x - l.hx) < l.w / 2 - 4 && Math.abs(k.y - l.hy) < 10
        expect(inside, `${l.label} 이름표가 ${k.word} 별을 덮음`).toBe(false)
      }
    }
  })
})
