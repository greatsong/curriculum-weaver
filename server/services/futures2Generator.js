/**
 * 미래 보기 2 — 교사가 고른 성취기준 2~7개로 "가능한 수업의 미래"를 하나씩 생성한다.
 *
 * - index마다 다른 관점(FUTURE_LENSES)을 배정해 넘길 때마다 다른 미래가 나오게 한다.
 * - 검증된 연결(published)의 근거·주제·수업 씨앗을 프롬프트에 넣고, 연결이 약한 조합은
 *   억지로 잇지 말고 솔직히 밝히게 한다(honesty_note).
 * - 같은 조합·모델·index는 scenario_cache에 'future2:v4:' 접두 키로 캐시한다. 캐시 장애는
 *   생성을 막지 않는다. (기존 시나리오 캐시 키는 '['로 시작하는 코드라 겹치지 않는다)
 * - 서버 전체 동시 생성 수를 futures2Queue로 묶는다. 채팅과 같은 API 키를 쓰므로, 미래 보기가
 *   동시에 시작하는 생성 요청을 제한한다. 실제 계정의 RPM/TPM 안전성은 별도 검증해야 한다.
 */
import PQueue from 'p-queue'
import { getAnthropic } from '../lib/anthropicClient.js'
import { Standards, StandardLinks } from '../lib/store.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

export const FUTURE_MIN_STANDARDS = 2
export const FUTURE_MAX_STANDARDS = 7
export const FUTURE_MAX_INDEX = 29 // 한 조합당 미래 30개까지

// 미래 보기 2 전용 큐. 실제 공급자 RPM/TPM은 검증 전이므로 기본 8개씩 실행한다.
// 채팅 큐와 별개이며, 운영 계정 한도를 확인한 뒤 FUTURES2_QUEUE_CONCURRENCY로 조정할 수 있다.
const configuredConcurrency = Number(process.env.FUTURES2_QUEUE_CONCURRENCY)
export const futures2Queue = new PQueue({
  concurrency: Number.isInteger(configuredConcurrency) && configuredConcurrency > 0 ? configuredConcurrency : 8,
})

export const FUTURE_MODELS = {
  // 생각 깊이 '보통': 실측 평균 17.1초 → 11.7초, 품질(역할·흐름) 동일 (2026-10-02, 고등 3과목 조합 4회씩)
  fast: { id: 'claude-sonnet-5-5', maxTokens: 6000, effort: 'medium' },
  precise: { id: 'claude-opus-5-5', maxTokens: 16000, effort: 'medium' },
}

// 별의 꼭지 8개 = 미래의 관점 8개. 관점마다 장면과 결과물 유형을 따로 정해 성격이 겹치지 않게 한다.
// (같은 조합에서 여러 관점이 '제안서'나 '같은 장면 비교'로 수렴하던 문제를 막는다)
export const FUTURE_LENSES = [
  { label: '지역 문제', scene: '학생이 학교 밖 지역 현장(동네·지역 기관·시설)에 나가 조사하고, 그 결과를 지역에 전달하거나 행동으로 옮기는 수업', output: '현장 조사 지도와 지역 기관·주민에게 전달하는 제안' },
  { label: '학교 생활', scene: '학생이 학교 안의 공간·규칙·일과를 관찰하고 직접 바꿔 보는 수업', output: '학교 안에서 시범 운영한 개선안과 운영 결과 기록' },
  { label: '데이터 탐구', scene: '학생이 직접 수집한 데이터를 정리하고 분석해 패턴을 찾는 수업', output: '그래프와 해석을 담은 분석 보고서나 대시보드' },
  { label: '과학 탐구', scene: '가설을 세우고 변인을 통제해 실험하거나 관찰하는 수업', output: '실험 설계와 결과를 담은 탐구 보고서' },
  { label: '창작 프로젝트', scene: '배운 내용을 작품으로 만들어 표현하는 수업', output: '영상·음악·전시·이야기·디자인 같은 작품' },
  { label: '역사적 관점', scene: '과거의 자료(기록·신문·작품·통계)를 오늘과 비교해 변화를 읽는 수업', output: '연표나 과거와 현재의 변화 비교 해설' },
  { label: '진로·직업', scene: '학생이 특정 직업인의 역할을 맡아 실제 업무 과정을 수행하는 수업', output: '그 직업이 실제로 만드는 산출물(기획안·진단서·설계도·보도자료 등)' },
  { label: '지구적 문제', scene: '여러 나라의 자료와 국제 사례를 비교해 지구적 문제를 이해하고 세계 시민의 관점에서 판단하는 수업', output: '국가 간 비교 자료와 세계 시민 관점의 해설' },
]
const lensOf = (index) => FUTURE_LENSES[index % FUTURE_LENSES.length]

