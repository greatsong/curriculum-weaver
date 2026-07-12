/**
 * pairExplorer 단위 테스트
 *
 * 대상:
 *   - normalizePairKey / selectCandidatePairs: 후보 선발 (기존 링크 제외, 학교급 격차 제외, 코사인 순위, 캡)
 *   - parseJudgeResponse: v2 계열 엄격 파서 (불량 판정 폐기)
 *   - startPairExploration: 입력 검증, fail-closed(API 키), 쿼터, 쿨다운, 잡 수명주기
 *
 * 외부 의존성은 vi.mock으로 차단 (Anthropic, Supabase 영속화, 임베딩 인덱스).
 * 성취기준 데이터는 실제 정본(store.js)을 사용 — 후보 선발이 실데이터에서 동작하는지 함께 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/anthropicClient.js', () => ({
  getAnthropic: () => ({ messages: { create: vi.fn(async () => { throw new Error('테스트에서 실제 API 호출 금지') }) } }),
}))

const persistLinksMock = vi.fn(async (links) => ({ persisted: true, count: links.length }))
vi.mock('../../lib/linkService.js', () => ({
  persistLinks: (links) => persistLinksMock(links),
}))

// 임베딩 조회는 테스트별로 제어 (embeddingStore.getEmbedding 대체)
const getEmbeddingMock = vi.fn(() => null)
vi.mock('../embeddingStore.js', () => ({
  getEmbedding: (code) => getEmbeddingMock(code),
}))

import {
  normalizePairKey, selectCandidatePairs, parseJudgeResponse,
  startPairExploration, getPairJob,
  _setJudgeBatchForTests, _resetForTests, _getUserQuotaForTests,
} from '../pairExplorer.js'
import { initStore, Standards, StandardLinks } from '../../lib/store.js'

// 성취기준 인메모리 스토어 채우기 (index.js 부팅과 동일 — 정본 standards.js 로드)
initStore()

/** 잡이 끝날 때까지 폴링 (judge override는 즉시 반환이므로 수 ms 내 완료) */
async function waitForJob(jobId, timeoutMs = 3000) {
  const start = Date.now()
  for (;;) {
    const job = getPairJob(jobId)
    if (job && job.status !== 'running') return job
    if (Date.now() - start > timeoutMs) throw new Error('잡 완료 대기 타임아웃')
    await new Promise((r) => setTimeout(r, 10))
  }
}

/** 실데이터에서 학교급이 같고 성취기준이 있는 서로 다른 과목 n개 선택 */
function pickHighSchoolSubjects(n) {
  const bySubject = new Map()
  for (const s of Standards.list()) {
    if ((s.school_level || '') !== '고등학교' && !/^고/.test(s.grade_group || '')) continue
    if (!bySubject.has(s.subject)) bySubject.set(s.subject, 0)
    bySubject.set(s.subject, bySubject.get(s.subject) + 1)
  }
  return [...bySubject.entries()].filter(([, c]) => c >= 3).map(([subj]) => subj).slice(0, n)
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetForTests()
  getEmbeddingMock.mockReturnValue(null)
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('normalizePairKey', () => {
  it('과목 순서와 무관하게 같은 키를 만든다', () => {
    expect(normalizePairKey('확률과 통계', '통합사회1')).toBe(normalizePairKey('통합사회1', '확률과 통계'))
  })
})

describe('selectCandidatePairs — 후보 선발', () => {
  const std = (code, subject, level, grade = '') => ({ code, subject, school_level: level, grade_group: grade })

  it('기존 링크 쌍은 제외한다 (정규화된 키 기준)', () => {
    const A = [std('[A1]', '가', '고등학교')]
    const B = [std('[B1]', '나', '고등학교'), std('[B2]', '나', '고등학교')]
    const existing = new Set([['[A1]', '[B1]'].sort().join('|')])
    const { pairs } = selectCandidatePairs(A, B, existing, null)
    expect(pairs.map((p) => `${p.a}|${p.b}`)).toEqual(['[A1]|[B2]'])
  })

  it('학교급 2단계 격차 쌍(초등↔고등)은 제외한다', () => {
    const A = [std('[A1]', '가', '초등학교')]
    const B = [std('[B1]', '나', '고등학교'), std('[B2]', '나', '중학교')]
    const { pairs } = selectCandidatePairs(A, B, new Set(), null)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].b).toBe('[B2]')
  })

  it('임베딩이 있으면 코사인 내림차순, 없으면 뒤에 배치한다', () => {
    const A = [std('[A1]', '가', '고등학교')]
    const B = [std('[B1]', '나', '고등학교'), std('[B2]', '나', '고등학교'), std('[B3]', '나', '고등학교')]
    const emb = {
      '[A1]': new Float32Array([1, 0]),
      '[B1]': new Float32Array([0.5, 0.5]), // cos ≈ 0.707
      '[B2]': new Float32Array([1, 0.1]),   // cos ≈ 0.995
      // [B3] 임베딩 없음 → cos null → 마지막
    }
    const { pairs } = selectCandidatePairs(A, B, new Set(), (code) => emb[code] || null)
    expect(pairs.map((p) => p.b)).toEqual(['[B2]', '[B1]', '[B3]'])
    expect(pairs[0].cos).toBeGreaterThan(pairs[1].cos)
    expect(pairs[2].cos).toBeNull()
  })

  it('cap을 초과하면 상위 cap개만 반환하고 전체 후보 수를 보고한다', () => {
    const A = Array.from({ length: 10 }, (_, i) => std(`[A${i}]`, '가', '고등학교'))
    const B = Array.from({ length: 10 }, (_, i) => std(`[B${i}]`, '나', '고등학교'))
    const { pairs, totalCandidates } = selectCandidatePairs(A, B, new Set(), null, 30)
    expect(totalCandidates).toBe(100)
    expect(pairs).toHaveLength(30)
  })
})

