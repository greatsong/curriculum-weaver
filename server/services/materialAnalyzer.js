/**
 * 자료 분석 파이프라인 (재설계)
 *
 * 파이프라인:
 *   pending → parsing → analyzing → completed | failed
 *
 * 1. Storage/Buffer에서 파일 수신
 * 2. 확장자별 텍스트 추출 (pdf/docx/txt/csv/pptx/xlsx)
 * 3. Claude tool_use로 구조화된 JSON 분석 결과 수신 (프롬프트 캐싱)
 * 4. 성취기준 코드 할루시네이션 필터링 (standardsValidator)
 * 5. Supabase materials 테이블 UPDATE
 *
 * 참고: _workspace/design/file-upload-redesign.md §3, §5
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { validateCode } from '../lib/standardsValidator.js'
import { Materials } from '../lib/store.js'
import {
  MATERIAL_ERROR_CODES as E,
  MATERIAL_INTENTS,
  DEFAULT_MATERIAL_INTENT,
} from '../../shared/constants.js'

// Lazy 초기화 — ESM hoisting으로 dotenv 로드 이전에 모듈이 평가되는 경우를 대비.
// process.env.ANTHROPIC_API_KEY가 실제 호출 시점에 주입되도록 보장.
let _client = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

/** 추출 본문 최대 길이 (약 20k 토큰) */
const TEXT_TRUNCATE = 20000
/** AI 분석 타임아웃 (ms) */
const AI_TIMEOUT_MS = 60_000
/**
 * 자료 분석용 AI 모델 — 프로젝트 다수가 claude-sonnet-4-6(fast) 사용 중이므로 동일 유지.
 * aiAgent.js의 MODEL_MAP.fast와 일치.
 */
const ANALYZER_MODEL = 'claude-sonnet-4-6'

// ── 시스템 프롬프트 (캐싱 대상, intent 블록은 끝에 배치) ──
// 앞 부분(공통 규칙)을 고정해 프롬프트 캐시 히트율을 유지한다.
const SYSTEM_PROMPT_BASE = `당신은 한국 2022 개정 교육과정 기반 융합 수업 설계 보조 AI입니다.
교사가 업로드한 자료를 분석해 수업 설계에 활용 가능한 인사이트를 구조화된 JSON으로 반환합니다.

[절대 규칙]
1. 성취기준 코드(suggested_standard_codes)는 "후보"로만 제시합니다. 형식은 [9과05-01], [4수02-03]처럼 대괄호를 포함한 한국 교육과정 표준 형식만 허용됩니다.
2. 확신이 없으면 빈 배열을 반환하세요. 추측으로 코드를 만들지 마세요.
3. summary는 5~7문장, 500자 이내로 작성합니다. 구조는 "개괄(1~2문장) → 핵심 포인트(2~3문장) → 수업 활용 제안(1~2문장)" 순서를 지키세요.
4. intent_driven_summary는 아래 [교사 업로드 의도]의 지시에 맞춰 별도로 작성합니다. intent가 'general'이면 summary와 동일해도 됩니다. 5~7문장, 500자 이내.
5. design_suggestions는 최대 5개, key_insights는 최대 8개, extracted_keywords는 최대 15개입니다.
6. 반드시 제공된 tool(submit_material_analysis)을 호출해 JSON으로만 응답하세요. 자유 텍스트는 금지입니다.`

/**
 * intent별 프롬프트 지시문 — 시스템 프롬프트 뒤에 붙어 요약 관점을 전환한다.
 * custom은 `${intentNote}`가 치환된 텍스트로 동적 구성된다.
 */