const cacheKeyOf = (modelKey, keys, index) => `future2:v4:${modelKey}:${[...keys].sort().join('|')}#${index}`
const inflight = new Map()

/** 요청 값 검증 — 성취기준은 key(충돌 코드는 'code|과목')로 받는다. */
export function resolveFutureRequest(body = {}) {
  const raw = Array.isArray(body.codes) ? body.codes : []
  const standards = []
  for (const value of raw) {
    if (typeof value !== 'string') return { error: '성취기준 형식이 올바르지 않습니다.' }
    const std = Standards.getByKey(value.trim()) || Standards.getByCode(value.trim())
    if (!std) return { error: `찾을 수 없는 성취기준입니다: ${value}` }
    if (!standards.some((s) => s.key === std.key)) standards.push(std)
  }
  if (standards.length < FUTURE_MIN_STANDARDS || standards.length > FUTURE_MAX_STANDARDS) {
    return { error: `성취기준을 ${FUTURE_MIN_STANDARDS}~${FUTURE_MAX_STANDARDS}개 골라 주세요.` }
  }
  const modelKey = body.model === 'precise' ? 'precise' : 'fast'
  const index = Number.isInteger(body.index) ? body.index : parseInt(body.index, 10)
  if (!Number.isInteger(index) || index < 0 || index > FUTURE_MAX_INDEX) {
    return { error: `미래 번호는 0~${FUTURE_MAX_INDEX} 사이여야 합니다.` }
  }
  return { standards, modelKey, index }
}

