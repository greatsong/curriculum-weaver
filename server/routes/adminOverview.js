/**
 * 관리자 사용 현황 — GET /api/admin/overview?days=30 (관리자 전용, 2026-10-20)
 *
 * 워크스페이스별·계정별 활동과 AI 비용(추정)을 한 번에 돌려준다. /data의 "사용 현황" 탭이 쓴다.
 *
 * 집계 규칙
 * - 교사 메시지 = messages.sender_type 'teacher'(실제 값은 teacher·ai·system).
 * - 시뮬레이션 복제 프로젝트(projects.source_project_id 있음)는 가상 교사 발화라 활동·메시지 수에서 빼고
 *   워크스페이스별 시뮬레이션 수로만 센다.
 * - 작성자(user_id)가 없는 교사 메시지(2026-04~09 예전 기록)는 워크스페이스·프로젝트 수에는 넣고
 *   계정 수에서는 빠진다. 그 수를 totals.unattributed_teacher_messages로 알린다.
 * - 마지막 활동 = 교사 메시지·보드 저장(designs.last_editor_id)·AI 호출 중 가장 최근 시각.
 * - AI 비용은 lib/aiPricing.js 단가표로 계산한 추정치다. ai_usage(00030)는 2026-10-12부터 쌓였으므로
 *   첫 기록 시각을 ai.tracking_since로 돌려준다. 실제 청구액의 정본은 각 사 콘솔이다.
 * - 승인 상태는 auth app_metadata(lib/approval.js). auth 조회가 실패해도 나머지는 돌려준다(approval=null).
 *
 * 전체 테이블을 읽으므로 기간별로 60초 캐시한다(?fresh=1이면 새로 읽는다). 단일 인스턴스 전제.
 */
import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { estimateCost } from '../lib/aiPricing.js'
import { listAllAuthUsers, approvalStatusFromAuthUser, getApprovalRequiredSince } from '../lib/approval.js'
import { summarizeUsage } from './adminUsage.js'
import { PROCEDURES, PROCEDURE_LIST, getProcedureLabel } from 'curriculum-weaver-shared/constants.js'

export const adminOverviewRouter = Router()
adminOverviewRouter.use(requireAuth, requireAdmin)

export const ALLOWED_DAYS = Object.freeze([7, 30, 90])
const DEFAULT_DAYS = 30
const CACHE_TTL_MS = 60_000
const PAGE = 1000
const MAX_ROWS = 200_000
const KST_OFFSET_MS = 9 * 3_600_000
const DAY_MS = 86_400_000
const LAST_PROCEDURE_ORDER = Math.max(...PROCEDURE_LIST.map((p) => p.order))

/** 한국 시간 날짜 키 (YYYY-MM-DD) */
export const kstDay = (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10)

/** 기간 시작 시각(ms) — 오늘을 포함해 days일 전 한국 시간 자정 */
export function windowStartMs(days, now = Date.now()) {
  const kstMs = now + KST_OFFSET_MS
  const todayMidnight = kstMs - (kstMs % DAY_MS) - KST_OFFSET_MS
  return todayMidnight - (days - 1) * DAY_MS
}

export function parseDays(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10)
  return ALLOWED_DAYS.includes(n) ? n : DEFAULT_DAYS
}

const toMs = (iso) => {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? t : null
}

/** 더 최근 시각으로 갱신 */
function touch(row, iso) {
  const t = toMs(iso)
  if (t == null) return
  if (row._last == null || t > row._last) row._last = t
}

const round = (n, d = 4) => Number((n || 0).toFixed(d))

/** 절차 진행 정보 — prep은 "준비"로 보인다 */
function procedureInfo(code) {
  const proc = PROCEDURES[code]
  if (!proc) return { code: code || null, label: code || '', step: null }
  return { code, label: code === 'prep' ? '준비' : getProcedureLabel(code), step: proc.order }
}

/**
 * 원본 행들을 화면용 현황으로 묶는다(순수 함수 — 테스트는 이 함수에 배열을 넣는다).
 * @param {object} data - { users, authUsers(null이면 승인 상태 모름), workspaces, members, projects, messages, designs, usage }
 * @param {{ days?: number, now?: number, approvalSince?: number }} [opts]
 */
