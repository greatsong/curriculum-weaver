/**
 * 온디맨드 과목쌍 AI 탐색 서비스
 *
 * 교사가 설계 모드 과목쌍 렌즈에서 링크가 없는(적은) 과목쌍을 골랐을 때,
 * 그 쌍에 대해서만 즉석으로 링크 후보를 생성한다.
 * 배치 파이프라인(scripts/generateLinksV2.mjs)의 사각지대 —
 * 임베딩 코사인 필터가 "방법 과목 × 대상 과목"(예: 확률과 통계 × 통합사회)
 * 융합쌍을 후보에서 원천 배제하는 문제 — 를 수요 기반으로 보완한다.
 *
 * 안전 설계 (안정성 최우선):
 * - 결과는 항상 status=candidate로만 적재 — published 그래프를 오염시키지 않는다.
 *   (게시는 기존 검토 경로: PATCH links/:id/status 또는 add-links 확정)
 * - 판정 프롬프트·파서는 v2 파이프라인과 동일 계열 (인덱스 참조로 코드 할루시네이션 차단)
 * - 사용자당 일일 쿼터 + 서버 전역 동시 실행 상한 + 쌍당 판정 상한 (비용 가드)
 * - 같은 쌍 재탐색 쿨다운 (성공 시에만 기록 — 실패는 재시도 가능)
 * - ANTHROPIC_API_KEY 없으면 시작 자체를 거부 (fail-closed)
 * - DB 영속화 실패 시에도 인메모리 candidate는 유지하고 persisted=false로 보고
 *   (기존 add-links와 동일한 비파괴 정책)
 */
import { randomUUID } from 'crypto'
import { getAnthropic } from '../lib/anthropicClient.js'
import { Standards, StandardLinks, resolveSchoolLevel } from '../lib/store.js'
import { persistLinks } from '../lib/linkService.js'
import { getEmbedding } from './embeddingStore.js'

const MODEL = 'claude-sonnet-5'
const LINK_TYPES = new Set(['cross_subject', 'same_concept', 'application', 'prerequisite', 'extension'])
const SCHOOL_LEVEL_ORDER = { '초등학교': 0, '중학교': 1, '고등학교': 2 }

// 비용·시간 가드
const MAX_JUDGE_PAIRS = 60        // 쌍당 판정 후보 상한 (임베딩 순위 상위 선발)
const JUDGE_BATCH_SIZE = 20       // 배치당 후보 수 (v2보다 작게 — 온디맨드 지연 최소화)
const JUDGE_CONCURRENCY = 2       // 배치 동시 실행
const JUDGE_TIMEOUT_MS = 90_000   // 배치당 API 타임아웃
const DAILY_USER_QUOTA = 10       // 사용자당 하루 탐색 횟수
const MAX_RUNNING_JOBS = 2        // 서버 전역 동시 탐색 잡 상한
const JOB_TTL_MS = 30 * 60 * 1000            // 완료/실패 잡 보존 시간
const EXPLORED_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 같은 쌍 재탐색 쿨다운 (성공 시)

// ─── 인메모리 상태 (서버 재시작 시 초기화 — 쿼터·쿨다운은 보수적 가드일 뿐, 정합성 데이터 아님) ───
const jobs = new Map()          // jobId -> job
const runningPairKeys = new Map() // pairKey -> jobId (동일 쌍 동시 실행 방지 + 합류)
const exploredPairs = new Map() // pairKey -> { at, accepted }
const userQuotas = new Map()    // userId -> { day, count }

// 테스트 주입 지점 (프로덕션에서는 null → 실제 judgeBatch 사용)
let _judgeOverride = null
export function _setJudgeBatchForTests(fn) { _judgeOverride = fn }
export function _resetForTests() {
  jobs.clear(); runningPairKeys.clear(); exploredPairs.clear(); userQuotas.clear()
  _judgeOverride = null
}
export function _getUserQuotaForTests(userId) { return userQuotas.get(userId) || null }

function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

