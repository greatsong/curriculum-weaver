/**
 * 성취기준 라우트
 *
 * 교육과정 성취기준 검색, 필터, 그래프, 프로젝트 연결 관리.
 *
 * - 검색/필터: supabaseService 우선, DB 비어있으면 로컬 데이터 폴백
 * - 그래프: 로컬 데이터 기반 (TF-IDF/UMAP 임베딩)
 * - 프로젝트 연결: 기존 session 기반 → project 기반으로 변경
 *
 * 라우트:
 * - GET  /api/standards/search                          — 성취기준 검색
 * - GET  /api/standards/subjects                        — 교과 목록
 * - GET  /api/standards/grades                          — 학년군 목록
 * - GET  /api/standards/domains                         — 영역 목록
 * - GET  /api/standards/school-levels                   — 학교급 목록
 * - GET  /api/standards/categories                      — 교육과정 구분 목록
 * - GET  /api/standards/all                             — 전체 목록
 * - GET  /api/standards/graph                           — 그래프 데이터 (로컬)
 * - GET  /api/standards/graph3d                         — 3D 쇼케이스 경량 그래프 (사전계산 좌표)
 * - GET  /api/standards/:id/links                       — 연결 조회
 * - POST /api/standards/project/:projectId              — 프로젝트에 성취기준 추가
 * - DELETE /api/standards/project/:projectId/:standardId — 프로젝트에서 제거
 * - GET  /api/standards/project/:projectId              — 프로젝트 성취기준 조회
 * - POST /api/standards/upload                          — 벌크 업로드
 * - DELETE /api/standards/all                           — 전체 초기화
 * - POST /api/standards/graph/chat                      — AI 그래프 채팅 (SSE)
 * - POST /api/standards/graph/add-links                 — AI 추천 링크 추가
 * - POST /api/standards/pairs/explore                   — 과목쌍 온디맨드 AI 탐색 시작
 * - GET  /api/standards/pairs/jobs/:jobId               — 탐색 잡 상태 폴링
 */
import { Router } from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { getAnthropic } from '../lib/anthropicClient.js'
import { Standards, StandardLinks, resolveSchoolLevel } from '../lib/store.js'
import { validateCode, getStandardsForSubjects } from '../lib/standardsValidator.js'
import { computeEmbedding3D, invalidateEmbeddingCache } from '../services/embeddings.js'
import { semanticSearch, isSemanticSearchAvailable } from '../services/semanticSearch.js'
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { persistLinks, persistLinkStatus } from '../lib/linkService.js'
import { startPairExploration, getPairJob } from '../services/pairExplorer.js'
import {
  searchStandards, getStandardsByProject,
  addStandardToProject, removeStandardFromProject, resolveStandardId,
  getProject, getMemberRole, logActivity,
} from '../lib/supabaseService.js'

export const standardsRouter = Router()

// ============================================================
// 검색/필터 엔드포인트 (supabaseService 우선, 로컬 폴백)
// ============================================================

/**
 * GET /api/standards/search
 * 성취기준 검색
 *
 * supabaseService.searchStandards로 DB 검색 시도.
 * DB가 비어있으면 로컬 인메모리 데이터 폴백.
 *
 * @query {string} [q]                    - 검색어 (내용, 코드, 키워드)
 * @query {string} [subject]              - 교과 필터
 * @query {string} [grade]                - 학년군 필터
 * @query {string} [domain]               - 영역 필터
 * @query {string} [school_level]         - 학교급 필터
 * @query {string} [curriculum_category]  - 교육과정 구분 필터
 * @returns {object[]} 검색 결과
 */
standardsRouter.get('/search', async (req, res) => {
  try {
    const { q, subject, grade, domain, school_level, curriculum_category } = req.query

    // school_level 정규화 (한글→영어, DB 호환)
    const schoolLevelMap = { '초등학교': 'elementary', '중학교': 'middle', '고등학교': 'high' }
    const normalizedLevel = schoolLevelMap[school_level] || school_level || null

    // 항상 로컬 데이터를 단일 소스로 사용 (DB/로컬 불일치 방지)
    // DB가 있어도 domain, curriculum_category 필터가 누락되는 문제를 근본적으로 해결
    const results = Standards.search({ q, subject, grade, domain, school_level, curriculum_category })
    res.json(results)
  } catch (err) {
    console.error('[standards] 검색 오류:', err.message)
    res.status(500).json({ error: '성취기준 검색에 실패했습니다.' })
  }
})

/**
 * GET /api/standards/semantic-search
 * 시맨틱 검색 — OpenAI 임베딩 기반 의미적 유사도 검색
 */
standardsRouter.get('/semantic-search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q || !q.trim()) return res.json([])

    // semanticSearch가 내부에서 로드 완료를 대기하므로(비동기 로드 도입),
    // 가용성 판정은 호출 결과로 한다 — 부팅 직후 로드 창에서 오탐 503 방지.
    const results = await semanticSearch(q.trim(), Standards.list(), 50)
    if (results === null) {
      return res.status(503).json({ error: '시맨틱 검색을 사용할 수 없습니다 (임베딩 없음)' })
    }
    res.json(results)
  } catch (err) {
    console.error('[standards] 시맨틱 검색 오류:', err.message)
    res.status(500).json({ error: '시맨틱 검색에 실패했습니다.' })
  }
})

// 교과 목록 조회
standardsRouter.get('/subjects', async (req, res) => {
  res.json(Standards.subjects())
})

// 학년군 목록 조회
standardsRouter.get('/grades', async (req, res) => {
  res.json(Standards.gradeGroups())
})

// 영역(domain) 목록
standardsRouter.get('/domains', async (req, res) => {
  res.json(Standards.domains())
})

// 학교급 목록
standardsRouter.get('/school-levels', async (req, res) => {
  res.json(Standards.schoolLevels())
})

// 교육과정 구분 목록
standardsRouter.get('/categories', async (req, res) => {
  res.json(Standards.categories())
})

// 성취기준 전체 목록
standardsRouter.get('/all', async (req, res) => {
  const { detail } = req.query
  const standards = Standards.list()
  if (detail === 'full') {
    res.json(standards)
  } else {
    // 기본 필드만 반환 (하위 호환성)
    res.json(standards.map(s => ({
      id: s.id,
      code: s.code,
      subject: s.subject,
      subject_group: s.subject_group || s.subject,
      grade_group: s.grade_group,
      area: s.area,
      content: s.content,
    })))
  }
})

