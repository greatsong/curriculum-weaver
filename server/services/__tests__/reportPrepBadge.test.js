/**
 * 보고서에 내부 절차 코드(prep)가 보이지 않아야 한다 (2026-10-04 QA: '준비' 단계 배지와
 * '학습자/맥락 정보 제공' 절차 배지에 prep가 찍힘). 다른 단계·절차는 표시 코드(T, T-1 등)를 그대로 보인다.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createProject, upsertDesign } from '../../lib/supabaseService.js'
import { collectReportData, generateHTML, generateMarkdown } from '../reportGenerator.js'

let data
beforeAll(async () => {
  const project = await createProject({ title: '준비 배지 테스트', workspace_id: 'ws-test', owner_id: 'user-1' })
  await upsertDesign(project.id, 'prep', { grade: '중학교 2학년', studentCount: 25, digitalLiteracy: '중' }, 'user-1')
  await upsertDesign(project.id, 'T-1-1', { commonVision: '함께 성장하는 융합 수업' }, 'user-1')
  data = await collectReportData(project.id)
})

const visibleText = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')

describe('보고서 준비 단계 배지', () => {
  it('HTML: 준비 단계·절차에 prep 배지가 없고, 팀준비 단계는 T와 T-1 배지를 보인다', () => {
    const html = generateHTML(data)
    expect(visibleText(html)).not.toMatch(/\bprep\b/)
    expect(html).toContain('학습자/맥락 정보 제공')
    expect(html).toContain('중학교 2학년')
    expect(html).toMatch(/<span class="phase-badge"[^>]*>T<\/span>/)
    expect(html).toMatch(/<span class="proc-code"[^>]*>T-1<\/span>/)
  })

  it('MD: "준비 (prep)", "prep: …" 대신 이름만 쓰고, 다른 절차는 표시 코드를 붙인다', () => {
    const md = generateMarkdown(data)
    expect(md).not.toMatch(/\bprep\b/)
    expect(md).toMatch(/^## .*준비\s*$/m)
    expect(md).toMatch(/^### 학습자\/맥락 정보 제공/m)
    expect(md).toMatch(/^### T-1: 공동 비전 설정/m)
  })
})
