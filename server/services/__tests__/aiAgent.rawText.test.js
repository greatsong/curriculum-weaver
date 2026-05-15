/**
 * aiAgent — 멘션 자료 원문 동봉(extracted_text) 단위 테스트
 *
 * 검증 범위:
 *   - allocateMentionRawBudget: 균등 분배 + 자료당 상한
 *   - formatMentionRawTextSection: 한도 이내/초과 시 메시지 포맷
 *   - buildMaterialsContext: 멘션 자료에 [원문] 섹션이 붙는지, 멘션 안 한 자료엔 안 붙는지
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    constructor() {}
    messages = { stream: vi.fn(), create: vi.fn() }
  },
}))

import {
  allocateMentionRawBudget,
  formatMentionRawTextSection,
  buildMaterialsContext,
  MENTION_RAW_PER_ITEM_CAP_DEFAULT,
  MENTION_RAW_TOTAL_BUDGET_DEFAULT,
} from '../aiAgent.js'

// ──────────────────────────────────────────
// allocateMentionRawBudget
// ──────────────────────────────────────────

describe('allocateMentionRawBudget', () => {
  it('count<=0이면 0', () => {
    expect(allocateMentionRawBudget(0, 24000, 8000)).toBe(0)
    expect(allocateMentionRawBudget(-1, 24000, 8000)).toBe(0)
  })

  it('자료 1개면 perItemCap이 곧 한도', () => {
    expect(allocateMentionRawBudget(1, 24000, 8000)).toBe(8000)
  })

  it('자료 3개면 균등 분배(8000) + perItemCap=8000과 동일', () => {
    expect(allocateMentionRawBudget(3, 24000, 8000)).toBe(8000)
  })

  it('자료 5개면 균등 분배(4800)이 perItemCap보다 작아 4800이 적용', () => {
    expect(allocateMentionRawBudget(5, 24000, 8000)).toBe(4800)
  })

  it('자료 10개면 2400자씩만 동봉', () => {
    expect(allocateMentionRawBudget(10, 24000, 8000)).toBe(2400)
  })

  it('totalBudget 또는 perItemCap이 0/음수/NaN이면 안전하게 처리', () => {
    expect(allocateMentionRawBudget(2, 0, 8000)).toBe(0)
    expect(allocateMentionRawBudget(2, -10, 8000)).toBe(0)
    expect(allocateMentionRawBudget(2, NaN, 8000)).toBe(0)
    // perItemCap이 비정상이면 totalBudget을 cap으로 사용 → 24000/2=12000
    expect(allocateMentionRawBudget(2, 24000, 0)).toBe(12000)
    expect(allocateMentionRawBudget(2, 24000, NaN)).toBe(12000)
  })
})

// ──────────────────────────────────────────
// formatMentionRawTextSection
// ──────────────────────────────────────────

describe('formatMentionRawTextSection', () => {
  it('빈 텍스트나 비문자열이면 null', () => {
    expect(formatMentionRawTextSection('', 8000)).toBeNull()
    expect(formatMentionRawTextSection(null, 8000)).toBeNull()
    expect(formatMentionRawTextSection(undefined, 8000)).toBeNull()
    expect(formatMentionRawTextSection(123, 8000)).toBeNull()
  })

  it('allowedChars<=0이면 null', () => {
    expect(formatMentionRawTextSection('내용', 0)).toBeNull()
    expect(formatMentionRawTextSection('내용', -1)).toBeNull()
  })

  it('원문 ≤ 한도: 잘림 없음 표시 + 원문 그대로 포함', () => {
    const text = '한국어 원문 샘플입니다.\n두 번째 줄.'
    const out = formatMentionRawTextSection(text, 8000)
    expect(out).toContain(`전체 ${text.length}자 동봉 (잘림 없음)`)
    expect(out).toContain('───────── 원문 시작 ─────────')
    expect(out).toContain(text)
    expect(out).toContain('───────── 원문 끝 ─────────')
    expect(out).not.toContain('잘림 ⚠️')
  })

  it('원문 > 한도: 잘림 안내 + 정확한 수치 + 안내 문구', () => {
    const text = 'a'.repeat(20000)
    const out = formatMentionRawTextSection(text, 8000)
    expect(out).toContain('전체 20,000자 중 처음 8,000자')
    expect(out).toContain('약 40%')
    expect(out).toContain('원문 끝 — 잘림 ⚠️')
    expect(out).toContain('보고 싶으신 단락을 채팅에 붙여주시면')
    // 잘린 본문은 정확히 8000자
    const startIdx = out.indexOf('───────── 원문 시작 ─────────\n') + '───────── 원문 시작 ─────────\n'.length
    const endIdx = out.indexOf('\n   ───────── 원문 끝')
    expect(out.slice(startIdx, endIdx).length).toBe(8000)
  })

  it('퍼센트는 최소 1% (잘림이 일어났는데 0%로 반올림되지 않음)', () => {
    const text = 'a'.repeat(1_000_000)
    const out = formatMentionRawTextSection(text, 100)
    expect(out).toMatch(/약 \d+%/)
    expect(out).not.toContain('약 0%')
  })
})

// ──────────────────────────────────────────
// buildMaterialsContext — 원문 섹션 통합
// ──────────────────────────────────────────

const completed = (overrides = {}) => ({
  id: overrides.id || 'mat-x',
  file_name: overrides.file_name || 'x.pdf',
  intent: overrides.intent || 'general',
  ai_summary: overrides.ai_summary || '기본 요약입니다.',
  ai_analysis: overrides.ai_analysis || {
    summary: '기본 요약입니다.',
    intent_driven_summary: '의도 기반 요약입니다.',
    material_type: '기타',
    key_insights: ['인사이트 A'],
    validated_connections: [{ code: '[9과05-01]' }],
    design_suggestions: ['수업 제안 1'],
  },
  extracted_text: overrides.extracted_text,
  ...overrides,
})

describe('buildMaterialsContext — 멘션 자료 원문 동봉', () => {
  it('멘션 + 분석완료 + extracted_text 있음 → [원문] 섹션 포함', () => {
    const m = completed({ id: 'm1', file_name: 'a.pdf', extracted_text: '원문 내용입니다.' })
    const out = buildMaterialsContext([m], { mentionedIds: ['m1'] })
    expect(out).toContain('[원문 — 전체')
    expect(out).toContain('원문 내용입니다.')
  })

  it('멘션됐지만 extracted_text 없음 → 원문 섹션 없음 (요약은 유지)', () => {
    const m = completed({ id: 'm1', extracted_text: undefined })
    const out = buildMaterialsContext([m], { mentionedIds: ['m1'] })
    expect(out).not.toContain('[원문 —')
    expect(out).toContain('의도 기반 요약입니다.')
  })

  it('멘션 안 한 자료의 extracted_text는 일반 섹션에서도 무시 (요약만 사용)', () => {
    const m = completed({ id: 'm1', extracted_text: '원문 내용은 무시되어야 함' })
    const out = buildMaterialsContext([m], {}) // 멘션 없음
    expect(out).not.toContain('[원문 —')
    expect(out).not.toContain('원문 내용은 무시되어야 함')
  })

  it('멘션 자료가 분석 미완료(요약 없음) + extracted_text 있음 → 원문 섹션 추가하지 않음 (⏳ 안내 유지)', () => {
    const pending = {
      id: 'mp',
      file_name: 'wip.pdf',
      intent: 'general',
      processing_status: 'analyzing',
      extracted_text: '추출 텍스트는 있지만 요약은 아직 없음',
    }
    const out = buildMaterialsContext([pending], { mentionedIds: ['mp'] })
    expect(out).toContain('분석 진행 중')
    expect(out).not.toContain('[원문 —')
    expect(out).not.toContain('추출 텍스트는 있지만 요약은 아직 없음')
  })

  it('멘션 자료 3개 + 각 원문 큼 → 자료당 균등 분배(8000자) 적용', () => {
    const longText = 'X'.repeat(15000)
    const ms = [
      completed({ id: 'm1', file_name: 'a.pdf', extracted_text: longText }),
      completed({ id: 'm2', file_name: 'b.pdf', extracted_text: longText }),
      completed({ id: 'm3', file_name: 'c.pdf', extracted_text: longText }),
    ]
    const out = buildMaterialsContext(ms, { mentionedIds: ['m1', 'm2', 'm3'] })
    // 각 자료에 처음 8000자 동봉 안내가 있어야 함
    const occurrences = out.match(/전체 15,000자 중 처음 8,000자/g) || []
    expect(occurrences.length).toBe(3)
  })

  it('opts로 perItemCap을 줄이면 그 한도가 적용됨 (오버라이드 가능)', () => {
    const longText = 'Y'.repeat(10000)
    const m = completed({ id: 'm1', extracted_text: longText })
    const out = buildMaterialsContext([m], {
      mentionedIds: ['m1'],
      mentionRawPerItemCap: 1000,
    })
    expect(out).toContain('전체 10,000자 중 처음 1,000자')
  })

  it('mentionRawTotalBudget=0이면 원문 동봉 비활성화', () => {
    const m = completed({ id: 'm1', extracted_text: '원문' })
    const out = buildMaterialsContext([m], {
      mentionedIds: ['m1'],
      mentionRawTotalBudget: 0,
    })
    expect(out).not.toContain('[원문 —')
  })

  it('기본값 export가 일치한다', () => {
    expect(MENTION_RAW_PER_ITEM_CAP_DEFAULT).toBe(8000)
    expect(MENTION_RAW_TOTAL_BUDGET_DEFAULT).toBe(24000)
  })
})