// ============================================================
// 그래프 엔드포인트 (로컬 데이터 기반)
// ============================================================

// 성취기준 간 그래프 데이터 (임베딩 3D 좌표 포함)
// ?status=published (기본) | ?status=all | ?status=candidate,reviewed
// /graph 응답 메모이즈 — 노드 4,856+링크 수천 개를 매 요청 재구성하던 것을
// 링크 버전이 같으면 재사용. 링크 변경(add-links·상태 변경·하이드레이션) 시 버전이 올라 자동 무효화.
const graphResponseCache = new Map() // statusParam → { version, body }
const GRAPH_CACHE_MAX_KEYS = 8

standardsRouter.get('/graph', async (req, res) => {
  const statusKey = String(req.query.status || 'published')
  const cached = graphResponseCache.get(statusKey)
  if (cached && cached.version === StandardLinks.version()) {
    return res.json(cached.body)
  }
  const versionAtBuild = StandardLinks.version()
  const graph = StandardLinks.getGraph()
  // 임베딩 기반 3D 좌표 계산
  const allStandards = Standards.list()
  const coords = computeEmbedding3D(allStandards)
  // 노드에 초기 좌표 추가 (포스 시뮬레이션의 시작점, 고정하지 않음)
  graph.nodes = graph.nodes.map(node => {
    const pos = coords.get(node.id)
    return pos ? { ...node, x: pos.x, y: pos.y, z: pos.z } : node
  })
  // 학교급 2단계 이상 차이 나는 연결 제거 (예: 초등↔고등)
  const schoolLevelOrder = { '초등학교': 0, '중학교': 1, '고등학교': 2 }
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))
  graph.links = graph.links.filter(l => {
    const src = nodeMap.get(l.source)
    const tgt = nodeMap.get(l.target)
    if (!src || !tgt) return true // 안전: 노드 못 찾으면 유지
    const srcLevel = schoolLevelOrder[src.school_level]
    const tgtLevel = schoolLevelOrder[tgt.school_level]
    if (srcLevel === undefined || tgtLevel === undefined) return true // 분류 불가 시 유지
    return Math.abs(srcLevel - tgtLevel) <= 1 // 인접 학교급만 허용
  })
  // 링크 상태 필터링 (기본: published만)
  const statusParam = statusKey
  if (statusParam !== 'all') {
    const allowedStatuses = new Set(statusParam.split(','))
    graph.links = graph.links.filter(l => allowedStatuses.has(l.status))
  }
  if (graphResponseCache.size >= GRAPH_CACHE_MAX_KEYS) graphResponseCache.clear()
  graphResponseCache.set(statusKey, { version: versionAtBuild, body: graph })
  res.json(graph)
})

// ── 3D 쇼케이스 경량 그래프 ──
// 사전계산 좌표(scripts/compute-graph3d-layout.mjs → server/data/graph3dLayout.json)를
// 포함한 경량 페이로드. 클라이언트 force 시뮬레이션 불필요 — 접속 즉시 결정적 성운.
// 쇼케이스 정의: published + 교과군 간(cross subject_group) 연결 + 연결된 노드만.
let graph3dLayoutCache = null // { coords, computedAt } | 'missing'
function loadGraph3dLayout() {
  if (graph3dLayoutCache) return graph3dLayoutCache
  try {
    const path = fileURLToPath(new URL('../data/graph3dLayout.json', import.meta.url))
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    graph3dLayoutCache = { coords: parsed.coords || {}, computedAt: parsed.computedAt }
    console.log(`✅ graph3d 레이아웃 로드: 노드 ${Object.keys(graph3dLayoutCache.coords).length} (${parsed.computedAt})`)
  } catch {
    console.warn('⚠️ graph3dLayout.json 없음 — graph3d는 임베딩 좌표 폴백으로 동작')
    graph3dLayoutCache = 'missing'
  }
  return graph3dLayoutCache
}

// code 기반 결정적 지터 (레이아웃에 없는 신규 노드 배치용 — Math.random 금지: 결정성 유지)
function codeJitter(code, salt) {
  let h = 2166136261
  const s = code + salt
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) / 4294967295 - 0.5) * 2 // -1 ~ 1
}

let graph3dResponseCache = null // { body, version }

standardsRouter.get('/graph3d', async (req, res) => {
  const version = StandardLinks.version()
  if (graph3dResponseCache && graph3dResponseCache.version === version) {
    return res.type('application/json').send(graph3dResponseCache.body)
  }

  const graph = StandardLinks.getGraph()
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]))

  // published + 인접 학교급 + 교과군 간 연결만
  const schoolLevelOrder = { '초등학교': 0, '중학교': 1, '고등학교': 2 }
  const links = graph.links.filter(l => {
    if (l.status !== 'published') return false
    const src = nodeById.get(l.source)
    const tgt = nodeById.get(l.target)
    if (!src || !tgt) return false
    if ((src.subject_group || src.subject) === (tgt.subject_group || tgt.subject)) return false
    const srcLevel = schoolLevelOrder[src.school_level]
    const tgtLevel = schoolLevelOrder[tgt.school_level]
    if (srcLevel !== undefined && tgtLevel !== undefined && Math.abs(srcLevel - tgtLevel) > 1) return false
    return true
  })

  const linkedIds = new Set()
  links.forEach(l => { linkedIds.add(l.source); linkedIds.add(l.target) })

  const layout = loadGraph3dLayout()
  const layoutCoords = layout === 'missing' ? {} : layout.coords
  // 레이아웃에 없는 노드 폴백용 임베딩 좌표 (기존 캐시 재사용, prod 캐시 미스 시 빈 Map)
  const embeddingCoords = computeEmbedding3D(Standards.list())

  const nodes = []
  for (const n of graph.nodes) {
    if (!linkedIds.has(n.id)) continue
    let pos = layoutCoords[n.code]
    if (!pos) {
      const emb = embeddingCoords.get(n.id)
      pos = emb
        ? [emb.x, emb.y, emb.z]
        : [codeJitter(n.code, 'x') * 150, codeJitter(n.code, 'y') * 150, codeJitter(n.code, 'z') * 150]
    }
    nodes.push({
      code: n.code,
      subject: n.subject,
      subject_group: n.subject_group || n.subject,
      // school_level 빈값(수학·국어·정보 등 다수)은 grade_group으로 유추 보강
      // (빈값이면 클라 학교급 필터에서 전부 감광되는 버그의 원인)
      school_level: n.school_level || resolveSchoolLevel(n) || '',
      grade_group: n.grade_group || '',
      area: n.area || '',
      content: n.content || '',
      x: pos[0], y: pos[1], z: pos[2],
    })
  }

  const idToCode = new Map(graph.nodes.map(n => [n.id, n.code]))
  const outLinks = links.map(l => ({
    s: idToCode.get(l.source),
    t: idToCode.get(l.target),
    type: l.link_type,
    theme: l.integration_theme || null,
    hook: l.lesson_hook || null,
    r: l.rationale || null,
  }))

  const body = JSON.stringify({
    nodes,
    links: outLinks,
    meta: {
      layout: layout === 'missing' ? 'embedding-fallback' : 'precomputed',
      computedAt: layout === 'missing' ? null : layout.computedAt,
    },
  })
  graph3dResponseCache = { body, version }
  res.type('application/json').send(body)
})

