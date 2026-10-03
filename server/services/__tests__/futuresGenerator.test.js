/**
 * 미래 보기 생성기 테스트 — docs/미래보기-명세서.md 1부 §2~§5, 3부 T2~T4, 최신 사용자 결정 3번(strength).
 * 요청 검증, 연결 찾기 프롬프트·검증(V1~V16, V11-1), 카드 프롬프트·검증(C1~C7), 우선 축 순환,
 * 캐시 키 버전, 다시 생성, 422·502, DB 없이 생성·메모리 캐시, 동시 요청 공유, 전체 동시 상한.
 * Anthropic·Supabase는 mock. 성취기준은 실제 정본(initStore)의 표본 조합(1부 §8-0 T1·T2·T7)을 쓴다.
 * 고정 자료는 실제 원문과 §2-5 검증을 통과한 출력으로 만든다(R15).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sdk = vi.hoisted(() => ({ create: vi.fn() }))
const db = vi.hoisted(() => ({ cache: new Map(), fail: false, upserts: [] }))

vi.mock('../../lib/anthropicClient.js', () => ({
  getAnthropic: () => ({ messages: { create: sdk.create } }),
}))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: () => {
      if (db.fail) throw new Error('DB 미설정')
      let key = null
      const q = {
        select: () => q,
        eq: (_col, value) => { key = value; return q },
        maybeSingle: async () => ({ data: db.cache.has(key) ? { scenario: db.cache.get(key) } : null }),
        upsert: async (row) => { db.upserts.push(row); db.cache.set(row.key, row.scenario); return {} },
      }
      return q
    },
  },
}))

import { initStore, Standards } from '../../lib/store.js'
import {
  resolveFutureRequest, resolveStandards, buildBridgePrompt, parseBridges, generateBridges,
  buildFuturePrompt, parseFuture, generateFuture, regenerationReasons, clampLongPitch, clampWhy,
  orderConcepts, conceptSpread, normalizeStrength, preferredAxisOf, filterKeywords,
  bridgeCacheKey, futureCacheKey, FutureError, FUTURE_LENSES, FUTURE_MODELS, BRIDGE_MODEL, FUTURE_MESSAGES,
  futuresQueue, _clearFuturesMemCache,
} from '../futuresGenerator.js'

initStore()

const std = (code) => {
  const s = Standards.getByCode(code)
  if (!s) throw new Error(`정본에 없는 표본 성취기준: ${code}`)
  return s
}
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
// 표본 조합(1부 §8-0)
const T1 = ['[12생과01-05]', '[12운건01-01]', '[12기가01-03]', '[12독작01-11]'].map(std)
const T2 = ['[12지구01-04]', '[12한탐04-02]', '[12인수01-03]', '[12화언01-09]'].map(std)
const T7 = [...T2, std('[12윤탐03-02]'), std('[12데과02-02]')]
const T2_SORTED = [...T2].sort(byKey) // 생성은 정렬한 순서로 S 번호를 붙인다
const T2_KEYS = T2_SORTED.map((s) => s.key)
const [GEO, KGEO, AIM, SPEECH] = T2 // 지구과학 · 한국지리 탐구 · 인공지능 수학 · 화법과 언어

// 모델 응답 만들기: 성취기준 코드로 쓰고 S 번호는 주어진 순서로 바꾼다
const sid = (list, s) => `S${list.indexOf(s) + 1}`
const bridgeReply = (list, keywords, links = []) => JSON.stringify({
  keywords: keywords.map(([s, words]) => ({ id: sid(list, s), words })),
  links: links.map((l) => ({ ...l, ends: l.ends.map(([s, word]) => ({ id: sid(list, s), word })) })),
})
const textResponse = (text, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text }] })

// T2 고정 자료 — 실제 원문에서 뗀 키워드와, 검증을 통과하는 연결 3개
const T2_KEYWORDS = [
  [GEO, ['태풍', '집중호우', '악기상', '대처 방안']],
  [KGEO, ['도시화', '하천', '해안지역', '지속가능한 활용']],
  [AIM, ['빅데이터', '인공지능']],
  [SPEECH, ['정제된 언어적 표현', '준언어적⋅비언어적 표현', '발표']],
]
const T2_LINKS = [
  { label: '도시 침수 위험', kind: 'same', strength: 3, ends: [[GEO, '집중호우'], [KGEO, '도시화']], why: '집중호우 기록과 도시화 지역을 지도에 겹쳐 비교한다.' },
  { label: '재해 대응 발표', kind: 'method', strength: 2, ends: [[SPEECH, '발표'], [GEO, '대처 방안']], why: '악기상 대처 방안을 조사해 학급에 발표한다.' },
  { label: '도시 변화 빅데이터', kind: 'same', strength: 1, ends: [[KGEO, '도시화'], [AIM, '빅데이터']], why: '도시 변화를 빅데이터로 살핀 사례를 찾아 정리한다.' },
]
const T2_BRIDGES = {
  keywords: Object.fromEntries(T2_SORTED.map((s) => [s.key, T2_KEYWORDS.find(([x]) => x === s)[1]])),
  concepts: T2_LINKS.map((l) => ({ label: l.label, kind: l.kind, strength: l.strength, ends: l.ends.map(([s, word]) => ({ key: s.key, word })), why: l.why })),
  isolated: [],
}

const goodCard = (extra = {}) => JSON.stringify({
  title: '집중호우와 도시화 비교 지도',
  activity: '학교 주변 하천에서 집중호우 흔적과 도시화 지역을 기록한다.',
  product: '조사한 내용을 지도로 만들어 학급 게시판에 붙인다.',
  light: [],
  axis: ['도시 침수 위험'],
  ...extra,
})

const isBridgePrompt = (p) => p.startsWith('교사가 고른 성취기준')
const isCardPrompt = (p) => p.startsWith('당신은 융합 수업 설계 전문가입니다.')
const promptOf = (call) => call[0].messages[0].content
const cardCalls = () => sdk.create.mock.calls.filter((c) => isCardPrompt(promptOf(c)))
const bridgeCalls = () => sdk.create.mock.calls.filter((c) => isBridgePrompt(promptOf(c)))
/** 연결 찾기·카드 요청을 나눠 응답한다(문자열 또는 함수) */
function routeModel({ bridge = bridgeReply(T2_SORTED, T2_KEYWORDS, T2_LINKS), card = goodCard() } = {}) {
  const queues = { bridge: Array.isArray(bridge) ? [...bridge] : null, card: Array.isArray(card) ? [...card] : null }
  sdk.create.mockImplementation(async (params) => {
    const kind = isBridgePrompt(params.messages[0].content) ? 'bridge' : 'card'
    const src = kind === 'bridge' ? bridge : card
    const value = queues[kind] ? (queues[kind].length > 1 ? queues[kind].shift() : queues[kind][0]) : src
    if (typeof value === 'function') return value(params)
    return typeof value === 'string' ? textResponse(value) : value
  })
}

let logs
beforeEach(() => {
  sdk.create.mockReset()
  _clearFuturesMemCache()
  db.cache.clear()
  db.fail = false
  db.upserts = []
  logs = {
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  }
})
afterEach(() => { vi.restoreAllMocks() })

