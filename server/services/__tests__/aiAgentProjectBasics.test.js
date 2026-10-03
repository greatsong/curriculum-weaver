/**
 * 프로젝트를 만들 때 고른 교과·학년이 AI 시스템 프롬프트에 들어가는지 고정한다.
 *
 * 2026-10-03 제보: 프로젝트 만들기에서 학년·교과를 골랐는데 준비 절차 AI가
 * "대상 학년이 어떻게 되나요?"라고 처음부터 다시 물었다. 원인은 프롬프트가
 * 학습자 맥락 보드의 학년만 읽고 projects.grade·subjects는 읽지 않던 것.
 */
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../aiAgent.js'
import { describeProjectGrade, PROJECT_GRADE_OPTIONS } from 'curriculum-weaver-shared/constants.js'

const base = {
  standards: [],
  materials: [],
  boards: [],
  recentMessages: [],
  currentStep: null,
}

const project = { title: '기후 융합수업', grade: '중학교', subjects: ['과학', '사회'] }

describe('프로젝트 교과·학년 → AI 프롬프트', () => {
  it('교과가 설계 세션 섹션에 들어간다 (모든 절차)', () => {
    const prompt = buildSystemPrompt({ ...base, session: project, procedure: 'T-2-1' })
    expect(prompt).toContain('교과: 과학, 사회 (프로젝트를 만들 때 교사가 선택)')
  })

  it('보드가 비어 있으면 프로젝트 학년이 학습자 맥락에 들어간다', () => {
    const prompt = buildSystemPrompt({ ...base, session: project, procedure: 'T-2-1' })
    expect(prompt).toContain('[학습자 맥락]')
    expect(prompt).toContain('학년: 중학교 (프로젝트를 만들 때 교사가 선택')
    expect(prompt).toContain('구체 학년은 아직 모름')
  })

  it('보드 학년이 있으면 보드 값이 우선하고 프로젝트 학년은 쓰지 않는다', () => {
    const boards = [{ board_type: 'learner_context', content: { grade: '중학교 2학년', studentCount: 25 } }]
    const prompt = buildSystemPrompt({ ...base, session: project, boards, procedure: 'T-2-1' })
    expect(prompt).toContain('학년: 중학교 2학년')
    expect(prompt).toContain('학생 수: 25')
    expect(prompt).not.toContain('프로젝트를 만들 때 교사가 선택, 학교급')
  })

  it('준비 절차에서는 이미 받은 정보를 다시 묻지 말라고 지시한다', () => {
    const prompt = buildSystemPrompt({ ...base, session: project, procedure: 'prep' })
    expect(prompt).toContain('[프로젝트를 만들 때 이미 받은 정보]')
    expect(prompt).toContain('- 대상 학년: 중학교')
    expect(prompt).toContain('- 교과: 과학, 사회')
    expect(prompt).toContain('다시 묻지 않는다')
    expect(prompt).toContain('구체 학년만 짧게 확인한다')
  })

  it('설정 마법사의 구체 학년(중2)은 그대로 쓰고 구체 학년을 다시 묻지 않는다', () => {
    const prompt = buildSystemPrompt({ ...base, session: { title: 't', grade: '중2' }, procedure: 'prep' })
    expect(prompt).toContain('- 대상 학년: 중2')
    expect(prompt).not.toContain('구체 학년만 짧게 확인한다')
  })

  it('보드에 학년이 있으면 준비 절차 지시에서 학년은 빠지고 교과만 남는다', () => {
    const boards = [{ board_type: 'learner_context', content: { grade: '고등학교 1학년' } }]
    const prompt = buildSystemPrompt({ ...base, session: project, boards, procedure: 'prep' })
    expect(prompt).toContain('- 교과: 과학, 사회')
    expect(prompt).not.toContain('- 대상 학년:')
    expect(prompt).not.toContain('보드에 반영하자고 제안한다')
  })

  it('학년·교과가 없는 프로젝트는 기존과 같다 (섹션 미생성)', () => {
    const prompt = buildSystemPrompt({ ...base, session: { title: 't' }, procedure: 'prep' })
    expect(prompt).not.toContain('[프로젝트를 만들 때 이미 받은 정보]')
    expect(prompt).not.toContain('[학습자 맥락]')
  })

  it('시연 모드에는 준비 절차 지시를 넣지 않는다', () => {
    const prompt = buildSystemPrompt({ ...base, session: project, procedure: 'demo_lesson_plan', mode: 'demo' })
    expect(prompt).not.toContain('[프로젝트를 만들 때 이미 받은 정보]')
  })

  it('프롬프트에 내부 절차 코드가 새로 들어가지 않는다', () => {
    const prompt = buildSystemPrompt({ ...base, session: project, procedure: 'prep' })
    const section = prompt.split('[프로젝트를 만들 때 이미 받은 정보]')[1].split('\n[')[0]
    expect(section).not.toMatch(/\bprep\b|[TA]-\d-\d/)
  })
})

describe('describeProjectGrade', () => {
  it('현재 폼 선택지는 학교급·학년군 범위로 해석한다', () => {
    for (const o of PROJECT_GRADE_OPTIONS) {
      expect(describeProjectGrade(o.value)).toEqual({ text: o.value, isRange: true })
    }
  })

  it('고등학교는 공통·선택 구분 없이 하나다', () => {
    expect(PROJECT_GRADE_OPTIONS.filter((o) => o.label.startsWith('고등학교'))).toHaveLength(1)
  })

  it('예전 폼의 대표값은 고르지 않은 학년으로 단정하지 않는다', () => {
    expect(describeProjectGrade('중학교 1학년')).toEqual({ text: '중학교', isRange: true })
    expect(describeProjectGrade('고등학교 1학년')).toEqual({ text: '고등학교', isRange: true })
    expect(describeProjectGrade('고등학교 2학년')).toEqual({ text: '고등학교', isRange: true })
    expect(describeProjectGrade('초등학교 3학년')).toEqual({ text: '초등학교 3-4학년', isRange: true })
    expect(describeProjectGrade('초등학교 5학년')).toEqual({ text: '초등학교 5-6학년', isRange: true })
  })

  it('그 밖의 값은 그대로, 빈 값은 null', () => {
    expect(describeProjectGrade('중2, 중3')).toEqual({ text: '중2, 중3', isRange: false })
    expect(describeProjectGrade('  ')).toBeNull()
    expect(describeProjectGrade(null)).toBeNull()
  })
})