/**
 * POST /api/standards/links/report
 * "이 연결이 이상해요" 신고 — 검토 큐(link_reports)에 기록만 하고
 * 링크 자체는 절대 건드리지 않는다 (자동 강등 없음, 관리자 검토 후 결정).
 * 같은 사용자의 같은 링크 중복 신고는 멱등 처리.
 */
standardsRouter.post('/links/report', requireAuth, async (req, res) => {
  try {
    const { source_code, target_code, reason } = req.body || {}
    const src = validateCode(source_code)
    const tgt = validateCode(target_code)
    if (!src.valid || !tgt.valid) {
      return res.status(400).json({ error: '유효하지 않은 성취기준 코드입니다.' })
    }
    const a = src.matched.code
    const b = tgt.matched.code
    if (a === b) return res.status(400).json({ error: '같은 성취기준끼리는 신고할 수 없습니다.' })
    // curriculum_links와 동일한 정규화 (source < target)
    const [sourceCode, targetCode] = a < b ? [a, b] : [b, a]

    const { error } = await supabaseAdmin.from('link_reports').upsert({
      source_code: sourceCode,
      target_code: targetCode,
      reporter_id: req.user.id,
      reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
    }, { onConflict: 'source_code,target_code,reporter_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)

    console.log(`[standards] 링크 신고: ${sourceCode} ↔ ${targetCode} (by ${req.user.id})`)
    res.json({ ok: true })
  } catch (err) {
    console.error('[standards] 링크 신고 오류:', err.message)
    res.status(500).json({ error: '신고 접수에 실패했습니다.' })
  }
})

/**
 * GET /api/standards/links/reports
 * 신고 검토 큐 (관리자 전용) — 미처리 신고를 (source, target) 쌍으로 그룹핑해
 * 링크 메타(품질·근거)와 성취기준 내용을 병합해 반환한다.
 */
standardsRouter.get('/links/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from('link_reports')
      .select('id, source_code, target_code, reporter_id, reason, created_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)

    // (source|target) 쌍으로 그룹핑
    const byPair = new Map()
    for (const r of rows) {
      const key = `${r.source_code}|${r.target_code}`
      if (!byPair.has(key)) byPair.set(key, { source_code: r.source_code, target_code: r.target_code, reports: [] })
      byPair.get(key).reports.push({ id: r.id, reason: r.reason, created_at: r.created_at })
    }

    // 링크 메타 + 성취기준 내용 병합 (인메모리 — 추가 왕복 없음)
    const allLinks = StandardLinks.list()
    const linkByPair = new Map(allLinks.map(l => {
      const [a, b] = l.source_code < l.target_code ? [l.source_code, l.target_code] : [l.target_code, l.source_code]
      return [`${a}|${b}`, l]
    }))
    const items = [...byPair.entries()].map(([key, g]) => {
      const link = linkByPair.get(key)
      const src = Standards.getByCode(g.source_code)
      const tgt = Standards.getByCode(g.target_code)
      return {
        ...g,
        source: src ? { subject: src.subject, content: src.content } : null,
        target: tgt ? { subject: tgt.subject, content: tgt.content } : null,
        link: link ? {
          status: link.status,
          link_type: link.link_type,
          rationale: link.rationale,
          quality_score: link.quality_score,
          semantic_score: link.semantic_score,
        } : null, // 링크가 이미 삭제/미등재면 null
      }
    })
    res.json({ items, total: rows.length })
  } catch (err) {
    console.error('[standards] 신고 목록 오류:', err.message)
    res.status(500).json({ error: '신고 목록 조회에 실패했습니다.' })
  }
})

/**
 * PATCH /api/standards/links/reports/resolve
 * 신고 쌍 처리 (관리자 전용) — body { source_code, target_code, action }
 *  - action 'demote':  링크를 candidate로 강등(그래프에서 내려감) + 해당 쌍 신고 전체 처리 표시
 *  - action 'dismiss': 링크는 그대로 두고 신고만 처리 표시 (문제없음 판정)
 */
standardsRouter.patch('/links/reports/resolve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { source_code, target_code, action } = req.body || {}
    if (!['demote', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: "action은 'demote' 또는 'dismiss'여야 합니다." })
    }
    const [a, b] = source_code < target_code ? [source_code, target_code] : [target_code, source_code]

    let demoted = false
    if (action === 'demote') {
      const link = StandardLinks.list().find(l => {
        const [x, y] = l.source_code < l.target_code ? [l.source_code, l.target_code] : [l.target_code, l.source_code]
        return x === a && y === b
      })
      if (link && link.status === 'published') {
        link.status = 'candidate'
        StandardLinks.bumpVersion() // 스토어 우회 직접 변이 — 그래프 캐시 수동 무효화
        const persistResult = await persistLinkStatus(link.source_code, link.target_code, 'candidate')
        if (!persistResult.persisted && persistResult.error !== 'not_configured') {
          console.warn('[standards] 신고 강등 DB 영속화 실패:', persistResult.error)
        }
        demoted = true
      }
    }

    const { error } = await supabaseAdmin
      .from('link_reports')
      .update({ resolved_at: new Date().toISOString() })
      .eq('source_code', a).eq('target_code', b)
      .is('resolved_at', null)
    if (error) throw new Error(error.message)

    console.log(`[standards] 신고 처리: ${a} ↔ ${b} (${action}${demoted ? ', 강등됨' : ''})`)
    res.json({ ok: true, demoted })
  } catch (err) {
    console.error('[standards] 신고 처리 오류:', err.message)
    res.status(500).json({ error: '신고 처리에 실패했습니다.' })
  }
})