export function buildOverview(data, { days = DEFAULT_DAYS, now = Date.now(), approvalSince = getApprovalRequiredSince() } = {}) {
  const {
    users = [], authUsers = null, workspaces = [], members = [], projects = [],
    messages = [], designs = [], usage = [],
  } = data
  const since = windowStartMs(days, now)
  const inWindow = (iso) => {
    const t = toMs(iso)
    return t != null && t >= since
  }

  // ── 계정 ──
  const authById = new Map((authUsers || []).map((u) => [u.id, u]))
  const accounts = new Map()
  for (const u of users) {
    const isAdmin = u.role === 'admin'
    let approval = null
    if (isAdmin) approval = 'approved'
    else if (authUsers) approval = authById.has(u.id) ? approvalStatusFromAuthUser(authById.get(u.id), { since: approvalSince }) : 'unknown'
    accounts.set(u.id, {
      id: u.id,
      name: u.display_name || '',
      email: u.email || '',
      school_name: u.school_name || '',
      role: isAdmin ? 'admin' : 'teacher',
      approval,
      joined_at: u.created_at || null,
      workspaces: 0,
      owned_workspaces: 0,
      teacher_messages: 0,
      teacher_messages_window: 0,
      board_saves_window: 0,
      ai_calls_window: 0,
      ai_cost_window: 0,
      ai_cost_total: 0,
      _last: null,
    })
  }

  // ── 워크스페이스·프로젝트 ──
  const wsRows = new Map()
  for (const w of workspaces) {
    wsRows.set(w.id, {
      id: w.id,
      name: w.name || '',
      owner_id: w.owner_id || null,
      owner_name: accounts.get(w.owner_id)?.name || '',
      created_at: w.created_at || null,
      members: 0,
      projects: 0,
      simulations: 0,
      teacher_messages: 0,
      teacher_messages_window: 0,
      ai_messages: 0,
      board_saves_window: 0,
      active_members_window: 0,
      ai_calls_window: 0,
      ai_cost_window: 0,
      ai_cost_total: 0,
      furthest: null,
      project_list: [],
      _active: new Set(),
      _last: null,
    })
    const owner = accounts.get(w.owner_id)
    if (owner) owner.owned_workspaces++
  }
  for (const m of members) {
    const ws = wsRows.get(m.workspace_id)
    if (ws) ws.members++
    const acc = accounts.get(m.user_id)
    if (acc && ws) acc.workspaces++
  }

  const projectRows = new Map()
  for (const p of projects) {
    const ws = wsRows.get(p.workspace_id)
    const isSim = Boolean(p.source_project_id)
    const row = {
      id: p.id,
      title: p.title || '',
      simulation: isSim,
      procedure: procedureInfo(p.current_procedure),
      teacher_messages: 0,
      created_at: p.created_at || null,
      _ws: ws || null,
      _last: null,
    }
    touch(row, p.created_at)
    projectRows.set(p.id, row)
    if (!ws) continue
    if (isSim) { ws.simulations++; continue }
    ws.projects++
    touch(ws, p.created_at)
    ws.project_list.push(row)
    if (row.procedure.step != null && (ws.furthest == null || row.procedure.step > ws.furthest.step)) ws.furthest = row.procedure
  }

  // ── 일자별 ──
  const daily = new Map()
  for (let t = since; t <= now; t += DAY_MS) {
    daily.set(kstDay(t), { day: kstDay(t), teacher_messages: 0, active_accounts: 0, ai_calls: 0, ai_cost: 0, _active: new Set() })
  }
  const dayOf = (iso) => daily.get(kstDay(toMs(iso)))

  const totals = {
    accounts: accounts.size,
    admins: [...accounts.values()].filter((a) => a.role === 'admin').length,
    approval: authUsers ? { approved: 0, pending: 0, rejected: 0, unknown: 0 } : null,
    workspaces: wsRows.size,
    active_workspaces_window: 0,
    projects: 0,
    simulations: 0,
    teacher_messages: 0,
    teacher_messages_window: 0,
    active_accounts_window: 0,
    never_active_accounts: 0,
    unattributed_teacher_messages: 0,
    simulation_teacher_messages: 0,
  }
  const activeAccounts = new Set()

  // ── 메시지 ──
  for (const m of messages) {
    const proj = projectRows.get(m.project_id)
    const ws = proj?._ws
    if (!proj || !ws) continue
    if (proj.simulation) {
      if (m.sender_type === 'teacher') totals.simulation_teacher_messages++
      continue
    }
    if (m.sender_type === 'ai') { ws.ai_messages++; continue }
    if (m.sender_type !== 'teacher') continue

    const win = inWindow(m.created_at)
    totals.teacher_messages++
    ws.teacher_messages++
    proj.teacher_messages++
    touch(ws, m.created_at)
    touch(proj, m.created_at)
    if (win) {
      totals.teacher_messages_window++
      ws.teacher_messages_window++
      const d = dayOf(m.created_at)
      if (d) d.teacher_messages++
    }
    const acc = m.user_id ? accounts.get(m.user_id) : null
    if (!acc) { totals.unattributed_teacher_messages++; continue }
    acc.teacher_messages++
    touch(acc, m.created_at)
    if (win) {
      acc.teacher_messages_window++
      ws._active.add(acc.id)
      activeAccounts.add(acc.id)
      dayOf(m.created_at)?._active.add(acc.id)
    }
  }

  // ── 보드 저장 ──
  for (const d of designs) {
    const proj = projectRows.get(d.project_id)
    if (!proj?._ws || proj.simulation) continue
    touch(proj._ws, d.updated_at)
    touch(proj, d.updated_at)
    const win = inWindow(d.updated_at)
    if (win) proj._ws.board_saves_window++
    const acc = d.last_editor_id ? accounts.get(d.last_editor_id) : null
    if (!acc) continue
    touch(acc, d.updated_at)
    if (win) {
      acc.board_saves_window++
      proj._ws._active.add(acc.id)
      activeAccounts.add(acc.id)
      dayOf(d.updated_at)?._active.add(acc.id)
    }
  }

  // ── AI 사용 ──
  const adminIds = new Set([...accounts.values()].filter((a) => a.role === 'admin').map((a) => a.id))
  const ai = {
    tracking_since: null,
    calls_window: 0,
    errors_window: 0,
    cost_window: 0,
    teacher_cost_window: 0,
    admin_cost_window: 0,
    cost_total: 0,
    unpriced_window: 0,
    by_model_route: [],
  }
  const windowUsage = []
  for (const r of usage) {
    const t = toMs(r.created_at)
    if (t != null && (ai.tracking_since == null || t < toMs(ai.tracking_since))) ai.tracking_since = r.created_at
    const cost = estimateCost(r)
    const c = cost || 0
    const wsId = r.workspace_id || projectRows.get(r.project_id)?._ws?.id || null
    const ws = wsId ? wsRows.get(wsId) : null
    const acc = r.user_id ? accounts.get(r.user_id) : null
    const win = inWindow(r.created_at)
    ai.cost_total += c
    if (ws) ws.ai_cost_total += c
    if (acc) {
      acc.ai_cost_total += c
      touch(acc, r.created_at)
    }
    if (!win) continue
    windowUsage.push(r)
    ai.calls_window++
    if (r.error_code) ai.errors_window++
    if (cost == null) ai.unpriced_window++
    ai.cost_window += c
    if (r.user_id && adminIds.has(r.user_id)) ai.admin_cost_window += c
    else ai.teacher_cost_window += c
    if (ws) { ws.ai_calls_window++; ws.ai_cost_window += c }
    if (acc) {
      acc.ai_calls_window++
      acc.ai_cost_window += c
      activeAccounts.add(acc.id)
      dayOf(r.created_at)?._active.add(acc.id)
    }
    const d = dayOf(r.created_at)
    if (d) { d.ai_calls++; d.ai_cost += c }
  }
  ai.by_model_route = summarizeUsage(windowUsage)
    .filter((g) => g.kind === 'model')
    .sort((a, b) => b.cost - a.cost)
    .map(({ provider, model, route, calls, errors, cost, unpriced }) => ({ provider, model, route, calls, errors, cost, unpriced }))
  for (const k of ['cost_window', 'teacher_cost_window', 'admin_cost_window', 'cost_total']) ai[k] = round(ai[k])

  // ── 마무리 ──
  const iso = (ms) => (ms == null ? null : new Date(ms).toISOString())
  const accountList = [...accounts.values()].map(({ _last, ...a }) => {
    if (totals.approval) totals.approval[a.approval in totals.approval ? a.approval : 'unknown']++
    if (_last == null) totals.never_active_accounts++
    return { ...a, ai_cost_window: round(a.ai_cost_window), ai_cost_total: round(a.ai_cost_total), last_activity_at: iso(_last) }
  })
  const byRecent = (a, b) => (b.last_activity_at || '').localeCompare(a.last_activity_at || '')
  accountList.sort(byRecent)

  const workspaceList = [...wsRows.values()].map(({ _active, _last, project_list, ...w }) => {
    if (_active.size > 0) totals.active_workspaces_window++
    totals.projects += w.projects
    totals.simulations += w.simulations
    return {
      ...w,
      active_members_window: _active.size,
      ai_cost_window: round(w.ai_cost_window),
      ai_cost_total: round(w.ai_cost_total),
      last_activity_at: iso(_last),
      project_list: project_list
        .map(({ _ws, _last: pl, ...p }) => ({ ...p, last_activity_at: iso(pl) }))
        .sort(byRecent),
    }
  })
  workspaceList.sort(byRecent)
  totals.active_accounts_window = activeAccounts.size

  return {
    generated_at: new Date(now).toISOString(),
    window: { days, since: new Date(since).toISOString() },
    procedure_steps: LAST_PROCEDURE_ORDER,
    totals,
    ai,
    daily: [...daily.values()].map(({ _active, ...d }) => ({ ...d, active_accounts: _active.size, ai_cost: round(d.ai_cost) })),
    workspaces: workspaceList,
    accounts: accountList,
  }
}

