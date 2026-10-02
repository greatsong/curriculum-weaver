/**
 * 미래 보기 생성기 테스트 — 요청 검증, 프롬프트, 응답 파싱, 캐시·재시도·거절 처리.
 * Anthropic·Supabase는 mock. 성취기준은 실제 정본(initStore)을 쓴다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  resolveFutureRequest, buildFuturePrompt, parseFuture, generateFuture, FutureError, clampPitch,
  FUTURE_LENSES, FUTURE_MODELS, futuresQueue, buildBridgePrompt, parseBridges, generateBridges, BRIDGE_MODEL, _clearFuturesMemCache,
} from '../futuresGenerator.js'

initStore()

// 서로 다른 교과에서 3개 고른다(실제 정본)
const picks = []
for (const s of Standards.list()) {
  if (!picks.some((p) => p.subject === s.subject)) picks.push(s)
  if (picks.length === 3) break
}
const keys = picks.map((s) => s.key)

const goodJson = (extra = {}) => JSON.stringify({
  title: '우리 동네 침수 위험 지도 만들기',
  pitch: '학생들이 동네 하천을 걸으며 침수 흔적을 지도에 표시한다. 기상 자료로 위험한 곳을 골라 구청에 제안한다.',
  honesty_note: '',
  ...extra,
})
const textResponse = (text, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text }] })

beforeEach(() => {
  sdk.create.mockReset()
  _clearFuturesMemCache()
  db.cache.clear()
  db.fail = false
  db.upserts = []
})

describe('요청 검증', () => {
  it('성취기준 2~6개, 모델, 번호를 검증한다', () => {
    expect(resolveFutureRequest({ codes: keys, model: 'fast', index: 0 }).standards).toHaveLength(3)
    expect(resolveFutureRequest({ codes: keys.slice(0, 1), index: 0 }).error).toMatch('2~6')
    const extra = Standards.list().filter((s) => !keys.includes(s.key)).slice(0, 4).map((s) => s.key)
    expect(resolveFutureRequest({ codes: [...keys, ...extra], index: 0 }).error).toMatch('2~6')
    expect(resolveFutureRequest({ codes: [...keys, '[없는코드-99]'], index: 0 }).error).toMatch('찾을 수 없는')
    expect(resolveFutureRequest({ codes: keys, index: 30 }).error).toMatch('미래 번호')
    expect(resolveFutureRequest({ codes: keys, index: -1 }).error).toMatch('미래 번호')
  })
  it('중복은 하나로 합치고, 모르는 모델 값은 빠른 모드로 둔다', () => {
    const r = resolveFutureRequest({ codes: [keys[0], keys[0], keys[1]], model: 'hacked', index: '2' })
    expect(r.standards).toHaveLength(2)
    expect(r.modelKey).toBe('fast')
    expect(r.index).toBe(2)
  })
})

describe('프롬프트', () => {
  it('모든 성취기준과 번호별 관점을 담고, 연결 없는 쌍을 밝힌다', () => {
    const p0 = buildFuturePrompt(picks, 0, [])
    for (const s of picks) expect(p0).toContain(s.code)
    expect(p0).toContain(FUTURE_LENSES[0].scene)
    expect(p0).toContain(FUTURE_LENSES[0].output)
    expect(p0).toContain('검증된 연결이 없는 쌍: S1-S2, S1-S3, S2-S3')
    expect(buildFuturePrompt(picks, 1, [])).toContain(FUTURE_LENSES[1].scene)
    expect(FUTURE_LENSES).toHaveLength(8)
    expect(buildFuturePrompt(picks, FUTURE_LENSES.length, [])).toContain('2회차')
  })
  it('긴 수업 계획 대신 2문장 100자 이내의 짧은 카드를 요구한다', () => {
    const p = buildFuturePrompt(picks, 0, [])
    expect(p).toContain('100자 이내')
    expect(p).toContain('차시 계획·단계·평가 방법·자료 목록은 쓰지 마세요')
    expect(p).not.toContain('activity_steps')
    expect(p).not.toContain('"axis"') // 연결 지도가 없으면 축도 묻지 않는다
  })
  it('검증된 연결의 근거를 넣는다', () => {
    const p = buildFuturePrompt(picks, 0, [{ source_code: keys[0], target_code: keys[1], rationale: '근거A', integration_theme: '주제A' }])
    expect(p).toContain('S1–S2')
    expect(p).toContain('근거A')
    expect(p).toContain('검증된 연결이 없는 쌍: S1-S3, S2-S3')
  })
})

describe('응답 파싱', () => {
  it('제목·설명·축을 읽는다 (짧은 카드)', () => {
    const f = parseFuture(goodJson({ axis: ['기상 빅데이터', ' ', 3] }), picks)
    expect(f.title).toBe('우리 동네 침수 위험 지도 만들기')
    expect(f.pitch).toMatch(/^학생들이/)
    expect(f.axis).toEqual(['기상 빅데이터'])
    expect(Object.keys(f).sort()).toEqual(['axis', 'honesty_note', 'pitch', 'title'])
  })
  it('남은 S1·S2 번호를 교과와 코드로 바꾼다', () => {
    const f = parseFuture(goodJson({ honesty_note: 'S1과 S3의 연결은 약하다.' }), picks)
    expect(f.honesty_note).toBe(`${picks[0].subject} ${picks[0].code}과 ${picks[2].subject} ${picks[2].code}의 연결은 약하다.`)
  })
  it('JSON이 없거나 제목·설명이 없으면 null', () => {
    expect(parseFuture('미래를 그릴 수 없습니다', picks)).toBeNull()
    expect(parseFuture('{"title": "제목만"}', picks)).toBeNull()
    expect(parseFuture('{"title": "", "pitch": "설명"}', picks)).toBeNull()
  })
  it('설명이 길면 끝난 문장까지만 남긴다', () => {
    const long = '학생들이 하천을 조사한다. ' + '가'.repeat(150) + '를 만든다.'
    expect(clampPitch(long, 60)).toBe('학생들이 하천을 조사한다.')
    expect(clampPitch('짧은 설명이다.', 60)).toBe('짧은 설명이다.')
    expect(clampPitch('끝나지 않는 아주 긴 문장 '.repeat(10), 40)).toMatch(/…$/)
  })
})

// 성취기준 원문에서 실제 구절을 떼어 키워드로 쓴다
const quoteOf = (s, len = 6, from = 0) => s.content.replace(/\s+/g, ' ').trim().slice(from, from + len).trim()
const bridgeKey = () => `bridge:v2:${[...keys].sort().join('|')}`
const seededBridges = () => ({
  keywords: { [keys[0]]: [quoteOf(picks[0])], [keys[1]]: [quoteOf(picks[1])], [keys[2]]: [quoteOf(picks[2])] },
  concepts: [{ label: '공통 자료', ends: [{ key: keys[0], word: quoteOf(picks[0]) }, { key: keys[1], word: quoteOf(picks[1]) }], keys: [keys[0], keys[1]], why: '두 교과가 같은 자료를 다룬다.' }],
  isolated: [keys[2]],
})

describe('생성', () => {
  const req = () => resolveFutureRequest({ codes: keys, model: 'fast', index: 0 })
  // 이 묶음은 미래 생성만 본다 — 연결 개념 지도는 캐시에 미리 넣어 둔다
  beforeEach(() => { db.cache.set(bridgeKey(), seededBridges()) })

  it('생성 후 캐시에 넣고, 같은 요청은 캐시로 돌려준다', async () => {
    sdk.create.mockResolvedValue(textResponse(goodJson()))
    const first = await generateFuture(req())
    expect(first.cached).toBe(false)
    expect(first.future.pitch).toBeTruthy()
    expect(sdk.create.mock.calls[0][0].model).toBe(FUTURE_MODELS.fast.id)
    expect(sdk.create.mock.calls[0][0].output_config).toEqual({ effort: 'medium' })
    expect(db.upserts[0].key).toMatch(/^future:v5:fast:/)
    const second = await generateFuture(req())
    expect(second.cached).toBe(true)
    expect(sdk.create).toHaveBeenCalledTimes(1)
  })

  it('정밀 모드는 Opus 5.5에 effort medium으로 요청하고 캐시 키가 분리된다', async () => {
    sdk.create.mockResolvedValue(textResponse(goodJson()))
    await generateFuture(resolveFutureRequest({ codes: keys, model: 'precise', index: 0 }))
    const params = sdk.create.mock.calls[0][0]
    expect(params.model).toBe('claude-opus-5-5')
    expect(params.output_config).toEqual({ effort: 'medium' })
    expect(params.tool_choice).toBeUndefined()
    expect(db.upserts[0].key).toMatch(/^future:v5:precise:/)
  })

  it('JSON이 깨지면 한 번 다시 시도한다', async () => {
    sdk.create.mockResolvedValueOnce(textResponse('잠시만요')).mockResolvedValueOnce(textResponse(goodJson()))
    const r = await generateFuture(req())
    expect(r.future.title).toBeTruthy()
    expect(sdk.create).toHaveBeenCalledTimes(2)
  })

  it('두 번 다 실패하면 502, 거절이면 422', async () => {
    sdk.create.mockResolvedValue(textResponse('잠시만요'))
    await expect(generateFuture(req())).rejects.toMatchObject({ status: 502 })
    sdk.create.mockReset()
    sdk.create.mockResolvedValue({ stop_reason: 'refusal', content: [] })
    const err = await generateFuture(req()).catch((e) => e)
    expect(err).toBeInstanceOf(FutureError)
    expect(err.status).toBe(422)
  })

  it('DB(캐시)가 없어도 생성은 되고, 같은 요청은 메모리 캐시로 돌려준다', async () => {
    db.fail = true
    sdk.create.mockResolvedValue(textResponse(goodJson()))
    const r = await generateFuture(req())
    expect(r.future.title).toBeTruthy()
    const calls = sdk.create.mock.calls.length
    const again = await generateFuture(req())
    expect(again.cached).toBe(true)
    expect(sdk.create.mock.calls.length).toBe(calls)
  })

  it('같은 요청이 동시에 오면 생성은 한 번만 한다', async () => {
    let release
    sdk.create.mockImplementation(() => new Promise((resolve) => { release = () => resolve(textResponse(goodJson())) }))
    const a = generateFuture(req())
    const b = generateFuture(req())
    await new Promise((r) => setTimeout(r, 10))
    release()
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.future.title).toBe(rb.future.title)
    expect(sdk.create).toHaveBeenCalledTimes(1)
  })

  it('서버 전체 동시 생성 수는 큐 상한을 넘지 않는다 (채팅과 API 한도 공유 보호)', async () => {
    const saved = futuresQueue.concurrency
    futuresQueue.concurrency = 2
    let active = 0, peak = 0
    sdk.create.mockImplementation(async () => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 15))
      active--
      return textResponse(goodJson())
    })
    try {
      const results = await Promise.all([0, 1, 2, 3, 4].map((index) => generateFuture({ ...req(), index })))
      expect(results).toHaveLength(5)
      expect(sdk.create).toHaveBeenCalledTimes(5)
      expect(peak).toBe(2)
    } finally {
      futuresQueue.concurrency = saved
    }
  })
})

describe('연결 마법진 (키워드 연결)', () => {
  const standards = () => resolveFutureRequest({ codes: keys, index: 0 }).standards
  const reply = (keywords, links = []) => JSON.stringify({ keywords, links })
  const kw = (i, ...words) => ({ id: `S${i + 1}`, words })

  it('프롬프트는 원문 그대로의 키워드와 억지 연결 금지를 요구한다', () => {
    const p = buildBridgePrompt(standards())
    expect(p).toContain('원문에 있는 말을 그대로')
    expect(p).toContain('모든 키워드를 엮을 필요는 없습니다')
    expect(p).toContain("'융합'")
    picks.forEach((s, i) => expect(p).toContain(`S${i + 1}. ${s.code}`))
  })

  it('원문에 없는 키워드는 버리고, 연결의 끝은 검증된 키워드여야 한다', () => {
    const a = quoteOf(picks[0]), b = quoteOf(picks[1]), c = quoteOf(picks[2])
    const r = parseBridges(reply(
      [kw(0, a, '지어낸 키워드'), kw(1, b), kw(2, c)],
      [
        { label: '진짜 연결', ends: [{ id: 'S1', word: a }, { id: 'S2', word: b }], why: 'S1과 S2가 만난다.' },
        { label: '가짜 끝', ends: [{ id: 'S1', word: '지어낸 키워드' }, { id: 'S3', word: c }] },
        { label: '같은 성취기준끼리', ends: [{ id: 'S2', word: b }, { id: 'S2', word: b }] },
      ],
    ), standards())
    expect(r.keywords[keys[0]]).toEqual([a])
    expect(r.concepts.map((x) => x.label)).toEqual(['진짜 연결'])
    expect(r.concepts[0].ends).toEqual([{ key: keys[0], word: a }, { key: keys[1], word: b }])
    expect(r.concepts[0].why).not.toMatch(/\bS1\b/)
    expect(r.isolated).toEqual([keys[2]]) // 서버가 직접 계산
  })

  it('공백·가운뎃점 차이는 같은 말로 본다', () => {
    const spaced = quoteOf(picks[0], 8).split('').join(' ')
    const r = parseBridges(reply([kw(0, spaced), kw(1, quoteOf(picks[1]))], [{ label: '띄어 쓴 연결', ends: [{ id: 'S1', word: spaced }, { id: 'S2', word: quoteOf(picks[1]) }] }]), standards())
    expect(r.concepts).toHaveLength(1)
  })

  it('연결이 0개여도 결과로 인정하고(억지로 잇지 않음), 키워드가 하나도 없으면 null', () => {
    const r = parseBridges(reply([kw(0, quoteOf(picks[0])), kw(1, quoteOf(picks[1]))], []), standards())
    expect(r.concepts).toEqual([])
    expect(r.isolated).toHaveLength(3)
    expect(parseBridges('지도 없음', standards())).toBeNull()
    expect(parseBridges(reply([kw(0, '원문에 없는 말')]), standards())).toBeNull()
  })

  it('조합당 한 번 생성해 모델과 무관한 키로 캐시한다 (Sonnet 5.5, effort low)', async () => {
    sdk.create.mockResolvedValue(textResponse(reply([kw(0, quoteOf(picks[0])), kw(1, quoteOf(picks[1]))], [{ label: '공통 자료', ends: [{ id: 'S1', word: quoteOf(picks[0]) }, { id: 'S2', word: quoteOf(picks[1]) }] }])))
    const a = await generateBridges({ standards: standards() })
    expect(a.cached).toBe(false)
    expect(a.bridges.concepts).toHaveLength(1)
    expect(sdk.create.mock.calls[0][0]).toMatchObject({ model: BRIDGE_MODEL.id, output_config: { effort: 'low' } })
    expect(db.upserts[0].key).toBe(bridgeKey())
    const b = await generateBridges({ standards: standards() })
    expect(b.cached).toBe(true)
    expect(sdk.create).toHaveBeenCalledTimes(1)
  })

  it('미래 프롬프트에 연결 지도(양 끝 키워드)와 축 규칙이 들어가고, 응답의 axis를 읽는다', async () => {
    db.cache.set(bridgeKey(), seededBridges())
    sdk.create.mockResolvedValue(textResponse(goodJson({ axis: ['공통 자료'] })))
    const r = await generateFuture(resolveFutureRequest({ codes: keys, model: 'fast', index: 2 }))
    const prompt = sdk.create.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('## 연결 지도')
    expect(prompt).toContain(`- 공통 자료: S1「${quoteOf(picks[0])}」 · S2「${quoteOf(picks[1])}」`)
    expect(prompt).toContain('어느 연결에도 엮이지 않은 성취기준: S3')
    expect(prompt).toContain('"axis"')
    expect(r.future.axis).toEqual(['공통 자료'])
  })

  it('지도가 없으면 그 구역 없이 미래를 만든다 (지도 실패가 미래를 막지 않는다)', async () => {
    sdk.create.mockImplementation(async ({ messages }) => textResponse(messages[0].content.includes('핵심 키워드를 뽑고') ? '실패' : goodJson()))
    const r = await generateFuture(resolveFutureRequest({ codes: keys, model: 'fast', index: 1 }))
    expect(r.future.title).toBeTruthy()
    const futurePrompt = sdk.create.mock.calls.map((c) => c[0].messages[0].content).find((p) => p.includes('수업의 미래'))
    expect(futurePrompt).not.toContain('## 연결 지도')
    expect(futurePrompt).not.toContain('"axis"')
  })
})