// 링크 상태 변경 (관리자 전용 — 인증+권한 필수)
standardsRouter.patch('/links/:linkId/status', requireAuth, requireAdmin, async (req, res) => {
  const { linkId } = req.params
  const { status } = req.body
  const validStatuses = ['candidate', 'reviewed', 'published']
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `유효하지 않은 상태: ${status}` })
  }
  const allLinks = StandardLinks.list()
  const link = allLinks.find(l => l.id === linkId)
  if (!link) {
    return res.status(404).json({ error: '링크를 찾을 수 없습니다.' })
  }
  link.status = status
  if (status === 'reviewed' || status === 'published') {
    link.reviewed_at = new Date().toISOString()
  }
  StandardLinks.bumpVersion() // 그래프 응답 캐시 무효화
  // DB 영속화 (서버 재시작 시 상태 리셋 방지)
  const persistResult = await persistLinkStatus(link.source_code, link.target_code, status)
  if (!persistResult.persisted && persistResult.error !== 'not_configured') {
    console.warn('[standards] 링크 상태 DB 영속화 실패:', persistResult.error)
  }
  res.json({ ok: true, link, persisted: persistResult.persisted })
})

// ============================================================
// 과목쌍 온디맨드 AI 탐색 (설계 모드 PairLens)
// ============================================================

/**
 * POST /api/standards/pairs/explore
 * 두 과목 사이의 링크 후보를 즉석 생성 (임베딩 순위 상위 후보 → LLM 판정 → candidate 적재).
 *
 * 인증 필수. requireAdmin이 아닌 이유: 결과가 항상 candidate라 published 그래프를
 * 오염시키지 않고, 사용자 일일 쿼터·전역 동시 실행 상한으로 비용이 방어된다.
 * (published 승격은 기존 관리자 검토 경로 유지)
 *
 * @body {{ subjectA: string, subjectB: string }}
 * @returns 202 { job } — 잡 시작(또는 진행 중 잡에 합류)
 * @returns 200 { alreadyExplored } — 최근 탐색 쿨다운 (재판정 불필요)
 */
standardsRouter.post('/pairs/explore', requireAuth, async (req, res) => {
  try {
    const { subjectA, subjectB } = req.body || {}
    const result = startPairExploration({ subjectA, subjectB, userId: req.user.id })
    if (result.alreadyExplored) {
      return res.json({ alreadyExplored: result.alreadyExplored })
    }
    res.status(202).json({ job: result.job, joined: result.joined || false })
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code })
    }
    console.error('[standards] 과목쌍 탐색 시작 오류:', err.message)
    res.status(500).json({ error: 'AI 탐색을 시작하지 못했습니다.' })
  }
})

/**
 * GET /api/standards/pairs/jobs/:jobId
 * 탐색 잡 상태 폴링. 완료 시 클라이언트가 그래프를 다시 불러온다.
 */
standardsRouter.get('/pairs/jobs/:jobId', requireAuth, async (req, res) => {
  const job = getPairJob(req.params.jobId)
  if (!job) return res.status(404).json({ error: '탐색 작업을 찾을 수 없습니다. (만료되었을 수 있습니다)' })
  res.json({ job })
})

// 특정 성취기준의 연결 조회
standardsRouter.get('/:id/links', async (req, res) => {
  const links = StandardLinks.getByStandard(req.params.id)
  res.json(links)
})

// ============================================================
// 프로젝트 기반 성취기준 연결 (기존 세션 기반 대체)
// ============================================================

/**
 * GET /api/standards/recommend
 * 교과+학년+주제 기반 성취기준 자동 추천
 *
 * @query {string} subjects - 교과 목록 (쉼표 구분, 예: "국어,수학")
 * @query {string} grade - 학년 텍스트 (예: "중학교 2학년")
 * @query {string} [topic] - 주제 키워드 (관련도 순 정렬에 사용)
 */
standardsRouter.get('/recommend', async (req, res) => {
  try {
    const { subjects: subjectsStr, grade, topic } = req.query
    if (!subjectsStr) {
      return res.status(400).json({ error: '교과(subjects)는 필수입니다.' })
    }

    const subjects = subjectsStr.split(',').map(s => s.trim()).filter(Boolean)
    const { standards } = getStandardsForSubjects(subjects, grade || '')

    // 주제 키워드가 있으면 관련도 점수 부여 후 정렬
    let results = standards
    if (topic && topic.trim()) {
      const keywords = topic.trim().split(/\s+/)
      const scored = results.map(s => {
        let score = 0
        const text = `${s.content} ${s.area || ''} ${(s.keywords || []).join(' ')} ${s.explanation || ''}`.toLowerCase()
        for (const kw of keywords) {
          if (text.includes(kw.toLowerCase())) score += 10
        }
        return { ...s, _relevance: score }
      })
      scored.sort((a, b) => b._relevance - a._relevance)
      results = scored
    }

    res.json({
      recommendations: results,
      total: results.length,
      subjects,
      grade: grade || null,
      topic: topic || null,
    })
  } catch (err) {
    console.error('[standards] 추천 오류:', err.message)
    res.status(500).json({ error: '성취기준 추천에 실패했습니다.' })
  }
})

/**
 * GET /api/standards/project/:projectId/companions
 * 프로젝트에 이미 선택된 성취기준들과 "융합 궁합이 좋은" 성취기준 추천.
 * 검증된 published 링크(quality ≥ 0.7)의 상대편을 quality 내림차순으로 반환 — LLM 호출 없음(무료·즉시).
 * 프로젝트 학교급(선택 성취기준 최빈값)으로 필터해 고교 프로젝트에 타 학교급 추천이 섞이지 않게 한다.
 *
 * @query {number} [limit=12]
 */