export function normalizePairKey(subjectA, subjectB) {
  return [subjectA, subjectB].sort((a, b) => a.localeCompare(b, 'ko')).join('|')
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/** 사용자 일일 쿼터 확인 + 차감. 초과 시 throw. */
function consumeQuota(userId) {
  const day = todayKey()
  const q = userQuotas.get(userId)
  if (!q || q.day !== day) {
    userQuotas.set(userId, { day, count: 1 })
    return
  }
  if (q.count >= DAILY_USER_QUOTA) {
    throw httpError(429, 'quota_exceeded', `AI 탐색 일일 한도(${DAILY_USER_QUOTA}회)를 모두 사용했습니다. 내일 다시 시도해주세요.`)
  }
  q.count += 1
}

/** 잡 실패 시 쿼터 반환 (실패가 사용자 한도를 잠식하지 않도록) */
function refundQuota(userId) {
  const q = userQuotas.get(userId)
  if (q && q.day === todayKey() && q.count > 0) q.count -= 1
}

/** 만료 잡 정리 (호출 시점 lazy 정리 — 타이머 없음) */
function pruneJobs() {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id)
  }
  for (const [key, mark] of exploredPairs) {
    if (now - mark.at > EXPLORED_COOLDOWN_MS) exploredPairs.delete(key)
  }
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

/**
 * 두 과목의 성취기준 크로스 조인 → 기존 링크 제외 → 학교급 2단계 격차 제외
 * → 임베딩 코사인 내림차순 상위 cap개 선발.
 * 임베딩이 없는 쌍은 코사인 null로 뒤에 배치하되 제외하지 않는다
 * (배치 파이프라인과 달리 "이 쌍을 보고 싶다"는 교사 의도가 명시적이므로.
 *  임베딩 스토어가 아직 비동기 로드 중이어도 순위 없이 정상 동작한다).
 * @param {(code: string) => Float32Array|null} [embLookup] - 코드별 임베딩 조회 함수
 */
export function selectCandidatePairs(stdsA, stdsB, existingPairKeys, embLookup, cap = MAX_JUDGE_PAIRS) {
  const out = []
  for (const a of stdsA) {
    const la = SCHOOL_LEVEL_ORDER[resolveSchoolLevel(a)]
    const va = embLookup ? embLookup(a.code) : null
    for (const b of stdsB) {
      if (a.code === b.code) continue
      const lb = SCHOOL_LEVEL_ORDER[resolveSchoolLevel(b)]
      // 그래프 API가 학교급 2단계 격차 링크를 표시에서 제거하므로, 생성 단계에서도 제외
      if (la !== undefined && lb !== undefined && Math.abs(la - lb) > 1) continue
      const [s, t] = a.code < b.code ? [a.code, b.code] : [b.code, a.code]
      if (existingPairKeys.has(`${s}|${t}`)) continue
      const vb = embLookup ? embLookup(b.code) : null
      const cos = va && vb ? cosine(va, vb) : null
      out.push({ a: a.code, b: b.code, cos })
    }
  }
  out.sort((x, y) => {
    if (x.cos == null && y.cos == null) return (x.a + x.b).localeCompare(y.a + y.b)
    if (x.cos == null) return 1
    if (y.cos == null) return -1
    return y.cos - x.cos
  })
  return { pairs: out.slice(0, cap), totalCandidates: out.length }
}

/**
 * 판정 프롬프트 — v2(scripts/generateLinksV2.mjs)와 동일 계열.
 * 차이: 교사가 이 두 과목의 융합을 명시적으로 원한다는 맥락 +
 * "방법·도구 적용(application)" 유형을 적극 검토하라는 지시.
 * (임베딩 유사도가 낮아도 교육적으로 성립하는 방법×대상 융합을 살리는 것이 이 서비스의 존재 이유)
 * 품질 임계(0.5 미만 reject)는 v2와 동일하게 유지 — recall만 보강, 정확도 기준은 낮추지 않는다.
 */