describe('parseJudgeResponse — 엄격 파서', () => {
  it('유효한 accept 판정을 파싱한다', () => {
    const text = '```json\n[{"idx":0,"accept":true,"link_type":"application","quality":0.85,"rationale":"' + 'a'.repeat(40) + '","integration_theme":"데이터로 보는 사회","lesson_hook":"통계로 사회 문제 분석"}]\n```'
    const results = parseJudgeResponse(text, 2)
    expect(results).toEqual([expect.objectContaining({ idx: 0, accept: true, link_type: 'application', quality: 0.85 })])
  })

  it('불량 판정(link_type 오류·rationale 짧음)은 reject 취급한다', () => {
    const text = '```json\n[{"idx":0,"accept":true,"link_type":"nonsense","quality":0.9,"rationale":"' + 'a'.repeat(40) + '"},{"idx":1,"accept":true,"link_type":"application","quality":0.9,"rationale":"짧음"}]\n```'
    const results = parseJudgeResponse(text, 2)
    expect(results.every((r) => !r.accept && r.invalid)).toBe(true)
  })

  it('범위 밖 인덱스는 폐기한다', () => {
    const text = '```json\n[{"idx":5,"accept":false},{"idx":0,"accept":false}]\n```'
    const results = parseJudgeResponse(text, 2)
    expect(results).toEqual([{ idx: 0, accept: false }])
  })

  it('JSON 블록이 없으면 throw한다', () => {
    expect(() => parseJudgeResponse('판정 결과가 없습니다', 2)).toThrow()
  })
})

describe('startPairExploration — 검증과 fail-closed', () => {
  it('과목이 비어 있으면 400', () => {
    expect(() => startPairExploration({ subjectA: '', subjectB: '수학', userId: 'u1' }))
      .toThrow(expect.objectContaining({ status: 400, code: 'invalid_input' }))
  })

  it('같은 과목이면 400', () => {
    expect(() => startPairExploration({ subjectA: '수학', subjectB: '수학', userId: 'u1' }))
      .toThrow(expect.objectContaining({ status: 400 }))
  })

  it('ANTHROPIC_API_KEY가 없으면 503 (fail-closed)', () => {
    delete process.env.ANTHROPIC_API_KEY
    const [a, b] = pickHighSchoolSubjects(2)
    expect(() => startPairExploration({ subjectA: a, subjectB: b, userId: 'u1' }))
      .toThrow(expect.objectContaining({ status: 503, code: 'not_configured' }))
  })

  it('존재하지 않는 과목이면 404', () => {
    expect(() => startPairExploration({ subjectA: '없는과목XYZ', subjectB: '수학', userId: 'u1' }))
      .toThrow(expect.objectContaining({ status: 404, code: 'unknown_subject' }))
  })
})