export function buildFuturePrompt(standards, index, links, bridges = null) {
  const lens = lensOf(index)
  const round = Math.floor(index / FUTURE_LENSES.length)
  const ids = new Map(standards.map((s, i) => [s.key, `S${i + 1}`]))
  const standardLines = standards.map((s, i) =>
    `S${i + 1}. ${s.code} [${s.subject}${s.grade_group ? ` · ${s.grade_group}` : ''}] ${s.content}`).join('\n')

  const linkedPairs = new Set()
  const linkLines = links.map((l) => {
    const a = ids.get(l.source_code)
    const b = ids.get(l.target_code)
    if (!a || !b) return null
    linkedPairs.add([a, b].sort().join('-'))
    const meta = [l.integration_theme && `주제: ${l.integration_theme}`, l.rationale && `근거: ${l.rationale}`, l.lesson_hook && `수업 씨앗: ${l.lesson_hook}`]
      .filter(Boolean).join(' / ')
    return `- ${a}–${b}${meta ? ` — ${meta}` : ''}`
  }).filter(Boolean)
  const allPairs = []
  for (let i = 0; i < standards.length; i++) for (let j = i + 1; j < standards.length; j++) allPairs.push(`S${i + 1}-S${j + 1}`)
  const unlinked = allPairs.filter((p) => !linkedPairs.has(p))
  const conceptLines = (bridges?.concepts || []).map((c) =>
    `- ${c.label}: ${(c.ends || c.keys.map((key) => ({ key }))).map((e) => `${ids.get(e.key)}${e.word ? `「${e.word}」` : ''}`).join(' · ')}${c.why ? ` — ${c.why}` : ''}`)
  const isolatedIds = (bridges?.isolated || []).map((k) => ids.get(k)).filter(Boolean)

  return `당신은 융합 수업 설계 전문가입니다. 교사가 고른 성취기준 ${standards.length}개로 만들 수 있는 "수업의 미래" 하나를 그려 주세요.

## 고른 성취기준
${standardLines}

## 검증된 교과 연결
${linkLines.length ? linkLines.join('\n') : '- 없음'}
${unlinked.length ? `- 검증된 연결이 없는 쌍: ${unlinked.join(', ')}` : ''}
${conceptLines.length ? `
## 연결 지도 (성취기준의 키워드끼리 이어진 연결)
${conceptLines.join('\n')}${isolatedIds.length ? `\n- 어느 연결에도 엮이지 않은 성취기준: ${isolatedIds.join(', ')}` : ''}
` : ''}
## 이번 미래의 관점 (${index + 1}번째 미래 · ${lens.label})
- 장면: ${lens.scene}
- 학생 결과물: ${lens.output}
- 이 관점의 장면과 결과물만 쓰세요. 다른 관점의 대표 결과물은 빌리지 마세요. 제안서는 '지역 문제', 학교 안 시범 운영은 '학교 생활', 실험은 '과학 탐구', 작품은 '창작 프로젝트', 국가 간 비교는 '지구적 문제'의 몫입니다.${round > 0 ? `\n- 같은 관점의 앞선 미래와 소재·장소·데이터가 겹치지 않게 새로 잡으세요 (${round + 1}회차).` : ''}

## 원칙
1. 하나의 수업 장면이 고른 성취기준들을 자연스럽게 관통해야 합니다. 성취기준마다 따로 노는 짜깁기는 실패작입니다.
2. 성취기준이 실제로 다루는 내용 요소와 활동만 사용하세요. 성취기준에 없는 내용을 만들어 내지 마세요.
3. 연결이 약한 성취기준은 억지로 늘이지 말고 보조 역할로 두되, 그 사실을 honesty_note에 솔직히 적으세요.
4. 데이터와 자료는 학생이 실제로 구하거나 만들 수 있는 것만 쓰세요(공공데이터, 교실 측정, 설문 등).
5. 가짜 인물·가짜 수치·지어낸 고전 구절은 쓰지 마세요. 사실이 확실하지 않으면 학생 탐구 과제로 넘기세요.
6. 톤은 담담하게 쓰세요. 비장하거나 선정적인 제목 대신 무엇을 하는 수업인지 드러나는 제목을 쓰세요.
   평이한 현대어로 쓰세요. '견주다' 같은 문어투 대신 '비교하다'를 쓰고, 은유나 과장된 표현은 피하세요.
7. S1, S2 같은 번호는 roles의 id에만 쓰세요. 다른 모든 문장에서는 교과명이나 성취기준 내용으로 부르세요.${conceptLines.length ? `
8. 연결 지도에서 이번 관점에 가장 맞는 연결을 1~2개 골라 수업의 축으로 삼으세요. 그 연결의 키워드들이 활동 흐름에서 실제로 만나야 합니다. 고른 연결 이름을 axis에 그대로 적으세요.` : ''}

## 응답 형식 — 아래 JSON만 출력 (코드펜스·다른 텍스트 금지, 전체 1,500자 이내)
{
  "title": "미래 제목 한 줄",
  "lens": "이 미래의 관점을 한 구절로",
  "situation": "수업이 시작되는 문제 상황 3~4문장",
  "driving_question": "학생이 답을 찾아가는 핵심 질문 한 문장",
  "roles": [{"id": "S1", "role": "이 수업에서 이 성취기준이 맡는 역할 한 문장"}],
  "activity_steps": ["차시 흐름 4~5단계, 각 한 줄"],
  "data_sources": ["학생이 실제로 쓸 수 있는 자료 2~3개"],
  "student_output": "학생이 만들어 내는 결과물 한 줄",
  "assessment_idea": "과정 중심 평가 아이디어 1~2문장",
  "honesty_note": "억지스러운 연결이 있으면 한 문장으로 솔직하게, 없으면 빈 문자열"${conceptLines.length ? ',\n  "axis": ["수업의 축으로 삼은 연결 이름 1~2개"]' : ''}
}
roles에는 S1~S${standards.length}가 모두 한 번씩 들어가야 합니다.`
}

/** 본문에 남은 S1·S2 같은 내부 번호를 "교과 [코드]"로 바꾼다(사용자는 번호를 모른다). */
function replaceInternalIds(value, standards) {
  if (typeof value !== 'string') return ''
  return value.replace(/\bS([1-7])\b/g, (whole, n) => {
    const std = standards[Number(n) - 1]
    return std ? `${std.subject} ${std.code}` : whole
  })
}

