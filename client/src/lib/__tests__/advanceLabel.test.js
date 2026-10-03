import { describe, it, expect } from 'vitest'
import { advanceButtonLabel, josaRo } from '../advanceLabel'
import { PROCEDURE_LIST } from 'curriculum-weaver-shared/constants.js'

describe('절차 이동 버튼 문구', () => {
  it('내부 코드 대신 표시 코드로 쓴다(제보 사례 Ds-2-1 → Ds-4)', () => {
    expect(advanceButtonLabel('Ds-2-1')).toBe('Ds-4 도구 연결로 이동')
  })
  it('모든 절차에서 내부 코드(예: T-1-1)가 문구에 나오지 않는다', () => {
    for (const p of PROCEDURE_LIST) {
      const text = advanceButtonLabel(p.code)
      expect(text).not.toMatch(/\b[A-Z][a-z]?-\d-\d\b/)
      expect(text.endsWith(' 이동')).toBe(true)
    }
  })
  it('받침에 맞춰 로/으로를 고른다', () => {
    expect(josaRo('도구 연결')).toBe('로')     // ㄹ 받침
    expect(josaRo('평가 설계')).toBe('로')     // 받침 없음
    expect(josaRo('팀 규칙 결정')).toBe('으로') // ㅇ 받침
    expect(josaRo('A-4')).toBe('(으)로')
  })
  it('정의에 없는 코드는 넘겨받은 이름으로, 이름도 없으면 빈 문자열', () => {
    expect(advanceButtonLabel('X-9-9', '다음 절차')).toBe('다음 절차로 이동')
    expect(advanceButtonLabel('X-9-9')).toBe('')
  })
})
