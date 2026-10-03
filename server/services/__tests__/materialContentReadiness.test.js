// @vitest-environment node
import JSZip from 'jszip'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import * as xlsx from 'xlsx'
const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mocks.create } } }))
import { analyzeMaterial, analyzeUrlMaterial, _internal } from '../materialAnalyzer.js'
import { buildMaterialsContext } from '../aiAgent.js'
import { Materials } from '../../lib/store.js'
import { selectMaterialExcerpts, MAX_MATERIAL_TEXT_CHARS, materialCoverageMessage } from '../../../shared/materialText.js'

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', '')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
  mocks.create.mockReset().mockResolvedValue({ content: [{ type: 'tool_use', input: {
    summary: '검사용 요약', intent_driven_summary: '검사용 의도 요약',
    key_insights: [], design_suggestions: [], extracted_keywords: [], suggested_standard_codes: [],
  } }] })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('문서 뒷부분의 질문 관련 구간을 앞부분 대신 찾아 전달한다', () => {
  const text = '앞부분 설명. '.repeat(5000) + '\n준비물: 색종이 17장\n' + '끝부분 설명. '.repeat(1000)
  const excerpt = selectMaterialExcerpts(text, 8000, '준비물은 몇 개인가요?')
  expect(excerpt.text).toContain('색종이 17장')
  expect(excerpt.includedChars).toBeLessThanOrEqual(8000)
  const context = buildMaterialsContext([{ ...material, extracted_text: text }], { selectedIds: ['ref'], query: '준비물은 몇 개인가요?' })
  expect(context).toContain('색종이 17장')
})

it('재분석 실패 자료의 이전 요약을 완료 자료로 사용하지 않는다', () => {
  const row = { id: 'failed', processing_status: 'failed', ai_summary: '이전 요약', file_name: '자료.txt' }
  expect(buildMaterialsContext([row])).toBeNull()
  const context = buildMaterialsContext([row], { mentionedIds: ['failed'] })
  expect(context).toContain('분석 실패')
  expect(context).not.toContain('이전 요약')
})

it('보존 한도를 넘으면 잘림을 기록하고 실시간 이벤트에 긴 원문을 싣지 않는다', async () => {
  const emit = vi.fn()
  vi.stubGlobal('__cwIo', { to: () => ({ emit }) })
  const row = Materials.add('ux-audit', { processing_status: 'pending', file_type: 'txt' })
  await analyzeMaterial(row.id, Buffer.from('가'.repeat(MAX_MATERIAL_TEXT_CHARS + 10)), 'txt', { projectId: 'ux-audit' })
  const saved = Materials.findById(row.id)
  expect(saved.extracted_text).toHaveLength(MAX_MATERIAL_TEXT_CHARS)
  expect(saved.ai_analysis.meta.coverage.storage_truncated).toBe(true)
  const updates = emit.mock.calls.filter(([event]) => event === 'material_updated')
  expect(updates.map(([, patch]) => patch.processing_status)).toEqual(['parsing', 'analyzing', 'completed'])
  expect(updates.every(([, patch]) => patch.extracted_text === undefined)).toBe(true)
})

// 저장소 밖 개인 문서 대신 재현 가능한 작은 OOXML 문서를 생성한다.
for (const ext of ['docx', 'pptx']) {
  it(`[정상] ${ext.toUpperCase()} 문서를 실제 파서로 읽는다`, async () => {
    const zip = new JSZip()
    const text = '수업 자료 본문과 학생 활동 준비물 색종이 17장'
    if (ext === 'docx') {
      zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
      zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
      zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`)
    } else {
      zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>')
      zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>')
      zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>')
      zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`)
    }
    const parsed = await _internal.extractText(await zip.generateAsync({ type: 'nodebuffer' }), ext)
    expect(parsed.error).toBeUndefined()
    expect(parsed.text).toContain('색종이 17장')
  })
}

it('XLSX의 51행 이후도 보존한다', async () => {
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(Array.from({ length: 60 }, (_, i) => [`학생${i + 1}`, i + 1])), '학생자료')
  const parsed = await _internal.extractText(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'xlsx')
  expect(parsed.error).toBeUndefined()
  expect(parsed.text).toContain('학생50,50')
  expect(parsed.text).toContain('학생60,60')
})

it('긴 자료의 전체 본문을 보존하고 앞·중간·뒤 발췌와 범위 정보를 분석에 전달한다', async () => {
  const row = Materials.add('ux-audit', { processing_status: 'pending', file_type: 'txt' })
  await analyzeMaterial(row.id, Buffer.from('앞부분'.repeat(10000) + '최종결론은 수업시간 45분'), 'txt')
  const saved = Materials.findById(row.id)
  expect(saved.processing_status).toBe('completed')
  expect(saved.extracted_text.length).toBeGreaterThan(20000)
  expect(saved.extracted_text).toContain('최종결론')
  expect(saved.ai_analysis.meta.coverage.analysis_truncated).toBe(true)
  expect(mocks.create.mock.calls[0][0].messages[0].content).toContain('최종결론')
})

const material = { id: 'ref', file_name: '활동지.txt', processing_status: 'completed', ai_summary: '활동지 개요', extracted_text: '표에 적힌 준비물은 색종이 17장이다.' }
it('선택 자료의 구체적 수치도 원문과 함께 전달한다', () => {
  const context = buildMaterialsContext([material], { selectedIds: ['ref'] })
  expect(context).toContain('활동지 개요')
  expect(context).toContain('색종이 17장')
})
it('[정상] @로 지정한 짧은 자료는 원문까지 AI 입력에 포함한다', () => {
  expect(buildMaterialsContext([material], { mentionedIds: ['ref'] })).toContain('색종이 17장')
})
it('[정상] 모두 제외를 지정하면 일반 자료 컨텍스트를 보내지 않는다', () => {
  expect(buildMaterialsContext([material], { selectedIds: [] })).toBeNull()
})

it('빈 웹페이지는 AI를 호출하지 않고 실패 이유를 저장한다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })))
  const row = Materials.add('ux-audit', { processing_status: 'pending', file_type: 'url' })
  await analyzeUrlMaterial(row.id, 'https://example.com/empty')
  expect(Materials.findById(row.id).processing_status).toBe('failed')
  expect(Materials.findById(row.id).processing_error).toContain('본문이 비어')
  expect(mocks.create).not.toHaveBeenCalled()
})

it('이미지 직접 분석을 이전 텍스트 분석으로 잘못 안내하지 않는다', () => {
  expect(materialCoverageMessage({ ai_analysis: { meta: { analysis_mode: 'vision_image' } } })).toContain('시각적으로 분석')
  expect(materialCoverageMessage({ ai_analysis: { meta: { analysis_mode: 'vision_pdf' } } })).not.toContain('재분석해주세요')
})
