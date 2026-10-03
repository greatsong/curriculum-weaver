/**
 * T-2-1(T-3 역할 배분)이 생략됐을 때 남은 역할표를 "확정"으로 쓰지 않는지 고정한다.
 *
 * 배경: 2026-10-03 교사 연수 한정으로 T-3 역할 배분이 생략 가능해졌다. 역할표를 몇 줄 쓰다가
 * 건너뛰면 보드에 미완성 역할표가 남는다. 생략 절차의 남은 내용은 확정이 아니라는 원칙(PR #148)에 따라
 *   - 보고서: '참여 선생님'·'참여 교과'를 그 역할표에서 뽑지 않고, 본문은 '팀 합의로 생략'만 표기한다.
 *   - AI 프롬프트: 이전 절차 요약·정합성 점검에 역할표를 넣지 않고, 역할을 짐작하거나
 *     "역할이 정해지지 않았다"고 단정하지 않도록 안내한다.
 * 설정을 되돌린 뒤에도 연수 중 생략 기록이 남으므로 이 테스트는 유지한다.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createProject, upsertDesign, addProjectSkip } from '../../lib/supabaseService.js'
import { collectReportData, generateHTML, generateMarkdown } from '../reportGenerator.js'
import { buildSystemPrompt } from '../aiAgent.js'

const LEFTOVER_ROLES = {
  roles: [
    { memberName: '김미완', subject: '과학', role: '작성 중 역할 — 자료 담당?', strengths: '실험' },
  ],
}

describe('보고서: 생략된 T-3 역할 배분의 남은 역할표를 참여자로 쓰지 않는다', () => {
  let skippedId
  let activeId

  beforeAll(async () => {
    const skipped = await createProject({ title: '역할 생략 보고서', workspace_id: 'ws-role', owner_id: 'user-1' })
    skippedId = skipped.id
    await upsertDesign(skippedId, 'T-1-1', { commonVision: '함께 성장하는 융합 수업' }, 'user-1')
    await upsertDesign(skippedId, 'T-2-1', LEFTOVER_ROLES, 'user-1')
    await addProjectSkip(skippedId, 'T-2-1', 'user-1', '교무 분장으로 이미 정함')

    // 대조군: 같은 역할표, 생략 없음
    const active = await createProject({ title: '역할 작성 보고서', workspace_id: 'ws-role', owner_id: 'user-1' })
    activeId = active.id
    await upsertDesign(activeId, 'T-2-1', LEFTOVER_ROLES, 'user-1')
  })

  it('생략됐으면 participants가 비고, 절차 상태는 skipped다', async () => {
    const data = await collectReportData(skippedId)
    expect(data.participants).toEqual([])
    expect(data.procedureStatus['T-2-1']).toBe('skipped')
  })

  it('HTML: 참여 선생님·참여 교과·역할 내용이 없고 T-3은 생략 블록으로만 나온다', async () => {
    const html = generateHTML(await collectReportData(skippedId))
    expect(html).not.toContain('참여 선생님')
    expect(html).not.toContain('참여 교과')
    expect(html).not.toContain('김미완')
    expect(html).not.toContain('작성 중 역할')
    expect(html).toContain('팀 합의로 생략')
    expect(html).toContain('사유: 교무 분장으로 이미 정함')
    expect(html).toContain('>T-3<')
  })

  it('Markdown: 참여 선생님 없이 취소선 생략 표기만 남는다', async () => {
    const md = generateMarkdown(await collectReportData(skippedId))
    expect(md).not.toContain('참여 선생님')
    expect(md).not.toContain('김미완')
    expect(md).not.toContain('작성 중 역할')
    expect(md).toContain('~~역할 배분~~ [팀 합의로 생략]')
  })

  it('생략하지 않았으면 예전처럼 역할표에서 참여 선생님을 뽑는다', async () => {
    const data = await collectReportData(activeId)
    expect(data.participants).toHaveLength(1)
    expect(data.participants[0]).toMatchObject({ name: '김미완', subject: '과학' })
    const html = generateHTML(data)
    expect(html).toContain('참여 선생님')
    expect(html).toContain('김미완')
  })
})

describe('AI 프롬프트: 생략된 T-3 역할 배분의 남은 역할표를 확정으로 쓰지 않는다', () => {
  const base = { session: { title: 't' }, standards: [], materials: [], recentMessages: [], currentStep: null }
  const boards = [
    { board_type: 'team_vision', procedure_code: 'T-1-1', content: { commonVision: '삶과 연결된 융합 수업' } },
    { board_type: 'role_assignment', procedure_code: 'T-2-1', content: LEFTOVER_ROLES },
    { board_type: 'team_rules', procedure_code: 'T-2-2', content: { allRules: ['회의는 매주 화요일'] } },
  ]
  const summaryOf = (p) => p.split('[지금까지의 설계 진행 — 교사와 함께 확정한 이전 절차 내용]')[1] || ''
  const coherenceOf = (p) => (p.split('[정합성 점검 컨텍스트]')[1] || '').split('\n[')[0]
  const ROLE_LINE = '팀원별 역할 정보가 없습니다'

  it('이전 절차 요약에서 역할표를 빼고, 다른 절차(팀 규칙)는 그대로 둔다', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'A-1-2', skippedCodes: ['T-2-1'] })
    const summary = summaryOf(prompt)
    expect(summary).toContain('회의는 매주 화요일')
    expect(prompt).not.toContain('김미완')
    expect(prompt).not.toContain('작성 중 역할')
  })

  it('생략 안내에 T-3 역할 배분이 표시 코드로 들어가고, 역할을 짐작하거나 "미정"으로 단정하지 말라고 안내한다', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'A-1-2', skippedCodes: ['T-2-1'] })
    expect(prompt).toContain('[생략된 절차]')
    expect(prompt).toContain('T-3 역할 배분')
    expect(prompt).toContain(ROLE_LINE)
    expect(prompt).toContain('"역할이 정해지지 않았다"고 단정하지도 마세요')
  })

  it('정합성 점검(T-2-1을 대상으로 하는 E-2 협력 과정 성찰)에서도 역할표 대신 생략 표기만 한다', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'E-2-1', skippedCodes: ['T-2-1'] })
    const coherence = coherenceOf(prompt)
    expect(coherence).toContain('[T-3 역할 배분] 역할 배분: (팀 결정으로 생략됨')
    expect(coherence).not.toContain('[T-3 역할 배분] 역할 배분: (아직 확정되지 않음)')
    expect(prompt).not.toContain('김미완')
    expect(prompt).not.toContain('작성 중 역할')
  })

  it('생략하지 않았으면 역할표가 예전처럼 들어가고 역할 안내 줄은 없다', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'A-1-2', skippedCodes: [] })
    expect(summaryOf(prompt)).toContain('김미완')
    expect(prompt).not.toContain(ROLE_LINE)
  })

  it('다른 절차만 생략했을 때는 역할 안내 줄을 넣지 않는다', () => {
    const prompt = buildSystemPrompt({ ...base, boards, procedure: 'A-1-2', skippedCodes: ['T-2-2'] })
    expect(prompt).toContain('[생략된 절차]')
    expect(prompt).not.toContain(ROLE_LINE)
    expect(summaryOf(prompt)).toContain('김미완')
  })
})