// ── DB 읽기 ──────────────────────────────────────────────────────

/** 테이블 전체를 쪽 단위로 읽는다(순서 고정 — 쪽 사이 중복·누락 방지) */
async function fetchAll(table, columns, orderBy = ['id']) {
  const rows = []
  for (let off = 0; off < MAX_ROWS; off += PAGE) {
    let q = supabaseAdmin.from(table).select(columns)
    for (const col of orderBy) q = q.order(col, { ascending: true })
    const { data, error } = await q.range(off, off + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < PAGE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

export async function loadOverviewData() {
  const tables = {
    users: ['users', 'id, email, display_name, role, school_name, created_at'],
    workspaces: ['workspaces', 'id, name, owner_id, created_at'],
    members: ['members', 'workspace_id, user_id', ['workspace_id', 'user_id']],
    projects: ['projects', 'id, workspace_id, title, current_procedure, source_project_id, created_at'],
    messages: ['messages', 'id, project_id, user_id, sender_type, created_at'],
    designs: ['designs', 'id, project_id, last_editor_id, updated_at'],
    usage: ['ai_usage', 'id, created_at, provider, model, route, user_id, workspace_id, project_id, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens, error_code, fallback_used'],
  }
  const keys = Object.keys(tables)
  const [results, authUsers] = await Promise.all([
    Promise.all(keys.map((k) => fetchAll(...tables[k]))),
    // 승인 상태는 부가 정보 — 실패해도 현황은 보여 준다
    listAllAuthUsers().catch((err) => {
      console.warn('[admin/overview] 승인 상태 조회 실패(생략):', err?.message || err)
      return null
    }),
  ])
  const data = { authUsers }
  const truncated = []
  keys.forEach((k, i) => {
    data[k] = results[i].rows
    if (results[i].truncated) truncated.push(tables[k][0])
  })
  return { data, truncated }
}

// ── 라우트 ───────────────────────────────────────────────────────

const cache = new Map() // days → { at, body }
const inflight = new Map() // days → Promise<body>

/** 테스트 전용 */
export function _clearOverviewCache() {
  cache.clear()
  inflight.clear()
}

adminOverviewRouter.get('/', async (req, res) => {
  const days = parseDays(req.query.days)
  const fresh = req.query.fresh === '1'
  const hit = cache.get(days)
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json({ ...hit.body, cached: true })
  try {
    if (!inflight.has(days)) {
      inflight.set(days, loadOverviewData()
        .then(({ data, truncated }) => {
          const body = { ...buildOverview(data, { days }), truncated, approval_loaded: data.authUsers != null }
          cache.set(days, { at: Date.now(), body })
          return body
        })
        .finally(() => inflight.delete(days)))
    }
    const body = await inflight.get(days)
    res.json({ ...body, cached: false })
  } catch (err) {
    console.error('[admin/overview] 조회 실패:', err?.message || err)
    res.status(500).json({ error: '사용 현황을 불러오지 못했습니다.' })
  }
})