// ─────────────────────────────────────────────────────────────
describe('요청 검증 (1부 §6-7 문구)', () => {
  const keys = T2.map((s) => s.key)
  it('성취기준 2~6개만 받는다', () => {
    expect(resolveFutureRequest({ codes: keys, model: 'fast', index: 0 }).standards).toHaveLength(4)
    expect(resolveFutureRequest({ codes: keys.slice(0, 1), index: 0 }).error).toBe('성취기준을 2~6개 골라 주세요.')
    expect(resolveFutureRequest({ codes: [...T7.map((s) => s.key), std('[12확통01-01]').key], index: 0 }).error).toBe('성취기준을 2~6개 골라 주세요.')
    expect(resolveStandards({ codes: T7.map((s) => s.key) }).standards).toHaveLength(6)
  })
  it('형식이 틀리면 형식 오류, 없는 성취기준은 그 코드를 밝힌다', () => {
    expect(resolveStandards({ codes: 'a,b' }).error).toBe('성취기준 형식이 올바르지 않습니다.')
    expect(resolveStandards({}).error).toBe('성취기준 형식이 올바르지 않습니다.')
    expect(resolveStandards({ codes: [keys[0], 3] }).error).toBe('성취기준 형식이 올바르지 않습니다.')
    expect(resolveStandards({ codes: [keys[0], '[없는코드-99]'] }).error).toBe('찾을 수 없는 성취기준입니다: [없는코드-99]')
  })
  it('아이디어 번호는 0~29만 받는다(문자열 숫자 허용)', () => {
    expect(resolveFutureRequest({ codes: keys, index: 29 }).index).toBe(29)
    expect(resolveFutureRequest({ codes: keys, index: '3' }).index).toBe(3)
    for (const bad of [30, -1, 1.5, 'abc', '2x', undefined, null]) {
      expect(resolveFutureRequest({ codes: keys, index: bad }).error).toBe('아이디어 번호는 0~29 사이여야 합니다.')
    }
  })
  it('중복은 하나로 합치고, 모르는 모델 값은 빠른 모드로 둔다', () => {
    const r = resolveFutureRequest({ codes: [keys[0], keys[0], keys[1]], model: 'hacked', index: 2 })
    expect(r.standards).toHaveLength(2)
    expect(r.modelKey).toBe('fast')
    expect(resolveFutureRequest({ codes: keys, model: 'precise', index: 0 }).modelKey).toBe('precise')
  })
})

// ─────────────────────────────────────────────────────────────
describe('연결 찾기 프롬프트 (1부 §5-1 + 최신 결정 3번)', () => {
  it('성취기준을 S 번호와 원문으로 싣고, 검토할 쌍 전체를 나열한다', () => {
    const p = buildBridgePrompt(T2)
    expect(p.startsWith('교사가 고른 성취기준 4개를 하나의 수업으로 엮으려고 합니다.')).toBe(true)
    T2.forEach((s, i) => expect(p).toContain(`S${i + 1}. ${s.code} [${s.subject}] ${s.content}`))
    expect(p).toContain('## 검토할 성취기준 쌍\nS1-S2, S1-S3, S1-S4, S2-S3, S2-S4, S3-S4\n')
    expect(buildBridgePrompt(T2.slice(0, 2))).toContain('## 검토할 성취기준 쌍\nS1-S2\n')
    const six = buildBridgePrompt(T7).split('## 검토할 성취기준 쌍\n')[1].split('\n')[0].split(', ')
    expect(six).toHaveLength(15)
    expect(six.at(-1)).toBe('S5-S6')
  })
  it('검증된 교과 연결은 "S1-S2 / 주제 / 근거"로, 없으면 "없음"', () => {
    expect(buildBridgePrompt(T2)).toContain('## 검증된 교과 연결\n- 없음\n')
    const p = buildBridgePrompt(T2, [{ source_code: KGEO.key, target_code: GEO.key, integration_theme: '재해와 지형', rationale: '근거A', lesson_hook: '쓰지 않음' }])
    expect(p).toContain('- S1-S2 / 주제: 재해와 지형 / 근거: 근거A')
    expect(p).not.toContain('수업 예시')
  })
  it('키워드 원칙·연결 원칙(13·14번 쏠림 규칙, 15번 강도)을 원문 그대로 담는다', () => {
    const p = buildBridgePrompt(T2)
    expect(p).toContain("2. 키워드는 성취기준 원문에 있는 말을 그대로 옮기세요(2~12자).")
    expect(p).toContain("'준언어적'이 아니라 '준언어적·비언어적 표현'처럼")
    expect(p).toContain('   - 어느 성취기준에나 있는 말: 자료, 사례, 방법, 내용, 과정, 문제, 탐구')
    expect(p).toContain("13. '검토할 성취기준 쌍'을 하나씩 모두 살펴 성립하는 연결이 있는지 따지세요. 연결이 한 성취기준에 몰리지 않게, 그 성취기준이 들어가지 않은 쌍을 먼저 검토한 뒤에 그 성취기준의 연결을 더하세요.")
    expect(p).toContain('14. 12번이 13번보다 우선합니다. 다른 쌍에서 실제로 성립하는 연결이 없으면 한 성취기준에 연결이 몰려도 그대로 두세요. 고르게 만들려고 근거가 약한 연결을 만들지 마세요.')
    expect(p).toContain('15. 연결마다 strength를 1~3 정수로 적으세요. 3은 두 키워드가 같은 대상·개념을 직접 다루어 한 활동에서 두 성취기준의 핵심 내용이 함께 다뤄질 때, 2는 한 활동에서 함께 다룰 수 있지만 한쪽이 보조 역할일 때, 1은 연결은 성립하지만 활동을 따로 설계해야 이어질 때입니다. 약한 연결을 강하게 적지 마세요.')
    // 절 순서
    const order = ['## 고른 성취기준', '## 검증된 교과 연결', '## 검토할 성취기준 쌍', '## 키워드 원칙', '## 연결 원칙', '## 응답 형식']
    const at = order.map((h) => p.indexOf(h))
    expect(at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1]))).toBe(true)
  })
  it('응답 형식에 kind와 strength가 들어간다', () => {
    const p = buildBridgePrompt(T2)
    expect(p).toContain('## 응답 형식 (아래 JSON만 출력, 코드펜스·다른 텍스트 금지)\n{"keywords": [{"id": "S1", "words": ["원문 키워드", "원문 키워드", "원문 키워드"]}],\n "links": [{"label": "연결 이름", "kind": "same", "strength": 2, "ends": [{"id": "S1", "word": "S1의 키워드"}, {"id": "S2", "word": "S2의 키워드"}], "why": "두 키워드를 한 활동에서 함께 다루는 방법 한 문장"}]}')
  })
})

// ─────────────────────────────────────────────────────────────
describe('연결 찾기 검증 — 고정 자료', () => {
  it('고정 자료는 검증을 통과해도 변화가 없다 (R15)', () => {
    const r = parseBridges(bridgeReply(T2_SORTED, T2_KEYWORDS, T2_LINKS), T2_SORTED)
    expect(r).toEqual(T2_BRIDGES)
    expect(Object.keys(r.concepts[0])).toEqual(['label', 'kind', 'strength', 'ends', 'why'])
  })
})

