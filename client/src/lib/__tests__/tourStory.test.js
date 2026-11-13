import { describe, it, expect } from 'vitest'
import { josa, buildStory } from '../tourStory'

describe('josa', () => {
  it('받침 유무로 조사를 고른다', () => {
    expect(josa('과학계열전문', '과', '와')).toBe('과')
    expect(josa('수학', '과', '와')).toBe('과')
    expect(josa('국어', '과', '와')).toBe('와')
    expect(josa('기술·가정', '을', '를')).toBe('을')
    expect(josa('정보', '을', '를')).toBe('를')
    expect(josa('AI', '과', '와')).toBe('와')
  })
})

describe('buildStory', () => {
  it('받침 있는 상대 교과에 맞는 조사를 붙인다', () => {
    // 세 문장 중 무엇이 고르든 '과학계열전문와'·'과학계열전문를'은 나오지 않아야 한다
    for (const g of ['과학', '수학', '국어', '사회', '영어', '정보', '도덕', '음악']) {
      const s = buildStory(g, '과학계열전문')
      expect(s).not.toMatch(/전문와|전문를/)
    }
    const s = buildStory('국어', '정보')
    expect(s).not.toMatch(/정보과 |정보을/)
  })
  it('대표 주제 두 개를 앞 주제 받침에 맞춰 잇는다', () => {
    expect(buildStory('과학', '수학', ['적분을 이용한 일과 에너지 계산', '탐구 데이터의 통계적 시각화']))
      .toContain("'적분을 이용한 일과 에너지 계산'과 '탐구 데이터의 통계적 시각화'입니다.")
    expect(buildStory('과학', '수학', ['기후 위기', '에너지 전환']))
      .toContain("'기후 위기'와 '에너지 전환'입니다.")
    expect(buildStory('과학', '수학', ['기후 위기'])).toContain("주제는 '기후 위기'입니다.")
  })
})