standardsRouter.get('/project/:projectId/companions', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params
    const limit = Math.min(Number(req.query.limit) || 12, 30)

    const projectStandards = await getStandardsByProject(projectId).catch(() => [])
    const stds = projectStandards.map((s) => s.curriculum_standards || s).filter((s) => s?.code)
    if (stds.length === 0) return res.json({ companions: [] })

    const codes = stds.map((s) => s.code)
    const levelCounts = new Map()
    for (const s of stds) {
      const lvl = resolveSchoolLevel(s)
      if (lvl) levelCounts.set(lvl, (levelCounts.get(lvl) || 0) + 1)
    }
    const projectLevel = [...levelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null

    const results = StandardLinks.getCompanionsForCodes(codes, {
      status: 'published',
      minQuality: 0.7,
      limit,
      schoolLevel: projectLevel,
    })

    res.json({
      companions: results.map(({ link, anchorCode, companion }) => ({
        anchorCode,
        companion: {
          id: companion.id,
          code: companion.code,
          subject: companion.subject,
          subject_group: companion.subject_group || companion.subject,
          school_level: companion.school_level || '',
          grade_group: companion.grade_group || '',
          content: companion.content,
        },
        link: {
          link_type: link.link_type,
          rationale: link.rationale || '',
          integration_theme: link.integration_theme || null,
          lesson_hook: link.lesson_hook || null,
          quality_score: link.quality_score ?? null,
        },
      })),
      projectLevel,
    })
  } catch (err) {
    console.error('[standards] 궁합 추천 오류:', err.message)
    res.status(500).json({ error: '궁합 성취기준 추천에 실패했습니다.' })
  }
})

/**
 * POST /api/standards/project/:projectId/bulk
 * 프로젝트에 성취기준 일괄 추가
 *
 * @param {string} projectId
 * @body {{ standard_ids: string[] }}
 */
standardsRouter.post('/project/:projectId/bulk', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params
    const { standard_ids, standard_codes } = req.body

    // code 우선(권장), 레거시 standard_ids 호환
    const refs = Array.isArray(standard_codes) && standard_codes.length > 0
      ? standard_codes.map((c) => ({ code: c }))
      : Array.isArray(standard_ids) ? standard_ids.map((id) => ({ id })) : []

    if (refs.length === 0) {
      return res.status(400).json({ error: 'standard_codes(또는 standard_ids) 배열이 필요합니다.' })
    }

    const project = await getProject(projectId)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role || role === 'viewer') {
      return res.status(403).json({ error: '성취기준 추가 권한이 없습니다.' })
    }

    let added = 0
    for (const ref of refs) {
      try {
        const resolvedId = await resolveStandardId(ref)
        if (!resolvedId) continue
        await addStandardToProject(projectId, resolvedId, req.user.id, false)
        added++
      } catch (e) {
        // 중복 등 무시
      }
    }

    console.log(`[standards] 일괄 추가: ${added}/${refs.length}개 → 프로젝트 ${projectId}`)
    res.status(201).json({ ok: true, added, total: refs.length })
  } catch (err) {
    console.error('[standards] 일괄 추가 오류:', err.message)
    res.status(500).json({ error: '성취기준 일괄 추가에 실패했습니다.' })
  }
})

/**
 * POST /api/standards/project/:projectId
 * 프로젝트에 성취기준 추가
 *
 * 인증 필수. 프로젝트의 워크스페이스 멤버(editor 이상)만 가능.
 *
 * @param {string} projectId - 프로젝트 ID
 * @body {{ standard_id: string, is_primary?: boolean }}
 */
standardsRouter.post('/project/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params
    const { standard_id, standard_code, is_primary } = req.body

    if (!standard_id && !standard_code) {
      return res.status(400).json({ error: 'standard_code(또는 standard_id)는 필수입니다.' })
    }

    // 프로젝트 존재 + 멤버십 확인
    const project = await getProject(projectId)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
    }
    if (role === 'viewer') {
      return res.status(403).json({ error: '성취기준 추가 권한이 없습니다. (editor 이상 필요)' })
    }

    // 검색 결과의 휘발성 로컬 id를 code로 실제 standard id로 정규화
    const resolvedId = await resolveStandardId({ code: standard_code, id: standard_id })
    if (!resolvedId) {
      return res.status(404).json({ error: '해당 성취기준을 찾을 수 없습니다.' })
    }

    await addStandardToProject(projectId, resolvedId, req.user.id, is_primary || false)

    // 활동 로그 기록 (실패해도 본 작업에 영향 없음)
    try {
      await logActivity({
        project_id: projectId,
        user_id: req.user.id,
        action_type: 'standard_added',
        after_data: { standard_id: resolvedId, standard_code: standard_code || null, is_primary: is_primary || false },
      })
    } catch (logErr) {
      console.warn('[standards] 활동 로그 기록 실패 (본 작업은 성공):', logErr.message)
    }

    res.status(201).json({ ok: true, message: '성취기준이 추가되었습니다.' })
  } catch (err) {
    console.error('[standards] 프로젝트 성취기준 추가 오류:', err.message)
    res.status(500).json({ error: '성취기준 추가에 실패했습니다.' })
  }
})

/**
 * DELETE /api/standards/project/:projectId/:standardId
 * 프로젝트에서 성취기준 제거
 *
 * @param {string} projectId - 프로젝트 ID
 * @param {string} standardId - 성취기준 ID
 */
standardsRouter.delete('/project/:projectId/:standardId', requireAuth, async (req, res) => {
  try {
    const { projectId, standardId } = req.params

    // 프로젝트 존재 + 멤버십 확인
    const project = await getProject(projectId)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
    }
    if (role === 'viewer') {
      return res.status(403).json({ error: '성취기준 제거 권한이 없습니다. (editor 이상 필요)' })
    }

    // 경로 파라미터는 code(권장) 또는 레거시 id일 수 있으므로 실제 id로 정규화
    const resolvedId = await resolveStandardId({ code: standardId, id: standardId })
    await removeStandardFromProject(projectId, resolvedId || standardId)

    // 활동 로그 기록 (실패해도 본 작업에 영향 없음)
    try {
      await logActivity({
        project_id: projectId,
        user_id: req.user.id,
        action_type: 'standard_removed',
        after_data: { standard_id: standardId },
      })
    } catch (logErr) {
      console.warn('[standards] 활동 로그 기록 실패 (본 작업은 성공):', logErr.message)
    }

    res.json({ ok: true, message: '성취기준이 제거되었습니다.' })
  } catch (err) {
    console.error('[standards] 프로젝트 성취기준 제거 오류:', err.message)
    res.status(500).json({ error: '성취기준 제거에 실패했습니다.' })
  }
})

/**
 * GET /api/standards/project/:projectId
 * 프로젝트에 연결된 성취기준 목록 조회
 *
 * @param {string} projectId - 프로젝트 ID
 * @returns {object[]} 성취기준 목록 (is_primary, added_by, added_at 포함)
 */