describe('연결 찾기 검증 — 키워드 (V1~V8)', () => {
  const kwOf = (s, words) => filterKeywords(words, s.content).map((k) => k.display)

  it('V1 JSON이 없거나 깨지면 null', () => {
    expect(parseBridges('연결을 찾을 수 없습니다', T2)).toBeNull()
    expect(parseBridges('{"keywords": [', T2)).toBeNull()
  })
  it('V2 원문에 없는 키워드는 버린다 (R1: 인공지능 수학의 "예측", 다른 성취기준의 낱말)', () => {
    expect(kwOf(AIM, ['예측', '빅데이터', '집중호우'])).toEqual(['빅데이터'])
  })
  it('V2 공백·가운뎃점·따옴표 차이는 같은 말로 보고, 표시는 원문 그대로 둔다', () => {
    expect(kwOf(SPEECH, ['준언어적·비언어적 표현'])).toEqual(['준언어적⋅비언어적 표현']) // 모델은 ·(U+00B7), 원문은 ⋅(U+22C5)
    expect(kwOf(GEO, ['집중 호우', "'악기상'"])).toEqual(['집중호우', '악기상'])
  })
  it('V3 지운 뒤 2자 미만은 버리고, 표시용은 16자에서 자른다', () => {
    expect(kwOf(KGEO, ['산', '하천'])).toEqual(['하천'])
    const long = '주요 악기상의 생성 메커니즘과 대처 방안'
    const [shown] = kwOf(GEO, [long])
    expect(shown).toBe(long.slice(0, 16).trim())
  })
  it('V4 일반어(자료·사례·방법·문제 등)는 버린다', () => {
    expect(kwOf(AIM, ['사례', '빅데이터'])).toEqual(['빅데이터'])
    expect(kwOf(T1[3], ['자료', '설득 전략'])).toEqual(['설득 전략'])
    expect(kwOf(T1[0], ['방법', '물질대사'])).toEqual(['물질대사'])
    expect(kwOf(T1[2], ['문제', '식생활 문제'])).toEqual(['식생활 문제'])
  })
  it('V5 조사 꼬리(의·을·를·에서·으로·에게)로 끝나면 버린다', () => {
    expect(kwOf(AIM, ['빅데이터를', '빅데이터의', '인공지능에서'])).toEqual([])
    expect(kwOf(T1[1], ['운동의', '질환 예방'])).toEqual(['질환 예방'])
    expect(kwOf(T1[0], ['질병 조사를'])).toEqual([])
  })
  it("V5 예외: '토의'처럼 낱말 자체가 그 글자로 끝나는 명사는 남긴다(명세 K2의 활동 키워드 예)", () => {
    expect(kwOf(T1[0], ['토의', '생활 습관'])).toEqual(['토의', '생활 습관'])
    // 낱말 전체이거나 띄어 쓴 마지막 낱말일 때만 예외('운동의'는 '동의'로 끝나도 조사 꼬리)
    expect(filterKeywords(['민주주의', '집단 토의', '운동의', '공정의'], '민주주의 원리와 집단 토의, 운동의 효과와 공정의 가치').map((k) => k.display)).toEqual(['민주주의', '집단 토의'])
  })
  it('V6 "적"으로 끝나고 원문에서 바로 뒤가 가운뎃점·쉼표인 꾸밈 조각은 버린다', () => {
    expect(kwOf(SPEECH, ['준언어적', '발표'])).toEqual(['발표']) // 준언어적⋅비언어적
    expect(kwOf(T1[1], ['신체적', '사회적 건강'])).toEqual(['사회적 건강']) // 신체적, 정신적
  })
  it('V7 같은 성취기준 안에서 같거나 포함 관계인 키워드는 앞의 것만 남긴다', () => {
    expect(kwOf(T1[2], ['식생활문화', '건강한 식생활 문화'])).toEqual(['식생활문화'])
    expect(kwOf(T1[2], ['식생활 문제', '식생활'])).toEqual(['식생활 문제'])
    expect(kwOf(KGEO, ['도시화', '도시화'])).toEqual(['도시화'])
  })
  it('V8 성취기준마다 앞에서부터 최대 4개, 모두 못 건지면 null', () => {
    expect(kwOf(KGEO, ['도시화', '농업', '산지', '하천', '해안지역'])).toEqual(['도시화', '농업', '산지', '하천'])
    expect(parseBridges(bridgeReply(T2, [[GEO, ['빅데이터']], [AIM, ['사례', '예측']]]), T2)).toBeNull()
  })
  it('키워드를 못 건진 성취기준도 빈 배열로 싣는다', () => {
    const r = parseBridges(bridgeReply(T2, [[GEO, ['태풍']]]), T2)
    expect(r.keywords).toEqual({ [GEO.key]: ['태풍'], [KGEO.key]: [], [AIM.key]: [], [SPEECH.key]: [] })
  })
})

