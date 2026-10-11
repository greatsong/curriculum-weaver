/**
 * 가입 승인 판정·처리 (lib/approval.js) 단위 테스트 — Supabase는 가짜 객체
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'

const db = vi.hoisted(() => ({
  roles: new Map(),        // userId → role
  authUsers: new Map(),    // userId → auth user
  roleQueryError: null,
  listCalls: [],
  updateCalls: [],
}))

vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: () => {
      const q = {
        _id: null,
        select() { return q },
        eq(_k, v) { q._id = v; return q },
        async maybeSingle() {
          if (db.roleQueryError) return { data: null, error: db.roleQueryError }
          const role = db.roles.get(q._id)
          return { data: role ? { role } : null, error: null }
        },
      }
      return q
    },
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: db.authUsers.get(id) || null }, error: null }),
        updateUserById: async (id, attrs) => {
          db.updateCalls.push({ id, attrs })
          const u = db.authUsers.get(id)
          const next = { ...u, app_metadata: attrs.app_metadata }
          db.authUsers.set(id, next)
          return { data: { user: next }, error: null }
        },
        listUsers: async ({ page, perPage }) => {
          db.listCalls.push({ page, perPage })
          const all = [...db.authUsers.values()]
          return { data: { users: all.slice((page - 1) * perPage, page * perPage) }, error: null }
        },
      },
    },
  },
}))

const approval = await import('../approval.js')
const {
  approvalStatusFromAuthUser, resolveApproval, getApprovalRequiredSince, DEFAULT_APPROVAL_REQUIRED_SINCE,
  verifiedEmailOf, approveUser, rejectUser, approveIfPending, onApprovalChange, isPendingCandidate,
  listAllAuthUsers, findAuthUserByEmail, _resetApprovalStateForTest,
} = approval

const BEFORE = '2026-10-11T05:59:59Z' // 기준(15:00 KST = 06:00Z) 1초 전
const AFTER = '2026-10-11T06:00:01Z'

const authUser = (id, extra = {}) => ({ id, email: `${id}@school.kr`, created_at: AFTER, app_metadata: { provider: 'email' }, ...extra })

beforeEach(() => {
  _resetApprovalStateForTest()
  db.roles.clear()
  db.authUsers.clear()
  db.roleQueryError = null
  db.listCalls.length = 0
  db.updateCalls.length = 0
})
afterEach(() => vi.unstubAllEnvs())

describe('승인 기준 시각', () => {
  it('기본값은 2026-10-11 15:00 KST, env로 덮을 수 있고 잘못된 값은 기본값', () => {
    expect(getApprovalRequiredSince({})).toBe(Date.parse(DEFAULT_APPROVAL_REQUIRED_SINCE))
    expect(new Date(getApprovalRequiredSince({})).toISOString()).toBe('2026-10-11T06:00:00.000Z')
    expect(getApprovalRequiredSince({ APPROVAL_REQUIRED_SINCE: '2026-12-01T00:00:00+09:00' })).toBe(Date.parse('2026-11-30T15:00:00Z'))
    expect(getApprovalRequiredSince({ APPROVAL_REQUIRED_SINCE: '아무 값' })).toBe(Date.parse(DEFAULT_APPROVAL_REQUIRED_SINCE))
  })
})

describe('approvalStatusFromAuthUser', () => {
  it('기준 시각 이전 계정은 승인(기존 가입자 47명)', () => {
    expect(approvalStatusFromAuthUser(authUser('u1', { created_at: BEFORE }))).toBe('approved')
  })
  it('기준 시각 이후 계정은 app_metadata.approved가 있어야 승인', () => {
    expect(approvalStatusFromAuthUser(authUser('u2'))).toBe('pending')
    expect(approvalStatusFromAuthUser(authUser('u3', { app_metadata: { approved: true } }))).toBe('approved')
  })
  it('user_metadata의 approved는 판정에 쓰지 않는다(사용자가 고칠 수 있음)', () => {
    expect(approvalStatusFromAuthUser(authUser('u4', { user_metadata: { approved: true } }))).toBe('pending')
  })
  it('거절은 기존 가입자여도 거절', () => {
    expect(approvalStatusFromAuthUser(authUser('u5', { app_metadata: { rejected: true } }))).toBe('rejected')
    expect(approvalStatusFromAuthUser(authUser('u6', { created_at: BEFORE, app_metadata: { rejected: true } }))).toBe('rejected')
  })
  it('created_at을 읽을 수 없으면 승인 대기(안전 쪽)', () => {
    expect(approvalStatusFromAuthUser({ id: 'u7', app_metadata: {} })).toBe('pending')
    expect(approvalStatusFromAuthUser(null)).toBe('pending')
  })
  it('env로 기준 시각을 바꾸면 그 시각 기준으로 판정', () => {
    vi.stubEnv('APPROVAL_REQUIRED_SINCE', '2026-10-12T00:00:00+09:00')
    expect(approvalStatusFromAuthUser(authUser('u8', { created_at: AFTER }))).toBe('approved')
  })
})

describe('resolveApproval — 관리자는 항상 승인', () => {
  it('users.role=admin이면 미승인·거절 상태여도 승인', async () => {
    db.roles.set('adm', 'admin')
    expect(await resolveApproval(authUser('adm'))).toEqual({ approved: true, status: 'approved', admin: true })
    expect((await resolveApproval(authUser('adm', { app_metadata: { rejected: true } }))).approved).toBe(true)
  })
  it('관리자가 아니면 승인 대기 그대로', async () => {
    db.roles.set('t1', 'teacher')
    expect(await resolveApproval(authUser('t1'))).toEqual({ approved: false, status: 'pending' })
  })
  it('관리자 역할 조회가 실패하면 승인하지 않는다', async () => {
    db.roleQueryError = { message: 'db down' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await resolveApproval(authUser('t2'))).approved).toBe(false)
    warn.mockRestore()
  })
})

describe('verifiedEmailOf', () => {
  it('이메일 확인 완료 또는 구글 로그인만 확인된 이메일(소문자)', () => {
    expect(verifiedEmailOf({ email: 'Kim@School.KR', email_confirmed_at: '2026-10-11T07:00:00Z' })).toBe('kim@school.kr')
    expect(verifiedEmailOf({ email: 'lee@gmail.com', app_metadata: { provider: 'google' } })).toBe('lee@gmail.com')
    expect(verifiedEmailOf({ email: 'park@gmail.com', identities: [{ provider: 'google' }] })).toBe('park@gmail.com')
    expect(verifiedEmailOf({ email: 'choi@school.kr', app_metadata: { provider: 'email' } })).toBeNull()
    expect(verifiedEmailOf({})).toBeNull()
  })
})

describe('approveUser / rejectUser', () => {
  it('app_metadata에 승인 정보를 쓰되 기존 값(provider)은 보존하고, 구독자에게 알린다', async () => {
    db.authUsers.set('u1', authUser('u1', { app_metadata: { provider: 'google', providers: ['google'] } }))
    const seen = []
    onApprovalChange((id) => seen.push(id))
    await approveUser('u1', { via: 'admin', by: 'adm' })
    const meta = db.updateCalls[0].attrs.app_metadata
    expect(meta).toMatchObject({ provider: 'google', providers: ['google'], approved: true, approved_via: 'admin', approved_by: 'adm', rejected: false })
    expect(Date.parse(meta.approved_at)).not.toBeNaN()
    expect(seen).toEqual(['u1'])
    expect(approvalStatusFromAuthUser(db.authUsers.get('u1'))).toBe('approved')
  })
  it('알 수 없는 승인 경로는 거부', async () => {
    db.authUsers.set('u1', authUser('u1'))
    await expect(approveUser('u1', { via: 'self' })).rejects.toThrow('알 수 없는 승인 경로')
  })
  it('거절하면 rejected=true, approved=false', async () => {
    db.authUsers.set('u2', authUser('u2', { app_metadata: { approved: true } }))
    await rejectUser('u2', { by: 'adm' })
    expect(db.authUsers.get('u2').app_metadata).toMatchObject({ rejected: true, approved: false, rejected_by: 'adm' })
    expect(approvalStatusFromAuthUser(db.authUsers.get('u2'))).toBe('rejected')
  })
  it('없는 사용자는 404 오류', async () => {
    await expect(approveUser('none', { via: 'admin' })).rejects.toMatchObject({ status: 404 })
  })
})

describe('approveIfPending — 초대·참여 요청·멤버 추가 경로', () => {
  it('승인 대기면 승인한다', async () => {
    db.authUsers.set('p1', authUser('p1'))
    expect(await approveIfPending('p1', { via: 'invite', by: 'h1' })).toEqual({ status: 'approved', changed: true })
    expect(db.authUsers.get('p1').app_metadata.approved_via).toBe('invite')
  })
  it('이미 승인된 사용자는 건드리지 않는다', async () => {
    const u = authUser('p2', { created_at: BEFORE })
    expect(await approveIfPending(u, { via: 'member_add' })).toEqual({ status: 'approved', changed: false })
    expect(db.updateCalls).toHaveLength(0)
  })
  it('관리자가 거절한 사용자는 이 경로로 되살리지 않는다', async () => {
    const u = authUser('p3', { app_metadata: { rejected: true } })
    expect(await approveIfPending(u, { via: 'join_request' })).toEqual({ status: 'rejected', changed: false })
    expect(db.updateCalls).toHaveLength(0)
  })
})

describe('대기 목록·사용자 조회', () => {
  it('isPendingCandidate: 기준 시각 이후 + 미승인 + 미거절만', () => {
    expect(isPendingCandidate(authUser('a'))).toBe(true)
    expect(isPendingCandidate(authUser('b', { created_at: BEFORE }))).toBe(false)
    expect(isPendingCandidate(authUser('c', { app_metadata: { approved: true } }))).toBe(false)
    expect(isPendingCandidate(authUser('d', { app_metadata: { rejected: true } }))).toBe(false)
  })
  it('listAllAuthUsers는 페이지 끝까지 읽는다(기본 50명 한계 없음)', async () => {
    for (let i = 0; i < 5; i++) db.authUsers.set(`u${i}`, authUser(`u${i}`))
    const users = await listAllAuthUsers({ perPage: 2 })
    expect(users).toHaveLength(5)
    expect(db.listCalls.map((c) => c.page)).toEqual([1, 2, 3])
  })
  it('findAuthUserByEmail은 대소문자를 무시하고 뒤쪽 페이지도 찾는다', async () => {
    for (let i = 0; i < 60; i++) db.authUsers.set(`u${i}`, authUser(`u${i}`))
    db.authUsers.set('target', { ...authUser('target'), email: 'Late.User@School.kr' })
    const found = await findAuthUserByEmail('late.user@SCHOOL.KR ')
    expect(found?.id).toBe('target')
    expect(await findAuthUserByEmail('nobody@school.kr')).toBeNull()
  })
})
