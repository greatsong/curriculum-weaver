/**
 * materialAnalyzer 단위 테스트
 *
 * 대상:
 *   - filterHallucinations: AI가 제안한 코드를 DB 대조로 validated/rejected 분류
 *   - extractText: 확장자별 텍스트 추출 (pdf/docx/txt/csv + unsupported 케이스)
 *
 * 외부 의존성은 vi.mock으로 차단한다 (Anthropic, Supabase, pdf-parse 등).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── 외부 모듈 모킹 (import materialAnalyzer 이전에 등록되어야 함) ──
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class Anthropic {
      constructor() {}
      messages = { create: vi.fn() }
    },
  }
})

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}))

// standardsValidator는 테스트별 시나리오에 맞게 validateCode를 mock한다.
vi.mock('../../lib/standardsValidator.js', () => ({
  validateCode: vi.fn(),
}))

// extractText 테스트를 위해 pdf-parse / mammoth / officeparser를 mock
vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => ({ text: 'PDF 본문 내용입니다.' })),
}))
vi.mock('mammoth', () => ({
  extractRawText: vi.fn(async () => ({ value: 'DOCX 본문 내용입니다.' })),
}))

import { _internal } from '../materialAnalyzer.js'
import { validateCode } from '../../lib/standardsValidator.js'

const { filterHallucinations, extractText } = _internal

beforeEach(() => {
  vi.clearAllMocks()
})

describe('filterHallucinations — 할루시네이션 필터', () => {
  it('valid한 코드는 validated에 exact로 들어간다', () => {
    validateCode.mockReturnValue({
      valid: true,
      matched: {
        code: '[9과05-01]',
        content: '물질의 상태변화를 설명할 수 있다.',
        subject_group: '과학',
      },
    })

    const input = [
      { code: '[9과05-01]', confidence: 0.9, reason: '상태변화 관련' },
    ]
    const { validated, rejected } = filterHallucinations(input)

    expect(rejected).toHaveLength(0)
    expect(validated).toHaveLength(1)
    expect(validated[0]).toMatchObject({
      code: '[9과05-01]',
      subject: '과학',
      confidence: 0.9,
      match_reason: 'exact',
    })
  })

  it('편집거리 2 이내면 suggestion으로 자동 교정 + confidence 0.15 감쇠', () => {
    validateCode.mockReturnValue({
      valid: false,
      suggestion: {
        code: '[9과05-01]',
        content: '교정된 성취기준',
        subject_group: '과학',
      },
      distance: 2,
    })

    const input = [
      { code: '[9과05-0l]', confidence: 0.8, reason: '오타 코드' },
    ]
    const { validated, rejected } = filterHallucinations(input)

    expect(rejected).toHaveLength(0)
    expect(validated).toHaveLength(1)
    expect(validated[0].code).toBe('[9과05-01]')
    expect(validated[0].match_reason).toBe('auto_corrected')
    expect(validated[0].original_code).toBe('[9과05-0l]')
    expect(validated[0].edit_distance).toBe(2)
    // 0.8 - 0.15 = 0.65
    expect(validated[0].confidence).toBeCloseTo(0.65, 5)
  })

  it('편집거리 3 이상이면 rejected(too_distant)로 분류', () => {
    validateCode.mockReturnValue({
      valid: false,
      suggestion: {
        code: '[9과05-01]',
        content: '너무 먼 코드',
        subject_group: '과학',
      },
      distance: 3,
    })

    const input = [
      { code: '[XXXX-99-99]', confidence: 0.4, reason: '엉뚱한 코드' },
    ]
    const { validated, rejected } = filterHallucinations(input)

    expect(validated).toHaveLength(0)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({
      code: '[XXXX-99-99]',
      reason: 'too_distant',
      suggestion: '[9과05-01]',
      edit_distance: 3,
    })
  })

  it('DB에 없고 suggestion도 없으면 not_found로 분류', () => {
    validateCode.mockReturnValue({ valid: false })

    const { validated, rejected } = filterHallucinations([
      { code: '[존재안함-01-01]', confidence: 0.1, reason: '' },
    ])
    expect(validated).toHaveLength(0)
    expect(rejected[0].reason).toBe('not_found')
  })

  it('배열이 아니거나 빈 입력을 안전 처리', () => {
    expect(filterHallucinations(null)).toEqual({ validated: [], rejected: [] })
    expect(filterHallucinations(undefined)).toEqual({ validated: [], rejected: [] })
    expect(filterHallucinations([])).toEqual({ validated: [], rejected: [] })
  })
})

describe('extractText — 확장자별 텍스트 추출', () => {
  it('pdf는 pdf-parse 결과의 text를 반환', async () => {
    const result = await extractText(Buffer.from('%PDF-1.4 dummy'), 'pdf')
    expect(result.text).toBe('PDF 본문 내용입니다.')
    expect(result.unsupported).toBeFalsy()
  })

  it('docx는 mammoth.extractRawText의 value를 반환', async () => {
    const result = await extractText(Buffer.from('PK dummy'), 'docx')
    expect(result.text).toBe('DOCX 본문 내용입니다.')
    expect(result.unsupported).toBeFalsy()
  })

  it('txt는 utf-8 그대로 반환', async () => {
    const buf = Buffer.from('안녕하세요 텍스트입니다', 'utf-8')
    const result = await extractText(buf, 'txt')
    expect(result.text).toBe('안녕하세요 텍스트입니다')
  })

  it('md는 마크다운 원문을 그대로 반환 (txt와 동일 경로)', async () => {
    const md = '# 수업안\n\n## 학습 목표\n- 목표1\n- 목표2'
    const result = await extractText(Buffer.from(md, 'utf-8'), 'md')
    expect(result.text).toBe(md)
    expect(result.unsupported).toBeFalsy()
  })

  it('csv는 첫 50행만 포함', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => `row${i}`).join('\n')
    const result = await extractText(Buffer.from(rows, 'utf-8'), 'csv')
    const lines = result.text.split('\n')
    expect(lines).toHaveLength(50)
    expect(lines[0]).toBe('row0')
    expect(lines[49]).toBe('row49')
  })

  it('hwp(바이너리)는 unsupported=true + hwpx 안내', async () => {
    const r = await extractText(Buffer.from('hwp'), 'hwp')
    expect(r.unsupported).toBe(true)
    expect(r.error).toMatch(/hwpx|PDF/)
  })

  it('hwpx는 ZIP 내 section XML에서 <hp:t> 텍스트를 추출', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('Contents/content.hpf', '<manifest/>')
    zip.file(
      'Contents/section0.xml',
      '<hs:sec xmlns:hp="x"><hp:p><hp:run><hp:t>융합 수업 설계안</hp:t></hp:run></hp:p>' +
        '<hp:p><hp:run><hp:t>물질의 상태변화 &amp; 에너지</hp:t></hp:run></hp:p></hs:sec>'
    )
    zip.file(
      'Contents/section1.xml',
      '<hs:sec xmlns:hp="x"><hp:p><hp:run><hp:t>2차시: 입자 모형</hp:t></hp:run></hp:p></hs:sec>'
    )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const r = await extractText(buffer, 'hwpx')
    expect(r.unsupported).toBeFalsy()
    expect(r.error).toBeFalsy()
    expect(r.text).toContain('융합 수업 설계안')
    expect(r.text).toContain('물질의 상태변화 & 에너지') // 엔티티 디코딩
    expect(r.text).toContain('2차시: 입자 모형') // 섹션 순서 보존
    // 문단 경계가 개행으로 유지된다
    expect(r.text.indexOf('융합 수업 설계안')).toBeLessThan(r.text.indexOf('물질의 상태변화'))
    expect(r.text).toMatch(/융합 수업 설계안\n/)
  })

  it('본문 섹션이 없는 zip은 hwpx 파싱 실패 안내', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('mimetype', 'application/hwp+zip')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const r = await extractText(buffer, 'hwpx')
    expect(r.error).toMatch(/hwpx 파싱 실패/)
  })

  it('zip이 아닌 hwpx는 파싱 실패 안내 (unsupported 아님 — 사유 노출)', async () => {
    const r = await extractText(Buffer.from('이건 zip이 아님'), 'hwpx')
    expect(r.error).toMatch(/hwpx 파싱 실패/)
  })

  it('doc / ppt는 레거시 OLE로 unsupported 반환', async () => {
    const r = await extractText(Buffer.from('doc'), 'doc')
    expect(r.unsupported).toBe(true)
    expect(r.error).toMatch(/레거시|OLE/)
  })

  it('이미지 확장자는 Vision 경로 sentinel(visionImage)을 반환', async () => {
    const r = await extractText(Buffer.from('img'), 'png')
    expect(r.visionImage).toBe(true)
    expect(r.mediaType).toBe('image/png')
    expect(r.unsupported).toBeFalsy()
  })

  it('jpg는 image/jpeg media type으로 매핑', async () => {
    const r = await extractText(Buffer.from('img'), 'jpg')
    expect(r.visionImage).toBe(true)
    expect(r.mediaType).toBe('image/jpeg')
  })

  it('알 수 없는 확장자는 unsupported 반환', async () => {
    const r = await extractText(Buffer.from('?'), 'xyz')
    expect(r.unsupported).toBe(true)
    expect(r.error).toMatch(/지원하지 않는 확장자/)
  })
})

describe('buildAnalyzeTool — intent별 동적 스키마 (출력 토큰 감량)', () => {
  const { buildAnalyzeTool } = _internal

  it('general intent는 intent_driven_summary를 required에서 제외 (요약 이중 생성 방지)', () => {
    const tool = buildAnalyzeTool('general')
    expect(tool.input_schema.required).not.toContain('intent_driven_summary')
    // 속성 자체는 남아 있어 모델이 원하면 채울 수 있다
    expect(tool.input_schema.properties.intent_driven_summary).toBeDefined()
  })

  it('general 외 intent는 intent_driven_summary가 required에 포함', () => {
    for (const intent of ['learner_context', 'curriculum_doc', 'research', 'assessment', 'custom']) {
      const tool = buildAnalyzeTool(intent)
      expect(tool.input_schema.required).toContain('intent_driven_summary')
    }
  })

  it('성취기준 후보는 최대 5개, reason은 100자 제한', () => {
    const codes = buildAnalyzeTool('general').input_schema.properties.suggested_standard_codes
    expect(codes.maxItems).toBe(5)
    expect(codes.items.properties.reason.maxLength).toBe(100)
  })
})
