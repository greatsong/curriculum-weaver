/**
 * 미래 보기 생성기 — 교사가 고른 성취기준 2~6개로
 *   ① 연결 찾기: 성취기준마다 원문 키워드를 고르고, 서로 다른 두 성취기준의 키워드를 잇는다(조합당 1회).
 *   ② 수업 아이디어: 관점 8가지(index % 8) 가운데 하나로 짧은 카드 1장을 만든다(번호마다 1장).
 *
 * 명세: docs/미래보기-명세서.md
 *   - 맨 앞 "최신 사용자 결정" 3번(연결 강도 strength 1~3, 프롬프트 15번, 검증 V11-1)이 본문보다 우선한다.
 *   - 1부 §2(키워드 K1~K6·연결 L1~L9·서버 검증 V1~V16), §3(관점 8개), §4(카드 규칙·C1~C7),
 *     §5(프롬프트 원문), §6-7(서버 오류 문구), 3부 T2~T4(API·모델·캐시·부하 보호).
 *
 * 캐시: Supabase scenario_cache(키 접두 'bridge:v3:' / 'future:v6:') + 서버 메모리 600개.
 *   기존 시나리오 캐시 키는 '['로 시작하는 코드라 겹치지 않는다. 캐시 장애는 생성을 막지 않는다.
 * 부하 보호: 같은 키의 동시 요청은 첫 생성을 공유하고(in-flight), 서버 전체 동시 생성 수는 futuresQueue(80)로 묶는다.
 *   채팅과 같은 API 키를 쓰므로 미래 보기가 몰려도 분당 출력 토큰 한도를 다 쓰지 못하게 한다(채팅 큐와 분리).
 */
import PQueue from 'p-queue'
import { getAnthropic } from '../lib/anthropicClient.js'
import { Standards, StandardLinks } from '../lib/store.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

export const FUTURE_MIN_STANDARDS = 2
export const FUTURE_MAX_STANDARDS = 6
export const FUTURE_MAX_INDEX = 29 // 0~7 = 관점 8개, 8~29 = 같은 관점의 다음 회차(§3-2)

// 서버 전체 동시 생성 상한(기본 80 = 연수 최대 10명 × 카드 8장). 상한이 꽉 차도 분당 출력 토큰은 키 한도(200만)의
// 약 4분의 1 이하라 채팅이 같은 키의 한도에 막히지 않는다(3부 T4).
export const futuresQueue = new PQueue({ concurrency: Number(process.env.FUTURES_QUEUE_CONCURRENCY) || 80 })

// 카드 생성 모델(1부 §4-8, 3부 T3)
export const FUTURE_MODELS = {
  fast: { id: 'claude-sonnet-5-5', maxTokens: 2000, effort: 'medium' },
  precise: { id: 'claude-opus-5-5', maxTokens: 6000, effort: 'medium' },
}
// 연결 찾기 모델(1부 §2-6) — 모델 선택과 무관하게 조합당 한 번
export const BRIDGE_MODEL = { id: 'claude-sonnet-5-5', maxTokens: 3000, effort: 'low' }
export const FUTURE_TIMEOUT_MS = 150_000
export const BRIDGE_TIMEOUT_MS = 90_000

// 서버 → 화면 문구(1부 §6-7 정본 그대로)
export const FUTURE_MESSAGES = {
  badFormat: '성취기준 형식이 올바르지 않습니다.',
  notFound: (code) => `찾을 수 없는 성취기준입니다: ${code}`,
  count: '성취기준을 2~6개 골라 주세요.',
  index: '아이디어 번호는 0~29 사이여야 합니다.',
  cardRefused: 'AI가 이 조합으로는 수업 아이디어를 만들지 않았습니다. 다른 성취기준으로 시도해 주세요.',
  cardFailed: '수업 아이디어를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
  bridgeRefused: 'AI가 이 조합의 키워드 연결을 만들지 않았습니다.',
  bridgeFailed: '키워드 연결을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.',
}

// 관점 8개(1부 §3-1). 순서 = 3×3 배치 순서(위 줄 장소: 학교 → 지역 → 세계, 가운데 줄 만들기·역할, 아래 줄 탐구 방법)
export const FUTURE_LENSES = [
  { label: '학교 생활', scene: '학생이 학교 안의 공간·규칙·일과를 관찰하고 개선안을 학교 안에서 시범 운영하는 수업', output: '시범 운영 결과 기록, 학교 안내물, 학생회 건의문 가운데 하나' },
  { label: '지역 문제', scene: '학생이 학교 밖 지역 현장(동네·지역 기관·시설)에 나가 조사하고 그 결과를 지역에 전달하는 수업', output: '현장 조사 지도, 지역 기관에 보내는 제안서, 주민 안내 자료 가운데 하나' },
  { label: '지구적 문제', scene: '여러 나라의 자료와 국제 사례를 비교해 지구적 문제를 이해하고 세계 시민의 관점에서 판단하는 수업', output: '국가 간 비교 자료, 세계 시민 관점의 해설문이나 발표 가운데 하나' },
  { label: '창작 프로젝트', scene: '배운 내용을 작품으로 만들어 표현하는 수업', output: '영상·음악·전시·이야기·디자인·게임 가운데 하나' },
  { label: '진로·직업', scene: '학생이 실제로 있는 직업의 역할을 맡아 그 직업의 업무 과정을 수행하는 수업', output: '그 직업이 실제로 만드는 산출물(기획안·진단서·설계도·보도자료 등)' },
  { label: '데이터 탐구', scene: '학생이 직접 수집하거나 공개된 자료를 정리하고 분석해 패턴을 찾는 수업', output: '그래프와 해석을 담은 분석 보고서나 대시보드' },
  { label: '과학 탐구', scene: '가설을 세우고 실험·관찰·조사로 확인하는 수업(과학 교과가 없는 조합이면 가설과 검증의 순서만 빌린다)', output: '탐구 설계와 결과를 담은 탐구 보고서' },
  { label: '역사적 관점', scene: '과거의 자료(기록·신문·작품·통계)를 오늘과 비교해 변화를 살피는 수업', output: '연표나 과거와 현재의 변화 비교 해설' },
]
export const lensOf = (index) => FUTURE_LENSES[index % FUTURE_LENSES.length]
export const roundOf = (index) => Math.floor(index / FUTURE_LENSES.length) + 1