const INTENT_PROMPT_FRAGMENTS = {
  [MATERIAL_INTENTS.GENERAL]:
    '교사의 수업 설계에 도움이 될 수 있는 일반적 관점에서 요약하세요. 균형 잡힌 요약과 다각도 활용 제안을 제공하세요.',
  [MATERIAL_INTENTS.LEARNER_CONTEXT]:
    '이 자료에서 학생의 수준·사전지식·특성·동기 측면을 집중 추출하여 요약하세요. 성취기준 매칭보다 학습자 프로파일이 중요합니다. design_suggestions는 이 학습자 프로파일에 맞춘 차별화 수업 전략으로 작성하세요.',
  [MATERIAL_INTENTS.CURRICULUM_DOC]:
    '교육과정·성취기준 매칭과 원문 인용 정확성에 최우선 순위를 두고 요약하세요. intent_driven_summary는 어떤 교과·영역·성취기준을 다루는지 명시적으로 나열하고, suggested_standard_codes를 가장 적극적으로 추출하되 문서에 명시된 코드만 사용하세요.',
  [MATERIAL_INTENTS.RESEARCH]:
    '이론적 핵심 개념·모형·논거를 계층적으로 요약하고, 수업에 적용 가능한 함의를 강조하세요. key_insights는 수업 설계에 영감을 줄 만한 이론적 관점이어야 합니다.',
  [MATERIAL_INTENTS.ASSESSMENT]:
    '평가 도구의 유형(선택형/서술형/수행형 등)·수준·측정 역량·루브릭을 분석하고 교사가 활용 가능한 형태로 요약하세요. design_suggestions는 이 문항들을 변형·확장·대체할 아이디어로 작성하세요.',
  [MATERIAL_INTENTS.CUSTOM]:
    '교사가 남긴 아래 메모를 최우선 지침으로 삼아 intent_driven_summary와 key_insights를 작성하세요.',
}

/**
 * intent + intentNote를 받아 최종 system prompt 텍스트를 구성.
 * 캐시 친화적 구조: 앞 부분(공통 규칙)은 고정, 뒷부분(intent)만 가변.
 */
function buildSystemPrompt({ intent, intentNote } = {}) {
  const safeIntent = Object.values(MATERIAL_INTENTS).includes(intent)
    ? intent
    : DEFAULT_MATERIAL_INTENT
  const fragment = INTENT_PROMPT_FRAGMENTS[safeIntent] || INTENT_PROMPT_FRAGMENTS[DEFAULT_MATERIAL_INTENT]

  let intentBlock = `\n\n[교사 업로드 의도 — intent: ${safeIntent}]\n${fragment}`
  if (safeIntent === MATERIAL_INTENTS.CUSTOM && intentNote) {
    const clipped = String(intentNote).slice(0, 200)
    intentBlock += `\n\n교사 메모: "${clipped}"`
  }

  return SYSTEM_PROMPT_BASE + intentBlock
}

// ── Tool 스키마 (JSON 출력 강제) ──
const ANALYZE_TOOL = {
  name: 'submit_material_analysis',
  description: '교사가 업로드한 수업자료에 대한 구조화된 분석 결과를 제출합니다.',
  input_schema: {
    type: 'object',
    required: [
      'material_type',
      'summary',
      'intent_driven_summary',
      'key_insights',
      'suggested_standard_codes',
      'design_suggestions',
      'extracted_keywords',
    ],
    properties: {
      material_type: {
        type: 'string',
        enum: ['교과서단원', '수업지도안', '활동지', '뉴스기사', '학교문서', '학생결과물', '연구논문', '기타'],
      },
      summary: {
        type: 'string',
        maxLength: 500,
        description: '범용 요약 — 5~7문장, 500자 이내, "개괄→포인트→활용" 구조.',
      },
      intent_driven_summary: {
        type: 'string',
        maxLength: 500,
        description: '위 intent에 최적화된 요약 (5~7문장, 500자 내). intent=general이면 summary와 동일해도 됨.',
      },
      key_insights: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      suggested_standard_codes: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          required: ['code', 'confidence', 'reason'],
          properties: {
            code: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reason: { type: 'string', maxLength: 200 },
          },
        },
      },
      design_suggestions: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      extracted_keywords: { type: 'array', items: { type: 'string' }, maxItems: 15 },
    },
  },
}

