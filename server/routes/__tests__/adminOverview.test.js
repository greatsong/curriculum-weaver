/**
 * 관리자 사용 현황 (routes/adminOverview.js) — 집계 규칙과 라우트 동작
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'

const db = vi.hoisted(() => ({ tables: {}, authUsers: [], authFail: false, tableFail: null, isAdminCaller: true, reads: [] }))

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: '00000000-0000-4000-8000-0000000000aa' }; next() },
  requireAdmin: (req, res, next) => (db.isAdminCaller ? next() : res.status(403).json({ error: '관리자 전용 기능입니다.' })),
}))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: (table) => {
      const q = {
        select() { return q },
        order() { return q },
        range: async (from, to) => {
          db.reads.push(table)
          if (db.tableFail === table) return { data: null, error: { message: 'boom' } }
          return { data: (db.tables[table] || []).slice(from, to + 1), error: null }
        },
      }
      return q
    },
    auth: {
      admin: {
        listUsers: async ({ page, perPage }) => {
          if (db.authFail) return { data: null, error: { message: 'auth down' } }
          return { data: { users: db.authUsers.slice((page - 1) * perPage, page * perPage) }, error: null }
        },
      },
    },
  },
}))

const { buildOverview, windowStartMs, parseDays, adminOverviewRouter, _clearOverviewCache } = await import('../adminOverview.js')

const NOW = Date.parse('2026-10-20T03:00:00Z') // 한국 시간 10/20 12:00
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1)
const T1 = uid(2)
const T2 = uid(3)
const T3 = uid(4) // 한 번도 활동하지 않은 계정

function baseData() {
  return {
    users: [
      { id: ADMIN, email: 'admin@x.kr', display_name: '관리자', role: 'admin', created_at: '2026-04-01T00:00:00Z' },
      { id: T1, email: 't1@x.kr', display_name: '교사1', role: 'teacher', school_name: '가고', created_at: '2026-10-01T00:00:00Z' },
      { id: T2, email: 't2@x.kr', display_name: '교사2', role: 'teacher', created_at: '2026-10-12T00:00:00Z' },
      { id: T3, email: 't3@x.kr', display_name: '교사3', role: 'teacher', created_at: '2026-10-16T00:00:00Z' },
    ],
    authUsers: [
      { id: ADMIN, created_at: '2026-04-01T00:00:00Z', app_metadata: {} },
      { id: T1, created_at: '2026-10-01T00:00:00Z', app_metadata: {} },                    // 기준 이전 가입 → 승인
      { id: T2, created_at: '2026-10-12T00:00:00Z', app_metadata: { approved: true } },    // 승인
      { id: T3, created_at: '2026-10-16T00:00:00Z', app_metadata: {} },                    // 대기
    ],
    workspaces: [
      { id: 'w1', name: '1팀', owner_id: T1, created_at: '2026-10-09T00:00:00Z' },
      { id: 'w2', name: '빈 팀', owner_id: T3, created_at: '2026-10-16T00:00:00Z' },
    ],
    members: [
      { workspace_id: 'w1', user_id: T1 }, { workspace_id: 'w1', user_id: T2 }, { workspace_id: 'w2', user_id: T3 },
    ],
    projects: [
      { id: 'p1', workspace_id: 'w1', title: '기후', current_procedure: 'T-1-1', created_at: '2026-10-09T00:00:00Z' },
      { id: 'p2', workspace_id: 'w1', title: '에너지', current_procedure: 'E-2-1', created_at: '2026-10-09T00:00:00Z' },
      { id: 'p3', workspace_id: 'w1', title: '기후 #1', current_procedure: 'E-2-1', source_project_id: 'p1', created_at: '2026-10-19T00:00:00Z' },
    ],
    messages: [
      { project_id: 'p1', user_id: T1, sender_type: 'teacher', created_at: '2026-10-09T01:00:00Z' }, // 7일 밖
      { project_id: 'p1', user_id: null, sender_type: 'ai', created_at: '2026-10-09T01:01:00Z' },
      { project_id: 'p2', user_id: T2, sender_type: 'teacher', created_at: '2026-10-19T16:00:00Z' },  // 한국 10/20 01:00
      { project_id: 'p2', user_id: null, sender_type: 'teacher', created_at: '2026-10-18T00:00:00Z' }, // 작성자 없음
      { project_id: 'p3', user_id: T1, sender_type: 'teacher', created_at: '2026-10-19T02:00:00Z' },   // 시뮬레이션
      { project_id: 'p1', user_id: null, sender_type: 'system', created_at: '2026-10-19T02:00:00Z' },
    ],
    designs: [
      { project_id: 'p1', last_editor_id: T1, updated_at: '2026-10-17T00:00:00Z' },
      { project_id: 'p3', last_editor_id: T1, updated_at: '2026-10-19T05:00:00Z' }, // 시뮬레이션 — 무시
    ],
    usage: [
      { created_at: '2026-10-12T02:00:00Z', provider: 'anthropic', model: 'claude-sonnet-5-5', route: 'chat', user_id: T1, project_id: 'p1', input_tokens: 1_000_000, output_tokens: 0 }, // 7일 밖, $2
      { created_at: '2026-10-19T03:00:00Z', provider: 'openai', model: 'gpt-6-luna', route: 'chat', user_id: T2, workspace_id: 'w1', input_tokens: 1_000_000, output_tokens: 1_000_000 }, // $0.6
      { created_at: '2026-10-20T01:00:00Z', provider: 'anthropic', model: 'claude-sonnet-5-5', route: 'futures_lab', user_id: ADMIN, input_tokens: 0, output_tokens: 100_000 }, // $1
      { created_at: '2026-10-20T01:30:00Z', provider: 'anthropic', model: 'unknown-model', route: 'chat', user_id: T2, project_id: 'p2', input_tokens: 10, output_tokens: 10, error_code: 'timeout' },
    ],
  }
}

const build = (data = baseData(), days = 7) => buildOverview(data, { days, now: NOW, approvalSince: Date.parse('2026-10-11T15:00:00+09:00') })
const acc = (o, id) => o.accounts.find((a) => a.id === id)
const ws = (o, id) => o.workspaces.find((w) => w.id === id)

describe('windowStartMs·parseDays', () => {
  it('오늘을 포함한 days일 전 한국 시간 자정', () => {
    expect(new Date(windowStartMs(7, NOW)).toISOString()).toBe('2026-10-13T15:00:00.000Z') // 한국 10/14 00:00
    expect(new Date(windowStartMs(1, NOW)).toISOString()).toBe('2026-10-19T15:00:00.000Z')
  })
  it('허용한 기간만 받고 나머지는 30일', () => {
    expect(parseDays('7')).toBe(7)
    expect(parseDays('90')).toBe(90)
    expect(parseDays('365')).toBe(30)
    expect(parseDays(undefined)).toBe(30)
    expect(parseDays('abc')).toBe(30)
  })
})

describe('buildOverview — 메시지 집계', () => {
  it('교사 메시지만 세고, 시뮬레이션 발화는 따로 센다', () => {
    const o = build()
    expect(o.totals.teacher_messages).toBe(3)              // p1 1 + p2 2(작성자 없음 포함)
    expect(o.totals.teacher_messages_window).toBe(2)
    expect(o.totals.simulation_teacher_messages).toBe(1)
    expect(o.totals.unattributed_teacher_messages).toBe(1)
    expect(ws(o, 'w1')).toMatchObject({ teacher_messages: 3, teacher_messages_window: 2, ai_messages: 1, projects: 2, simulations: 1 })
  })

  it('작성자 없는 메시지는 계정 수에서 빠진다', () => {
    const o = build()
    expect(acc(o, T1)).toMatchObject({ teacher_messages: 1, teacher_messages_window: 0 })
    expect(acc(o, T2)).toMatchObject({ teacher_messages: 1, teacher_messages_window: 1 })
  })

  it('일자는 한국 시간 기준으로 나눈다', () => {
    const o = build()
    expect(o.daily).toHaveLength(7)
    expect(o.daily[0].day).toBe('2026-10-14')
    const d20 = o.daily.find((d) => d.day === '2026-10-20')
    expect(d20.teacher_messages).toBe(1) // UTC 10/19 16:00 = 한국 10/20 01:00
    expect(o.daily.find((d) => d.day === '2026-10-18').teacher_messages).toBe(1)
  })
})

describe('buildOverview — 활동·진행', () => {
  it('마지막 활동은 메시지·보드 저장·AI 호출 중 가장 최근, 시뮬레이션은 제외', () => {
    const o = build()
    expect(acc(o, T1).last_activity_at).toBe('2026-10-17T00:00:00.000Z') // 보드 저장(시뮬레이션 보드는 무시)
    expect(acc(o, T2).last_activity_at).toBe('2026-10-20T01:30:00.000Z') // AI 호출
    expect(acc(o, T3).last_activity_at).toBeNull()
    expect(o.totals.never_active_accounts).toBe(1)
  })

  it('기간 안 활동 계정 = 메시지·보드 저장·AI 호출이 있는 계정', () => {
    const o = build()
    expect(o.totals.active_accounts_window).toBe(3) // T1(보드)·T2·관리자(AI)
    expect(ws(o, 'w1').active_members_window).toBe(2)
    expect(o.totals.active_workspaces_window).toBe(1)
  })

  it('워크스페이스의 가장 앞선 절차와 프로젝트 목록(시뮬레이션 제외)', () => {
    const o = build()
    expect(ws(o, 'w1').furthest).toMatchObject({ code: 'E-2-1', label: 'E-2 협력 과정 성찰', step: 18 })
    expect(ws(o, 'w1').project_list.map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(o.procedure_steps).toBe(18)
    expect(ws(o, 'w2')).toMatchObject({ projects: 0, furthest: null, last_activity_at: null })
  })

  it('prep 절차는 "준비"로 보인다', () => {
    const data = baseData()
    data.projects[0].current_procedure = 'prep'
    data.projects[1].current_procedure = 'prep'
    expect(ws(build(data), 'w1').furthest).toMatchObject({ code: 'prep', label: '준비', step: 0 })
  })

  it('워크스페이스는 마지막 활동 최근 순, 활동 없는 곳은 뒤로', () => {
    expect(build().workspaces.map((w) => w.id)).toEqual(['w1', 'w2'])
  })
})

describe('buildOverview — AI 비용', () => {
  it('관리자 사용분을 나누고, 기간 밖은 전체에만 넣는다', () => {
    const o = build()
    expect(o.ai.tracking_since).toBe('2026-10-12T02:00:00Z')
    expect(o.ai.calls_window).toBe(3)
    expect(o.ai.errors_window).toBe(1)
    expect(o.ai.unpriced_window).toBe(1)
    expect(o.ai.teacher_cost_window).toBeCloseTo(0.6, 6)
    expect(o.ai.admin_cost_window).toBeCloseTo(1, 6)
    expect(o.ai.cost_total).toBeCloseTo(3.6, 6)
  })

  it('계정·워크스페이스별 비용 — workspace_id가 없으면 project_id로 찾는다', () => {
    const o = build()
    expect(acc(o, T1)).toMatchObject({ ai_calls_window: 0, ai_cost_window: 0, ai_cost_total: 2 })
    expect(acc(o, T2).ai_calls_window).toBe(2)
    expect(ws(o, 'w1').ai_cost_total).toBeCloseTo(2.6, 6)
    expect(ws(o, 'w1').ai_calls_window).toBe(2)
  })

  it('모델·경로별 합계는 비용 큰 순', () => {
    const rows = build().ai.by_model_route
    expect(rows[0]).toMatchObject({ model: 'claude-sonnet-5-5', route: 'futures_lab', calls: 1 })
    expect(rows.map((r) => r.route)).toContain('chat')
  })

  it('사용 기록이 없으면 tracking_since는 null', () => {
    const data = baseData()
    data.usage = []
    expect(build(data).ai).toMatchObject({ tracking_since: null, calls_window: 0, cost_total: 0 })
  })
})

describe('buildOverview — 승인 상태', () => {
  it('관리자는 승인, 그 밖은 auth app_metadata로', () => {
    const o = build()
    expect(acc(o, ADMIN).approval).toBe('approved')
    expect(acc(o, T1).approval).toBe('approved')
    expect(acc(o, T2).approval).toBe('approved')
    expect(acc(o, T3).approval).toBe('pending')
    expect(o.totals.approval).toEqual({ approved: 3, pending: 1, rejected: 0, unknown: 0 })
  })

  it('auth를 못 읽으면 승인 상태는 null(관리자 제외)', () => {
    const data = baseData()
    data.authUsers = null
    const o = build(data)
    expect(o.totals.approval).toBeNull()
    expect(acc(o, T1).approval).toBeNull()
    expect(acc(o, ADMIN).approval).toBe('approved')
  })
})

describe('GET /api/admin/overview', () => {
  const app = express()
  app.use('/api/admin/overview', adminOverviewRouter)

  function seed() {
    const d = baseData()
    db.tables = { users: d.users, workspaces: d.workspaces, members: d.members, projects: d.projects, messages: d.messages, designs: d.designs, ai_usage: d.usage }
    db.authUsers = d.authUsers
  }

  beforeEach(() => {
    _clearOverviewCache()
    db.authFail = false
    db.tableFail = null
    db.isAdminCaller = true
    db.reads.length = 0
    seed()
  })

  it('관리자가 아니면 403', async () => {
    db.isAdminCaller = false
    const res = await request(app).get('/api/admin/overview')
    expect(res.status).toBe(403)
  })

  it('기본 30일, 허용 밖 기간은 30일로', async () => {
    const res = await request(app).get('/api/admin/overview?days=365')
    expect(res.status).toBe(200)
    expect(res.body.window.days).toBe(30)
    expect(res.body.totals.accounts).toBe(4)
    expect(res.body.approval_loaded).toBe(true)
    expect(res.body.truncated).toEqual([])
  })

  it('60초 안 재요청은 캐시, fresh=1이면 새로 읽는다', async () => {
    await request(app).get('/api/admin/overview?days=7')
    const reads = db.reads.length
    const second = await request(app).get('/api/admin/overview?days=7')
    expect(second.body.cached).toBe(true)
    expect(db.reads.length).toBe(reads)
    const third = await request(app).get('/api/admin/overview?days=7&fresh=1')
    expect(third.body.cached).toBe(false)
    expect(db.reads.length).toBeGreaterThan(reads)
  })

  it('1,000행이 넘는 테이블도 끝까지 읽는다', async () => {
    db.tables.messages = Array.from({ length: 2_500 }, (_, i) => ({ project_id: 'p1', user_id: T1, sender_type: 'teacher', created_at: '2026-10-09T00:00:00Z', id: i }))
    const res = await request(app).get('/api/admin/overview?fresh=1')
    expect(res.body.totals.teacher_messages).toBe(2_500)
  })

  it('승인 상태 조회가 실패해도 현황은 돌려준다', async () => {
    db.authFail = true
    const res = await request(app).get('/api/admin/overview')
    expect(res.status).toBe(200)
    expect(res.body.approval_loaded).toBe(false)
    expect(res.body.totals.approval).toBeNull()
  })

  it('테이블 조회가 실패하면 500, 다음 요청은 다시 읽는다', async () => {
    db.tableFail = 'messages'
    const res = await request(app).get('/api/admin/overview')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('사용 현황을 불러오지 못했습니다.')
    db.tableFail = null
    const retry = await request(app).get('/api/admin/overview')
    expect(retry.status).toBe(200)
  })
})