// 캐시 키 — 조합은 정렬한 key 목록(고른 순서와 무관하게 같은 캐시)
export const bridgeCacheKey = (keys) => `bridge:v3:${[...keys].sort().join('|')}`
export const futureCacheKey = (modelKey, keys, index) => `future:v6:${modelKey}:${[...keys].sort().join('|')}#${index}`

export class FutureError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

// ─────────────────────────────────────────────────────────────
// 요청 검증
// ─────────────────────────────────────────────────────────────

/** 성취기준 목록 검증 — key(충돌 코드는 'code|과목')로 받고, 코드만 와도 찾는다. 중복은 하나로 합친다. */
export function resolveStandards(body = {}) {
  const raw = body?.codes
  if (!Array.isArray(raw)) return { error: FUTURE_MESSAGES.badFormat }
  if (raw.length > 30) return { error: FUTURE_MESSAGES.count }
  const standards = []
  for (const value of raw) {
    if (typeof value !== 'string' || !value.trim()) return { error: FUTURE_MESSAGES.badFormat }
    const v = value.trim()
    const std = Standards.getByKey(v) || Standards.getByCode(v)
    if (!std) return { error: FUTURE_MESSAGES.notFound(v.slice(0, 40)) }
    if (!standards.some((s) => s.key === std.key)) standards.push(std)
  }
  if (standards.length < FUTURE_MIN_STANDARDS || standards.length > FUTURE_MAX_STANDARDS) {
    return { error: FUTURE_MESSAGES.count }
  }
  return { standards }
}

/** 카드 요청 검증 — 성취기준 2~6개, 모델(모르는 값은 빠른 모드), 번호 0~29. */
export function resolveFutureRequest(body = {}) {
  const resolved = resolveStandards(body)
  if (resolved.error) return resolved
  const modelKey = body?.model === 'precise' ? 'precise' : 'fast'
  const rawIndex = body?.index
  const index = typeof rawIndex === 'number' ? rawIndex
    : (typeof rawIndex === 'string' && /^\d+$/.test(rawIndex.trim()) ? Number(rawIndex.trim()) : NaN)
  if (!Number.isInteger(index) || index < 0 || index > FUTURE_MAX_INDEX) return { error: FUTURE_MESSAGES.index }
  return { standards: resolved.standards, modelKey, index }
}

// ─────────────────────────────────────────────────────────────
// 공통 도구
// ─────────────────────────────────────────────────────────────

// 생성은 정렬한 순서로 한다 — 같은 조합이면 같은 프롬프트(S 번호)·같은 결과(그래프 G11)
const canonical = (standards) => [...standards].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

// 가능한 성취기준 쌍 전체: S1-S2, S1-S3, …(2개면 1쌍, 6개면 15쌍)
export function allPairIds(n) {
  const pairs = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push(`S${i + 1}-S${j + 1}`)
  return pairs
}

const oneLine = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** 본문에 남은 S1·S2 같은 내부 번호를 '{과목} {코드}'로 바꾼다(V13·C2 — 교사는 번호를 모른다). */
export function replaceInternalIds(value, standards) {
  if (typeof value !== 'string') return ''
  return value.replace(/\bS([1-9])\b/g, (whole, n) => {
    const std = standards[Number(n) - 1]
    return std ? `${std.subject} ${std.code}` : whole
  })
}

// 문장 끝: 마침표·물음표·느낌표 뒤가 공백이거나 글 끝인 곳
const isSentenceEnd = (text, i) => '.!?'.includes(text[i]) && (i + 1 === text.length || /\s/.test(text[i + 1]))