/** 모델 응답 → 미래 객체. JSON이 없거나 깨지면 null. */
export function parseFuture(text, standards) {
  const match = typeof text === 'string' ? text.match(/\{[\s\S]*\}/) : null
  if (!match) return null
  let data
  try { data = JSON.parse(match[0]) } catch { return null }
  if (!data || typeof data.title !== 'string' || typeof data.driving_question !== 'string') return null
  const byId = new Map(standards.map((s, i) => [`S${i + 1}`, s]))
  const roles = (Array.isArray(data.roles) ? data.roles : [])
    .map((r) => {
      const std = byId.get(String(r?.id || '').trim())
      return std && typeof r.role === 'string' ? { key: std.key, code: std.code, subject: std.subject, role: replaceInternalIds(r.role, standards) } : null
    })
    .filter(Boolean)
  const missing = standards.filter((s) => !roles.some((r) => r.key === s.key)).map((s) => s.key)
  const text1 = (v) => replaceInternalIds(v, standards)
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map(text1) : [])
  return {
    title: text1(data.title),
    lens: text1(data.lens),
    situation: text1(data.situation),
    driving_question: text1(data.driving_question),
    roles,
    missing_roles: missing,
    activity_steps: list(data.activity_steps),
    data_sources: list(data.data_sources),
    student_output: text1(data.student_output),
    assessment_idea: text1(data.assessment_idea),
    honesty_note: text1(data.honesty_note),
    axis: list(data.axis).slice(0, 3),
  }
}

// 메모리 캐시 — DB가 없거나 잠시 장애여도 같은 조합의 연결 지도·미래가 다시 생성되지 않게(같은 지도 위에서 8개가 그려지도록)
const MEM_CACHE_MAX = 600
const memCache = new Map()
export function _clearFutures2MemCache() { memCache.clear() } // 테스트 전용
function memSet(key, value) {
  memCache.delete(key)
  memCache.set(key, value)
  if (memCache.size > MEM_CACHE_MAX) memCache.delete(memCache.keys().next().value)
}

async function readCache(key) {
  if (memCache.has(key)) return memCache.get(key)
  try {
    const { data } = await supabaseAdmin.from('scenario_cache').select('scenario').eq('key', key).maybeSingle()
    if (data?.scenario) memSet(key, data.scenario)
    return data?.scenario || null
  } catch { return null } // DB 미설정·장애 — 캐시 없이 생성
}

async function writeCache(key, keys, future, modelId) {
  memSet(key, future)
  try {
    await supabaseAdmin.from('scenario_cache').upsert({ key, codes: keys, scenario: future, model: modelId }, { onConflict: 'key', ignoreDuplicates: true })
  } catch (err) {
    console.warn('[futures2] 캐시 저장 실패(무시):', err?.message || err)
  }
}

export class FutureError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

/**
 * 미래 하나 생성(캐시 우선). 같은 키의 동시 요청은 첫 생성을 공유한다.
 * @returns {Promise<{future: object, cached: boolean}>}
 */
export async function generateFuture({ standards, modelKey, index }) {
  const keys = standards.map((s) => s.key)
  const key = cacheKeyOf(modelKey, keys, index)
  const hit = await readCache(key)
  if (hit) return { future: hit, cached: true }

  if (!inflight.has(key)) {
    const model = FUTURE_MODELS[modelKey]
    const run = (async () => {
      const links = StandardLinks.getLinksAmongCodes(keys, { status: 'published', minQuality: 0, limit: 15 })
      const bridges = await bridgesForFuture(standards)
      const prompt = buildFuturePrompt(standards, index, links, bridges)
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await futures2Queue.add(() => getAnthropic().messages.create({
          model: model.id,
          max_tokens: model.maxTokens,
          ...(model.effort ? { output_config: { effort: model.effort } } : {}),
          messages: [{ role: 'user', content: prompt }],
        }, { timeout: 150_000, maxRetries: 1 }))
        if (response.stop_reason === 'refusal') throw new FutureError(422, 'AI가 이 조합의 미래를 그리지 않았습니다. 다른 성취기준으로 시도해 주세요.')
        const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
        const future = parseFuture(text, standards)
        if (future) {
          const full = { ...future, index, lens_label: lensOf(index).label, model: model.id, keys }
          await writeCache(key, keys, full, model.id)
          return full
        }
        console.error(`[futures2] JSON 추출 실패 (시도 ${attempt + 1}, stop=${response.stop_reason}): ${text.slice(0, 160)}`)
      }
      throw new FutureError(502, '미래를 그리지 못했습니다. 잠시 후 다시 시도해 주세요.')
    })()
    inflight.set(key, run)
    run.then(() => inflight.delete(key), () => inflight.delete(key))
  }
  return { future: await inflight.get(key), cached: false }
}

