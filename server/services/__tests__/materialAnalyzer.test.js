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

  it('hwp / hwpx는 unsupported=true 반환', async () => {
    const r1 = await extractText(Buffer.from('hwp'), 'hwp')
    const r2 = await extractText(Buffer.from('hwpx'), 'hwpx')
    expect(r1.unsupported).toBe(true)
    expect(r2.unsupported).toBe(true)
    expect(r1.error).toMatch(/한글/)
  })

  it('doc / ppt는 레거시 OLE로 unsupported 반환', async () => {
    const r = await extractText(Buffer.from('doc'), 'doc')
    expect(r.unsupported).toBe(true)
    expect(r.error).toMatch(/레거시|OLE/)
  })

  it('이미지 확장자는 unsupported(Vision 예정)', async () => {
    const r = await extractText(Buffer.from('img'), 'png')
    expect(r.unsupported).toBe(true)
    expect(r.error).toMatch(/이미지|Vision/)
  })

  it('알 수 없는 확장자는 unsupported 반환', async () => {
    const r = await extractText(Buffer.from('?'), 'xyz')
    expect(r.unsupported).toBe(true)
    expect(r.error).toMatch(/지원하지 않는 확장자/)
  })
})