/**
 * materials 테이블의 특정 행 업데이트. Supabase 실패 시 인메모리 store로 폴백.
 * 인메모리 폴백은 "Materials.update 자체가 null을 반환(행 없음)"한 경우에도
 * 조용히 무시한다 — 테스트 환경과 dev 모드 모두 안전.
 */
async function updateMaterialRow(materialId, patch) {
  let supabaseOk = false
  try {
    const { error } = await supabaseAdmin
      .from('materials')
      .update(patch)
      .eq('id', materialId)
    if (error) throw error
    supabaseOk = true
  } catch (err) {
    // Supabase 미연결 / RLS 실패 등 — 인메모리 store 폴백
    try {
      Materials.update(materialId, patch)
    } catch (memErr) {
      console.warn(
        '[materialAnalyzer] 상태 갱신 실패(무시):',
        err?.message || err,
        memErr?.message || memErr
      )
    }
  }
  // Supabase 성공 여부와 무관하게 인메모리 store도 동기화(GET /analysis 폴백 경로 호환)
  if (supabaseOk) {
    try { Materials.update(materialId, patch) } catch { /* ignore */ }
  }
}

/**
 * 확장자별 파서 — {text, unsupported, error} 반환
 */
async function extractText(buffer, ext) {
  const lower = String(ext || '').toLowerCase()
  try {
    if (lower === 'pdf') {
      const pdfParse = (await import('pdf-parse')).default
      const result = await pdfParse(buffer)
      return { text: result.text || '' }
    }
    if (lower === 'docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return { text: result.value || '' }
    }
    if (lower === 'txt' || lower === 'md') {
      // md는 마크다운 원문을 그대로 분석 대상 텍스트로 사용
      return { text: buffer.toString('utf-8') }
    }
    if (lower === 'csv') {
      const raw = buffer.toString('utf-8')
      // 첫 50행만 사용 (분석 비용 절약)
      const head = raw.split(/\r?\n/).slice(0, 50).join('\n')
      return { text: head }
    }
    if (lower === 'xlsx' || lower === 'xls') {
      // xlsx (SheetJS)는 프로젝트 루트에 이미 있음
      try {
        const xlsx = await import('xlsx')
        const wb = xlsx.read(buffer, { type: 'buffer' })
        const parts = []
        for (const sheetName of wb.SheetNames) {
          const csv = xlsx.utils.sheet_to_csv(wb.Sheets[sheetName])
          const head = csv.split(/\r?\n/).slice(0, 50).join('\n')
          parts.push(`### ${sheetName}\n${head}`)
        }
        return { text: parts.join('\n\n') }
      } catch (e) {
        return { unsupported: true, error: `xlsx 파싱 불가: ${e.message}` }
      }
    }
    if (lower === 'pptx') {
      // officeparser v6 API 변경으로 parseOfficeAsync(버퍼→문자열) 제거됨.
      // 대신 parseOffice(buffer) → OfficeParserAST 객체가 반환되며, toText()로 평문을 얻는다.
      try {
        const mod = await import('officeparser')
        const parseOffice = mod.parseOffice || mod.default?.parseOffice
        if (typeof parseOffice !== 'function') {
          return { unsupported: true, error: 'officeparser parseOffice를 찾을 수 없습니다.' }
        }
        const ast = await parseOffice(buffer)
        const text = typeof ast?.toText === 'function' ? ast.toText() : ''
        return { text: text || '' }
      } catch (e) {
        return { unsupported: true, error: `pptx 파서 미설치 또는 실패: ${e.message}` }
      }
    }
    if (['hwp', 'hwpx'].includes(lower)) {
      return { unsupported: true, error: '한글(hwp/hwpx) 파서 미지원 — docx 또는 pdf로 변환해주세요.' }
    }
    if (['doc', 'ppt', 'xls'].includes(lower)) {
      return { unsupported: true, error: '레거시 OLE 형식은 지원하지 않습니다. docx/pptx/xlsx로 변환해주세요.' }
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(lower)) {
      return { unsupported: true, error: '이미지 Vision 분석은 추후 제공 예정입니다.' }
    }
    return { unsupported: true, error: `지원하지 않는 확장자: ${lower}` }
  } catch (err) {
    return { error: err?.message || '텍스트 추출 중 오류' }
  }
}

