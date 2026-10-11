/**
 * 성취기준 라우트 — 입력 상한과 권한
 * - semantic-search: 로그인 필요, 검색어 200자 상한, 형식 오류 400
 * - recommend-ai: 교과 최대 6개·각 50자, topic·boardContext 문자열 500자 상한, 형식 오류 400
 * - links/scenario: angle 전체 해시를 캐시 키에 사용(앞부분이 같은 다른 angle이 키를 공유하지 않음)
 * - project/:id/companions: 프로젝트 멤버만
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// 인증: Authorization 헤더가 있을 때만 통과(라우트에 requireAuth가 붙었는지 확인용)
vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
    req.user = { id: 'teacher' }
    next()
  },
}))

const state = vi.hoisted(() => ({
  project: { id: 'p1', workspace_id: 'w1' },
  role: 'editor',
  scenarioKeys: [],
  prompts: [],
  semanticCalls: [],
}))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async () => state.project),
  getMemberRole: vi.fn(async () => state.role),
  getStandardsByProject: vi.fn(async () => []),
}))

vi.mock('../../services/semanticSearch.js', async (importOriginal) => ({
  ...(await importOriginal()),
  semanticSearch: vi.fn(async (q) => { state.semanticCalls.push(q); return [] }),
}))

vi.mock('../../lib/standardsValidator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  validateCode: (code) => ({ valid: true, matched: { code, subject: '과목', content: `${code} 내용` } }),
  getStandardsForSubjects: (subjects) => ({
    standards: subjects.map((s, i) => ({ code: `[S${i}-01]`, subject: s, content: `${s} 내용` })),
  }),
}))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_col, key) => ({
          maybeSingle: async () => {
            state.scenarioKeys.push(key)
            return { data: { scenario: { title: '캐시된 장면' } } }
          },
        }),
      }),
    }),
  },
}))

vi.mock('../../lib/anthropicClient.js', () => ({
  getAnthropic: () => ({
    messages: {
      create: async ({ messages }) => {
        state.prompts.push(messages[0].content)
        return { content: [{ type: 'text', text: '```json\n{"selected":[]}\n```' }], usage: {}, stop_reason: 'end_turn' }
      },
    },
  }),
}))
vi.mock('../../lib/aiUsage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  recordUsage: vi.fn(),
}))

const { standardsRouter, parseRecommendAiInput, scenarioCacheKey, SEMANTIC_QUERY_MAX_CHARS } = await import('../standards.js')
const { getMemberRole } = await import('../../lib/supabaseService.js')

const app = express()
app.use(express.json())
app.use('/api/standards', standardsRouter)
const AUTH = { Authorization: 'Bearer test' }

beforeEach(() => {
  state.project = { id: 'p1', workspace_id: 'w1' }
  state.role = 'editor'
  state.scenarioKeys = []
  state.prompts = []
  state.semanticCalls = []
  vi.mocked(getMemberRole).mockClear()
})

describe('GET /semantic-search', () => {
  it('로그인하지 않으면 401 (유료 임베딩 호출 없음)', async () => {
    const res = await request(app).get('/api/standards/semantic-search').query({ q: '기후' })
    expect(res.status).toBe(401)
    expect(state.semanticCalls).toHaveLength(0)
  })

  it(`검색어가 ${SEMANTIC_QUERY_MAX_CHARS}자를 넘으면 400`, async () => {
    const res = await request(app).get('/api/standards/semantic-search').set(AUTH).query({ q: '가'.repeat(SEMANTIC_QUERY_MAX_CHARS + 1) })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('query_too_long')
    expect(state.semanticCalls).toHaveLength(0)
  })

  it('검색어가 배열이면(q=a&q=b) 400', async () => {
    const res = await request(app).get('/api/standards/semantic-search?q=a&q=b').set(AUTH)
    expect(res.status).toBe(400)
  })

  it('200자 이내면 검색한다', async () => {
    const res = await request(app).get('/api/standards/semantic-search').set(AUTH).query({ q: '가'.repeat(SEMANTIC_QUERY_MAX_CHARS) })
    expect(res.status).toBe(200)
    expect(state.semanticCalls).toHaveLength(1)
  })
})

describe('parseRecommendAiInput', () => {
  it('정상 입력: 교과 중복 제거, 앞에서부터 최대 6개', () => {
    const r = parseRecommendAiInput({ subjects: ['수학', '과학', '수학', '정보', '국어', '영어', '사회', '미술'], grade: '고1' })
    expect(r.ok).toBe(true)
    expect(r.value.subjects).toEqual(['수학', '과학', '정보', '국어', '영어', '사회'])
    expect(r.value.grade).toBe('고1')
  })

  it('긴 topic·vision·selectedTopic은 500자까지만 쓴다(화면이 보내는 1,000자 비전도 거절하지 않는다)', () => {
    const r = parseRecommendAiInput({
      subjects: ['수학'],
      topic: '주'.repeat(800),
      boardContext: { vision: '비'.repeat(1000), selectedTopic: '선'.repeat(600), prep: { grade: '고1' } },
    })
    expect(r.ok).toBe(true)
    expect(r.value.topic).toHaveLength(500)
    expect(r.value.boardContext.vision).toHaveLength(500)
    expect(r.value.boardContext.selectedTopic).toHaveLength(500)
    expect(r.value.boardContext.prep).toEqual({ grade: '고1' })
  })

  it.each([
    [{}, '교과'],
    [{ subjects: '수학' }, '교과'],
    [{ subjects: [] }, '교과'],
    [{ subjects: [1] }, '문자열'],
    [{ subjects: ['  '] }, '문자열'],
    [{ subjects: ['가'.repeat(51)] }, '50자'],
    [{ subjects: Array.from({ length: 31 }, (_, i) => `과목${i}`) }, '너무 많'],
    [{ subjects: ['수학'], topic: { $gt: '' } }, 'topic'],
    [{ subjects: ['수학'], grade: 3 }, 'grade'],
    [{ subjects: ['수학'], boardContext: 'x' }, 'boardContext'],
    [{ subjects: ['수학'], boardContext: { vision: ['a'] } }, 'vision'],
    [{ subjects: ['수학'], boardContext: { prep: 'x' } }, 'prep'],
  ])('형식 오류 %j → 거절', (body, hint) => {
    const r = parseRecommendAiInput(body)
    expect(r.ok).toBe(false)
    expect(r.error).toContain(hint)
  })
})

describe('POST /recommend-ai', () => {
  it('형식이 틀리면 400이고 AI를 부르지 않는다', async () => {
    const res = await request(app).post('/api/standards/recommend-ai').set(AUTH).send({ subjects: [{ x: 1 }] })
    expect(res.status).toBe(400)
    expect(state.prompts).toHaveLength(0)
  })

  it('프롬프트에는 상한까지 자른 값만 들어간다', async () => {
    const res = await request(app).post('/api/standards/recommend-ai').set(AUTH).send({
      subjects: ['수학', '과학'],
      topic: 'T'.repeat(900),
      boardContext: { vision: 'V'.repeat(1000) },
    })
    expect(res.status).toBe(200)
    expect(state.prompts).toHaveLength(1)
    const prompt = state.prompts[0]
    expect(prompt).toContain(`주제: ${'T'.repeat(500)}\n`)
    expect(prompt).not.toContain('T'.repeat(501))
    expect(prompt).toContain(`팀 비전: ${'V'.repeat(500)}\n`)
    expect(prompt).not.toContain('V'.repeat(501))
  })
})

describe('시나리오 캐시 키', () => {
  it('angle이 없으면 예전과 같은 키(코드 정렬 결합)', () => {
    expect(scenarioCacheKey(['[B]', '[A]'], '')).toBe('[A]|[B]')
  })

  it('앞부분이 같은 서로 다른 angle은 다른 키를 쓴다', () => {
    const preset = '지방선거·공직선거의 여론조사 결과와 실제 득표의 차이(표본·응답 편향)'
    const k1 = scenarioCacheKey(['[A]', '[B]'], preset)
    const k2 = scenarioCacheKey(['[A]', '[B]'], `${preset.slice(0, 9)} 다른 방향으로`)
    expect(k1).not.toBe(k2)
    expect(k1).toMatch(/^\[A\]\|\[B\]@[0-9a-f]{16}$/)
    // 같은 angle은 언제나 같은 키(팀 간 캐시 공유)
    expect(scenarioCacheKey(['[B]', '[A]'], preset)).toBe(k1)
  })

  it('라우트가 angle 해시 키로 캐시를 조회한다', async () => {
    const angle = '지방선거 여론조사'
    const res = await request(app).post('/api/standards/links/scenario').set(AUTH)
      .send({ concept_code: '[A]', context_codes: ['[B]'], angle })
    expect(res.status).toBe(200)
    expect(state.scenarioKeys).toEqual([scenarioCacheKey(['[A]', '[B]'], angle)])
  })
})

describe('GET /project/:projectId/companions', () => {
  it('프로젝트 멤버가 아니면 403', async () => {
    state.role = null
    const res = await request(app).get('/api/standards/project/p1/companions').set(AUTH)
    expect(res.status).toBe(403)
    expect(getMemberRole).toHaveBeenCalledWith('w1', 'teacher')
  })

  it('프로젝트가 없으면 404', async () => {
    state.project = null
    const res = await request(app).get('/api/standards/project/p1/companions').set(AUTH)
    expect(res.status).toBe(404)
  })

  it('멤버면 200', async () => {
    const res = await request(app).get('/api/standards/project/p1/companions').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ companions: [] })
  })
})