// ── 연결 마법진 (연결 개념 지도) ──
// 성취기준마다 핵심 키워드 3~5개(원문 그대로)를 뽑고, 서로 다른 성취기준의 키워드끼리 실제로 이어지는 것만 잇는다.
// 화면에서는 성취기준 하나가 마법진 하나, 이어진 키워드는 초록 선으로 연결되고 연결된 마법진이 초록으로 켜진다.
// 꼭지마다의 미래는 이 연결 위에서 그린다(관점에 맞는 연결 1~2개를 축으로). 조합당 한 번 생성·캐시하고 모델과 무관하다.
export const BRIDGE_MODEL = { id: 'claude-sonnet-5-5', maxTokens: 3000, effort: 'low' }
export const BRIDGE_MAX_CONCEPTS = 7
export const BRIDGE_MAX_KEYWORDS = 5
const bridgeKeyOf = (keys) => `future2-bridge:v2:${[...keys].sort().join('|')}`
const bridgeInflight = new Map()

export function buildBridgePrompt(standards, links = []) {
  const ids = new Map(standards.map((s, i) => [s.key, `S${i + 1}`]))
  const standardLines = standards.map((s, i) => `S${i + 1}. ${s.code} [${s.subject}] ${s.content}`).join('\n')
  const linkLines = links.map((l) => {
    const a = ids.get(l.source_code), b = ids.get(l.target_code)
    return a && b ? `- ${a}–${b}${l.integration_theme ? ` — 주제: ${l.integration_theme}` : ''}${l.rationale ? ` / 근거: ${l.rationale}` : ''}` : null
  }).filter(Boolean)
  return `교사가 고른 성취기준 ${standards.length}개를 하나의 수업으로 엮으려고 합니다. 먼저 성취기준마다 핵심 키워드를 뽑고, 서로 다른 성취기준의 키워드 가운데 실제로 이어지는 것만 연결해 주세요.

## 고른 성취기준
${standardLines}

## 검증된 교과 연결
${linkLines.length ? linkLines.join('\n') : '- 없음'}

## 키워드 원칙
1. 성취기준마다 그 성취기준이 다루는 핵심 내용 요소를 3~${BRIDGE_MAX_KEYWORDS}개 고르세요.
2. 키워드는 성취기준 원문에 있는 말을 그대로 옮기세요(2~10자). 고치거나 바꿔 말하지 마세요.
3. '설명할 수 있다', '탐구한다', '이해하고'처럼 행동만 나타내는 말은 키워드가 아닙니다. 무엇을 다루는지 드러나는 명사구를 고르세요.

## 연결 원칙
4. 연결은 서로 다른 성취기준의 키워드 2~4개를 잇고, 그 키워드들을 한 수업에서 실제로 함께 다룰 수 있을 때만 만드세요.
5. 연결마다 그 연결이 무엇인지 드러나는 이름(2~12자 명사구, 예: '기상 빅데이터', '위험 지도', '설득 근거 자료')과 이유 한 문장을 쓰세요. 이유는 번호 대신 교과명으로 쓰세요.
6. '융합', '탐구', '소통', '문제 해결'처럼 어디에나 붙는 이름은 쓰지 마세요.
7. 모든 키워드를 엮을 필요는 없습니다. 억지스럽거나 터무니없는 연결은 만들지 마세요. 이어지지 않는 성취기준이 있으면 그대로 두세요.
8. 연결은 0~${BRIDGE_MAX_CONCEPTS}개.

## 응답 형식 — 아래 JSON만 출력 (코드펜스·다른 텍스트 금지)
{"keywords": [{"id": "S1", "words": ["원문 키워드", "원문 키워드", "원문 키워드"]}],
 "links": [{"label": "연결 이름", "ends": [{"id": "S1", "word": "S1의 키워드"}, {"id": "S2", "word": "S2의 키워드"}], "why": "이 키워드들이 이어지는 이유 한 문장"}]}`
}