/** V13 — 근거가 60자를 넘으면 문장 경계에서, 없으면 공백에서 자른다(공백에서 자를 때만 '…'). */
export function clampWhy(text, max = 60) {
  if (text.length <= max) return text
  let end = -1
  for (let i = 0; i < max; i++) if (isSentenceEnd(text, i)) end = i
  if (end > 0) return text.slice(0, end + 1)
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** C7 — 설명이 200자를 넘는 비정상 응답만 마지막으로 끝난 문장까지 남긴다. 끝난 문장이 없으면 자르지 않는다. */
export function clampLongPitch(text, max = 200) {
  if (text.length <= max) return text
  let end = -1
  for (let i = 0; i < max; i++) if (isSentenceEnd(text, i)) end = i
  return end > 0 ? text.slice(0, end + 1) : text
}

/** 응답에서 가장 바깥 {…}를 파싱(V1·C1). 실패하면 null. */
function extractJson(text) {
  const match = typeof text === 'string' ? text.match(/\{[\s\S]*\}/) : null
  if (!match) return null
  try {
    const data = JSON.parse(match[0])
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null
  } catch { return null }
}

const textOf = (response) => (response?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')

function callModel(model, prompt, timeout) {
  return futuresQueue.add(() => getAnthropic().messages.create({
    model: model.id,
    max_tokens: model.maxTokens,
    output_config: { effort: model.effort },
    messages: [{ role: 'user', content: prompt }],
  }, { timeout, maxRetries: 1 }))
}

const publishedLinksAmong = (keys) => StandardLinks.getLinksAmongCodes(keys, { status: 'published', minQuality: 0, limit: 15 })

/** 검증된 교과 연결(게시 상태) → 프롬프트 줄 '- S1-S2 / 주제: … / 근거: …[ / 수업 예시: …]'과 연결이 있는 쌍 */
function publishedLinkLines(standards, links, { withHook }) {
  const pos = new Map(standards.map((s, i) => [s.key, i + 1]))
  const linkedPairs = new Set()
  const lines = []
  for (const l of links || []) {
    const a = pos.get(l.source_code)
    const b = pos.get(l.target_code)
    if (!a || !b || a === b) continue
    const pair = `S${Math.min(a, b)}-S${Math.max(a, b)}`
    linkedPairs.add(pair)
    const parts = [pair]
    if (l.integration_theme) parts.push(`주제: ${oneLine(l.integration_theme)}`)
    if (l.rationale) parts.push(`근거: ${oneLine(l.rationale)}`)
    if (withHook && l.lesson_hook) parts.push(`수업 예시: ${oneLine(l.lesson_hook)}`)
    lines.push(`- ${parts.join(' / ')}`)
  }
  return { lines, linkedPairs }
}

// ─────────────────────────────────────────────────────────────
// ① 연결 찾기
// ─────────────────────────────────────────────────────────────

/** 1부 §5-1 연결 찾기 프롬프트(+ 최신 사용자 결정 3번: 연결 원칙 15번, 응답 형식 strength). */
export function buildBridgePrompt(standards, links = []) {
  const n = standards.length
  const { lines: linkLines } = publishedLinkLines(standards, links, { withHook: false })
  return [
    `교사가 고른 성취기준 ${n}개를 하나의 수업으로 엮으려고 합니다. 먼저 성취기준마다 키워드를 고르고, 서로 다른 두 성취기준의 키워드 가운데 한 수업에서 실제로 함께 다룰 수 있는 것만 연결해 주세요.`,
    '',
    '## 고른 성취기준',
    ...standards.map((s, i) => `S${i + 1}. ${s.code} [${s.subject}] ${s.content}`),
    '',
    '## 검증된 교과 연결',
    ...(linkLines.length ? linkLines : ['- 없음']),
    '',
    '## 검토할 성취기준 쌍',
    allPairIds(n).join(', '),
    '',
    '## 키워드 원칙',
    '1. 성취기준마다 키워드를 3~4개 고르세요. 그 성취기준이 다루는 대상·개념 2~3개와, 학생 활동을 나타내는 명사 0~1개(예: 토의, 발표, 논증하는 글, 조사)로 구성합니다.',
    "2. 키워드는 성취기준 원문에 있는 말을 그대로 옮기세요(2~12자). 고치거나 바꿔 말하지 마세요. 원문에서 뜻이 서는 가장 짧은 구절을 고르세요(예: '신체적, 정신적 질환 예방'보다 '질환 예방').",
    "3. 가운뎃점(·)이나 쉼표로 묶인 말에서 꾸미는 말만 떼어 내지 마세요. '준언어적'이 아니라 '준언어적·비언어적 표현'처럼 꾸밈을 받는 말까지 옮기세요.",
    '4. 다음은 키워드가 아닙니다.',
    '   - 행동만 나타내는 말: 설명할 수 있다, 탐구한다, 이해하고, 파악한다',
    '   - 어느 성취기준에나 있는 말: 자료, 사례, 방법, 내용, 과정, 문제, 탐구',
    '   - 조건이나 꾸밈만 담은 말: 자신의 수준, 활용한 사례',
    "5. 한 성취기준 안에서 뜻이 겹치는 키워드는 하나만 고르세요(예: '식생활문화'와 '건강한 식생활 문화' 가운데 하나).",
    '',
    '## 연결 원칙',
    '6. 연결 하나는 서로 다른 두 성취기준의 키워드를 하나씩, 모두 2개 잇습니다. 세 성취기준이 함께 이어지면 연결 2개로 나눠 적으세요. 같은 키워드를 여러 연결에 다시 사용해도 됩니다.',
    '7. 연결은 두 종류만 만드세요.',
    '   - same: 두 키워드가 같은 현상이나 대상을 다룹니다. 예: 집중호우 × 도시화 → 도시 침수 위험',
    '   - method: 한 성취기준의 활동으로 다른 성취기준의 내용을 다룹니다. 예: 발표 × 대처 방안 → 재해 대응 발표',
    "8. 연결 이름은 학생이 실제로 다룰 대상이 드러나는 2~10자 명사구로 쓰세요. 두 키워드 가운데 하나를 그대로 이름으로 삼지 마세요. '융합', '탐구', '소통', '문제 해결', '연계'처럼 어디에나 붙는 말은 사용하지 마세요.",
    "9. why는 40자 이내 한 문장으로, 두 키워드를 한 활동에서 어떻게 함께 다루는지 쓰세요. '둘 다 ~와 관련된다'는 이유가 되지 않습니다. 번호 대신 교과명을 쓰세요.",
    "10. 낱말이 같아도 교과마다 뜻이 다르면 잇지 마세요(예: 물리의 '일'과 일상어 '일').",
    '11. 같은 두 성취기준 사이의 연결은 1개, 꼭 필요할 때만 2개까지 만드세요. 전체 연결은 0~6개입니다.',
    '12. 모든 키워드를 엮을 필요는 없습니다. 억지스러운 연결은 만들지 마세요. 이어지지 않는 성취기준은 그대로 둡니다. 다만 발표·토의·글쓰기처럼 활동을 다루는 성취기준은 method 연결이 가능한지 먼저 살펴보세요.',
    "13. '검토할 성취기준 쌍'을 하나씩 모두 살펴 성립하는 연결이 있는지 따지세요. 연결이 한 성취기준에 몰리지 않게, 그 성취기준이 들어가지 않은 쌍을 먼저 검토한 뒤에 그 성취기준의 연결을 더하세요.",
    '14. 12번이 13번보다 우선합니다. 다른 쌍에서 실제로 성립하는 연결이 없으면 한 성취기준에 연결이 몰려도 그대로 두세요. 고르게 만들려고 근거가 약한 연결을 만들지 마세요.',
    '15. 연결마다 strength를 1~3 정수로 적으세요. 3은 두 키워드가 같은 대상·개념을 직접 다루어 한 활동에서 두 성취기준의 핵심 내용이 함께 다뤄질 때, 2는 한 활동에서 함께 다룰 수 있지만 한쪽이 보조 역할일 때, 1은 연결은 성립하지만 활동을 따로 설계해야 이어질 때입니다. 약한 연결을 강하게 적지 마세요.',
    '',
    '## 응답 형식 (아래 JSON만 출력, 코드펜스·다른 텍스트 금지)',
    '{"keywords": [{"id": "S1", "words": ["원문 키워드", "원문 키워드", "원문 키워드"]}],',
    ' "links": [{"label": "연결 이름", "kind": "same", "strength": 2, "ends": [{"id": "S1", "word": "S1의 키워드"}, {"id": "S2", "word": "S2의 키워드"}], "why": "두 키워드를 한 활동에서 함께 다루는 방법 한 문장"}]}',
  ].join('\n')
}

// V2 원문 대조용 정규화: 공백·문장부호·가운뎃점·괄호·따옴표를 지운다
const SQUASH_CHARS = "\\s.,;:!?~·⋅ㆍ‧・∙\\-–—/()（）\\[\\]{}<>「」『』《》〈〉'\"“”‘’`"
const SQUASH_RE = new RegExp(`[${SQUASH_CHARS}]`, 'g')
const SQUASH_ONE = new RegExp(`^[${SQUASH_CHARS}]$`)
export const squashText = (v) => String(v ?? '').replace(SQUASH_RE, '')

// 지운 문자열의 각 글자가 원문 몇 번째 글자인지(V6에서 원문의 '바로 뒤 글자'를 찾는 데 사용)
function squashWithMap(raw) {
  let out = ''
  const map = []
  for (let i = 0; i < raw.length; i++) {
    if (SQUASH_ONE.test(raw[i])) continue
    out += raw[i]
    map.push(i)
  }
  return { out, map }
}

export const BRIDGE_MAX_KEYWORDS = 4 // V8
export const BRIDGE_MAX_CONCEPTS = 6 // V12 전체
export const BRIDGE_MAX_PER_PAIR = 2 // V12 같은 두 성취기준 사이
const KEYWORD_DISPLAY_MAX = 16 // V3 표시용
const LABEL_DISPLAY_MAX = 20 // V10 표시용
const GENERIC_WORDS = new Set(['자료', '사례', '방법', '내용', '과정', '문제', '탐구', '이해', '설명', '활동']) // V4
const PARTICLE_TAILS = ['의', '을', '를', '에서', '으로', '에게'] // V5
// V5 예외: 조사가 아니라 낱말 자체가 그 글자로 끝나는 명사. 명세 K2·프롬프트 1번이 활동 키워드 예로 든 '토의'가
// 글자 그대로의 V5('의'로 끝나면 버림)에 걸려 사라지는 충돌을 막는다. 키워드 전체이거나 띄어 쓴 마지막 낱말일 때만
// 예외로 본다('집단 토의'는 남기고, '운동의'는 '동의'로 끝나도 조사 꼬리로 버린다). '~주의'(민주주의 등)만 붙여 쓴 꼴도 예외.
const PARTICLE_TAIL_NOUNS = ['토의', '회의', '논의', '협의', '합의', '정의', '강의', '질의', '의의', '동의', '창의', '예의', '편의', '모의', '건의', '결의', '마을', '가을']
function hasParticleTail(q, original) {
  if (!PARTICLE_TAILS.some((t) => q.endsWith(t))) return false
  const lastWord = original.split(' ').pop()
  if (PARTICLE_TAIL_NOUNS.includes(lastWord)) return false
  if (lastWord.endsWith('주의')) return false
  return true
}
const MODIFIER_SEPARATORS = new Set(['·', '⋅', 'ㆍ', ',']) // V6

/**
 * 한 성취기준의 키워드 후보를 V2~V8 순서로 거른다.
 * @returns {{display: string, q: string}[]} display = 화면에 보일 원문 키워드, q = 대조용 정규화 값
 */
export function filterKeywords(words, content) {
  const raw = String(content ?? '')
  const { out: squashed, map } = squashWithMap(raw)
  const kept = []
  for (const w of Array.isArray(words) ? words : []) {
    if (kept.length >= BRIDGE_MAX_KEYWORDS) break // V8 앞에서부터 최대 4개
    const word = oneLine(w)
    const q = squashText(word)
    if (!q || !squashed.includes(q)) continue // V2 원문 대조
    // 원문에서 그대로 떼어 낸 구절(가운뎃점 글자·띄어쓰기도 원문 그대로) — 표시용과 V5 판단에 사용
    const at = squashed.indexOf(q)
    const original = raw.slice(map[at], map[at + q.length - 1] + 1).replace(/\s+/g, ' ').trim()
    if (q.length < 2) continue // V3 길이
    if (GENERIC_WORDS.has(q)) continue // V4 일반어
    if (hasParticleTail(q, original)) continue // V5 조사 꼬리
    if (q.endsWith('적')) { // V6 꾸밈 조각: 원문에서 바로 뒤 글자가 가운뎃점·쉼표
      let fragment = false
      for (let i = squashed.indexOf(q); i >= 0; i = squashed.indexOf(q, i + 1)) {
        if (MODIFIER_SEPARATORS.has(raw[map[i + q.length - 1] + 1])) { fragment = true; break }
      }
      if (fragment) continue
    }
    if (kept.some((k) => k.q === q || k.q.includes(q) || q.includes(k.q))) continue // V7 같은 성취기준 안 중복
    kept.push({ display: original.slice(0, KEYWORD_DISPLAY_MAX).trim(), q }) // V3 표시용은 16자에서 자른다
  }
  return kept
}

const normId = (v) => String(v ?? '').trim().toUpperCase()

/** V11-1 — strength가 1·2·3이 아니면 2(정수 문자열 '3'은 3으로 읽는다) */
export function normalizeStrength(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*[123]\s*$/.test(v) ? Number(v) : NaN)
  return n === 1 || n === 2 || n === 3 ? n : 2
}

/** V16 — 같은 성취기준이 연달아 나오지 않게 가능한 범위에서 섞고, 그 밖에는 응답 순서를 따른다. */
export function orderConcepts(concepts) {
  const rest = [...concepts]
  const out = []
  while (rest.length) {
    const prev = out[out.length - 1]
    let i = prev ? rest.findIndex((c) => !c.ends.some((e) => prev.ends.some((p) => p.key === e.key))) : 0
    if (i < 0) i = 0
    out.push(rest.splice(i, 1)[0])
  }
  return out
}

/** V15 — 쏠림 기록용 값: 가장 많은 연결의 끝이 된 성취기준의 비율, 서로 다른 성취기준 쌍의 수 */
export function conceptSpread(concepts) {
  const counts = new Map()
  const pairs = new Set()
  for (const c of concepts) {
    for (const e of c.ends) counts.set(e.key, (counts.get(e.key) || 0) + 1)
    pairs.add(c.ends.map((e) => e.key).sort().join('\t'))
  }
  let topKey = null
  let top = 0
  for (const [k, v] of counts) if (v > top) { top = v; topKey = k }
  return { maxEndShare: concepts.length ? top / concepts.length : 0, topKey, distinctPairs: pairs.size }
}

/**
 * 연결 찾기 응답 → 화면 데이터 { keywords: {key: string[]}, concepts: [{label, kind, strength, ends, why}], isolated: key[] }.
 * 1부 §2-5 V1~V16(+ V11-1)을 순서대로 적용한다. 키워드를 하나도 못 건지면 null(다시 생성 대상).
 * 연결은 0개여도 결과다(억지로 잇지 않음). isolated는 모델 답을 믿지 않고 서버가 계산한다(V14).
 */
export function parseBridges(text, standards) {
  const data = extractJson(text) // V1
  if (!data) return null
  const byId = new Map(standards.map((s, i) => [`S${i + 1}`, s]))

  // V2~V8 키워드
  const entries = Array.isArray(data.keywords) ? data.keywords
    : (data.keywords && typeof data.keywords === 'object' ? Object.entries(data.keywords).map(([id, words]) => ({ id, words })) : [])
  const wordsById = new Map()
  for (const k of entries) {
    const id = normId(k?.id)
    if (!byId.has(id) || !Array.isArray(k?.words)) continue
    wordsById.set(id, [...(wordsById.get(id) || []), ...k.words])
  }
  const kept = new Map() // key → [{display, q}]
  for (const [id, std] of byId) kept.set(std.key, filterKeywords(wordsById.get(id) || [], std.content))
  if (![...kept.values()].some((list) => list.length)) return null // V8 하나도 못 건지면 결과 없음
  const keywords = {}
  for (const s of standards) keywords[s.key] = kept.get(s.key).map((k) => k.display)

  // 연결 끝의 낱말 → 그 성취기준의 검증된 키워드(화면 문자열 그대로)
  const findKeyword = (key, word) => {
    const q = squashText(oneLine(word))
    if (!q) return null
    const hit = kept.get(key).find((k) => k.q === q || squashText(k.display) === q)
    return hit ? hit.display : null
  }

  const concepts = []
  const seenLabels = new Set()
  const perPair = new Map()
  for (const l of Array.isArray(data.links) ? data.links : []) {
    if (concepts.length >= BRIDGE_MAX_CONCEPTS) break // V12 전체 최대 6개(먼저 온 것 우선)
    // V9 연결 끝: 정확히 2개, 서로 다른 두 성취기준, 각 낱말은 그 성취기준의 검증된 키워드
    const rawEnds = Array.isArray(l?.ends) ? l.ends : []
    if (rawEnds.length !== 2) continue
    const ends = rawEnds.map((e) => {
      const std = byId.get(normId(e?.id))
      const word = std ? findKeyword(std.key, e?.word) : null
      return word ? { key: std.key, word } : null
    })
    if (!ends[0] || !ends[1] || ends[0].key === ends[1].key) continue
    // V10 연결 이름: 빈 이름·이미 나온 이름은 버린다(표시 20자)
    const label = oneLine(l?.label).slice(0, LABEL_DISPLAY_MAX).trim()
    if (!label || seenLabels.has(label)) continue
    // V12 같은 두 성취기준 사이 최대 2개
    const pair = [ends[0].key, ends[1].key].sort().join('\t')
    if ((perPair.get(pair) || 0) >= BRIDGE_MAX_PER_PAIR) continue
    perPair.set(pair, (perPair.get(pair) || 0) + 1)
    seenLabels.add(label)
    concepts.push({
      label,
      kind: l.kind === 'method' ? 'method' : 'same', // V11
      strength: normalizeStrength(l.strength), // V11-1
      ends,
      why: clampWhy(replaceInternalIds(oneLine(l.why), standards)), // V13
    })
  }

  const covered = new Set(concepts.flatMap((c) => c.ends.map((e) => e.key)))
  return {
    keywords,
    concepts: orderConcepts(concepts), // V16
    isolated: standards.map((s) => s.key).filter((k) => !covered.has(k)), // V14
  }
}

// ─────────────────────────────────────────────────────────────
// 캐시(메모리 + Supabase scenario_cache)와 동시 요청 공유
// ─────────────────────────────────────────────────────────────

// 메모리 캐시 — DB가 없거나 잠시 장애여도 같은 조합을 다시 생성하지 않는다(같은 연결 위에서 8장이 만들어지도록)
const MEM_CACHE_MAX = 600
const memCache = new Map()
export function _clearFuturesMemCache() { memCache.clear() } // 테스트 전용
function memGet(key) { return memCache.get(key) || null }
function memSet(key, value) {
  memCache.delete(key)
  memCache.set(key, value)
  if (memCache.size > MEM_CACHE_MAX) memCache.delete(memCache.keys().next().value)
}

async function readDbCache(key) {
  try {
    const { data } = await supabaseAdmin.from('scenario_cache').select('scenario').eq('key', key).maybeSingle()
    if (data?.scenario) memSet(key, data.scenario)
    return data?.scenario || null
  } catch { return null } // DB 미설정·장애 — 캐시 없이 생성
}

async function writeCache(key, keys, value, modelId) {
  memSet(key, value)
  try {
    await supabaseAdmin.from('scenario_cache').upsert({ key, codes: keys, scenario: value, model: modelId }, { onConflict: 'key', ignoreDuplicates: true })
  } catch (err) {
    console.warn('[futures] 캐시 저장 실패(무시):', err?.message || err)
  }
}

const bridgeInflight = new Map()
const futureInflight = new Map()

/** 같은 키의 동시 요청은 첫 생성(프로미스)을 공유한다. DB 캐시 읽기도 그 안에서 한 번만 한다. */
function shareInflight(map, key, task) {
  if (!map.has(key)) {
    const run = task()
    map.set(key, run)
    run.then(() => map.delete(key), () => map.delete(key))
  }
  return map.get(key)
}

/**
 * 연결 찾기(캐시 우선). 조합(정렬한 key)마다 한 번 생성하고 모델 선택과 무관하게 공유한다.
 * @returns {Promise<{bridges: object, cached: boolean}>}
 */
export async function generateBridges({ standards }) {
  const sorted = canonical(standards)
  const keys = sorted.map((s) => s.key)
  const key = bridgeCacheKey(keys)
  const mem = memGet(key)
  if (mem) return { bridges: mem, cached: true }

  const { value, cached } = await shareInflight(bridgeInflight, key, async () => {
    const hit = await readDbCache(key)
    if (hit) return { value: hit, cached: true }
    const prompt = buildBridgePrompt(sorted, publishedLinksAmong(keys))
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await callModel(BRIDGE_MODEL, prompt, BRIDGE_TIMEOUT_MS)
      if (response?.stop_reason === 'refusal') throw new FutureError(422, FUTURE_MESSAGES.bridgeRefused)
      const text = textOf(response)
      const bridges = parseBridges(text, sorted)
      if (bridges) {
        if (bridges.concepts.length >= 2) { // V15 쏠림 기록(거르지 않는다 — L9)
          const { maxEndShare, topKey, distinctPairs } = conceptSpread(bridges.concepts)
          console.info(`[futures] 연결 쏠림 기록: 연결 ${bridges.concepts.length}개 · 최다 끝 비율 ${maxEndShare.toFixed(2)}(${topKey}) · 서로 다른 쌍 ${distinctPairs}개 · 조합 ${keys.join(',')}`)
        }
        await writeCache(key, keys, bridges, BRIDGE_MODEL.id)
        return { value: bridges, cached: false }
      }
      console.error(`[futures] 연결 찾기 JSON·키워드 검증 실패 (시도 ${attempt + 1}, stop=${response?.stop_reason}): ${text.slice(0, 160)}`)
    }
    throw new FutureError(502, FUTURE_MESSAGES.bridgeFailed)
  })
  return { bridges: value, cached }
}