export function buildPairJudgePrompt(batch, stdByCode, subjectA, subjectB) {
  const pairsText = batch.map((p, i) => {
    const A = stdByCode.get(p.a), B = stdByCode.get(p.b)
    return `### 후보 ${i}
A: ${A.code} [${A.subject} · ${A.grade_group || A.school_level || ''}] ${A.content}
B: ${B.code} [${B.subject} · ${B.grade_group || B.school_level || ''}] ${B.content}`
  }).join('\n\n')

  return `당신은 한국 2022 개정 교육과정 기반 융합 수업 설계 전문가입니다.
한 교사가 「${subjectA}」와(과) 「${subjectB}」 두 과목으로 융합 수업을 설계하려고 이 과목쌍을 직접 선택했습니다.
아래 성취기준 후보 쌍들이 "실제 수업에서 함께 다루면 시너지가 나는 교육적 연결"인지 판정하세요.

## 판정 기준
- 표면적 단어 일치가 아닌 개념적·교육적 연결만 accept. 애매하면 reject.
- 두 과목의 문장이 서로 달라 보여도, 한 과목의 방법·기능(예: 통계 분석, 데이터 처리, 글쓰기, 표현 기법)을
  다른 과목의 탐구 대상·제재에 적용하는 수업이 성립하면 application 유형으로 적극 검토하세요.
  (예: 확률·통계의 자료 분석 기능으로 사회 현상 탐구하기)
- accept 시 반드시: link_type, quality(0.0~1.0), rationale(교사용 2~3문장, 어떤 수업 활동으로 연결되는지 구체적으로), integration_theme(융합 주제 한 구절), lesson_hook(수업 아이디어 한 문장)
- link_type: cross_subject(같은 현상을 다른 관점으로) | same_concept(본질적으로 동일 개념) | prerequisite(선수학습 관계) | application(한쪽 개념·기능을 다른 쪽에서 적용) | extension(심화·확장)
- quality: 0.9+=바로 수업 가능한 강한 연결, 0.7~0.8=좋은 연결, 0.5~0.6=쓸만함, 그 미만이면 reject하세요.

## 후보 쌍 목록
${pairsText}

## 응답 형식
JSON 배열만 출력. 각 원소는 반드시 위 "후보 N"의 번호 idx로만 쌍을 지칭 (성취기준 코드를 쓰지 마세요):
\`\`\`json
[
  {"idx": 0, "accept": true, "link_type": "application", "quality": 0.8, "rationale": "...", "integration_theme": "...", "lesson_hook": "..."},
  {"idx": 1, "accept": false}
]
\`\`\`
모든 후보(0~${batch.length - 1})에 대해 판정을 포함하세요.`
}

/** v2와 동일한 엄격 파서 — 불량 판정은 reject 취급, 범위 밖 인덱스 폐기 */
export function parseJudgeResponse(text, batchLen) {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\[[\s\S]*\])/)
  if (!m) throw new Error('JSON 블록 없음')
  const arr = JSON.parse(m[1])
  if (!Array.isArray(arr)) throw new Error('배열이 아님')
  const results = []
  for (const r of arr) {
    if (typeof r.idx !== 'number' || r.idx < 0 || r.idx >= batchLen) continue
    if (!r.accept) { results.push({ idx: r.idx, accept: false }); continue }
    const valid = LINK_TYPES.has(r.link_type)
      && typeof r.quality === 'number' && r.quality >= 0 && r.quality <= 1
      && typeof r.rationale === 'string' && r.rationale.trim().length >= 30
    if (!valid) { results.push({ idx: r.idx, accept: false, invalid: true }); continue }
    results.push({
      idx: r.idx, accept: true, link_type: r.link_type,
      quality: Math.round(r.quality * 100) / 100,
      rationale: r.rationale.trim(),
      integration_theme: (r.integration_theme || '').trim() || null,
      lesson_hook: (r.lesson_hook || '').trim() || null,
    })
  }
  return results
}

