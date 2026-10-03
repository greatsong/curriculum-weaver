import { describe, it, expect } from 'vitest'
import { buildRecommendBoardContext, resolveRecommendScope, recommendBasisText } from '../recommendContext'

const designs = [
  { procedure_code: 'prep', content: { grade: '고등학교 1학년', studentCount: 28 } },
  { procedure_code: 'T-1-1', content: { individualVisions: [{ vision: '행복', teacherName: '교사팀' }], commonVision: '영어로 나만의 생각을 창조적으로 표현하고, 바이브 코딩으로 디지털 결과물을 만든다.' } },
  { procedure_code: 'A-1-2', content: { selectedTopic: '나를 소개하는 영어 웹 포트폴리오' } },
]

describe('추천 근거 모으기', () => {
  it('팀 공통 비전·최종 선정 주제·학습자 맥락을 골라낸다', () => {
    const ctx = buildRecommendBoardContext(designs)
    expect(ctx.vision).toContain('바이브 코딩')
    expect(ctx.selectedTopic).toBe('나를 소개하는 영어 웹 포트폴리오')
    expect(ctx.prep).toEqual({ grade: '고등학교 1학년', studentCount: 28 })
  })

  it('AI가 한글 라벨 키로 저장한 보드도 읽는다', () => {
    const ctx = buildRecommendBoardContext([
      { procedure_code: 'T-1-1', content: { '팀 공통 비전': '라벨 키 비전' } },
      { procedure_code: 'A-1-2', content: { '최종 선정 주제': '라벨 키 주제' } },
    ])
    expect(ctx).toEqual({ vision: '라벨 키 비전', selectedTopic: '라벨 키 주제' })
  })

  it('보드가 없거나 모양이 달라도 빈 맥락으로 돌아간다 (예전처럼 교과·학년만으로 추천)', () => {
    expect(buildRecommendBoardContext(undefined)).toEqual({})
    expect(buildRecommendBoardContext([{ procedure_code: 'T-1-1', content: { commonVision: { nested: true } } }, { content: 'x' }])).toEqual({})
    expect(buildRecommendBoardContext([{ procedure_code: 'prep', content: { grade: '', studentCount: null } }])).toEqual({})
  })

  it('긴 비전은 잘라서 보낸다', () => {
    const ctx = buildRecommendBoardContext([{ procedure_code: 'T-1-1', content: { commonVision: '가'.repeat(5000) } }])
    expect(ctx.vision.length).toBe(1000)
  })
})

describe('추천 범위', () => {
  it('성취기준을 하나도 안 담아도 프로젝트 교과·학년으로 추천한다', () => {
    expect(resolveRecommendScope({ project: { subjects: ['영어', '정보'], grade: '고등학교' }, sessionStandards: [] }))
      .toEqual({ subjects: ['영어', '정보'], grade: '고등학교' })
  })

  it('담은 성취기준의 교과를 합치고, 학년은 프로젝트 값을 우선한다', () => {
    const sessionStandards = [{ curriculum_standards: { subject_group: '수학', grade_group: '고공통' } }]
    expect(resolveRecommendScope({ project: { subjects: ['영어'], grade: '고등학교 1학년' }, sessionStandards }))
      .toEqual({ subjects: ['영어', '수학'], grade: '고등학교' })
  })

  it('프로젝트에 교과·학년이 없으면 담은 성취기준에서 가져온다 (설정 마법사 프로젝트)', () => {
    const sessionStandards = [
      { curriculum_standards: { subject_group: '과학', grade_group: '중1-3' } },
      { subject_group: '사회', grade_group: '중1-3' },
    ]
    expect(resolveRecommendScope({ project: { subjects: [] }, sessionStandards })).toEqual({ subjects: ['과학', '사회'], grade: '중1-3' })
  })

  it('교과를 전혀 알 수 없으면 빈 목록 (화면이 안내 문구를 띄운다)', () => {
    expect(resolveRecommendScope({ project: null, sessionStandards: [] }).subjects).toEqual([])
  })
})

describe('추천 근거 안내 문구', () => {
  it('근거에 따라 조사까지 맞게 바뀐다', () => {
    expect(recommendBasisText({ vision: 'v', selectedTopic: 't' })).toBe('팀 공통 비전과 최종 선정 주제를 바탕으로 고른 성취기준입니다.')
    expect(recommendBasisText({ vision: 'v' })).toBe('팀 공통 비전을 바탕으로 고른 성취기준입니다.')
    expect(recommendBasisText({ selectedTopic: 't' })).toBe('최종 선정 주제를 바탕으로 고른 성취기준입니다.')
    expect(recommendBasisText({})).toBe('프로젝트 교과와 융합 가능한 성취기준입니다.')
  })
})
