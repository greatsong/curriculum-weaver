/**
 * aiAgent.buildMaterialsContext 테스트 — 채팅 인라인 업로드 Phase 1
 *
 * 확인:
 *   1) mentionedIds에 해당하는 자료는 최상단 "[교사가 명시적으로 언급한 자료]" 섹션에 포함된다.
 *   2) 멘션된 자료는 하단 "[업로드된 자료]" 섹션에서 중복 제거된다.
 *   3) mentionedIds가 비어 있으면 기존 단일 섹션 출력과 동일한 모양을 유지한다.
 */
import { describe, it, expect, vi } from 'vitest'

// Anthropic SDK는 buildMaterialsContext 경로에서 호출되지 않지만
// aiAgent.js import 시 Anthropic 생성자가 먼저 돌기 때문에 모킹한다.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    constructor() {}
    messages = { stream: vi.fn(), create: vi.fn() }
  },
}))

import { buildMaterialsContext } from '../aiAgent.js'

const baseMaterial = (overrides = {}) => ({
  id: overrides.id || 'mat-x',
  file_name: overrides.file_name || 'x.pdf',
  intent: overrides.intent || 'general',
  ai_summary: overrides.ai_summary || '기본 요약입니다.',
  ai_analysis: overrides.ai_analysis || {
    summary: '기본 요약입니다.',
    intent_driven_summary: '의도 기반 요약입니다.',
    material_type: '기타',
    key_insights: ['인사이트 A', '인사이트 B'],
    validated_connections: [{ code: '[9과05-01]' }],
    design_suggestions: ['수업 제안 1'],
  },
  ...overrides,
})

describe('buildMaterialsContext — mentionedIds 지원', () => {
  it('멘션된 자료는 최상단 전용 섹션에 포함된다', () => {
    const materials = [
      baseMaterial({ id: 'm1', file_name: 'a.pdf' }),
      baseMaterial({ id: 'm2', file_name: 'b.pdf' }),
    ]
    const out = buildMaterialsContext(materials, { mentionedIds: ['m2'] })
    expect(out).toBeTruthy()
    expect(out).toMatch(/\[교사가[^\]]*명시적으로 언급한 자료 1개/)
    // 멘션 섹션이 일반 섹션보다 앞에 있어야 한다
    const mentionIdx = out.search(/\[교사가[^\]]*명시적으로 언급한 자료/)
    const generalIdx = out.search(/\[(이 프로젝트에 )?업로드(·분석 완료)?된 자료/)
    expect(mentionIdx).toBeGreaterThanOrEqual(0)
    expect(generalIdx === -1 || mentionIdx < generalIdx).toBe(true)
    // b.pdf는 멘션 섹션에 포함
    expect(out).toMatch(/b\.pdf/)
  })

  it('멘션된 자료는 일반 섹션에서 중복 제거된다', () => {
    const materials = [
      baseMaterial({ id: 'm1', file_name: 'only-general.pdf' }),
      baseMaterial({ id: 'm2', file_name: 'mentioned.pdf' }),
    ]
    const out = buildMaterialsContext(materials, { mentionedIds: ['m2'] })
    // mentioned.pdf는 본문에 1번만 등장해야 함
    const occurrences = out.match(/mentioned\.pdf/g) || []
    expect(occurrences.length).toBe(1)
    // 일반 섹션의 개수 표시는 1개
    expect(out).toMatch(/\[(이 프로젝트에 )?업로드(·분석 완료)?된 자료 1개/)
  })

  it('mentionedIds가 비어 있으면 기존 섹션 출력만 한다', () => {
    const materials = [baseMaterial({ id: 'm1', file_name: 'only.pdf' })]
    const out = buildMaterialsContext(materials, {})
    expect(out).toMatch(/\[(이 프로젝트에 )?업로드(·분석 완료)?된 자료 1개/)
    expect(out).not.toMatch(/명시적으로 언급한 자료/)
  })

  it('멘션된 자료가 분석 미완료여도 섹션에는 포함된다', () => {
    const materials = [
      {
        id: 'm-pending',
        file_name: 'wip.pdf',
        intent: 'general',
        // ai_summary / ai_analysis 없음 → 일반 섹션에는 포함되지 않음
      },
    ]
    const out = buildMaterialsContext(materials, { mentionedIds: ['m-pending'] })
    expect(out).toBeTruthy()
    expect(out).toMatch(/명시적으로 언급한 자료 1개/)
    expect(out).toMatch(/wip\.pdf/)
    // 일반 섹션은 없음 (분석 미완료 자료만 존재하므로)
    expect(out).not.toMatch(/\[(이 프로젝트에 )?업로드(·분석 완료)?된 자료/)
  })
})