/** 배치 하나 판정 — 3회 재시도, 최종 실패 시 null (해당 배치만 소실, 잡은 계속) */
async function judgeBatch(batch, stdByCode, subjectA, subjectB, batchId) {
  if (_judgeOverride) return _judgeOverride(batch, stdByCode, subjectA, subjectB, batchId)
  const prompt = buildPairJudgePrompt(batch, stdByCode, subjectA, subjectB)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await getAnthropic().messages.create({
        model: MODEL, max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }, { timeout: JUDGE_TIMEOUT_MS })
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      if (!text) throw new Error(`텍스트 블록 없음 (stop_reason=${response.stop_reason})`)
      return parseJudgeResponse(text, batch.length)
    } catch (e) {
      console.warn(`[pairExplorer] 배치 ${batchId} 시도 ${attempt}/3 실패:`, e.message)
      if (attempt === 3) return null
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  return null
}

/** 실제 탐색 실행 (비동기 — 잡 상태를 갱신) */
async function runJob(job) {
  const { subjectA, subjectB, candidatePairs, stdByCode } = job._internal
  try {
    const batches = []
    for (let i = 0; i < candidatePairs.length; i += JUDGE_BATCH_SIZE) {
      batches.push(candidatePairs.slice(i, i + JUDGE_BATCH_SIZE))
    }
    const accepted = []
    let rejected = 0
    let failedBatches = 0
    let cursor = 0
    const worker = async () => {
      while (cursor < batches.length) {
        const idx = cursor++
        const batch = batches[idx]
        const results = await judgeBatch(batch, stdByCode, subjectA, subjectB, `${job.id.slice(0, 8)}-b${idx}`)
        if (!results) { failedBatches++; job.progress.done += batch.length; continue }
        for (const r of results) {
          if (!r.accept) { rejected++; continue }
          const p = batch[r.idx]
          accepted.push({
            source: p.a, target: p.b,
            link_type: r.link_type, rationale: r.rationale,
            integration_theme: r.integration_theme, lesson_hook: r.lesson_hook,
            semantic_score: p.cos != null ? Math.round(p.cos * 1000) / 1000 : null,
            quality_score: r.quality,
            status: 'candidate', generation_method: 'ai',
          })
        }
        job.progress.done += batch.length
      }
    }
    await Promise.all(Array.from({ length: Math.min(JUDGE_CONCURRENCY, batches.length) }, worker))

    // 모든 배치가 실패했으면 잡 실패 (부분 실패는 결과에 보고하고 성공 처리)
    if (batches.length > 0 && failedBatches === batches.length) {
      throw new Error('AI 판정이 모두 실패했습니다. 잠시 후 다시 시도해주세요.')
    }

    // 인메모리 candidate 적재 + DB 영속화 (add-links와 동일 정책: DB 실패해도 인메모리 유지)
    const addedLinks = accepted.length > 0 ? StandardLinks.addBulk(accepted) : []
    let persisted = true
    if (addedLinks.length > 0) {
      const persistResult = await persistLinks(addedLinks)
      persisted = persistResult.persisted
      if (!persisted && persistResult.error !== 'not_configured') {
        console.warn('[pairExplorer] DB 영속화 실패 (인메모리만 반영):', persistResult.error)
      }
    }

    exploredPairs.set(job.pairKey, { at: Date.now(), accepted: addedLinks.length })
    job.result = {
      judged: candidatePairs.length,
      accepted: addedLinks.length,
      rejected,
      failedBatches,
      persisted,
    }
    job.status = 'completed'
    console.log(`[pairExplorer] ${subjectA} × ${subjectB}: 판정 ${candidatePairs.length} → 채택 ${addedLinks.length} / 기각 ${rejected}${failedBatches ? ` / 실패 배치 ${failedBatches}` : ''}`)
  } catch (err) {
    console.error(`[pairExplorer] 잡 실패 (${subjectA} × ${subjectB}):`, err.message)
    job.status = 'failed'
    job.error = err.message
    refundQuota(job.userId)
  } finally {
    job.finishedAt = Date.now()
    runningPairKeys.delete(job.pairKey)
    delete job._internal // 대용량 내부 데이터 해제
  }
}

/**
 * 탐색 시작. 성공 시 { job } (합류 시 기존 잡), 쿨다운 시 { alreadyExplored }.
 * 검증 실패·쿼터 초과·서버 혼잡 시 status/code가 붙은 Error를 throw.
 */