describe('연결 찾기 검증 — 연결 (V9~V16, V11-1)', () => {
  const parse = (links, list = T2, keywords = T2_KEYWORDS) => parseBridges(bridgeReply(list, keywords, links), list)
  const link = (label, a, b, extra = {}) => ({ label, kind: 'same', strength: 2, ends: [a, b], why: '두 키워드를 함께 조사한다.', ...extra })

  it('V9 끝이 정확히 2개가 아니면 버린다', () => {
    const r = parse([
      { label: '셋', kind: 'same', ends: [[GEO, '태풍'], [KGEO, '하천'], [AIM, '빅데이터']] },
      { label: '하나', kind: 'same', ends: [[GEO, '태풍']] },
      link('둘', [GEO, '태풍'], [KGEO, '하천']),
    ])
    expect(r.concepts.map((c) => c.label)).toEqual(['둘'])
  })
  it('V9 같은 성취기준끼리·검증 안 된 낱말·없는 번호의 끝은 버린다', () => {
    const r = parseBridges(JSON.stringify({
      keywords: [{ id: 'S1', words: ['태풍', '집중호우'] }, { id: 'S2', words: ['도시화'] }, { id: 'S3', words: ['예측', '빅데이터'] }],
      links: [
        { label: '같은 성취기준', ends: [{ id: 'S1', word: '태풍' }, { id: 'S1', word: '집중호우' }] },
        { label: '지어낸 끝', ends: [{ id: 'S3', word: '예측' }, { id: 'S2', word: '도시화' }] },
        { label: '키워드 아님', ends: [{ id: 'S1', word: '날씨' }, { id: 'S2', word: '도시화' }] },
        { label: '없는 번호', ends: [{ id: 'S9', word: '태풍' }, { id: 'S2', word: '도시화' }] },
        { label: '살아남는 연결', ends: [{ id: 's1', word: '집중 호우' }, { id: 'S2', word: '도시화' }] },
      ],
    }), T2)
    expect(r.concepts).toHaveLength(1)
    expect(r.concepts[0].label).toBe('살아남는 연결')
    // 끝의 낱말은 키워드 목록의 문자열과 같다(띄어 쓴 '집중 호우' → '집중호우')
    expect(r.concepts[0].ends).toEqual([{ key: GEO.key, word: '집중호우' }, { key: KGEO.key, word: '도시화' }])
  })
  it('V9 끝 낱말이 원문 표기와 달라도 같은 키워드면 키워드 문자열로 맞춘다', () => {
    const r = parse([link('재해 대응 발표', [SPEECH, '준언어적·비언어적 표현'], [GEO, '대처 방안'])])
    expect(r.concepts[0].ends[0]).toEqual({ key: SPEECH.key, word: '준언어적⋅비언어적 표현' })
    expect(r.keywords[SPEECH.key]).toContain(r.concepts[0].ends[0].word)
  })
  it('V10 빈 이름·이미 나온 이름은 버리고, 표시용 이름은 20자에서 자른다', () => {
    const r = parse([
      link('  ', [GEO, '태풍'], [KGEO, '하천']),
      link('도시 침수 위험', [GEO, '집중호우'], [KGEO, '도시화']),
      link('도시 침수 위험', [AIM, '빅데이터'], [KGEO, '도시화']),
      link('가'.repeat(25), [SPEECH, '발표'], [GEO, '대처 방안']),
    ])
    expect(r.concepts.map((c) => c.label)).toEqual(['도시 침수 위험', '가'.repeat(20)])
  })
  it('V11 kind가 same·method가 아니면 same', () => {
    const r = parse([
      link('원인 관계', [GEO, '집중호우'], [KGEO, '도시화'], { kind: 'cause' }),
      link('재해 대응 발표', [SPEECH, '발표'], [AIM, '빅데이터'], { kind: 'method' }),
    ])
    expect(r.concepts.map((c) => c.kind)).toEqual(['same', 'method'])
  })
  it('V11-1 strength가 1·2·3이 아니면 2', () => {
    for (const bad of [0, 4, 2.5, -1, '강함', null, undefined, '', [3]]) expect(normalizeStrength(bad)).toBe(2)
    expect([1, 2, 3, '3', ' 1 '].map(normalizeStrength)).toEqual([1, 2, 3, 3, 1])
    const r = parse([
      link('강한 연결', [GEO, '집중호우'], [KGEO, '도시화'], { strength: 3 }),
      link('약한 연결', [SPEECH, '발표'], [AIM, '빅데이터'], { strength: 1 }),
      link('빠진 강도', [GEO, '대처 방안'], [SPEECH, '발표'], { strength: undefined }),
      link('틀린 강도', [KGEO, '하천'], [AIM, '인공지능'], { strength: 7 }),
    ])
    expect(Object.fromEntries(r.concepts.map((c) => [c.label, c.strength]))).toEqual({ '강한 연결': 3, '약한 연결': 1, '빠진 강도': 2, '틀린 강도': 2 })
  })
  it('V12 같은 두 성취기준 사이 최대 2개(먼저 온 것 우선)', () => {
    const r = parse([
      link('첫째', [GEO, '집중호우'], [KGEO, '도시화']),
      link('둘째', [KGEO, '하천'], [GEO, '태풍']),
      link('셋째', [GEO, '악기상'], [KGEO, '해안지역']),
    ])
    expect(r.concepts.map((c) => c.label)).toEqual(['첫째', '둘째'])
  })
  it('V12 전체 최대 6개(먼저 온 것 우선) — 6개 조합(T7)', () => {
    const [geo, kgeo, aim, speech, ethics, ds] = T7
    const keywords = [
      [geo, ['집중호우', '대처 방안']], [kgeo, ['도시화', '하천']], [aim, ['빅데이터', '인공지능']],
      [speech, ['발표']], [ethics, ['알고리즘의 편향성', '윤리문제']], [ds, ['이상치', '시각화']],
    ]
    const links = [
      link('L1', [geo, '집중호우'], [kgeo, '도시화']), link('L2', [aim, '빅데이터'], [ethics, '알고리즘의 편향성']),
      link('L3', [speech, '발표'], [ds, '시각화']), link('L4', [kgeo, '하천'], [ds, '이상치']),
      link('L5', [geo, '대처 방안'], [speech, '발표']), link('L6', [aim, '인공지능'], [ds, '시각화']),
      link('L7', [ethics, '윤리문제'], [speech, '발표']),
    ]
    const r = parse(links, T7, keywords)
    expect(r.concepts).toHaveLength(6)
    expect(r.concepts.map((c) => c.label).sort()).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6'])
  })
  it('V13 근거의 S 번호를 "{과목} {코드}"로 바꾼다', () => {
    const r = parse([link('도시 침수 위험', [GEO, '집중호우'], [KGEO, '도시화'], { why: 'S1의 집중호우와 S2의 도시화를 겹친다.' })])
    expect(r.concepts[0].why).toBe(`${GEO.subject} ${GEO.code}의 집중호우와 ${KGEO.subject} ${KGEO.code}의 도시화를 겹친다.`)
  })
  it('V13 60자를 넘으면 문장 경계에서, 없으면 공백에서 자른다', () => {
    const first = '집중호우 기록과 도시화 지역을 지도에 겹쳐 비교한다.'
    expect(clampWhy(`${first} ${'이어지는 둘째 문장이 아주 길게 계속된다'.repeat(2)}.`)).toBe(first)
    const noEnd = '집중호우 기록과 도시화 지역을 지도에 겹쳐 놓고 하천 주변의 변화를 차례로 비교하고 정리하는 활동으로 이어 간다'
    const cut = clampWhy(noEnd)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(61)
    expect(noEnd.startsWith(cut.slice(0, -1))).toBe(true)
    expect(noEnd[cut.length - 1]).toBe(' ') // 낱말 중간이 아니라 공백에서 잘림
    expect(clampWhy('짧은 근거다.')).toBe('짧은 근거다.')
  })
  it('V14 연결되지 않은 성취기준은 모델 답을 믿지 않고 서버가 계산한다', () => {
    const text = JSON.parse(bridgeReply(T2, T2_KEYWORDS, [link('도시 침수 위험', [GEO, '집중호우'], [KGEO, '도시화'])]))
    text.isolated = ['S1']
    const r = parseBridges(JSON.stringify(text), T2)
    expect(r.isolated).toEqual([AIM.key, SPEECH.key])
    expect(parse([]).isolated).toEqual(T2.map((s) => s.key)) // 연결 0개도 정상 결과
    expect(parse([]).concepts).toEqual([])
  })
  it('V15 쏠림 값: 최다 끝 비율과 서로 다른 쌍의 수(거르지 않는다)', () => {
    const r = parse([
      link('A', [GEO, '집중호우'], [KGEO, '도시화']),
      link('B', [GEO, '대처 방안'], [SPEECH, '발표']),
      link('C', [GEO, '태풍'], [AIM, '빅데이터']),
    ])
    expect(r.concepts).toHaveLength(3) // 한 성취기준에 몰려도 지우지 않는다(L9)
    expect(conceptSpread(r.concepts)).toEqual({ maxEndShare: 1, topKey: GEO.key, distinctPairs: 3 })
    expect(conceptSpread(T2_BRIDGES.concepts).distinctPairs).toBe(3)
  })
  it('V16 같은 성취기준이 연달아 나오지 않게 섞고, 그 밖에는 응답 순서를 따른다', () => {
    const c = (label, a, b) => ({ label, ends: [{ key: a }, { key: b }] })
    expect(orderConcepts([c('AB', 'a', 'b'), c('AC', 'a', 'c'), c('DE', 'd', 'e')]).map((x) => x.label)).toEqual(['AB', 'DE', 'AC'])
    expect(orderConcepts([c('AB', 'a', 'b'), c('AC', 'a', 'c'), c('BC', 'b', 'c')]).map((x) => x.label)).toEqual(['AB', 'AC', 'BC'])
    expect(orderConcepts([c('AB', 'a', 'b'), c('CD', 'c', 'd')]).map((x) => x.label)).toEqual(['AB', 'CD'])
    const r = parse([
      link('A', [GEO, '집중호우'], [KGEO, '도시화']),
      link('B', [GEO, '대처 방안'], [SPEECH, '발표']),
      link('C', [AIM, '빅데이터'], [SPEECH, '정제된 언어적 표현']),
    ])
    expect(r.concepts.map((x) => x.label)).toEqual(['A', 'C', 'B'])
  })
})

