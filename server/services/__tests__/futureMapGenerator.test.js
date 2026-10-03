/**
 * 미래 지도 생성기 — 기존 미래 보기 생성기와 다른 규칙 두 가지를 검증한다.
 *   1) 연결은 서로 다른 과목 사이에서만(한 과목뿐이면 그 안에서) — 프롬프트 쌍 목록·6-1 규칙·V9-1 검증
 *   2) 동사형 키워드('~한다', 받침 ㄴ+다, '~하는')는 버린다 — V5-1
 * 그 밖의 규칙(V1~V16, C1~C7, 캐시·큐)은 원본 생성기 테스트가 담당한다.
 */
import { describe, it, expect } from 'vitest'
import {
  crossSubjectPairIds, isMultiSubject, hasVerbTail, filterKeywords, parseBridges, buildBridgePrompt,
  bridgeCacheKey, futureCacheKey,
} from '../futureMapGenerator.js'

const S = [
  { key: '[12음02-01]', code: '[12음02-01]', subject: '음악', subject_group: '음악', content: '음악을 듣고 다양한 음악 요소와 원리를 인지하며 분석한다.' },
  { key: '[12음03-03]', code: '[12음03-03]', subject: '음악', subject_group: '음악', content: '음악 요소와 음악적 특징의 변화를 활용하여 다양한 형식의 음악을 만든다.' },
  { key: '[10공수1-03-03]', code: '[10공수1-03-03]', subject: '공통수학1, 공통수학2', subject_group: '수학', content: '조합의 개념을 이해하고, 조합의 수를 구하는 방법을 설명할 수 있다.' },
]

describe('과목 간 연결만 찾는다', () => {
  it('과목이 둘 이상이면 서로 다른 과목의 쌍만 검토 목록에 넣는다', () => {
    expect(isMultiSubject(S)).toBe(true)
    expect(crossSubjectPairIds(S)).toEqual(['S1-S3', 'S2-S3'])
  })
  it('한 과목뿐이면 전체 쌍을 검토한다', () => {
    const one = S.slice(0, 2)
    expect(isMultiSubject(one)).toBe(false)
    expect(crossSubjectPairIds(one)).toEqual(['S1-S2'])
  })
  it('프롬프트에 과목 간 연결 규칙(6-1)과 과목 간 쌍만 들어간다', () => {
    const p = buildBridgePrompt(S, [])
    expect(p).toContain('6-1. 연결은 서로 다른 과목의 성취기준 사이에서만')
    expect(p).toContain('S1-S3, S2-S3')
    expect(p).not.toContain('S1-S2,')
    expect(buildBridgePrompt(S.slice(0, 2), [])).not.toContain('6-1.')
  })
  it('V9-1: 같은 과목의 두 성취기준을 잇는 연결은 버리고, 과목 간 연결만 남긴다', () => {
    const text = JSON.stringify({
      keywords: [{ id: 'S1', words: ['음악 요소와 원리'] }, { id: 'S2', words: ['다양한 형식의 음악', '음악 요소'] }, { id: 'S3', words: ['조합의 수'] }],
      links: [
        { label: '음악 요소 분석', kind: 'same', strength: 3, ends: [{ id: 'S1', word: '음악 요소와 원리' }, { id: 'S2', word: '음악 요소' }], why: '같은 과목' },
        { label: '선율 조합 계산', kind: 'method', strength: 2, ends: [{ id: 'S3', word: '조합의 수' }, { id: 'S2', word: '다양한 형식의 음악' }], why: '음 배열의 조합의 수를 세어 음악을 만든다' },
      ],
    })
    const b = parseBridges(text, S)
    expect(b.concepts.map((c) => c.label)).toEqual(['선율 조합 계산'])
    expect(b.isolated).toEqual(['[12음02-01]'])
  })
  it('한 과목뿐이면 그 과목 안의 연결을 허용한다', () => {
    const one = S.slice(0, 2)
    const text = JSON.stringify({
      keywords: [{ id: 'S1', words: ['음악 요소와 원리'] }, { id: 'S2', words: ['음악 요소'] }],
      links: [{ label: '음악 요소 분석', kind: 'same', strength: 3, ends: [{ id: 'S1', word: '음악 요소와 원리' }, { id: 'S2', word: '음악 요소' }], why: '요소를 분석해 변주에 쓴다' }],
    })
    expect(parseBridges(text, one).concepts).toHaveLength(1)
  })
})

describe('동사형 키워드를 버린다 (V5-1)', () => {
  it('서술형 꼬리를 알아본다', () => {
    for (const w of ['만든다', '구한다', '분석한다', '비판적으로분석한다', '설명할수있다', '탐구하는', '제작하여']) expect(hasVerbTail(w), w).toBe(true)
    for (const w of ['바다', '분석', '제작', '조합의수', '데이터', '토의']) expect(hasVerbTail(w), w).toBe(false)
  })
  it('filterKeywords가 원문에 있는 동사형도 버리고 명사구만 남긴다', () => {
    const kept = filterKeywords(['음악 요소', '다양한 형식의 음악', '만든다', '음악적 특징의 변화'], S[1].content)
    expect(kept.map((k) => k.display)).toEqual(['음악 요소', '다양한 형식의 음악', '음악적 특징의 변화'])
  })
})

describe('캐시 키는 미래 보기와 섞이지 않는다', () => {
  it('접두가 fmap-', () => {
    expect(bridgeCacheKey(['b', 'a'])).toBe('fmap-bridge:v1:a|b')
    expect(futureCacheKey('fast', ['b', 'a'], 3)).toBe('fmap-future:v1:fast:a|b#3')
  })
})