/** 카드 생성용 — 같은 조합의 연결 찾기를 기다려 함께 사용하고, 실패해도 카드는 연결 없이 만든다(1부 §2-6). */
async function bridgesForFuture(standards) {
  try {
    return { bridges: (await generateBridges({ standards })).bridges, ok: true }
  } catch (err) {
    console.warn('[futures] 연결 없이 카드 생성:', err?.message || err)
    return { bridges: null, ok: false }
  }
}

// ─────────────────────────────────────────────────────────────
// ② 수업 아이디어(카드)
// ─────────────────────────────────────────────────────────────

/** 1부 §4-4 — 카드마다 먼저 검토할 연결을 돌려 가며 정한다: concepts[index % concepts.length].label */
export function preferredAxisOf(concepts, index) {
  return concepts?.length ? concepts[index % concepts.length].label : null
}

/** 1부 §5-2 수업 아이디어 프롬프트. 연결이 0개이거나 연결 찾기가 실패하면 연결 지도 없이 만든다. */
export function buildFuturePrompt(standards, index, links = [], bridges = null) {
  const n = standards.length
  const lens = lensOf(index)
  const round = roundOf(index)
  const ids = new Map(standards.map((s, i) => [s.key, `S${i + 1}`]))
  const { lines: linkLines, linkedPairs } = publishedLinkLines(standards, links, { withHook: true })
  const unlinked = allPairIds(n).filter((p) => !linkedPairs.has(p))
  const concepts = (bridges?.concepts || []).filter((c) => c.ends?.length === 2 && c.ends.every((e) => ids.has(e.key)))
  const hasMap = concepts.length > 0
  // 연결 0개면 '연결되지 않은 성취기준'도 말하지 않는다 — 카드는 성취기준 원문만으로 만든다(1부 §2-4)
  const isolatedIds = hasMap ? (bridges?.isolated || []).map((k) => ids.get(k)).filter(Boolean) : []
  const preferred = preferredAxisOf(concepts, index)

  const lines = [
    `당신은 융합 수업 설계 전문가입니다. 교사가 고른 성취기준 ${n}개로 만들 수 있는 수업 아이디어 하나를 짧은 카드로 써 주세요.`,
    '',
    '## 고른 성취기준',
    ...standards.map((s, i) => `S${i + 1}. ${s.code} [${s.subject}${s.grade_group ? ` · ${s.grade_group}` : ''}] ${s.content}`),
    '',
    '## 검증된 교과 연결',
    ...(linkLines.length ? linkLines : ['- 없음']),
  ]
  if (unlinked.length) lines.push(`- 검증된 연결이 없는 쌍: ${unlinked.join(', ')}`)
  if (hasMap) {
    lines.push('', '## 연결 지도 (성취기준의 키워드끼리 이어진 연결)')
    for (const c of concepts) {
      const [a, b] = c.ends
      lines.push(`- ${c.label} (${c.kind}): ${ids.get(a.key)}「${a.word}」 · ${ids.get(b.key)}「${b.word}」${c.why ? ` / ${c.why}` : ''}`)
    }
    if (isolatedIds.length) lines.push(`- 어느 연결에도 엮이지 않은 성취기준: ${isolatedIds.join(', ')}`)
  }
  lines.push(
    '',
    `## 이번 아이디어의 관점 (${index + 1}번째 · ${lens.label})`,
    `- 장면: ${lens.scene}`,
    `- 학생 결과물: ${lens.output}`,
    "- 이 관점의 장면과 결과물만 쓰세요. 다른 관점의 대표 결과물은 빌리지 마세요. 학교 안 시범 운영은 '학교 생활', 지역 기관에 내는 제안은 '지역 문제', 국가 간 비교는 '지구적 문제', 작품은 '창작 프로젝트', 직업 역할 수행은 '진로·직업', 자료 분석 보고서는 '데이터 탐구', 실험은 '과학 탐구', 과거 자료 비교는 '역사적 관점'의 몫입니다.",
  )
  if (round > 1) lines.push(`- 같은 관점의 앞선 아이디어와 소재·장소·자료가 겹치지 않게 새로 잡으세요 (${round}회차).`)
  lines.push(
    '',
    '## 원칙',
    '1. 하나의 수업 장면 안에서 고른 성취기준들이 함께 다뤄져야 합니다. 성취기준마다 따로 노는 짜깁기는 실패작입니다. 장면에 넣기 어려운 성취기준은 억지로 넣지 말고 light에 적으세요.',
    '2. 성취기준이 실제로 다루는 내용 요소와 활동만 사용하세요. 성취기준에 없는 내용을 만들어 내지 마세요.',
    "3. 성취기준의 수준을 넘지 마세요. '사례를 찾을 수 있다'인 성취기준으로 '예측 모델을 만든다'를 쓰지 않습니다. 학교급에 맞는 활동만 씁니다.",
    "4. 가짜 인물·가짜 수치·지어낸 고전 구절·지어낸 자료 이름은 쓰지 마세요. 자료 출처는 '기상청 관측 자료'처럼 실제로 있는 기관 수준까지만 적고, 직업은 실제로 있는 직업 이름만 사용하세요.",
    "5. 결과물은 학생이 수업 안에서 만들 수 있는 것만 씁니다. '정책이 바뀐다', '지역 문제를 해결한다' 같은 효과를 약속하지 마세요.",
    "6. 평이한 현대어로 담담하게 쓰세요. 비장하거나 과장된 표현, 은유, '견주다' 같은 문어투는 피하세요. 성취기준 문장의 표현('~ 전략을 활용하여' 등)을 그대로 옮겨 적지 마세요.",
    '7. S1, S2 같은 번호는 light에만 쓰고, 다른 곳에서는 교과명이나 성취기준 내용으로 부르세요.',
  )
  if (hasMap) lines.push(`8. 연결 지도에서 이번 관점에 맞는 연결을 1~2개 골라 수업의 축으로 삼고, 고른 연결 이름을 axis에 그대로 적으세요. 이번 아이디어는 '${preferred}' 연결을 먼저 검토하고, 이 관점과 맞지 않을 때만 다른 연결을 고르세요.`)
  if (isolatedIds.length) lines.push('9. 어느 연결에도 엮이지 않은 성취기준은 발표·글쓰기 같은 활동으로만 가볍게 다루거나 light에 적으세요.')
  lines.push(
    '',
    '## 쓰는 방법 (교사가 읽고 "이런 수업도 괜찮겠다"고 떠올릴 수 있는 짧은 카드)',
    "- title: 소재와 학생 결과물이 드러나는 명사구, 22자 이내. 결과물 이름(지도, 제안서, 보고서, 영상 등)으로 끝내세요. '우리 동네', '우리 학교', '우리 반'으로 시작하지 마세요. 물음표·느낌표·쌍점(:)은 쓰지 마세요.",
    "- activity: 한 문장, 40자 이내. 학생이 어디서 무엇을 조사하거나 만드는지 장면으로 쓰세요. 주어 '학생들이'는 생략합니다.",
    '- product: 한 문장, 40자 이내. 결과물을 누구에게 어떻게 내놓는지 쓰세요.',
    `- activity와 product는 '~한다'로 끝나는 평서문입니다.${hasMap ? ' axis로 고른 연결의 키워드를 원문 그대로 1개 이상 넣으세요.' : ''}`,
    '- 차시 계획·단계·평가 방법·자료 목록은 쓰지 마세요.',
    '- light: 이 수업에서 활동이 거의 없거나 빠진 성취기준의 번호 목록입니다. 모두 다루면 빈 배열로 둡니다.',
    '',
    '## 응답 형식 (아래 JSON만 출력, 코드펜스·다른 텍스트 금지)',
    hasMap
      ? '{"title": "…", "activity": "…", "product": "…", "light": [], "axis": ["연결 이름"]}'
      : '{"title": "…", "activity": "…", "product": "…", "light": []}',
  )
  return lines.join('\n')
}