standardsRouter.get('/project/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params

    // 프로젝트 존재 + 멤버십 확인
    const project = await getProject(projectId)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
    }

    const standards = await getStandardsByProject(projectId)
    res.json(standards)
  } catch (err) {
    console.error('[standards] 프로젝트 성취기준 조회 오류:', err.message)
    res.status(500).json({ error: '성취기준 조회에 실패했습니다.' })
  }
})

// ============================================================
// 벌크 업로드/초기화 (관리용, 기존 유지)
// ============================================================

// 성취기준 벌크 업로드 (관리자 전용)
standardsRouter.post('/upload', requireAuth, requireAdmin, async (req, res) => {
  const { standards: items, links } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'standards 배열이 필요합니다.' })
  }

  // 필수 필드 검증
  for (const item of items) {
    if (!item.code || !item.subject || !item.content) {
      return res.status(400).json({ error: 'code, subject, content는 필수입니다.' })
    }
  }

  const addedStandards = Standards.addBulk(items)
  StandardLinks.bumpVersion() // 노드 집합 변경 — 그래프 응답 캐시 무효화
  let addedLinks = []
  if (Array.isArray(links) && links.length > 0) {
    addedLinks = StandardLinks.addBulk(links)
  }

  // 데이터 변경 시 임베딩 캐시 무효화
  if (addedStandards.length > 0) invalidateEmbeddingCache()

  res.status(201).json({
    message: `성취기준 ${addedStandards.length}개, 연결 ${addedLinks.length}개 추가됨`,
    standards_count: addedStandards.length,
    links_count: addedLinks.length,
  })
})

/**
 * POST /api/standards/refresh
 * 디스크에서 성취기준 데이터를 다시 로드 (서버 재시작 없이 갱신)
 *
 * 사용 시나리오:
 *   1. ETL 스크립트로 standards_full.js 재생성
 *   2. 이 엔드포인트 호출 → 인메모리 인덱스 갱신
 */
standardsRouter.post('/refresh', requireAuth, requireAdmin, async (req, res) => {
  try {
    const count = Standards.reload()
    // 임베딩 캐시도 무효화
    invalidateEmbeddingCache()
    res.json({ success: true, count, message: `성취기준 ${count}개 로드 완료` })
  } catch (err) {
    console.error('[standards] refresh 오류:', err.message)
    res.status(500).json({ error: '성취기준 데이터 갱신에 실패했습니다.' })
  }
})

// 성취기준 전체 초기화 (관리자 전용)
standardsRouter.delete('/all', requireAuth, requireAdmin, async (req, res) => {
  Standards.clear()
  invalidateEmbeddingCache()
  res.json({ ok: true, message: '모든 성취기준과 연결이 초기화되었습니다.' })
})

// ============================================================
// ============================================================
// AI 기반 성취기준 추천 (프로젝트 컨텍스트 기반)
// ============================================================

/**
 * POST /api/standards/recommend-ai
 * AI가 프로젝트 컨텍스트를 분석하여 적합한 성취기준을 추천
 *
 * 사용 시점: A-2-1 진입 시, 또는 교사가 "AI 추천" 버튼 클릭 시
 */
standardsRouter.post('/recommend-ai', requireAuth, async (req, res) => {
  const { projectId, subjects, grade, topic, boardContext } = req.body

  if (!subjects || !Array.isArray(subjects) || subjects.length < 1) {
    return res.status(400).json({ error: '교과(subjects) 배열이 필요합니다.' })
  }

  try {
    // 1. 교과+학년으로 후보군 필터링
    const { standards: candidates } = getStandardsForSubjects(subjects, grade || '')
    if (candidates.length === 0) {
      return res.json({ recommendations: [], message: '해당 교과/학년의 성취기준이 없습니다.' })
    }

    // 2. 후보군을 AI에게 전달 — "이 프로젝트에 적합한 성취기준을 선택하라"
    const candidateText = candidates.map(s =>
      `${s.code} [${s.subject}] ${s.content}`
    ).join('\n')

    // 후보 간 검증된 교과 연결 — "서로 연결되는 기준 세트" 단위 추천을 유도
    const gradeLevel = /고등|고교|고\s*[1-3]/.test(grade || '') ? '고등학교'
      : /중학|중\s*[1-3]/.test(grade || '') ? '중학교'
      : /초등/.test(grade || '') ? '초등학교' : null
    const candidateLinks = StandardLinks.getLinksAmongCodes(
      candidates.map(s => s.code),
      { status: 'published', minQuality: 0.7, limit: 12, schoolLevel: gradeLevel }
    )
    const linkBoostText = candidateLinks.length > 0
      ? `\n## 검증된 교과 간 연결 (선별 시 가중 참고)
아래 쌍은 임베딩+AI 판정 파이프라인을 통과한 실제 연결입니다. 양끝 성취기준을 함께 선택하면 융합 설계가 유리하므로, 다른 기준이 비슷하다면 이 쌍을 우선하세요.
${candidateLinks.map(l => {
        const wrap = (c) => (String(c).startsWith('[') ? c : `[${c}]`)
        return `- ${wrap(l.source_code)}↔${wrap(l.target_code)}${l.integration_theme ? ` 주제: ${l.integration_theme}` : ''}${l.quality_score != null ? ` (q${Number(l.quality_score).toFixed(2)})` : ''}`
      }).join('\n')}\n`
      : ''

    // 프로젝트 컨텍스트 구성
    const contextParts = []
    if (topic) contextParts.push(`주제: ${topic}`)
    if (boardContext?.prep) contextParts.push(`학습자 맥락: ${JSON.stringify(boardContext.prep).slice(0, 500)}`)
    if (boardContext?.vision) contextParts.push(`팀 비전: ${boardContext.vision}`)
    if (boardContext?.selectedTopic) contextParts.push(`선정 주제: ${boardContext.selectedTopic}`)

    const aiPrompt = `당신은 2022 개정 교육과정 기반 융합수업 설계 전문가입니다.
아래 프로젝트에 가장 적합한 성취기준을 교과별 3~5개씩 선별하세요.

## 프로젝트 정보
교과: ${subjects.join(', ')}
학년: ${grade || '미정'}
${contextParts.join('\n')}

## 선별 기준 (5가지 — 모두 고려할 것)
1. **내용 연계성**: 주제의 핵심 개념·지식과 직접 관련되는가
2. **과정·기능 융합 가능성**: 다른 교과와 공유 가능한 탐구 과정을 포함하는가
3. **교과 간 시너지**: 교과 A의 산출이 교과 B의 입력이 되는 관계가 있는가
4. **핵심 아이디어 연결**: 단원의 빅아이디어가 주제와 맞닿는가
5. **학습 경험의 실제성**: 학생이 실제 프로젝트 활동으로 체험 가능한가
${linkBoostText}
## 사용 가능한 성취기준 (${candidates.length}개) — 이 목록에서만 선택!
${candidateText}

## 응답 형식
각 성취기준을 선택한 이유를 기준 번호(1~5)와 함께 설명하세요.
\`\`\`json
{
  "selected": [
    { "code": "[코드]", "reason": "기준 1,3: 이유 설명" }
  ]
}
\`\`\``

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: aiPrompt }],
    })

    const aiText = response.content[0]?.text || ''

    // 3. AI 응답에서 코드 추출 → DB 검증 → 유효한 것만 반환
    let selected = []
    try {
      const jsonMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/)
      const parsed = JSON.parse(jsonMatch ? jsonMatch[1].trim() : aiText.trim())
      selected = parsed.selected || []
    } catch {
      // JSON 파싱 실패 시 코드만 추출
      const codeMatches = aiText.match(/\[[\d\w가-힣 ]+-[\d]+-[\d]+\]/g) || []
      selected = codeMatches.map(code => ({ code, reason: '' }))
    }

    // 4. DB 검증 — 존재하는 코드만 유지
    const verified = []
    for (const item of selected) {
      const result = validateCode(item.code)
      if (result.valid) {
        verified.push({
          ...result.matched,
          _reason: item.reason,
        })
      }
    }

    console.log(`[standards] AI 추천: ${selected.length}개 선택 → ${verified.length}개 검증 통과`)

    res.json({
      recommendations: verified,
      total: verified.length,
      candidateCount: candidates.length,
    })
  } catch (err) {
    console.error('[standards] AI 추천 오류:', err.message)
    res.status(500).json({ error: 'AI 성취기준 추천에 실패했습니다.' })
  }
})

