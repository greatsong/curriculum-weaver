/**
 * 생략된 절차의 작성 중 내용이 AI에 "확정"으로 전달되지 않게 고정한다 (2026-10-03).
 * 7개 스텝 중 2개를 하다가 건너뛰면 보드에 미완성 내용이 남는다. 보고서는 "팀 합의로 생략"만
 * 표기하는데, AI 프롬프트는 이를 "교사와 함께 확정한 이전 절차 내용"과 정합성 점검 기준으로 넣었다.
 */
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../aiAgent.js'

const base = { session: { title: 't' }, standards: [], materials: [], recentMessages: [], currentStep: null }
const boards = [
  { board_type: 'team_rules', procedure_code: 'T-2-2', content: { allRules: ['미완성 규칙 — 회의는 격주?'] } },
  { board_type: 'team_schedule', procedure_code: 'T-2-3', content: { schedule: [{ date: '10/6', activity: '분석' }] } },
  { board_type: 'topic_criteria', procedure_code: 'A-1-1', content: { criteria: [{ name: '작성 중 기준 — 학생 삶 연결?' }] } },
]
// 이전 절차 요약은 보드마다 "[코드 이름] 라벨:" 줄로 이어져 섹션 경계를 문자열로 자르기 어렵다.
// A-1-2의 정합성 점검 대상은 T-1-1·A-1-1뿐이라, 팀 규칙·팀 일정 내용은 요약에만 들어간다 → 프롬프트 전체로 판정.
const summaryOf = (p) => p.split('[지금까지의 설계 진행 — 교사와 함께 확정한 이전 절차 내용]')[1] || ''
const coherenceOf = (p) => (p.split('[정합성 점검 컨텍스트]')[1] || '').split('\n[')[0]

describe('생략 절차 내용은 확정으로 전달하지 않는다', () => {
  it('이전 절차 요약에서 생략 절차 보드를 뺀다 (다른 절차는 그대로)', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'A-1-2', skippedCodes: ['T-2-2'] })
    const summary = summaryOf(prompt)
    expect(summary).not.toContain('미완성 규칙')
    expect(summary).toContain('10/6')
  })

  it('생략이 없으면 예전처럼 모두 요약에 들어간다', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'A-1-2', skippedCodes: [] })
    expect(summaryOf(prompt)).toContain('미완성 규칙')
  })

  it('정합성 점검 대상이 생략됐으면 내용이 있어도 기준으로 쓰지 않고 생략 표기만 한다', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'A-1-2', skippedCodes: ['A-1-1'] })
    const coherence = coherenceOf(prompt)
    expect(coherence).toContain('팀 결정으로 생략됨')
    expect(coherence).not.toContain('작성 중 기준')
    expect(summaryOf(prompt)).not.toContain('작성 중 기준')
  })

  it('생략 안내에 "미완성 내용은 확정이 아니다"와 해제 후 이어 쓰기를 알린다', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'A-1-2', skippedCodes: ['T-2-2'] })
    expect(prompt).toContain('작성하다 만 내용이 남아 있더라도 팀이 확정한 내용이 아닙니다')
    expect(prompt).toContain('해제하면 써 두었던 내용 그대로 이어서 작성할 수 있습니다')
  })

  it('해제하면(생략 목록에서 빠지면) 다시 확정 내용으로 들어간다', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'A-1-2', skippedCodes: [] })
    expect(coherenceOf(prompt)).toContain('작성 중 기준')
  })
})