export const CARD_PITCH_REGEN = 120 // C6 ①
export const CARD_TITLE_REGEN = 30 // C6 ②

/**
 * 카드 응답 → { title, activity, product, pitch, axis, light_keys }. C1~C5를 적용한다.
 * C1(JSON, 제목·활동·결과물 문자열)에 실패하면 null.
 */
export function parseFuture(text, standards, concepts = []) {
  const data = extractJson(text) // C1
  if (!data) return null
  const isFilled = (v) => typeof v === 'string' && v.trim().length > 0
  if (!isFilled(data.title) || !isFilled(data.activity) || !isFilled(data.product)) return null
  const body = (v) => oneLine(replaceInternalIds(v, standards)) // C2 번호 치환
  const title = body(data.title)
  const activity = body(data.activity).replace(/^학생들[이은] +/, '') // C3 주어 정리
  const product = body(data.product)
  // C4 축: 그 조합의 연결 이름과 정확히 같은 것만, 최대 2개
  const labels = new Set((concepts || []).map((c) => c.label))
  const axisRaw = Array.isArray(data.axis) ? data.axis : (typeof data.axis === 'string' ? [data.axis] : [])
  const axis = []
  for (const a of axisRaw) {
    const name = typeof a === 'string' ? a.trim() : ''
    if (labels.has(name) && !axis.includes(name)) axis.push(name)
    if (axis.length === 2) break
  }
  // C5 비중: 유효한 번호(S1…)만 성취기준 key로, 중복 제거
  const light_keys = []
  for (const v of Array.isArray(data.light) ? data.light : []) {
    const m = String(v ?? '').trim().match(/^S(\d+)$/i)
    const std = m ? standards[Number(m[1]) - 1] : null
    if (std && !light_keys.includes(std.key)) light_keys.push(std.key)
  }
  return { title, activity, product, pitch: `${activity} ${product}`, axis, light_keys }
}