// ============================================================
// AI 그래프 채팅 (SSE 스트리밍, 기존 유지)
// ============================================================

/**
 * POST /api/standards/graph/chat
 * 그래프 탐색 AI 채팅 (SSE 스트리밍)
 *
 * AI가 전체 성취기준과 연결 데이터를 읽고, 새로운 교과 간 연결을 추천.
 */
standardsRouter.post('/graph/chat', requireAuth, async (req, res) => {
  const { message, history = [], context = {} } = req.body
  if (!message?.trim()) {
    return res.status(400).json({ error: '메시지가 필요합니다.' })
  }

  // 사용자 입력 길이 제한 (프롬프트 인젝션 방어)
  if (message.length > 5000) {
    return res.status(400).json({ error: '메시지가 너무 깁니다. (최대 5,000자)' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // 클라이언트 disconnect 감지 — AI 토큰 낭비 방지
  let clientDisconnected = false
  req.on('close', () => {
    clientDisconnected = true
  })

  try {
    const allStandards = Standards.list()
    const graph = StandardLinks.getGraph()

    // 토큰 예산 제한: 시스템 프롬프트를 ~50K 문자 이내로
    const MAX_PROMPT_CHARS = 50000

    // ===== 1. 현재 그래프에 표시된 노드/연결 (최우선 컨텍스트) =====
    let visibleSection = ''
    if (context.visibleNodes?.length > 0) {
      const visibleNodesSummary = context.visibleNodes.map(n => {
        let line = `  ${n.code} [${n.subject}/${n.grade_group}/${n.area}]`
        if (n.school_level) line += ` {${n.school_level}}`
        line += ` — ${n.content}`
        return line
      }).join('\n')

      let visibleLinksSummary = ''
      if (context.visibleLinks?.length > 0) {
        visibleLinksSummary = context.visibleLinks.map(l =>
          `  ${l.source} ↔ ${l.target} [${l.link_type}] ${l.rationale || ''}`
        ).join('\n')
      }

      visibleSection = `
★★★ [현재 그래프에 표시된 노드 — ${context.visibleNodes.length}개] ★★★
교사가 지금 화면에서 보고 있는 성취기준입니다. 이 노드들을 우선적으로 참조하세요.
${visibleNodesSummary}
${visibleLinksSummary ? `
[현재 보이는 연결 — ${context.visibleLinks.length}개]
${visibleLinksSummary}` : '[현재 보이는 연결 없음]'}
`
    }

    // ===== 2. 포커스 교과군의 추가 성취기준 (보이지 않는 것 포함) =====
    const focusSubjectGroups = new Set()
    if (context.selectedNode) {
      focusSubjectGroups.add(context.selectedNode.subject_group || context.selectedNode.subject)
    }
    if (context.filterSubjects?.length > 0) {
      context.filterSubjects.forEach(s => focusSubjectGroups.add(s))
    }

    // 보이는 노드의 코드 세트 (중복 제외용)
    const visibleCodes = new Set((context.visibleNodes || []).map(n => n.code))

    let additionalStandardsSection = ''
    if (focusSubjectGroups.size > 0) {
      const additional = allStandards.filter(s =>
        focusSubjectGroups.has(s.subject_group || s.subject) && !visibleCodes.has(s.code)
      )
      if (additional.length > 0) {
        const schoolLevels = context.schoolLevel || []
        const filtered = schoolLevels.length > 0
          ? additional.filter(s => schoolLevels.includes(s.school_level))
          : additional
        const summary = filtered.slice(0, 100).map(s =>
          `${s.code} [${s.subject}] ${s.content}`
        ).join('\n')
        additionalStandardsSection = `
[같은 교과군의 추가 성취기준 — ${filtered.length}개${filtered.length > 100 ? ' (상위 100개)' : ''}]
그래프에 표시되지 않았지만 새 연결 제안 시 참고할 수 있는 성취기준입니다.
${summary}`
      }
    }

    // ===== 3. 전체 교과군 요약 (간략) =====
    const groupCounts = new Map()
    allStandards.forEach(s => {
      const g = s.subject_group || s.subject
      groupCounts.set(g, (groupCounts.get(g) || 0) + 1)
    })
    const overviewSection = `[전체 교과군 요약 — 총 ${allStandards.length}개 성취기준]\n` +
      [...groupCounts.entries()].map(([g, cnt]) => `${g}: ${cnt}개`).join(', ')

    // ===== 4. 시스템 프롬프트 조립 =====
    let systemPrompt = `당신은 2022 개정 교육과정의 교과 간 연결 탐색 전문 AI입니다.

교사가 성취기준 그래프를 탐색하고 있습니다. 교사의 질문에 대해:
1. 현재 그래프에 표시된 성취기준과 연결을 분석하고 설명합니다.
2. 아직 발견되지 않은 새로운 교과 간 연결 가능성을 제안합니다.
3. 특정 주제나 역량 중심의 융합 수업 아이디어를 제시합니다.

한국어로 응답하며, 존댓말을 사용합니다. 성취기준 코드를 반드시 포함해서 답변하세요.

새로운 연결을 제안할 때는 다음 JSON 형식을 사용하세요:
<new_links>
[{"source":"[코드]","target":"[코드]","link_type":"cross_subject","rationale":"연결 근거","integration_theme":"두 성취기준을 묶는 융합 주제(예: 에너지와 환경)","lesson_hook":"이 연결로 만들 수 있는 수업 아이디어 한 줄"}]
</new_links>

- integration_theme: 두 성취기준을 관통하는 융합 주제(명사구, 10자 내외).
- lesson_hook: 학생이 두 교과를 함께 다루며 수행할 구체적 활동 한 줄.
  표면적 키워드 일치가 아니라, 과정·기능을 공유하거나 한 교과 산출물이 다른 교과 입력이 되는 실제 융합만 제안하세요.

link_type 종류: cross_subject(교과연계), same_concept(동일개념), prerequisite(선수학습), application(적용), extension(확장)
같은 교과군 내 연결은 제안하지 마세요. 교과군 간 융합만 다룹니다.
${visibleSection}${context.selectedNode ? `
[교사가 선택한 노드]
${context.selectedNode.code} [${context.selectedNode.subject}/${context.selectedNode.area}] — ${context.selectedNode.content}${context.neighborCodes?.length > 0 ? `\n현재 연결: ${context.neighborCodes.join(', ')}` : ''}
→ 이 성취기준을 중심으로 답변해주세요.` : ''}${context.filterSubjects ? `
[교사의 교과 필터] ${context.filterSubjects.join(' × ')}${context.schoolLevel ? ` / 학교급: ${context.schoolLevel.join(', ')}` : ''}` : ''}
${additionalStandardsSection}
${overviewSection}`

    // 프롬프트 크기 초과 시 잘라내기 (안전장치)
    if (systemPrompt.length > MAX_PROMPT_CHARS) {
      console.warn(`시스템 프롬프트 크기 초과: ${systemPrompt.length}자 → ${MAX_PROMPT_CHARS}자로 잘라냄`)
      systemPrompt = systemPrompt.slice(0, MAX_PROMPT_CHARS) + '\n\n[컨텍스트가 길어 일부 생략됨]'
    }

    console.log(`[graph/chat] 프롬프트 크기: ${systemPrompt.length}자, 포커스: ${[...focusSubjectGroups].join(',') || '전체'}, 연결: ${graph.links.length}개`)

    const messages = []
    // history 각 항목의 content를 5000자로 캡 (최근 6개 × 5000자 상한)
    for (const msg of history.slice(-6)) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: String(msg.content || '').slice(0, 5000),
      })
    }
    messages.push({ role: 'user', content: message })

    let fullResponse = ''
    const stream = getAnthropic().messages.stream({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    })

    for await (const event of stream) {
      if (clientDisconnected) {
        stream.controller?.abort()
        break
      }
      if (event.type === 'content_block_delta' && event.delta?.text) {
        fullResponse += event.delta.text
        res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`)
      }
    }

    // <new_links> 추출
    const linkMatch = fullResponse.match(/<new_links>\s*([\s\S]*?)\s*<\/new_links>/)
    if (linkMatch) {
      try {
        const newLinks = JSON.parse(linkMatch[1])
        res.write(`data: ${JSON.stringify({ type: 'new_links', links: newLinks })}\n\n`)
      } catch (e) {
        console.warn('새 링크 JSON 파싱 실패:', e.message)
      }
    }

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (error) {
    console.error('그래프 AI 채팅 오류:', error?.message || error)
    const errMsg = error?.status === 401 ? 'API 키가 유효하지 않습니다.'
      : error?.status === 429 ? 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
      : error?.status === 400 ? 'AI 요청 처리 중 오류가 발생했습니다.'
      : '응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    res.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

// AI가 추천한 링크를 실제로 추가하는 엔드포인트 (관리자 전용)
standardsRouter.post('/graph/add-links', requireAuth, requireAdmin, async (req, res) => {
  const { links } = req.body
  if (!Array.isArray(links) || links.length === 0) {
    return res.status(400).json({ error: '추가할 링크 배열이 필요합니다.' })
  }

  // 성취기준 코드 존재 여부 검증 (할루시네이션 방지)
  const invalidCodes = []
  for (const link of links) {
    const srcResult = validateCode(link.source)
    const tgtResult = validateCode(link.target)
    if (!srcResult.valid) invalidCodes.push({ code: link.source, type: 'source', suggestion: srcResult.suggestion?.code })
    if (!tgtResult.valid) invalidCodes.push({ code: link.target, type: 'target', suggestion: tgtResult.suggestion?.code })
  }
  if (invalidCodes.length > 0) {
    return res.status(400).json({
      error: '존재하지 않는 성취기준 코드가 포함되어 있습니다.',
      invalidCodes,
    })
  }

  // 사용자가 명시적으로 추가한 링크 — 검토·게시 절차를 거친 것으로 간주해 published로 노출
  // (기본값 candidate면 기본 그래프(published 필터)에서 추가 직후에도 보이지 않는 문제)
  const added = StandardLinks.addBulk(links.map(l => ({ ...l, status: l.status || 'published' })))

  // DB 영속화 (실패해도 인메모리 추가는 유지 — 응답에 persisted로 보고)
  const persistResult = added.length > 0 ? await persistLinks(added) : { persisted: true, count: 0 }
  if (!persistResult.persisted && persistResult.error !== 'not_configured') {
    console.warn('[standards] add-links DB 영속화 실패 (인메모리만 반영):', persistResult.error)
  }

  res.status(201).json({
    message: `${added.length}개 연결 추가됨`,
    count: added.length,
    persisted: persistResult.persisted,
  })
})