// ─────────────────────────────────────────────────────────────
describe('카드 프롬프트 (1부 §5-2)', () => {
  const p0 = () => buildFuturePrompt(T2_SORTED, 0, [], T2_BRIDGES)
  const ids = new Map(T2_SORTED.map((s, i) => [s.key, `S${i + 1}`]))

  it('머리말과 성취기준 줄(과목 · 학년군)을 싣는다', () => {
    const p = p0()
    expect(p.startsWith('당신은 융합 수업 설계 전문가입니다. 교사가 고른 성취기준 4개로 만들 수 있는 수업 아이디어 하나를 짧은 카드로 써 주세요.\n\n## 고른 성취기준\n')).toBe(true)
    T2_SORTED.forEach((s, i) => expect(p).toContain(`S${i + 1}. ${s.code} [${s.subject} · ${s.grade_group}] ${s.content}`))
  })
  it('검증된 교과 연결(수업 예시 포함)과 검증된 연결이 없는 쌍을 밝힌다', () => {
    expect(p0()).toContain('## 검증된 교과 연결\n- 없음\n- 검증된 연결이 없는 쌍: S1-S2, S1-S3, S1-S4, S2-S3, S2-S4, S3-S4')
    const p = buildFuturePrompt(T2_SORTED, 0, [{ source_code: T2_SORTED[1].key, target_code: T2_SORTED[0].key, integration_theme: '주제A', rationale: '근거A', lesson_hook: '예시A' }], T2_BRIDGES)
    expect(p).toContain('- S1-S2 / 주제: 주제A / 근거: 근거A / 수업 예시: 예시A\n- 검증된 연결이 없는 쌍: S1-S3, S1-S4, S2-S3, S2-S4, S3-S4')
  })
  it('연결 지도를 "이름 (종류): S「키워드」 · S「키워드」 / 근거"로 싣는다', () => {
    const p = p0()
    expect(p).toContain('## 연결 지도 (성취기준의 키워드끼리 이어진 연결)')
    for (const c of T2_BRIDGES.concepts) {
      const [a, b] = c.ends
      expect(p).toContain(`- ${c.label} (${c.kind}): ${ids.get(a.key)}「${a.word}」 · ${ids.get(b.key)}「${b.word}」 / ${c.why}`)
    }
    expect(p).not.toContain('어느 연결에도 엮이지 않은 성취기준') // 연결되지 않은 성취기준 없음
    expect(p).not.toContain('\n9. ')
  })
  it('연결되지 않은 성취기준이 있으면 지도에 밝히고 원칙 9번을 더한다', () => {
    const bridges = { ...T2_BRIDGES, concepts: T2_BRIDGES.concepts.slice(0, 1), isolated: [AIM.key, SPEECH.key] }
    const p = buildFuturePrompt(T2_SORTED, 0, [], bridges)
    expect(p).toContain(`- 어느 연결에도 엮이지 않은 성취기준: ${ids.get(AIM.key)}, ${ids.get(SPEECH.key)}`)
    expect(p).toContain('9. 어느 연결에도 엮이지 않은 성취기준은 발표·글쓰기 같은 활동으로만 가볍게 다루거나 light에 적으세요.')
  })
  it('관점 8개의 이름·장면·결과물이 명세 순서·문구 그대로 들어간다', () => {
    expect(FUTURE_LENSES.map((l) => l.label)).toEqual(['학교 생활', '지역 문제', '지구적 문제', '창작 프로젝트', '진로·직업', '데이터 탐구', '과학 탐구', '역사적 관점'])
    const spec = [
      ['학생이 학교 안의 공간·규칙·일과를 관찰하고 개선안을 학교 안에서 시범 운영하는 수업', '시범 운영 결과 기록, 학교 안내물, 학생회 건의문 가운데 하나'],
      ['학생이 학교 밖 지역 현장(동네·지역 기관·시설)에 나가 조사하고 그 결과를 지역에 전달하는 수업', '현장 조사 지도, 지역 기관에 보내는 제안서, 주민 안내 자료 가운데 하나'],
      ['여러 나라의 자료와 국제 사례를 비교해 지구적 문제를 이해하고 세계 시민의 관점에서 판단하는 수업', '국가 간 비교 자료, 세계 시민 관점의 해설문이나 발표 가운데 하나'],
      ['배운 내용을 작품으로 만들어 표현하는 수업', '영상·음악·전시·이야기·디자인·게임 가운데 하나'],
      ['학생이 실제로 있는 직업의 역할을 맡아 그 직업의 업무 과정을 수행하는 수업', '그 직업이 실제로 만드는 산출물(기획안·진단서·설계도·보도자료 등)'],
      ['학생이 직접 수집하거나 공개된 자료를 정리하고 분석해 패턴을 찾는 수업', '그래프와 해석을 담은 분석 보고서나 대시보드'],
      ['가설을 세우고 실험·관찰·조사로 확인하는 수업(과학 교과가 없는 조합이면 가설과 검증의 순서만 빌린다)', '탐구 설계와 결과를 담은 탐구 보고서'],
      ['과거의 자료(기록·신문·작품·통계)를 오늘과 비교해 변화를 살피는 수업', '연표나 과거와 현재의 변화 비교 해설'],
    ]
    spec.forEach(([scene, output], i) => {
      const p = buildFuturePrompt(T2_SORTED, i, [], T2_BRIDGES)
      expect(p).toContain(`## 이번 아이디어의 관점 (${i + 1}번째 · ${FUTURE_LENSES[i].label})\n- 장면: ${scene}\n- 학생 결과물: ${output}\n`)
      expect(p).not.toContain('회차')
    })
    expect(p0()).toContain("- 이 관점의 장면과 결과물만 쓰세요. 다른 관점의 대표 결과물은 빌리지 마세요. 학교 안 시범 운영은 '학교 생활', 지역 기관에 내는 제안은 '지역 문제', 국가 간 비교는 '지구적 문제', 작품은 '창작 프로젝트', 직업 역할 수행은 '진로·직업', 자료 분석 보고서는 '데이터 탐구', 실험은 '과학 탐구', 과거 자료 비교는 '역사적 관점'의 몫입니다.")
  })
  it('번호 8 이상은 같은 관점의 다음 회차다', () => {
    const p = buildFuturePrompt(T2_SORTED, 8, [], T2_BRIDGES)
    expect(p).toContain('## 이번 아이디어의 관점 (9번째 · 학교 생활)')
    expect(p).toContain('- 같은 관점의 앞선 아이디어와 소재·장소·자료가 겹치지 않게 새로 잡으세요 (2회차).')
    expect(buildFuturePrompt(T2_SORTED, 29, [], T2_BRIDGES)).toContain('(4회차)')
  })
  it('원칙 1~7과 쓰는 방법(제목 22자·활동/결과물 40자·축 키워드)을 담는다', () => {
    const p = p0()
    expect(p).toContain("3. 성취기준의 수준을 넘지 마세요. '사례를 찾을 수 있다'인 성취기준으로 '예측 모델을 만든다'를 쓰지 않습니다. 학교급에 맞는 활동만 씁니다.")
    expect(p).toContain('7. S1, S2 같은 번호는 light에만 쓰고, 다른 곳에서는 교과명이나 성취기준 내용으로 부르세요.')
    expect(p).toContain("- title: 소재와 학생 결과물이 드러나는 명사구, 22자 이내. 결과물 이름(지도, 제안서, 보고서, 영상 등)으로 끝내세요. '우리 동네', '우리 학교', '우리 반'으로 시작하지 마세요. 물음표·느낌표·쌍점(:)은 쓰지 마세요.")
    expect(p).toContain("- activity: 한 문장, 40자 이내. 학생이 어디서 무엇을 조사하거나 만드는지 장면으로 쓰세요. 주어 '학생들이'는 생략합니다.")
    expect(p).toContain('- product: 한 문장, 40자 이내. 결과물을 누구에게 어떻게 내놓는지 쓰세요.')
    expect(p).toContain("- activity와 product는 '~한다'로 끝나는 평서문입니다. axis로 고른 연결의 키워드를 원문 그대로 1개 이상 넣으세요.")
    expect(p).toContain('- 차시 계획·단계·평가 방법·자료 목록은 쓰지 마세요.')
    expect(p).toContain('## 응답 형식 (아래 JSON만 출력, 코드펜스·다른 텍스트 금지)\n{"title": "…", "activity": "…", "product": "…", "light": [], "axis": ["연결 이름"]}')
    expect(p).not.toContain('pitch')
    expect(p).not.toContain('honesty')
  })
  it("원칙 8번: 카드마다 먼저 검토할 연결을 돌려 가며 정한다(concepts[index % n])", () => {
    const labels = T2_BRIDGES.concepts.map((c) => c.label)
    for (let i = 0; i < 30; i++) {
      expect(preferredAxisOf(T2_BRIDGES.concepts, i)).toBe(labels[i % 3])
      expect(buildFuturePrompt(T2_SORTED, i, [], T2_BRIDGES)).toContain(`8. 연결 지도에서 이번 관점에 맞는 연결을 1~2개 골라 수업의 축으로 삼고, 고른 연결 이름을 axis에 그대로 적으세요. 이번 아이디어는 '${labels[i % 3]}' 연결을 먼저 검토하고, 이 관점과 맞지 않을 때만 다른 연결을 고르세요.`)
    }
    // 8장의 우선 축이 연결 3개에 고루 나뉜다(1부 §8-3 10번)
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((i) => preferredAxisOf(T2_BRIDGES.concepts, i))).size).toBe(3)
    expect(preferredAxisOf([], 3)).toBeNull()
  })
  it('연결 지도가 없으면(실패·연결 0개) 지도·원칙 8·9·축 문장·axis 없이 만든다', () => {
    for (const bridges of [null, { keywords: {}, concepts: [], isolated: T2_KEYS }]) {
      const p = buildFuturePrompt(T2_SORTED, 0, [], bridges)
      expect(p).not.toContain('## 연결 지도')
      expect(p).not.toContain('어느 연결에도 엮이지 않은')
      expect(p).not.toContain('\n8. ')
      expect(p).not.toContain('\n9. ')
      expect(p).not.toContain('axis')
      expect(p).toContain("- activity와 product는 '~한다'로 끝나는 평서문입니다.\n")
      expect(p.endsWith('## 응답 형식 (아래 JSON만 출력, 코드펜스·다른 텍스트 금지)\n{"title": "…", "activity": "…", "product": "…", "light": []}')).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────
describe('카드 검증 (C1~C5)', () => {
  const concepts = T2_BRIDGES.concepts
  const parse = (extra) => parseFuture(goodCard(extra), T2_SORTED, concepts)

  it('C1 JSON과 제목·활동·결과물 문자열이 있어야 한다', () => {
    expect(parseFuture('아이디어를 만들 수 없습니다', T2_SORTED, concepts)).toBeNull()
    expect(parse({ title: '' })).toBeNull()
    expect(parse({ activity: '   ' })).toBeNull()
    expect(parse({ product: undefined })).toBeNull()
    expect(parse({ title: 3 })).toBeNull()
  })
  it('pitch는 활동 문장 + 공백 + 결과물 문장', () => {
    const f = parse()
    expect(f.pitch).toBe(`${f.activity} ${f.product}`)
    expect(Object.keys(f)).toEqual(['title', 'activity', 'product', 'pitch', 'axis', 'light_keys'])
  })
  it('C2 본문에 남은 S 번호는 "{과목} {코드}"로 바꾼다', () => {
    const f = parse({ activity: 'S1 사례와 S4 발표를 연결해 기록한다.', title: 'S2 하천 지도' })
    expect(f.activity).toBe(`${T2_SORTED[0].subject} ${T2_SORTED[0].code} 사례와 ${T2_SORTED[3].subject} ${T2_SORTED[3].code} 발표를 연결해 기록한다.`)
    expect(f.title).toBe(`${T2_SORTED[1].subject} ${T2_SORTED[1].code} 하천 지도`)
  })
  it('C3 활동 문장 앞의 "학생들이 "·"학생들은 "을 지운다', () => {
    expect(parse({ activity: '학생들이 하천을 조사한다.' }).activity).toBe('하천을 조사한다.')
    expect(parse({ activity: '학생들은 하천을 조사한다.' }).activity).toBe('하천을 조사한다.')
    expect(parse({ activity: '학생들의 통학로를 조사한다.' }).activity).toBe('학생들의 통학로를 조사한다.')
  })
  it('C4 축은 그 조합의 연결 이름과 정확히 같은 것만, 최대 2개', () => {
    expect(parse({ axis: ['도시 침수 위험', '없는 연결', '도시 침수 위험', ' 재해 대응 발표 ', '도시 변화 빅데이터'] }).axis).toEqual(['도시 침수 위험', '재해 대응 발표'])
    expect(parse({ axis: '도시 변화 빅데이터' }).axis).toEqual(['도시 변화 빅데이터'])
    expect(parseFuture(goodCard(), T2_SORTED, []).axis).toEqual([]) // 연결 0개면 축 없음
  })
  it('C5 비중은 유효한 번호만 key로 바꾸고 중복을 지운다', () => {
    expect(parse({ light: ['S3', 's3', 'S9', 4, 'S1'] }).light_keys).toEqual([T2_SORTED[2].key, T2_SORTED[0].key])
    expect(parse({ light: 'S1' }).light_keys).toEqual([])
  })
})

describe('카드 다시 생성 조건 (C6·C7)', () => {
  const card = (over = {}) => ({ title: '제목', activity: '활동한다.', product: '낸다.', pitch: '활동한다. 낸다.', axis: [], light_keys: [], ...over })
  it('C6 ① 설명 120자 초과 ② 제목 30자 초과', () => {
    expect(regenerationReasons(card({ pitch: '가'.repeat(120) }), 4)).toEqual([])
    expect(regenerationReasons(card({ pitch: '가'.repeat(121) }), 4)).toEqual(['pitch'])
    expect(regenerationReasons(card({ title: '가'.repeat(30) }), 4)).toEqual([])
    expect(regenerationReasons(card({ title: '가'.repeat(31) }), 4)).toEqual(['title'])
  })
  it('C6 ③ 비중이 작은 성취기준이 절반 초과(2개 조합에서 1개 빠짐 포함)', () => {
    expect(regenerationReasons(card({ light_keys: ['a', 'b'] }), 4)).toEqual([])
    expect(regenerationReasons(card({ light_keys: ['a', 'b', 'c'] }), 4)).toEqual(['light'])
    expect(regenerationReasons(card({ light_keys: ['a'] }), 3)).toEqual([])
    expect(regenerationReasons(card({ light_keys: ['a', 'b'] }), 3)).toEqual(['light'])
    expect(regenerationReasons(card({ light_keys: ['a'] }), 2)).toEqual(['light'])
    expect(regenerationReasons(card({ light_keys: [] }), 2)).toEqual([])
  })
  it('C7 200자를 넘는 비정상 설명만 마지막으로 끝난 문장까지 남기고, 끝난 문장이 없으면 자르지 않는다', () => {
    const s1 = `${'가'.repeat(100)}를 조사한다.`
    const s2 = `${'나'.repeat(120)}를 발표한다.`
    expect(clampLongPitch(`${s1} ${s2}`)).toBe(s1)
    expect(clampLongPitch(`${s1} 짧게 낸다.`)).toBe(`${s1} 짧게 낸다.`)
    const noEnd = '다'.repeat(230)
    expect(clampLongPitch(noEnd)).toBe(noEnd)
  })
})

// ─────────────────────────────────────────────────────────────
describe('연결 찾기 생성', () => {
  it('Sonnet 5.5·생각 깊이 low·최대 3,000토큰·timeout 90초로 요청하고, bridge:v3: 키(정렬 조합)로 캐시한다', async () => {
    routeModel()
    const a = await generateBridges({ standards: T2 })
    expect(a).toEqual({ bridges: T2_BRIDGES, cached: false })
    const [params, opts] = sdk.create.mock.calls[0]
    expect(params).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 3000, output_config: { effort: 'low' } })
    expect(BRIDGE_MODEL).toEqual({ id: 'claude-sonnet-5-5', maxTokens: 3000, effort: 'low' })
    expect(opts).toEqual({ timeout: 90_000, maxRetries: 1 })
    expect(db.upserts[0].key).toBe(`bridge:v3:${T2_KEYS.join('|')}`)
    expect(bridgeCacheKey([...T2_KEYS].reverse())).toBe(db.upserts[0].key)
    // 고른 순서가 달라도 같은 조합이면 같은 캐시
    const b = await generateBridges({ standards: [...T2].reverse() })
    expect(b.cached).toBe(true)
    expect(b.bridges).toEqual(T2_BRIDGES)
    expect(sdk.create).toHaveBeenCalledTimes(1)
  })
  it('프롬프트의 S 번호는 정렬한 조합 순서다(같은 조합 = 같은 프롬프트)', async () => {
    routeModel()
    await generateBridges({ standards: [...T2].reverse() })
    expect(promptOf(sdk.create.mock.calls[0])).toBe(buildBridgePrompt(T2_SORTED, []))
  })
  it('DB 캐시에 있으면 생성하지 않는다', async () => {
    db.cache.set(bridgeCacheKey(T2_KEYS), T2_BRIDGES)
    const r = await generateBridges({ standards: T2 })
    expect(r).toEqual({ bridges: T2_BRIDGES, cached: true })
    expect(sdk.create).not.toHaveBeenCalled()
  })
  it('V1 JSON·키워드 검증 실패는 1회 다시 생성, 두 번째도 실패하면 502(§6-7 문구)', async () => {
    routeModel({ bridge: ['잠시만요', bridgeReply(T2_SORTED, T2_KEYWORDS, T2_LINKS)] })
    expect((await generateBridges({ standards: T2 })).bridges).toEqual(T2_BRIDGES)
    expect(sdk.create).toHaveBeenCalledTimes(2)

    _clearFuturesMemCache(); db.cache.clear(); sdk.create.mockReset()
    routeModel({ bridge: bridgeReply(T2_SORTED, [[GEO, ['빅데이터']], [AIM, ['예측']]]) }) // 키워드를 하나도 못 건짐
    const err = await generateBridges({ standards: T2 }).catch((e) => e)
    expect(err).toBeInstanceOf(FutureError)
    expect(err.status).toBe(502)
    expect(err.message).toBe('키워드 연결을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.')
    expect(sdk.create).toHaveBeenCalledTimes(2)
  })
  it('거절 응답이면 422(§6-7 문구)', async () => {
    routeModel({ bridge: { stop_reason: 'refusal', content: [] } })
    const err = await generateBridges({ standards: T2 }).catch((e) => e)
    expect(err.status).toBe(422)
    expect(err.message).toBe('AI가 이 조합의 키워드 연결을 만들지 않았습니다.')
  })
  it('V15 연결이 2개 이상이면 쏠림을 로그로 남기고, 결과는 그대로 둔다', async () => {
    routeModel()
    const r = await generateBridges({ standards: T2 })
    expect(r.bridges.concepts).toHaveLength(3)
    const line = logs.info.mock.calls.map((c) => c.join(' ')).find((l) => l.includes('연결 쏠림 기록'))
    expect(line).toContain('최다 끝 비율 0.67')
    expect(line).toContain('서로 다른 쌍 3개')

    _clearFuturesMemCache(); db.cache.clear(); logs.info.mockClear()
    routeModel({ bridge: bridgeReply(T2_SORTED, T2_KEYWORDS, T2_LINKS.slice(0, 1)) })
    await generateBridges({ standards: T2 })
    expect(logs.info.mock.calls.some((c) => c.join(' ').includes('연결 쏠림 기록'))).toBe(false)
  })
  it('DB가 없어도 생성하고, 같은 조합은 메모리 캐시로 돌려준다', async () => {
    db.fail = true
    routeModel()
    expect((await generateBridges({ standards: T2 })).cached).toBe(false)
    const again = await generateBridges({ standards: T2 })
    expect(again.cached).toBe(true)
    expect(sdk.create).toHaveBeenCalledTimes(1)
  })
  it('같은 조합의 동시 요청은 첫 생성을 공유한다', async () => {
    let release
    sdk.create.mockImplementation(() => new Promise((resolve) => { release = () => resolve(textResponse(bridgeReply(T2_SORTED, T2_KEYWORDS, T2_LINKS))) }))
    const a = generateBridges({ standards: T2 })
    const b = generateBridges({ standards: [...T2].reverse() })
    await new Promise((r) => setTimeout(r, 10))
    release()
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.bridges).toEqual(rb.bridges)
    expect(sdk.create).toHaveBeenCalledTimes(1)
  })
})