// 원문 대조용 정규화: 공백·문장부호·가운뎃점 차이는 무시
const squashText = (v) => String(v ?? '').replace(/[\s.,·⋅ㆍ\-–—'"“”‘’()（）[\]]/g, '')

/**
 * 모델 응답 → { keywords: {key: [word]}, concepts: [{label, ends: [{key, word}], keys, why}], isolated: [key] }.
 * - 키워드는 그 성취기준 원문에 실제로 있는 말만 남긴다(지어낸 키워드는 버린다).
 * - 연결의 양 끝은 그 성취기준의 (검증된) 키워드여야 하고, 서로 다른 성취기준 2개 이상을 이어야 한다.
 * - 엮이지 않은 성취기준(isolated)은 모델 말을 믿지 않고 서버가 계산한다.
 * 키워드를 하나도 못 건지면 null(연결은 0개여도 된다 — 억지로 잇지 않는 것도 결과다).
 */
export function parseBridges(text, standards) {
  const match = typeof text === 'string' ? text.match(/\{[\s\S]*\}/) : null
  if (!match) return null
  let data
  try { data = JSON.parse(match[0]) } catch { return null }
  const byId = new Map(standards.map((s, i) => [`S${i + 1}`, s]))
  const keywords = {}
  for (const k of Array.isArray(data?.keywords) ? data.keywords : []) {
    const std = byId.get(String(k?.id ?? '').trim())
    if (!std || keywords[std.key]) continue
    const content = squashText(std.content)
    const words = []
    for (const w of Array.isArray(k.words) ? k.words : []) {
      const word = typeof w === 'string' ? w.trim().slice(0, 16) : ''
      const q = squashText(word)
      if (q.length >= 2 && content.includes(q) && !words.some((x) => squashText(x) === q)) words.push(word)
      if (words.length === BRIDGE_MAX_KEYWORDS) break
    }
    if (words.length) keywords[std.key] = words
  }
  if (!Object.keys(keywords).length) return null
  const findWord = (key, word) => (keywords[key] || []).find((w) => squashText(w) === squashText(word))
  const seen = new Set()
  const concepts = []
  for (const l of Array.isArray(data?.links) ? data.links : []) {
    const label = typeof l?.label === 'string' ? l.label.trim().slice(0, 20) : ''
    if (!label || seen.has(label)) continue
    const ends = []
    for (const e of Array.isArray(l.ends) ? l.ends : []) {
      const std = byId.get(String(e?.id ?? '').trim())
      const word = std && findWord(std.key, e.word)
      if (word && !ends.some((x) => x.key === std.key)) ends.push({ key: std.key, word })
    }
    if (ends.length < 2) continue
    seen.add(label)
    concepts.push({ label, ends, keys: ends.map((e) => e.key), why: replaceInternalIds(typeof l.why === 'string' ? l.why.trim() : '', standards) })
    if (concepts.length === BRIDGE_MAX_CONCEPTS) break
  }
  const covered = new Set(concepts.flatMap((c) => c.keys))
  return { keywords, concepts, isolated: standards.map((s) => s.key).filter((k) => !covered.has(k)) }
}

/** 연결 개념 지도(캐시 우선). 같은 조합의 동시 요청은 첫 생성을 공유한다. */
export async function generateBridges({ standards }) {
  const keys = standards.map((s) => s.key)
  const key = bridgeKeyOf(keys)
  const hit = await readCache(key)
  if (hit) return { bridges: hit, cached: true }
  if (!bridgeInflight.has(key)) {
    const run = (async () => {
      const links = StandardLinks.getLinksAmongCodes(keys, { status: 'published', minQuality: 0, limit: 15 })
      const prompt = buildBridgePrompt(standards, links)
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await futures2Queue.add(() => getAnthropic().messages.create({
          model: BRIDGE_MODEL.id,
          max_tokens: BRIDGE_MODEL.maxTokens,
          output_config: { effort: BRIDGE_MODEL.effort },
          messages: [{ role: 'user', content: prompt }],
        }, { timeout: 90_000, maxRetries: 1 }))
        if (response.stop_reason === 'refusal') throw new FutureError(422, 'AI가 이 조합의 연결을 그리지 않았습니다.')
        const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
        const bridges = parseBridges(text, standards)
        if (bridges) {
          await writeCache(key, keys, bridges, BRIDGE_MODEL.id)
          return bridges
        }
        console.error(`[futures2] 연결 개념 JSON 추출 실패 (시도 ${attempt + 1}): ${text.slice(0, 160)}`)
      }
      throw new FutureError(502, '연결 개념을 그리지 못했습니다.')
    })()
    bridgeInflight.set(key, run)
    run.then(() => bridgeInflight.delete(key), () => bridgeInflight.delete(key))
  }
  return { bridges: await bridgeInflight.get(key), cached: false }
}

/** 미래 생성용 — 연결 개념 지도가 실패해도 미래는 지도 없이 만든다. */
async function bridgesForFuture(standards) {
  try { return (await generateBridges({ standards })).bridges } catch (err) {
    console.warn('[futures2] 연결 개념 없이 진행:', err?.message || err)
    return null
  }
}
