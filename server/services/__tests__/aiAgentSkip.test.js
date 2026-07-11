/**
 * AI 시스템 프롬프트의 스킵 인식 테스트
 *
 * 핵심 위험: AI가 스킵을 모르면 <procedure_advance> suggested가 생략된 절차를
 * 가리켜, 수락 시 팀 커서가 생략 절차로 이동한다. 여기서 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../aiAgent.js'

const baseContext = {
  session: { title: '테스트 프로젝트', subjects: ['과학', '수학'] },
  standards: [],
  materials: [],
  boards: [],
  recentMessages: [],
  procedure: 'T-2-1',
  currentStep: null,
}

describe('buildSystemPrompt 스킵 인식', () => {
  it('스킵 없으면 바로 다음 절차(T-2-2)를 procedure_advance로 제안', () => {
    const prompt = buildSystemPrompt({ ...baseContext })
    expect(prompt).toContain('suggested="T-2-2"')
  })

  it('다음 절차가 스킵이면 건너뛰고 그 다음(T-2-3)을 제안', () => {
    const prompt = buildSystemPrompt({ ...baseContext, skippedCodes: ['T-2-2'] })
    expect(prompt).toContain('suggested="T-2-3"')
    expect(prompt).not.toContain('suggested="T-2-2"')
  })

  it('연속 스킵도 건너뛴다', () => {
    const prompt = buildSystemPrompt({ ...baseContext, skippedCodes: ['T-2-2', 'T-2-3'] })
    expect(prompt).toContain('suggested="A-1-1"')
  })

  it('생략된 절차 섹션이 displayCode로 주입된다 (내부 코드 미노출)', () => {
    const prompt = buildSystemPrompt({ ...baseContext, skippedCodes: ['T-2-2'] })
    expect(prompt).toContain('[생략된 절차]')
    expect(prompt).toContain('T-4 팀 규칙 결정')
  })

  it('스킵 없으면 생략 섹션 자체가 없다', () => {
    const prompt = buildSystemPrompt({ ...baseContext })
    expect(prompt).not.toContain('[생략된 절차]')
  })

  it('마지막 절차 이후가 전부 스킵이면 procedure_advance 미생성 안내', () => {
    const prompt = buildSystemPrompt({ ...baseContext, procedure: 'E-1-1', skippedCodes: ['E-2-1'] })
    expect(prompt).not.toContain('suggested="E-2-1"')
    expect(prompt).toContain('절대 생성하지 마세요')
  })
})