describe('카드 생성', () => {
  const req = (over = {}) => ({ standards: T2, modelKey: 'fast', index: 0, ...over })

  it('빠른 모드: Sonnet 5.5·medium·2,000토큰·timeout 150초, future:v6:fast: 키로 캐시', async () => {
    routeModel()
    const first = await generateFuture(req())
    expect(first.cached).toBe(false)
    const [params, opts] = cardCalls()[0]
    expect(params).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 2000, output_config: { effort: 'medium' } })
    expect(opts).toEqual({ timeout: 150_000, maxRetries: 1 })
    const key = `future:v6:fast:${T2_KEYS.join('|')}#0`
    expect(futureCacheKey('fast', [...T2_KEYS].reverse(), 0)).toBe(key)
    expect(db.upserts.map((u) => u.key)).toContain(key)
    const second = await generateFuture(req({ standards: [...T2].reverse() }))
    expect(second).toEqual({ future: first.future, cached: true })
    expect(cardCalls()).toHaveLength(1)
  })
  it('정밀 모드: Opus 5.5·medium·6,000토큰, 캐시 키가 모델별로 나뉜다', async () => {
    routeModel()
    await generateFuture(req({ modelKey: 'precise' }))
    expect(cardCalls()[0][0]).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 6000, output_config: { effort: 'medium' } })
    expect(FUTURE_MODELS).toEqual({ fast: { id: 'claude-sonnet-5-5', maxTokens: 2000, effort: 'medium' }, precise: { id: 'claude-opus-5-5', maxTokens: 6000, effort: 'medium' } })
    expect(db.upserts.some((u) => u.key.startsWith('future:v6:precise:'))).toBe(true)
    await generateFuture(req({ modelKey: 'fast' }))
    expect(cardCalls()).toHaveLength(2) // 모델이 다르면 다시 만든다
    await generateFuture(req({ modelKey: 'fast', index: 1 }))
    expect(cardCalls()).toHaveLength(3) // 번호가 다르면 다시 만든다
  })
  it('화면 데이터 형식(1부 §4-7)을 그대로 돌려준다', async () => {
    routeModel({ card: goodCard({ activity: '학생들이 학교 주변 하천에서 집중호우 흔적을 기록한다.', light: ['S1'] }) })
    const { future } = await generateFuture(req({ index: 5 }))
    expect(Object.keys(future)).toEqual(['index', 'lens_label', 'title', 'activity', 'product', 'pitch', 'axis', 'light_keys', 'model', 'keys'])
    expect(future).toMatchObject({
      index: 5, lens_label: '데이터 탐구', title: '집중호우와 도시화 비교 지도',
      activity: '학교 주변 하천에서 집중호우 흔적을 기록한다.', axis: ['도시 침수 위험'],
      light_keys: [T2_SORTED[0].key], model: 'claude-sonnet-5-5', keys: T2_KEYS,
    })
    expect(future.pitch).toBe(`${future.activity} ${future.product}`)
  })
  it('같은 조합의 연결 찾기 결과를 기다려 프롬프트에 넣는다(진행 중이면 공유)', async () => {
    routeModel({ bridge: () => new Promise((r) => setTimeout(() => r(textResponse(bridgeReply(T2_SORTED, T2_KEYWORDS, T2_LINKS))), 15)) })
    const [br, f0, f1] = await Promise.all([generateBridges({ standards: T2 }), generateFuture(req()), generateFuture(req({ index: 1 }))])
    expect(bridgeCalls()).toHaveLength(1)
    expect(br.bridges.concepts).toHaveLength(3)
    expect(f0.future.axis).toEqual(['도시 침수 위험'])
    const prompts = cardCalls().map(promptOf)
    expect(prompts[0]).toBe(buildFuturePrompt(T2_SORTED, 0, [], T2_BRIDGES))
    expect(prompts.find((p) => p.includes("'재해 대응 발표' 연결을 먼저 검토"))).toBeTruthy() // index 1의 우선 축
    expect(f1.future.index).toBe(1)
  })
  it('연결 찾기가 실패해도 카드는 연결 없이 만들고, 그 카드는 캐시하지 않는다', async () => {
    routeModel({ bridge: '실패', card: goodCard({ axis: undefined }) })
    const r = await generateFuture(req({ index: 1 }))
    expect(r.future.axis).toEqual([])
    const prompt = promptOf(cardCalls()[0])
    expect(prompt).not.toContain('## 연결 지도')
    expect(prompt).not.toContain('axis')
    expect(db.upserts.some((u) => u.key.startsWith('future:v6:'))).toBe(false)
    const again = await generateFuture(req({ index: 1 }))
    expect(again.cached).toBe(false)
  })
  it('C1 실패는 1회 다시 생성, 두 번 다 실패하면 502(§6-7 문구)', async () => {
    routeModel({ card: ['잠시만요', goodCard()] })
    expect((await generateFuture(req())).future.title).toBe('집중호우와 도시화 비교 지도')
    expect(cardCalls()).toHaveLength(2)

    _clearFuturesMemCache(); db.cache.clear(); sdk.create.mockReset()
    routeModel({ card: '{"title": "제목만"}' })
    const err = await generateFuture(req()).catch((e) => e)
    expect(err).toBeInstanceOf(FutureError)
    expect(err.status).toBe(502)
    expect(err.message).toBe('수업 아이디어를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
    expect(cardCalls()).toHaveLength(2)
  })
  it('거절 응답이면 422(§6-7 문구)', async () => {
    routeModel({ card: { stop_reason: 'refusal', content: [] } })
    const err = await generateFuture(req()).catch((e) => e)
    expect(err.status).toBe(422)
    expect(err.message).toBe('AI가 이 조합으로는 수업 아이디어를 만들지 않았습니다. 다른 성취기준으로 시도해 주세요.')
  })
  it('C6 첫 시도의 설명이 120자를 넘으면 한 번 다시 만들고, 두 번째는 자르지 않고 받아들인다', async () => {
    const longAct = `학교 주변 하천과 배수로에서 집중호우 뒤 물이 고이는 곳을 ${'꼼꼼히 '.repeat(20)}기록한다.`
    const second = goodCard({ activity: longAct, product: '기록을 지도로 만들어 학생회에 건의문과 함께 낸다.' })
    routeModel({ card: [goodCard({ activity: longAct, product: '지도로 만들어 학급에 낸다.' }), second] })
    const { future } = await generateFuture(req())
    expect(cardCalls()).toHaveLength(2)
    expect(future.pitch.length).toBeGreaterThan(120)
    expect(future.pitch).toBe(`${longAct} 기록을 지도로 만들어 학생회에 건의문과 함께 낸다.`) // 문장을 중간에서 자르지 않음
  })
  it('C6 제목 30자 초과·비중 절반 초과도 다시 만든다(첫 시도에만)', async () => {
    routeModel({ card: [goodCard({ title: '가'.repeat(31) }), goodCard({ title: '나'.repeat(31) }), goodCard()] })
    expect((await generateFuture(req())).future.title).toBe('나'.repeat(31))
    expect(cardCalls()).toHaveLength(2)

    _clearFuturesMemCache(); db.cache.clear(); sdk.create.mockReset()
    routeModel({ card: [goodCard({ light: ['S1', 'S2', 'S3'] }), goodCard({ light: ['S2'] })] })
    expect((await generateFuture(req())).future.light_keys).toEqual([T2_SORTED[1].key])
    expect(cardCalls()).toHaveLength(2)
  })
  it('C6 두 성취기준 조합에서 하나가 빠지면 다시 만든다', async () => {
    const pair = [GEO, KGEO]
    const sorted = [...pair].sort(byKey)
    routeModel({ bridge: bridgeReply(sorted, T2_KEYWORDS.slice(0, 2), T2_LINKS.slice(0, 1)), card: [goodCard({ light: ['S2'] }), goodCard()] })
    const { future } = await generateFuture({ standards: pair, modelKey: 'fast', index: 0 })
    expect(cardCalls()).toHaveLength(2)
    expect(future.light_keys).toEqual([])
  })
  it('C7 두 번째 시도의 설명이 200자를 넘으면 마지막으로 끝난 문장까지만 남긴다', async () => {
    const act = `${'하천 주변을 걸으며 '.repeat(9)}집중호우 흔적을 기록한다.`
    const prod = `${'지도와 사진을 묶어 '.repeat(9)}학생회에 낸다.`
    routeModel({ card: [goodCard({ activity: act }), goodCard({ activity: act, product: prod })] })
    const { future } = await generateFuture(req())
    expect(`${act} ${prod}`.length).toBeGreaterThan(200)
    expect(future.pitch).toBe(act)
  })
  it('다시 만든 두 번째가 C1에 실패하면 C1을 통과한 첫 결과를 사용한다', async () => {
    routeModel({ card: [goodCard({ title: '가'.repeat(31) }), '깨진 응답'] })
    const { future } = await generateFuture(req())
    expect(future.title).toBe('가'.repeat(31))
    expect(cardCalls()).toHaveLength(2)
  })
  it('DB 캐시에 있으면 생성하지 않는다', async () => {
    const cachedCard = { index: 0, lens_label: '학교 생활', title: '캐시 카드' }
    db.cache.set(futureCacheKey('fast', T2_KEYS, 0), cachedCard)
    expect(await generateFuture(req())).toEqual({ future: cachedCard, cached: true })
    expect(sdk.create).not.toHaveBeenCalled()
  })
  it('DB가 없어도 생성하고, 같은 요청은 메모리 캐시로 돌려준다', async () => {
    db.fail = true
    routeModel()
    expect((await generateFuture(req())).future.title).toBeTruthy()
    const calls = sdk.create.mock.calls.length
    expect((await generateFuture(req())).cached).toBe(true)
    expect(sdk.create.mock.calls.length).toBe(calls)
  })
  it('같은 요청이 동시에 오면 카드도 연결 찾기도 한 번만 생성한다', async () => {
    let release
    routeModel({ card: () => new Promise((resolve) => { release = () => resolve(textResponse(goodCard())) }) })
    const a = generateFuture(req())
    const b = generateFuture(req({ standards: [...T2].reverse() }))
    await new Promise((r) => setTimeout(r, 20))
    release()
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.future).toEqual(rb.future)
    expect(cardCalls()).toHaveLength(1)
    expect(bridgeCalls()).toHaveLength(1)
  })
  it('서버 전체 동시 생성 수는 큐 상한을 넘지 않는다(기본 80, 채팅과 API 한도 공유 보호)', async () => {
    expect(futuresQueue.concurrency).toBe(Number(process.env.FUTURES_QUEUE_CONCURRENCY) || 80)
    const saved = futuresQueue.concurrency
    futuresQueue.concurrency = 2
    db.cache.set(bridgeCacheKey(T2_KEYS), T2_BRIDGES)
    let active = 0, peak = 0
    sdk.create.mockImplementation(async () => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 15))
      active--
      return textResponse(goodCard())
    })
    try {
      const results = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map((index) => generateFuture(req({ index }))))
      expect(results.map((r) => r.future.lens_label)).toEqual(FUTURE_LENSES.map((l) => l.label))
      expect(sdk.create).toHaveBeenCalledTimes(8)
      expect(peak).toBe(2)
    } finally {
      futuresQueue.concurrency = saved
    }
  })
  it('서버 오류 문구는 §6-7 그대로다', () => {
    expect(FUTURE_MESSAGES.cardFailed).toBe('수업 아이디어를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
    expect(FUTURE_MESSAGES.bridgeFailed).toBe('키워드 연결을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.')
    // 1부 §6-9 금지어가 서버 문구에 없다
    const banned = ['자리', '별자리', '타임스톤', '스톤', '마방진', '마법진', '갈래', '그리는', '그리기', '그리지', '그립니다', '꼭지', '만나는 지점', '성운', '솔직한 메모']
    const all = Object.values(FUTURE_MESSAGES).map((m) => (typeof m === 'function' ? m('X') : m)).join(' ')
    for (const w of banned) expect(all).not.toContain(w)
  })
})