/**
 * Claude tool_use 기반 분석. Promise는 AI_TIMEOUT_MS 안에 resolve되지 않으면 reject.
 *
 * @param {string} text
 * @param {{intent?: string, intentNote?: string|null}} [options]
 */
async function callClaudeAnalysis(text, { intent = DEFAULT_MATERIAL_INTENT, intentNote = null } = {}) {
  const userMessage = `<자료본문>
${text}
</자료본문>

위 자료를 분석하여 submit_material_analysis 도구로 결과를 제출해주세요.`

  const systemText = buildSystemPrompt({ intent, intentNote })

  const aiCall = getClient().messages.create({
    model: ANALYZER_MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    tools: [ANALYZE_TOOL],
    tool_choice: { type: 'tool', name: 'submit_material_analysis' },
    messages: [{ role: 'user', content: userMessage }],
  })

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS)
  )
  const response = await Promise.race([aiCall, timeout])

  const toolUse = Array.isArray(response?.content)
    ? response.content.find((b) => b.type === 'tool_use')
    : null
  if (!toolUse || !toolUse.input || typeof toolUse.input !== 'object') {
    throw new Error('AI_SCHEMA_INVALID')
  }
  return toolUse.input
}

/**
 * 할루시네이션 필터 — AI가 반환한 코드를 DB와 대조하여 validated/rejected로 분리.
 */
function filterHallucinations(suggestedCodes) {
  const validated = []
  const rejected = []
  if (!Array.isArray(suggestedCodes)) return { validated, rejected }

  for (const item of suggestedCodes) {
    if (!item || typeof item !== 'object' || !item.code) continue
    const result = validateCode(item.code)

    if (result.valid && result.matched) {
      validated.push({
        code: result.matched.code,
        content: result.matched.content,
        subject: result.matched.subject_group || result.matched.subject,
        confidence: item.confidence ?? 0.5,
        reason: item.reason || '',
        match_reason: 'exact',
      })
      continue
    }

    // 편집거리 ≤ 2: 자동 교정 (confidence 15% 감쇠)
    if (result.suggestion && (result.distance ?? 99) <= 2) {
      validated.push({
        code: result.suggestion.code,
        content: result.suggestion.content,
        subject: result.suggestion.subject_group || result.suggestion.subject,
        confidence: Math.max(0, (item.confidence ?? 0.5) - 0.15),
        reason: item.reason || '',
        match_reason: 'auto_corrected',
        original_code: item.code,
        edit_distance: result.distance,
      })
      continue
    }

    rejected.push({
      code: item.code,
      reason: result.suggestion ? 'too_distant' : 'not_found',
      suggestion: result.suggestion?.code ?? null,
      edit_distance: result.distance ?? null,
      original_reason: item.reason || '',
    })
  }

  return { validated, rejected }
}

/**
 * 업로드된 자료 분석 (fire-and-forget 호출 대상)
 *
 * @param {string} materialId - materials.id
 * @param {Buffer} fileBuffer - 파일 원본 버퍼 (호출 직후 해제 권장)
 * @param {string} fileExt   - 확장자 (소문자, 점 없음)
 * @param {{intent?: string, intentNote?: string|null}} [options]
 */