export function startPairExploration({ subjectA, subjectB, userId }) {
  pruneJobs()

  if (!subjectA || !subjectB || typeof subjectA !== 'string' || typeof subjectB !== 'string') {
    throw httpError(400, 'invalid_input', 'subjectA와 subjectB가 필요합니다.')
  }
  if (subjectA === subjectB) {
    throw httpError(400, 'invalid_input', '서로 다른 두 과목을 선택해주세요.')
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw httpError(503, 'not_configured', 'AI 탐색을 사용할 수 없습니다. (서버 API 키 미설정)')
  }

  const allStandards = Standards.list()
  const stdsA = allStandards.filter((s) => s.subject === subjectA)
  const stdsB = allStandards.filter((s) => s.subject === subjectB)
  if (stdsA.length === 0) throw httpError(404, 'unknown_subject', `과목을 찾을 수 없습니다: ${subjectA}`)
  if (stdsB.length === 0) throw httpError(404, 'unknown_subject', `과목을 찾을 수 없습니다: ${subjectB}`)

  const pairKey = normalizePairKey(subjectA, subjectB)

  // 동일 쌍 실행 중이면 합류 (쿼터 소비 없음)
  const runningJobId = runningPairKeys.get(pairKey)
  if (runningJobId && jobs.get(runningJobId)?.status === 'running') {
    return { job: publicJob(jobs.get(runningJobId)), joined: true }
  }

  // 최근 탐색 쿨다운
  const mark = exploredPairs.get(pairKey)
  if (mark) {
    return { alreadyExplored: { at: mark.at, accepted: mark.accepted } }
  }

  // 전역 동시 실행 상한
  const runningCount = [...jobs.values()].filter((j) => j.status === 'running').length
  if (runningCount >= MAX_RUNNING_JOBS) {
    throw httpError(429, 'server_busy', '지금 다른 탐색이 진행 중입니다. 잠시 후 다시 시도해주세요.')
  }

  // 후보 선발
  const existingPairKeys = new Set()
  for (const l of StandardLinks.list()) {
    const [s, t] = l.source_code < l.target_code
      ? [l.source_code, l.target_code] : [l.target_code, l.source_code]
    existingPairKeys.add(`${s}|${t}`)
  }
  const { pairs: candidatePairs, totalCandidates } =
    selectCandidatePairs(stdsA, stdsB, existingPairKeys, getEmbedding)

  if (candidatePairs.length === 0) {
    // 판정할 신규 후보가 없음 (기존 링크가 전부 커버) — 쿼터 소비 없이 즉시 완료
    exploredPairs.set(pairKey, { at: Date.now(), accepted: 0 })
    return {
      alreadyExplored: { at: Date.now(), accepted: 0, noNewCandidates: true },
    }
  }

  consumeQuota(userId) // 여기서부터 쿼터 소비 (실패 시 runJob이 환불)

  const stdByCode = new Map([...stdsA, ...stdsB].map((s) => [s.code, s]))
  const job = {
    id: randomUUID(),
    pairKey,
    subjectA,
    subjectB,
    userId,
    status: 'running',
    progress: { done: 0, total: candidatePairs.length },
    totalCandidates,
    result: null,
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    _internal: { subjectA, subjectB, candidatePairs, stdByCode },
  }
  jobs.set(job.id, job)
  runningPairKeys.set(pairKey, job.id)

  // 비동기 실행 (fire-and-forget — 상태는 잡 객체로 폴링)
  runJob(job).catch((err) => {
    // runJob 내부에서 모두 처리되지만, 만약을 위한 최종 방어
    console.error('[pairExplorer] runJob 예기치 못한 오류:', err)
    job.status = 'failed'
    job.error = '탐색 처리 중 오류가 발생했습니다.'
    job.finishedAt = Date.now()
    runningPairKeys.delete(pairKey)
  })

  return { job: publicJob(job) }
}

/** 잡 조회 (내부 데이터 제외한 공개 뷰) */
export function getPairJob(jobId) {
  const job = jobs.get(jobId)
  return job ? publicJob(job) : null
}

function publicJob(job) {
  return {
    id: job.id,
    subjectA: job.subjectA,
    subjectB: job.subjectB,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
  }
}