/** C6 — 첫 시도에만 적용하는 다시 생성 조건. 걸린 조건 이름 목록(없으면 빈 배열). */
export function regenerationReasons(card, standardCount) {
  const reasons = []
  if (card.pitch.length > CARD_PITCH_REGEN) reasons.push('pitch')
  if (card.title.length > CARD_TITLE_REGEN) reasons.push('title')
  // 고른 성취기준 수의 절반 초과(2개 조합에서 1개가 빠진 경우 포함)
  const light = card.light_keys.length
  if (light > standardCount / 2 || (standardCount === 2 && light >= 1)) reasons.push('light')
  return reasons
}

/**
 * 수업 아이디어 1장 생성(캐시 우선). 같은 (모델, 조합, 번호)의 동시 요청은 첫 생성을 공유한다.
 * 연결 찾기 결과를 먼저 받아(진행 중이면 기다려 공유) 프롬프트에 넣는다.
 * @returns {Promise<{future: object, cached: boolean}>}
 */
export async function generateFuture({ standards, modelKey, index }) {
  const sorted = canonical(standards)
  const keys = sorted.map((s) => s.key)
  const mk = modelKey === 'precise' ? 'precise' : 'fast'
  const model = FUTURE_MODELS[mk]
  const key = futureCacheKey(mk, keys, index)
  const mem = memGet(key)
  if (mem) return { future: mem, cached: true }

  const { value, cached } = await shareInflight(futureInflight, key, async () => {
    const hit = await readDbCache(key)
    if (hit) return { value: hit, cached: true }
    const { bridges, ok: bridgesOk } = await bridgesForFuture(sorted)
    const concepts = bridges?.concepts || []
    const prompt = buildFuturePrompt(sorted, index, publishedLinksAmong(keys), bridges)

    const finish = async (card) => {
      const future = {
        index,
        lens_label: lensOf(index).label,
        title: card.title,
        activity: card.activity,
        product: card.product,
        pitch: clampLongPitch(card.pitch), // C7: 200자를 넘는 비정상 응답만 끝난 문장까지
        axis: card.axis,
        light_keys: card.light_keys,
        model: model.id,
        keys,
      }
      // 연결 찾기가 실패한 채 만든 카드는 저장하지 않는다 — 뒤에 연결이 생기면 그 연결 위에서 다시 만든다
      if (bridgesOk) await writeCache(key, keys, future, model.id)
      return { value: future, cached: false }
    }

    let firstValid = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await callModel(model, prompt, FUTURE_TIMEOUT_MS)
      if (response?.stop_reason === 'refusal') throw new FutureError(422, FUTURE_MESSAGES.cardRefused)
      const text = textOf(response)
      const card = parseFuture(text, sorted, concepts)
      if (!card) {
        console.error(`[futures] 카드 JSON 추출 실패 (시도 ${attempt + 1}, stop=${response?.stop_reason}): ${text.slice(0, 160)}`)
        continue
      }
      if (attempt === 0) {
        const reasons = regenerationReasons(card, sorted.length)
        if (reasons.length) { // C6 — 한 번만 다시 생성
          console.info(`[futures] 카드 다시 생성 (#${index}, ${reasons.join('·')})`)
          firstValid = card
          continue
        }
      }
      return finish(card) // C7 두 번째 시도는 C1만 통과하면 받아들인다(문장을 중간에서 자르지 않는다)
    }
    // C6 때문에 다시 만든 두 번째가 C1에 실패하면, C1을 통과한 첫 결과를 사용한다
    if (firstValid) return finish(firstValid)
    throw new FutureError(502, FUTURE_MESSAGES.cardFailed)
  })
  return { future: value, cached }
}