describe('startPairExploration — 잡 수명주기', () => {
  it('판정 통과 링크를 candidate로 적재하고 DB 영속화를 호출한다', async () => {
    const [a, b] = pickHighSchoolSubjects(2)
    // 첫 후보만 accept
    _setJudgeBatchForTests(async (batch) => batch.map((_, i) => (
      i === 0
        ? { idx: 0, accept: true, link_type: 'application', quality: 0.8, rationale: '두 과목의 기능과 제재가 실제 수업 활동으로 자연스럽게 결합됩니다. 프로젝트 수업에 적합합니다.', integration_theme: '테스트 융합', lesson_hook: '테스트 수업 아이디어' }
        : { idx: i, accept: false }
    )))

    const before = StandardLinks.list().length
    const { job } = startPairExploration({ subjectA: a, subjectB: b, userId: 'u1' })
    expect(job.status).toBe('running')

    const finished = await waitForJob(job.id)
    expect(finished.status).toBe('completed')
    // 배치 수(최대 3) × 배치당 1개 accept — 최소 1개는 적재
    expect(finished.result.accepted).toBeGreaterThanOrEqual(1)
    expect(finished.result.persisted).toBe(true)

    const added = StandardLinks.list().slice(before)
    expect(added.length).toBe(finished.result.accepted)
    expect(added.every((l) => l.status === 'candidate')).toBe(true)
    expect(added.every((l) => l.generation_method === 'ai')).toBe(true)
    expect(persistLinksMock).toHaveBeenCalledTimes(1)
  })

  it('완료된 쌍은 쿨다운으로 즉시 응답한다 (재판정 없음)', async () => {
    const [a, b] = pickHighSchoolSubjects(2)
    _setJudgeBatchForTests(async (batch) => batch.map((_, i) => ({ idx: i, accept: false })))
    const { job } = startPairExploration({ subjectA: a, subjectB: b, userId: 'u1' })
    await waitForJob(job.id)

    const second = startPairExploration({ subjectA: b, subjectB: a, userId: 'u2' }) // 순서 바꿔도 같은 쌍
    expect(second.alreadyExplored).toBeTruthy()
    expect(second.alreadyExplored.accepted).toBe(0)
  })

  it('판정이 전부 실패하면 잡 실패 + 쿼터 환불', async () => {
    const [a, b] = pickHighSchoolSubjects(2)
    _setJudgeBatchForTests(async () => null) // 모든 배치 실패
    const { job } = startPairExploration({ subjectA: a, subjectB: b, userId: 'u1' })
    expect(_getUserQuotaForTests('u1').count).toBe(1)

    const finished = await waitForJob(job.id)
    expect(finished.status).toBe('failed')
    expect(finished.error).toBeTruthy()
    expect(_getUserQuotaForTests('u1').count).toBe(0) // 환불
    // 실패한 쌍은 쿨다운 기록이 없어 재시도 가능
    const retry = startPairExploration({ subjectA: a, subjectB: b, userId: 'u1' })
    expect(retry.job).toBeTruthy()
  })

  it('일일 쿼터(10회) 초과 시 429', async () => {
    const subjects = pickHighSchoolSubjects(12)
    expect(subjects.length).toBeGreaterThanOrEqual(12)
    _setJudgeBatchForTests(async (batch) => batch.map((_, i) => ({ idx: i, accept: false })))
    // 서로 다른 쌍 10개 소진 (각 잡 완료를 기다려 동시 실행 상한 회피)
    for (let i = 1; i <= 10; i++) {
      const { job } = startPairExploration({ subjectA: subjects[0], subjectB: subjects[i], userId: 'quota-user' })
      await waitForJob(job.id)
    }
    expect(_getUserQuotaForTests('quota-user').count).toBe(10)
    expect(() => startPairExploration({ subjectA: subjects[1], subjectB: subjects[2], userId: 'quota-user' }))
      .toThrow(expect.objectContaining({ status: 429, code: 'quota_exceeded' }))
    // 다른 사용자는 영향 없음
    const other = startPairExploration({ subjectA: subjects[1], subjectB: subjects[2], userId: 'other-user' })
    expect(other.job).toBeTruthy()
    await waitForJob(other.job.id)
  })

  it('같은 쌍이 실행 중이면 새 잡을 만들지 않고 합류한다', async () => {
    const [a, b] = pickHighSchoolSubjects(2)
    let release
    const gate = new Promise((r) => { release = r })
    _setJudgeBatchForTests(async (batch) => { await gate; return batch.map((_, i) => ({ idx: i, accept: false })) })

    const first = startPairExploration({ subjectA: a, subjectB: b, userId: 'u1' })
    const joined = startPairExploration({ subjectA: a, subjectB: b, userId: 'u2' })
    expect(joined.joined).toBe(true)
    expect(joined.job.id).toBe(first.job.id)
    expect(_getUserQuotaForTests('u2')).toBeNull() // 합류는 쿼터 소비 없음

    release()
    await waitForJob(first.job.id)
  })
})
