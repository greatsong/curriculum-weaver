/**
 * AI가 다른 절차를 언급할 때 교사 화면 표기(표시 코드 + 이름)와 맞추도록 고정한다 (2026-10-03).
 * 화면의 절차 목록이 순번만 보여 "A-4", "Ds-1"을 찾지 못했다는 제보 후속:
 * 화면은 코드를 보여 주게 바꿨고, AI에게는 정확한 코드–이름 목록을 준다(이름 지어내기 방지).
 */
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../aiAgent.js'
import { PROCEDURES } from 'curriculum-weaver-shared/constants.js'

const base = { session: { title: 't' }, standards: [], materials: [], boards: [], recentMessages: [], currentStep: null }

describe('전체 절차 목록 섹션', () => {
  const prompt = buildSystemPrompt({ ...base, procedure: 'A-1-1' })
  const section = prompt.split('[전체 절차 목록 — 교사 화면 표기와 같음]')[1]?.split('\n[')[0] || ''

  it('표시 코드가 있는 모든 절차를 코드 + 이름으로 담는다', () => {
    for (const info of Object.values(PROCEDURES)) {
      if (!info.displayCode) continue
      expect(section).toContain(`${info.displayCode} ${info.name}`)
    }
    expect(section).toContain('A-4 핵심 아이디어 도출 및 통합 수업목표 진술')
    expect(section).toContain('설계(Ds): Ds-1 ')
  })

  it('내부 코드(A-2-2 등)는 들어가지 않는다 — 어휘 격리 유지', () => {
    expect(section).not.toMatch(/\b(?:T|A|Ds|DI|E)-\d-\d\b/)
    expect(prompt).not.toMatch(/\bA-2-2\b|\bDs-1-1\b/)
  })

  it('다른 절차는 코드와 이름을 함께 쓰라고 지시한다', () => {
    expect(prompt).toContain('표시 코드와 절차 이름을 함께 쓰세요')
  })

  it('시연 모드에는 넣지 않는다', () => {
    const demo = buildSystemPrompt({ ...base, procedure: 'demo_lesson_plan', mode: 'demo' })
    expect(demo).not.toContain('[전체 절차 목록')
  })
})