export async function analyzeMaterial(
  materialId,
  fileBuffer,
  fileExt,
  { intent = DEFAULT_MATERIAL_INTENT, intentNote = null } = {}
) {
  const safeIntent = Object.values(MATERIAL_INTENTS).includes(intent)
    ? intent
    : DEFAULT_MATERIAL_INTENT
  const safeNote = safeIntent === MATERIAL_INTENTS.CUSTOM && intentNote
    ? String(intentNote).slice(0, 200)
    : null

  // ── 1. parsing 단계 ──
  // intent/intent_note 컬럼도 함께 동기화 (업로드 시점과 분석 시점 사이 레코드 무결성 유지)
  await updateMaterialRow(materialId, {
    processing_status: 'parsing',
    processing_error: null,
    intent: safeIntent,
    intent_note: safeNote,
  })

  try {
    const { text, unsupported, error } = await extractText(fileBuffer, fileExt)

    if (unsupported) {
      // 파일은 보관하되 분석 불가 — failed로 전이하고 사유 기록
      await updateMaterialRow(materialId, {
        processing_status: 'failed',
        processing_error: `${E.UNSUPPORTED_TYPE}: ${error || '지원하지 않는 형식'}`,
      })
      return
    }
    if (error) {
      await updateMaterialRow(materialId, {
        processing_status: 'failed',
        processing_error: `${E.PARSE_FAILED}: ${error}`,
      })
      return
    }

    const truncated = (text || '').slice(0, TEXT_TRUNCATE)
    if (truncated.trim().length === 0) {
      await updateMaterialRow(materialId, {
        processing_status: 'failed',
        processing_error: `${E.PARSE_FAILED}: 추출된 텍스트가 비어 있습니다.`,
        extracted_text: '',
      })
      return
    }

    // ── 2. analyzing 단계 ──
    await updateMaterialRow(materialId, {
      processing_status: 'analyzing',
      extracted_text: truncated,
    })

    const aiRaw = await callClaudeAnalysis(truncated, { intent: safeIntent, intentNote: safeNote })

    // ── 3. 할루시네이션 필터 ──
    const { validated, rejected } = filterHallucinations(aiRaw.suggested_standard_codes || [])

    // intent_driven_summary가 비어 있으면 summary로 폴백 (응답 스키마 방어)
    const intentDrivenSummary =
      (aiRaw.intent_driven_summary || '').trim() || aiRaw.summary || ''

    const analysis = {
      material_type: aiRaw.material_type || '기타',
      summary: aiRaw.summary || '',
      intent_driven_summary: intentDrivenSummary,
      key_insights: aiRaw.key_insights || [],
      design_suggestions: aiRaw.design_suggestions || [],
      extracted_keywords: aiRaw.extracted_keywords || [],
      validated_connections: validated,
      rejected_codes: rejected,
      meta: {
        model: ANALYZER_MODEL,
        rejected_ratio: rejected.length
          ? rejected.length / ((rejected.length + validated.length) || 1)
          : 0,
        intent: safeIntent,
        intent_note: safeNote,
        prompt_version: '2025-04-a',
      },
    }

    // ── 4. completed 상태로 마감 ──
    await updateMaterialRow(materialId, {
      processing_status: 'completed',
      processing_error: null,
      ai_summary: analysis.summary,
      ai_analysis: analysis,
      analyzed_at: new Date().toISOString(),
    })
  } catch (err) {
    // 구조화된 에러 코드 매핑 — processing_error 포맷: "CODE: message"
    // (materials.js GET /:id/analysis 핸들러가 접두 코드를 파싱해 error_code로 내려줌)
    const msg = err?.message || '알 수 없는 오류'
    let structured
    if (msg === 'AI_TIMEOUT') {
      structured = `${E.AI_TIMEOUT}: AI 분석 타임아웃 (60s) — 재분석을 시도해주세요.`
    } else if (msg === 'AI_SCHEMA_INVALID') {
      structured = `${E.AI_SCHEMA_INVALID}: AI 응답 스키마가 올바르지 않습니다. 재분석을 시도해주세요.`
    } else if (/timeout/i.test(msg)) {
      structured = `${E.AI_TIMEOUT}: ${msg}`
    } else {
      structured = `${E.INTERNAL}: ${msg}`
    }
    console.error('[materialAnalyzer] 실패:', msg)
    await updateMaterialRow(materialId, {
      processing_status: 'failed',
      processing_error: structured,
    })
  }
}

// 내부 테스트용 export
export const _internal = {
  filterHallucinations,
  extractText,
  buildSystemPrompt,
  INTENT_PROMPT_FRAGMENTS,
}
