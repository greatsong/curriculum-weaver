/**
 * 보고서 생성의 스킵 표기 테스트 (인메모리 폴백 경로)
 *
 * 고정하는 것:
 *   - 생략 절차가 '진행중'으로 오분류되지 않고 'skipped'로 분류
 *   - 진행률 분모에서 생략 절차 제외 ("12/19 완료" 오표기 방지)
 *   - HTML/MD 본문에 '팀 합의로 생략' 블록 + 사유 병기
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createProject, upsertDesign, addProjectSkip } from '../../lib/supabaseService.js'
import { collectReportData, generateHTML, generateMarkdown } from '../reportGenerator.js'
import { PROCEDURE_LIST } from 'curriculum-weaver-shared/constants.js'

let projectId

beforeAll(async () => {
  const project = await createProject({
    title: '스킵 보고서 테스트',
    workspace_id: 'ws-test',
    owner_id: 'user-1',
  })
  projectId = project.id

  // T-1-1(비전)은 작성, T-2-2(팀 규칙)는 사유와 함께 생략
  await upsertDesign(projectId, 'T-1-1', { commonVision: '함께 성장하는 융합 수업' }, 'user-1')
  await addProjectSkip(projectId, 'T-2-2', 'user-1', '팀 규칙이 이미 있음')
})

describe('collectReportData 스킵 분류', () => {
  it('생략 절차는 skipped, 분모는 활성 절차 수', async () => {
    const data = await collectReportData(projectId)
    expect(data.procedureStatus['T-2-2']).toBe('skipped')
    expect(data.procedureStatus['T-1-1']).toBe('confirmed')
    // 19개 중 1개 생략 → 분모 18
    expect(data.totalProcedures).toBe(PROCEDURE_LIST.length - 1)
    expect(data.skipMap['T-2-2'].reason).toBe('팀 규칙이 이미 있음')
  })
})

describe('보고서 본문 생략 표기', () => {
  it('HTML: 팀 합의로 생략 블록 + 사유', async () => {
    const data = await collectReportData(projectId)
    const html = generateHTML(data)
    expect(html).toContain('팀 합의로 생략')
    expect(html).toContain('사유: 팀 규칙이 이미 있음')
    // 진행률 표기가 활성 분모 기준인지
    expect(html).toContain(`/${PROCEDURE_LIST.length - 1} 절차 완료`)
  })

  it('MD: 취소선 + 생략 태그 + 사유', async () => {
    const data = await collectReportData(projectId)
    const md = generateMarkdown(data)
    expect(md).toContain('~~팀 규칙 결정~~ [팀 합의로 생략]')
    expect(md).toContain('사유: 팀 규칙이 이미 있음')
  })
})
