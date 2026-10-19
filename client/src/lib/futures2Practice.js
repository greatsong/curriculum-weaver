/** 연습 세트는 실제 고등학교 성취기준의 코드·교과로 정본에서 조회한다. */
export const FUTURE_PRACTICE_SETS = [
  {
    id: 'music-math-korean', label: '음악 · 수학 · 국어', level: '고등학교',
    description: '음악의 요소와 조합을 탐구하고 매체로 표현하는 연습',
    criteria: [
      { code: '[12음02-01]', group: '음악' }, { code: '[12음03-03]', group: '음악' },
      { code: '[10공수1-03-01]', group: '수학' }, { code: '[10공수1-03-03]', group: '수학' },
      { code: '[10공국1-06-01]', group: '국어' }, { code: '[10공국1-06-02]', group: '국어' },
    ],
  },
  {
    id: 'art-computing-english', label: '미술 · 정보 · 영어', level: '고등학교',
    description: '이미지와 데이터를 활용하고 영어로 소통하는 연습',
    criteria: [
      { code: '[12미01-03]', group: '미술' }, { code: '[12미02-02]', group: '미술' },
      { code: '[12정02-03]', group: '정보' }, { code: '[12정02-04]', group: '정보' },
      { code: '[10공영1-02-01]', group: '영어' }, { code: '[10공영1-02-07]', group: '영어' },
    ],
  },
]

export function resolvePracticeSet(catalog, preset) {
  const standards = [], missing = []
  for (const item of preset.criteria) {
    const matches = (catalog || []).filter(s => s.code === item.code && s.school_level === preset.level && (s.subject_group || s.subject) === item.group)
    if (matches.length !== 1) missing.push(item.code)
    else standards.push(matches[0])
  }
  return { standards, missing }
}
