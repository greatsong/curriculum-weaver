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
import { Materials, Messages } from '../lib/store.js'
import {
  MATERIAL_ERROR_CODES as E,
  MATERIAL_INTENTS,
  DEFAULT_MATERIAL_INTENT,
  MAX_VISION_IMAGE_BYTES,
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
/** AI 분석 타임아웃 (ms) — 실측 p90 51s(감량 전) 대비 여유 확보 */
const AI_TIMEOUT_MS = 90_000
/** Vision(문서/이미지 직접 분석) 타임아웃 — 이미지 토큰 처리로 텍스트보다 오래 걸림 */
const AI_TIMEOUT_VISION_MS = 150_000
/** Vision PDF 페이지 상한 (Claude API 문서 입력 한도) */
const VISION_PDF_MAX_PAGES = 600
/** Vision 지원 이미지 확장자 → media_type (확장자 목록·크기 상한은 shared/constants가 정본) */
export const VISION_IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}
/**
 * 자료 분석용 AI 모델 — aiAgent.js의 MODEL_MAP.fast와 일치.
 */
const ANALYZER_MODEL = 'claude-sonnet-5'

// ── 시스템 프롬프트 (캐싱 대상, intent 블록은 끝에 배치) ──
// 앞 부분(공통 규칙)을 고정해 프롬프트 캐시 히트율을 유지한다.
const SYSTEM_PROMPT_BASE = `당신은 한국 2022 개정 교육과정 기반 융합 수업 설계 보조 AI입니다.
교사가 업로드한 자료를 분석해 수업 설계에 활용 가능한 인사이트를 구조화된 JSON으로 반환합니다.

[절대 규칙]
1. 성취기준 코드(suggested_standard_codes)는 "후보"로만 제시합니다. 형식은 [9과05-01], [4수02-03]처럼 대괄호를 포함한 한국 교육과정 표준 형식만 허용됩니다. 가장 확신하는 것부터 최대 5개, reason은 100자 이내.
2. 확신이 없으면 빈 배열을 반환하세요. 추측으로 코드를 만들지 마세요.
3. summary는 5~7문장으로 작성하되 500자를 절대 초과하지 마세요. 500자를 넘길 바에는 문장을 줄이세요. 구조는 "개괄(1~2문장) → 핵심 포인트(2~3문장) → 수업 활용 제안(1~2문장)" 순서를 지키세요.
4. intent_driven_summary는 아래 [교사 업로드 의도]의 지시에 맞춰 별도로 작성합니다(500자 이내). 단, intent가 'general'이면 summary와 동일하므로 이 필드를 아예 생략하세요 — 같은 내용을 두 번 쓰지 마세요.
5. design_suggestions는 최대 5개, key_insights는 최대 8개, extracted_keywords는 최대 15개입니다. 각 항목은 한 문장으로 간결하게.
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
// intent=general이면 intent_driven_summary가 summary와 중복이라 required에서 제외한다.
// (요약 이중 생성은 출력 토큰 = 분석 지연의 최대 요인 — 서버가 summary로 폴백)
function buildAnalyzeTool(intent) {
  const required = [
    'material_type',
    'summary',
    'key_insights',
    'suggested_standard_codes',
    'design_suggestions',
    'extracted_keywords',
  ]
  if (intent !== MATERIAL_INTENTS.GENERAL) required.splice(2, 0, 'intent_driven_summary')

  return {
    name: 'submit_material_analysis',
    description: '교사가 업로드한 수업자료에 대한 구조화된 분석 결과를 제출합니다.',
    input_schema: {
      type: 'object',
      required,
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
          description: '위 intent에 최적화된 요약 (5~7문장, 500자 내). intent=general이면 생략할 것.',
        },
        key_insights: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        suggested_standard_codes: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            required: ['code', 'confidence', 'reason'],
            properties: {
              code: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              reason: { type: 'string', maxLength: 100 },
            },
          },
        },
        design_suggestions: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        extracted_keywords: { type: 'array', items: { type: 'string' }, maxItems: 15 },
      },
    },
  }
}

/**
 * attached_material_id로 system 메시지를 찾아 processing_status를 전이한다.
 * — materialAnalyzer의 상태 전이(parsing → analyzing → completed/failed)에 맞춰
 *   채팅 타임라인의 첨부 알림 메시지도 동반 업데이트.
 * — Supabase 우선, 실패 시 인메모리 폴백.
 * — 업로드 소스가 chat이 아닌 경우(대응 메시지 없음)에도 안전하게 no-op.
 *
 * @param {string} materialId
 * @param {'parsing'|'analyzing'|'completed'|'failed'} status
 */
export async function updateSystemAttachmentMessage(materialId, status) {
  if (!materialId || !status) return
  // 채팅 시스템 메시지 CHECK 제약은 'parsing'|'completed'|'failed'만 허용.
  // analyzing은 UX상 "분석 중"과 동일하므로 parsing으로 축약한다.
  const dbStatus = status === 'analyzing' ? 'parsing' : status

  let updatedMessages = []

  // Supabase 먼저 시도 — .select()로 갱신된 행(들)을 돌려받아 Socket.IO 브로드캐스트에 사용
  try {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .update({ processing_status: dbStatus })
      .eq('attached_material_id', materialId)
      .eq('sender_type', 'system')
      .select()
    if (error) throw error
    updatedMessages = Array.isArray(data) ? data : (data ? [data] : [])
  } catch (err) {
    // 인메모리 폴백 (테스트 / dev 모드) — updateByAttachment는 배열 반환
    try {
      const memResult = Messages.updateByAttachment(materialId, { processing_status: dbStatus })
      updatedMessages = Array.isArray(memResult) ? memResult : (memResult ? [memResult] : [])
    } catch (memErr) {
      console.warn(
        '[materialAnalyzer] 시스템 메시지 상태 갱신 실패(무시):',
        err?.message || err,
        memErr?.message || memErr
      )
    }
  }

  // Supabase 성공 케이스에서도 인메모리 store 동기화 (GET 폴백 경로 대비)
  if (updatedMessages.length > 0) {
    try { Messages.updateByAttachment(materialId, { processing_status: dbStatus }) } catch { /* ignore */ }
  }

  // 실시간 브로드캐스트 — 채팅 패널의 시스템 메시지 칩 상태 갱신
  const io = globalThis.__cwIo
  if (io) {
    for (const msg of updatedMessages) {
      try {
        const room = msg?.project_id || msg?.session_id
        if (room) io.to(room).emit('message_updated', msg)
      } catch (emitErr) {
        console.warn('[materialAnalyzer] message_updated emit 실패(무시):', emitErr?.message || emitErr)
      }
    }
  }
}

/**
 * materials 테이블의 특정 행 업데이트. Supabase 실패 시 인메모리 store로 폴백.
 * 인메모리 폴백은 "Materials.update 자체가 null을 반환(행 없음)"한 경우에도
 * 조용히 무시한다 — 테스트 환경과 dev 모드 모두 안전.
 */
async function updateMaterialRow(materialId, patch) {
  let supabaseOk = false
  const payload = { ...patch }
  try {
    const stripped = []
    for (let i = 0; i < 8; i += 1) {
      const { error } = await supabaseAdmin
        .from('materials')
        .update(payload)
        .eq('id', materialId)
      if (!error) {
        if (stripped.length > 0) {
          console.warn('[materialAnalyzer] 운영 DB 누락 컬럼 제외 후 상태 갱신:', stripped.join(', '))
        }
        supabaseOk = true
        break
      }

      const missing = String(error?.message || '').match(/Could not find the '([^']+)' column/)?.[1]
      if (!missing || !(missing in payload)) throw error
      delete payload[missing]
      stripped.push(missing)
    }
    if (!supabaseOk) throw new Error('materials 상태 갱신 재시도 한도를 초과했습니다.')
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

/** URL fetch 타임아웃 (ms) */
const URL_FETCH_TIMEOUT_MS = 15_000
/** URL 응답 본문 최대 크기 (바이트) — 과도한 페이지/파일 방어 */
const MAX_URL_FETCH_BYTES = 8 * 1024 * 1024 // 8MB

/**
 * SSRF 방어 — 내부망/메타데이터 엔드포인트로의 요청을 차단.
 * best-effort(문자열 기반)이며 DNS rebinding까지는 막지 못한다.
 * @returns {{ok: true} | {ok: false, message: string}}
 */
function assertPublicUrl(rawUrl) {
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    return { ok: false, message: 'URL 형식이 올바르지 않습니다.' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, message: 'http/https URL만 지원합니다.' }
  }
  const host = u.hostname.toLowerCase()
  // 로컬/내부 도메인
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return { ok: false, message: '내부 주소는 가져올 수 없습니다.' }
  }
  // IPv6 루프백/링크로컬/ULA
  if (host === '::1' || host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd')) {
    return { ok: false, message: '내부 주소는 가져올 수 없습니다.' }
  }
  // IPv4 사설/루프백/링크로컬 대역
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    const isPrivate =
      a === 0 ||
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a >= 224 // 멀티캐스트/예약
    if (isPrivate) return { ok: false, message: '내부 주소는 가져올 수 없습니다.' }
  }
  return { ok: true }
}

/** 자주 쓰는 HTML 엔티티 디코드 (경량) */
function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)) } catch { return '' }
    })
}

/**
 * HTML → 평문 변환 (경량, 의존성 없음).
 * script/style/noscript/template 블록 제거 후 블록 태그를 개행으로 치환하고 나머지 태그를 제거한다.
 */
function htmlToText(html) {
  let s = String(html || '')
  // 제목/메타 설명을 우선 확보 (본문 추출 실패 대비 컨텍스트)
  const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : ''

  s = s
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    // 블록 경계를 개행으로
    .replace(/<\/?(p|div|section|article|header|footer|li|ul|ol|tr|h[1-6]|br|blockquote|pre)[^>]*>/gi, '\n')
    // 나머지 태그 제거
    .replace(/<[^>]+>/g, ' ')

  s = decodeEntities(s)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { title, text: s }
}

/** 최대 리다이렉트 추적 횟수 */
const MAX_URL_REDIRECTS = 5

/** 일부 사이트가 빈 UA를 차단 → 일반 브라우저 UA 모사 */
const URL_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (compatible; CurriculumWeaverBot/1.0; +https://curriculum-weaver)',
  Accept: 'text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.8',
}

/**
 * 응답 본문을 스트리밍으로 읽되 maxBytes를 초과하면 즉시 중단한다.
 * arrayBuffer()는 전체를 메모리에 적재한 뒤에야 크기를 알 수 있어 메모리 고갈 위험이 있다.
 * @returns {Promise<{buffer?: Buffer, tooLarge?: boolean}>}
 */
async function readBodyCapped(res, maxBytes) {
  const reader = res.body?.getReader?.()
  if (!reader) {
    // 스트림 미지원 환경 폴백 — arrayBuffer 후 크기 검사
    const ab = await res.arrayBuffer()
    if (ab.byteLength > maxBytes) return { tooLarge: true }
    return { buffer: Buffer.from(ab) }
  }
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      try { await reader.cancel() } catch { /* ignore */ }
      return { tooLarge: true }
    }
    chunks.push(Buffer.from(value))
  }
  return { buffer: Buffer.concat(chunks) }
}

/**
 * 참고사이트 URL을 가져와 분석용 평문을 추출한다.
 * - 입력한 단일 페이지만 가져온다(페이지 내부 링크 크롤링 없음).
 * - 리다이렉트를 수동으로 따라가며 매 홉마다 SSRF 가드를 재검증한다.
 * - 본문은 스트리밍으로 읽으며 크기 상한을 강제한다.
 * HTML은 본문 텍스트로, PDF는 pdf-parse로 처리한다.
 * @returns {Promise<{text?: string, unsupported?: boolean, error?: string}>}
 */
async function fetchUrlContent(rawUrl) {
  // 전체 작업(리다이렉트 + 본문 읽기)에 단일 타임아웃 예산 부여
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS)
  try {
    let currentUrl = rawUrl
    let res = null

    for (let hop = 0; hop <= MAX_URL_REDIRECTS; hop += 1) {
      // 매 홉마다 SSRF 재검증 — 공개 URL이 내부망으로 리다이렉트하는 우회를 차단
      const guard = assertPublicUrl(currentUrl)
      if (!guard.ok) return { error: guard.message }

      let r
      try {
        r = await fetch(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: URL_FETCH_HEADERS,
        })
      } catch (err) {
        const aborted = err?.name === 'AbortError'
        return {
          error: aborted
            ? `페이지 응답 시간 초과 (${URL_FETCH_TIMEOUT_MS / 1000}s)`
            : `페이지를 가져오지 못했습니다: ${err?.message || err}`,
        }
      }

      // 3xx + Location → 다음 홉으로 (본문은 버림)
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        try { await r.body?.cancel?.() } catch { /* ignore */ }
        let next
        try {
          next = new URL(r.headers.get('location'), currentUrl).toString()
        } catch {
          return { error: '리다이렉트 주소가 올바르지 않습니다.' }
        }
        currentUrl = next
        continue
      }

      res = r
      break
    }

    if (!res) return { error: '리다이렉트가 너무 많습니다.' }
    if (!res.ok) return { error: `페이지 응답 오류 (HTTP ${res.status})` }

    // content-length 힌트가 상한을 넘으면 바로 거절(다운로드 회피)
    const contentLength = Number(res.headers.get('content-length') || 0)
    if (contentLength && contentLength > MAX_URL_FETCH_BYTES) {
      try { await res.body?.cancel?.() } catch { /* ignore */ }
      return { error: `페이지가 너무 큽니다 (${Math.round(contentLength / 1024 / 1024)}MB).` }
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    const { buffer, tooLarge } = await readBodyCapped(res, MAX_URL_FETCH_BYTES)
    if (tooLarge) {
      return { error: `페이지가 너무 큽니다 (${Math.round(MAX_URL_FETCH_BYTES / 1024 / 1024)}MB 초과).` }
    }

    // PDF (content-type 또는 최종 URL 확장자 기준)
    if (contentType.includes('application/pdf') || /\.pdf(\?|#|$)/i.test(currentUrl)) {
      return await extractText(buffer, 'pdf')
    }
    // HTML/XML (content-type 미상이면 HTML로 간주)
    if (contentType.includes('html') || contentType.includes('xml') || contentType === '') {
      const { title, text } = htmlToText(buffer.toString('utf-8'))
      const header = title
        ? `[페이지 제목] ${title}\n[URL] ${rawUrl}\n\n`
        : `[URL] ${rawUrl}\n\n`
      return { text: header + text }
    }
    // 일반 텍스트/JSON
    if (contentType.includes('text/') || contentType.includes('json')) {
      return { text: `[URL] ${rawUrl}\n\n${buffer.toString('utf-8')}` }
    }
    return { unsupported: true, error: `지원하지 않는 콘텐츠 유형입니다: ${contentType || '알 수 없음'}` }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * HWPX(OWPML, KS X 6101) 텍스트 추출 — ZIP 컨테이너 안의 Contents/section*.xml에서
 * <hp:t> 텍스트 런을 모은다. 바이너리 .hwp(OLE)와 달리 표준 XML이라 파서 없이 처리 가능.
 * @returns {Promise<string>} 추출 평문 (섹션 순서 보존, 문단 경계는 개행)
 */
async function extractHwpxText(buffer) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)

  // Contents/section0.xml, section1.xml … 순서대로 (숫자 기준 정렬)
  const sectionNames = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/section(\d+)/i)?.[1] ?? 0)
      const nb = Number(b.match(/section(\d+)/i)?.[1] ?? 0)
      return na - nb
    })
  if (sectionNames.length === 0) {
    throw new Error('HWPX 본문(Contents/section*.xml)을 찾을 수 없습니다.')
  }

  const parts = []
  for (const name of sectionNames) {
    const xml = await zip.files[name].async('string')
    // 문단(</hp:p>) 경계를 개행으로 표시한 뒤 <hp:t> 런만 수집.
    // 태그명은 정확히 't'여야 한다 — [^>]*를 이름에 붙이면 hp:tbl(표)·hp:tc(셀)까지
    // 매칭돼 XML 마크업이 본문으로 새어 들어온다 (실파일 검증에서 발견).
    const withBreaks = xml.replace(/<\/hp:p>/gi, '\n')
    const re = /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/gi
    let m
    let lastEnd = 0
    let out = ''
    while ((m = re.exec(withBreaks)) !== null) {
      // 런 사이에 문단 개행이 있었으면 반영
      const gap = withBreaks.slice(lastEnd, m.index)
      if (gap.includes('\n')) out += '\n'
      // 런 내부의 중첩 태그(마커 등) 제거 후 엔티티 디코딩
      out += decodeEntities(m[1].replace(/<[^>]+>/g, ''))
      lastEnd = re.lastIndex
    }
    parts.push(out)
  }

  return parts
    .join('\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
      // numpages: 텍스트가 비었을 때 Vision 폴백의 페이지 상한 판정에 사용
      return { text: result.text || '', numpages: result.numpages || 0 }
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
    if (lower === 'hwpx') {
      // OWPML ZIP 컨테이너 — Contents/section*.xml에서 텍스트 런 추출
      try {
        return { text: await extractHwpxText(buffer) }
      } catch (e) {
        return { error: `hwpx 파싱 실패: ${e.message} — 손상됐거나 구버전 형식일 수 있어요. PDF로 변환해 올려주세요.` }
      }
    }
    if (lower === 'hwp') {
      return { unsupported: true, error: '한글 바이너리(.hwp)는 지원하지 않아요. 한글에서 .hwpx 또는 PDF로 저장해 올려주세요.' }
    }
    if (['doc', 'ppt', 'xls'].includes(lower)) {
      return { unsupported: true, error: '레거시 OLE 형식은 지원하지 않습니다. docx/pptx/xlsx로 변환해주세요.' }
    }
    if (VISION_IMAGE_MIME[lower]) {
      // 이미지는 텍스트 추출 대신 Vision 경로로 — analyzeMaterial이 이 sentinel을 보고 분기
      return { visionImage: true, mediaType: VISION_IMAGE_MIME[lower] }
    }
    return { unsupported: true, error: `지원하지 않는 확장자: ${lower}` }
  } catch (err) {
    return { error: err?.message || '텍스트 추출 중 오류' }
  }
}

/**
 * Claude tool_use 기반 분석. Promise는 타임아웃 안에 resolve되지 않으면 reject.
 *
 * @param {{text?: string, pdfBuffer?: Buffer, imageBuffer?: Buffer, imageMediaType?: string}} source
 *   - text: 추출된 평문 (기본 경로)
 *   - pdfBuffer: 텍스트 추출이 안 되는 PDF 원본 → Vision(document 블록)으로 직접 분석
 *   - imageBuffer + imageMediaType: 이미지 자료 → Vision(image 블록)으로 직접 분석
 * @param {{intent?: string, intentNote?: string|null}} [options]
 */
async function callClaudeAnalysis(source, { intent = DEFAULT_MATERIAL_INTENT, intentNote = null } = {}) {
  const instruction = '위 자료를 분석하여 submit_material_analysis 도구로 결과를 제출해주세요.'
  let content
  let timeoutMs = AI_TIMEOUT_MS

  if (source.pdfBuffer) {
    // 스캔본 등 텍스트 추출 불가 PDF — 원본을 document 블록으로 직접 전달 (베타 헤더 불필요)
    content = [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: source.pdfBuffer.toString('base64') },
      },
      { type: 'text', text: instruction },
    ]
    timeoutMs = AI_TIMEOUT_VISION_MS
  } else if (source.imageBuffer) {
    content = [
      {
        type: 'image',
        source: { type: 'base64', media_type: source.imageMediaType, data: source.imageBuffer.toString('base64') },
      },
      { type: 'text', text: instruction },
    ]
    timeoutMs = AI_TIMEOUT_VISION_MS
  } else {
    content = `<자료본문>\n${source.text}\n</자료본문>\n\n${instruction}`
  }

  const systemText = buildSystemPrompt({ intent, intentNote })

  const aiCall = getClient().messages.create({
    model: ANALYZER_MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    tools: [buildAnalyzeTool(intent)],
    tool_choice: { type: 'tool', name: 'submit_material_analysis' },
    messages: [{ role: 'user', content }],
  })

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs)
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
 * 자료 상태 변경을 프로젝트 room에 실시간 전파 — 폴링(3초 주기) 지연 없이
 * 업로더와 협업자 모두 즉시 상태를 본다. 폴링은 안전망으로 유지된다.
 */
function broadcastMaterialUpdate(projectId, patch) {
  if (!projectId) return
  const io = globalThis.__cwIo
  if (!io) return
  try {
    io.to(projectId).emit('material_updated', { project_id: projectId, ...patch })
  } catch (err) {
    console.warn('[materialAnalyzer] material_updated emit 실패(무시):', err?.message || err)
  }
}

/** 상태 갱신 + 첨부 메시지 전이 + 소켓 전파를 한 번에 (failed/parsing/analyzing 공통) */
async function transitionMaterial(materialId, patch, messageStatus, projectId) {
  await updateMaterialRow(materialId, patch)
  if (messageStatus) await updateSystemAttachmentMessage(materialId, messageStatus)
  broadcastMaterialUpdate(projectId, { id: materialId, ...patch })
}

/**
 * 업로드된 자료 분석 (fire-and-forget 호출 대상)
 *
 * @param {string} materialId - materials.id
 * @param {Buffer} fileBuffer - 파일 원본 버퍼 (호출 직후 해제 권장)
 * @param {string} fileExt   - 확장자 (소문자, 점 없음)
 * @param {{intent?: string, intentNote?: string|null, projectId?: string|null}} [options]
 */
export async function analyzeMaterial(
  materialId,
  fileBuffer,
  fileExt,
  { intent = DEFAULT_MATERIAL_INTENT, intentNote = null, projectId = null } = {}
) {
  const safeIntent = Object.values(MATERIAL_INTENTS).includes(intent)
    ? intent
    : DEFAULT_MATERIAL_INTENT
  const safeNote = safeIntent === MATERIAL_INTENTS.CUSTOM && intentNote
    ? String(intentNote).slice(0, 200)
    : null
  const opts = { intent: safeIntent, intentNote: safeNote, projectId }

  // ── 1. parsing 단계 ──
  // intent/intent_note 컬럼도 함께 동기화 (업로드 시점과 분석 시점 사이 레코드 무결성 유지)
  await transitionMaterial(materialId, {
    processing_status: 'parsing',
    processing_error: null,
    intent: safeIntent,
    intent_note: safeNote,
  }, 'parsing', projectId)

  const { text, numpages, unsupported, error, visionImage, mediaType } = await extractText(fileBuffer, fileExt)

  // 이미지 자료 → Vision 직접 분석
  if (visionImage) {
    if (fileBuffer.length > MAX_VISION_IMAGE_BYTES) {
      await transitionMaterial(materialId, {
        processing_status: 'failed',
        processing_error: `${E.UNSUPPORTED_TYPE}: 이미지가 너무 큽니다 (${Math.round(fileBuffer.length / 1024 / 1024)}MB). 5MB 이하로 줄여 올려주세요.`,
      }, 'failed', projectId)
      return
    }
    await analyzeSource(materialId, { imageBuffer: fileBuffer, imageMediaType: mediaType }, opts)
    return
  }

  if (unsupported) {
    // 파일은 보관하되 분석 불가 — failed로 전이하고 사유 기록
    await transitionMaterial(materialId, {
      processing_status: 'failed',
      processing_error: `${E.UNSUPPORTED_TYPE}: ${error || '지원하지 않는 형식'}`,
    }, 'failed', projectId)
    return
  }
  if (error) {
    await transitionMaterial(materialId, {
      processing_status: 'failed',
      processing_error: `${E.PARSE_FAILED}: ${error}`,
    }, 'failed', projectId)
    return
  }

  // 스캔본 PDF(텍스트가 사실상 없음) → 원본을 Vision으로 직접 분석
  // 과거 실패 4건이 전부 이 케이스("추출된 텍스트가 비어 있습니다")였다.
  if (String(fileExt).toLowerCase() === 'pdf' && (!text || text.trim().length < 50)) {
    if ((numpages || 0) > VISION_PDF_MAX_PAGES) {
      await transitionMaterial(materialId, {
        processing_status: 'failed',
        processing_error: `${E.PARSE_FAILED}: 텍스트를 추출할 수 없고 페이지가 너무 많습니다 (${numpages}p > ${VISION_PDF_MAX_PAGES}p). 필요한 부분만 나눠 올려주세요.`,
      }, 'failed', projectId)
      return
    }
    await analyzeSource(materialId, { pdfBuffer: fileBuffer }, opts)
    return
  }

  await analyzeSource(materialId, { text }, opts)
}

/**
 * 참고사이트 URL 자료 분석 (fire-and-forget 호출 대상).
 * URL을 fetch → 평문 추출 → 파일과 동일한 Claude 분석 파이프라인을 태운다.
 *
 * @param {string} materialId
 * @param {string} url — 분석 대상 URL (materials.storage_path)
 * @param {{intent?: string, intentNote?: string|null}} [options]
 */
export async function analyzeUrlMaterial(
  materialId,
  url,
  { intent = DEFAULT_MATERIAL_INTENT, intentNote = null, projectId = null } = {}
) {
  const safeIntent = Object.values(MATERIAL_INTENTS).includes(intent)
    ? intent
    : DEFAULT_MATERIAL_INTENT
  const safeNote = safeIntent === MATERIAL_INTENTS.CUSTOM && intentNote
    ? String(intentNote).slice(0, 200)
    : null
  const opts = { intent: safeIntent, intentNote: safeNote, projectId }

  // ── 1. parsing 단계 ──
  await transitionMaterial(materialId, {
    processing_status: 'parsing',
    processing_error: null,
    intent: safeIntent,
    intent_note: safeNote,
  }, 'parsing', projectId)

  const { text, unsupported, error } = await fetchUrlContent(url)
  if (unsupported || error) {
    await transitionMaterial(materialId, {
      processing_status: 'failed',
      processing_error: `${E.URL_FETCH_FAILED}: ${error || '페이지 내용을 가져오지 못했습니다.'}`,
    }, 'failed', projectId)
    return
  }

  await analyzeSource(materialId, { text }, opts)
}

/**
 * 소스(평문·PDF 원본·이미지)를 분석하는 공통 단계 (analyzing → AI → 필터 → completed/failed).
 * analyzeMaterial(파일)·analyzeUrlMaterial(URL)이 공유한다.
 * 호출 전에 parsing 단계가 이미 설정되어 있다고 가정한다.
 *
 * @param {string} materialId
 * @param {{text?: string, pdfBuffer?: Buffer, imageBuffer?: Buffer, imageMediaType?: string}} source
 * @param {{intent: string, intentNote: string|null, projectId?: string|null}} param2
 */
async function analyzeSource(materialId, source, { intent, intentNote, projectId = null }) {
  const isVision = !!(source.pdfBuffer || source.imageBuffer)
  const analysisMode = source.pdfBuffer ? 'vision_pdf' : source.imageBuffer ? 'vision_image' : 'text'
  try {
    const truncated = (source.text || '').slice(0, TEXT_TRUNCATE)
    if (!isVision && truncated.trim().length === 0) {
      await transitionMaterial(materialId, {
        processing_status: 'failed',
        processing_error: `${E.PARSE_FAILED}: 추출된 텍스트가 비어 있습니다. 스캔·이미지 기반 문서라면 PDF 또는 이미지 파일로 올려주세요.`,
        extracted_text: '',
      }, 'failed', projectId)
      return
    }

    // ── 2. analyzing 단계 ──
    await transitionMaterial(materialId, {
      processing_status: 'analyzing',
      extracted_text: isVision ? '' : truncated,
    // messages.processing_status CHECK 제약상 analyzing은 없으므로 parsing로 유지
    }, 'analyzing', projectId)

    const aiRaw = await callClaudeAnalysis(
      isVision ? source : { text: truncated },
      { intent, intentNote }
    )

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
        analysis_mode: analysisMode,
        rejected_ratio: rejected.length
          ? rejected.length / ((rejected.length + validated.length) || 1)
          : 0,
        intent,
        intent_note: intentNote,
        prompt_version: '2026-07-a',
      },
    }

    // ── 4. completed 상태로 마감 ──
    await transitionMaterial(materialId, {
      processing_status: 'completed',
      processing_error: null,
      ai_summary: analysis.summary,
      ai_analysis: analysis,
      analyzed_at: new Date().toISOString(),
    }, 'completed', projectId)
  } catch (err) {
    // 구조화된 에러 코드 매핑 — processing_error 포맷: "CODE: message"
    // (materials.js GET /:id/analysis 핸들러가 접두 코드를 파싱해 error_code로 내려줌)
    const msg = err?.message || '알 수 없는 오류'
    let structured
    if (msg === 'AI_TIMEOUT') {
      const limit = isVision ? AI_TIMEOUT_VISION_MS : AI_TIMEOUT_MS
      structured = `${E.AI_TIMEOUT}: AI 분석 타임아웃 (${Math.round(limit / 1000)}s) — 재분석을 시도해주세요.`
    } else if (msg === 'AI_SCHEMA_INVALID') {
      structured = `${E.AI_SCHEMA_INVALID}: AI 응답 스키마가 올바르지 않습니다. 재분석을 시도해주세요.`
    } else if (/timeout/i.test(msg)) {
      structured = `${E.AI_TIMEOUT}: ${msg}`
    } else {
      structured = `${E.INTERNAL}: ${msg}`
    }
    console.error('[materialAnalyzer] 실패:', msg)
    await transitionMaterial(materialId, {
      processing_status: 'failed',
      processing_error: structured,
    }, 'failed', projectId)
  }
}

// 내부 테스트용 export
export const _internal = {
  filterHallucinations,
  extractText,
  buildSystemPrompt,
  buildAnalyzeTool,
  INTENT_PROMPT_FRAGMENTS,
  assertPublicUrl,
  htmlToText,
  fetchUrlContent,
}
