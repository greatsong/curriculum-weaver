/**
 * 초대 수락(이메일 일치/불일치·원자성)과 워크스페이스 참여 요청·멤버 관리 통합 테스트.
 * supabaseService는 인메모리 폴백(Supabase env 없음)을 그대로 쓰고, 승인 처리만 가짜 함수로 본다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY

// x-test-user 헤더 → req.user
const users = vi.hoisted(() => new Map())

vi.mock('../../middleware/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  const fake = (req, res, next) => {
    const user = users.get(req.get('x-test-user'))
    if (!user) return res.status(401).json({ error: '인증이 필요합니다.' })
    req.user = user
    req.approval = { approved: !user._pending, status: user._pending ? 'pending' : 'approved' }
    next()
  }
  return { ...actual, requireAuth: fake, requireAuthAllowPending: fake }
})

vi.mock('../../lib/approval.js', async (importOriginal) => ({
  ...(await importOriginal()),
  approveIfPending: vi.fn(async () => ({ status: 'approved', changed: true })),
  findAuthUserByEmail: vi.fn(async () => null),
}))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, addMember: vi.fn((...args) => actual.addMember(...args)) }
})

const service = await import('../../lib/supabaseService.js')
const approval = await import('../../lib/approval.js')
const invitesRouter = (await import('../invites.js')).default
const { JOIN_REQUESTED_MESSAGE } = await import('../invites.js')
const workspacesRouter = (await import('../workspaces.js')).default
const { evictUserFromWorkspaceRooms } = await import('../workspaces.js')

function buildApp(io = null) {
  const app = express()
  app.use(express.json())
  if (io) app.set('io', io)
  app.use('/api/invites', invitesRouter)
  app.use('/api/workspaces', workspacesRouter)
  return app
}
const app = buildApp()

let seq = 0
function addUser(key, extra = {}) {
  const user = { id: `${key}-${++seq}`, email: `${key}@school.kr`, email_confirmed_at: '2026-10-11T07:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { display_name: key }, ...extra }
  users.set(key, user)
  return user
}

let owner, host, ws
beforeEach(async () => {
  vi.clearAllMocks()
  users.clear()
  owner = addUser('owner')
  host = addUser('host')
  ws = await service.createWorkspace({ name: '융합 팀', owner_id: owner.id })
  await service.addMember(ws.id, host.id, 'host')
})

const accept = (token, as) => request(app).post(`/api/invites/${token}/accept`).set('x-test-user', as)

describe('초대 수락 — 확인된 이메일이 같으면 바로 멤버', () => {
  it('이메일 확인 완료 계정(대소문자 무시) → 멤버 + 승인 대기면 승인(via invite)', async () => {
    const invitee = addUser('kim', { email: 'Kim@School.kr', _pending: true })
    const invite = await service.createInvite(ws.id, 'kim@school.KR', 'editor', host.id)
    const res = await accept(invite.token, 'kim')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ kind: 'joined', workspace_id: ws.id, role: 'editor' })
    expect(await service.getMemberRole(ws.id, invitee.id)).toBe('editor')
    expect(approval.approveIfPending).toHaveBeenCalledWith(expect.objectContaining({ id: invitee.id }), { via: 'invite', by: host.id })
  })

  it('구글 로그인 계정은 email_confirmed_at이 없어도 확인된 이메일', async () => {
    const invitee = addUser('lee', { email: 'lee@gmail.com', email_confirmed_at: null, app_metadata: { provider: 'google' } })
    const invite = await service.createInvite(ws.id, 'lee@gmail.com', 'viewer', host.id)
    const res = await accept(invite.token, 'lee')
    expect(res.body.kind).toBe('joined')
    expect(await service.getMemberRole(ws.id, invitee.id)).toBe('viewer')
  })
})

describe('초대 수락 — 이메일이 다르면 참여 요청', () => {
  it('다른 이메일 → 202 참여 요청 + 안내 문구, 멤버는 아니고 승인도 하지 않는다. 링크는 사용됨', async () => {
    const other = addUser('park', { _pending: true })
    const invite = await service.createInvite(ws.id, 'someone-else@school.kr', 'editor', host.id)
    const res = await accept(invite.token, 'park')
    expect(res.status).toBe(202)
    expect(res.body).toMatchObject({ kind: 'requested', message: JOIN_REQUESTED_MESSAGE })
    expect(res.body.message).toBe('초대한 팀의 호스트가 확인하면 들어갈 수 있습니다.')
    expect(await service.getMemberRole(ws.id, other.id)).toBeNull()
    expect(approval.approveIfPending).not.toHaveBeenCalled()
    const requests = await service.listJoinRequests(ws.id)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ user_id: other.id, invited_email: 'someone-else@school.kr', user_email: 'park@school.kr', requested_role: 'editor' })
    // 링크는 다시 쓸 수 없다
    addUser('someone-else')
    expect((await accept(invite.token, 'someone-else')).status).toBe(410)
  })

  it('이메일이 같아도 확인되지 않은 이메일 계정이면 참여 요청', async () => {
    addUser('choi', { email_confirmed_at: null })
    const invite = await service.createInvite(ws.id, 'choi@school.kr', 'editor', host.id)
    const res = await accept(invite.token, 'choi')
    expect(res.body.kind).toBe('requested')
  })
})

describe('초대 링크 원자성', () => {
  it('두 사람이 동시에 같은 링크를 수락해도 한 명만 통과한다', async () => {
    addUser('a1'); addUser('a2')
    const invite = await service.createInvite(ws.id, 'a1@school.kr', 'editor', host.id)
    const [r1, r2] = await Promise.all([accept(invite.token, 'a1'), accept(invite.token, 'a2')])
    const statuses = [r1.status, r2.status].sort()
    expect(statuses.filter((s) => s === 410)).toHaveLength(1)
    expect(statuses.filter((s) => s === 200 || s === 202)).toHaveLength(1)
  })

  it('이미 멤버면 409이고 링크를 소모하지 않는다', async () => {
    const invite = await service.createInvite(ws.id, 'host@school.kr', 'editor', owner.id)
    expect((await accept(invite.token, 'host')).status).toBe(409)
    const fresh = await service.getInviteByToken(invite.token)
    expect(fresh.used_at).toBeNull()
  })

  it('멤버 추가가 실패하면 링크 사용을 되돌린다', async () => {
    addUser('jung')
    const invite = await service.createInvite(ws.id, 'jung@school.kr', 'editor', host.id)
    service.addMember.mockImplementationOnce(async () => { throw new Error('db down') })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await accept(invite.token, 'jung')).status).toBe(500)
    err.mockRestore()
    expect((await service.getInviteByToken(invite.token)).used_at).toBeNull()
    expect((await accept(invite.token, 'jung')).status).toBe(200)
  })

  it('claimInvite: 이미 쓴 링크·만료된 링크는 null', async () => {
    const invite = await service.createInvite(ws.id, 'x@school.kr', 'editor', host.id)
    expect(await service.claimInvite(invite.token)).toMatchObject({ token: invite.token })
    expect(await service.claimInvite(invite.token)).toBeNull()
    const expired = await service.createInvite(ws.id, 'y@school.kr', 'editor', host.id)
    ;(await service.getInviteByToken(expired.token)).expires_at = '2020-01-01T00:00:00Z'
    expect(await service.claimInvite(expired.token)).toBeNull()
  })
})

describe('참여 요청 처리 (host·owner)', () => {
  async function makeRequest(key = 'req') {
    const requester = addUser(key, { _pending: true })
    const invite = await service.createInvite(ws.id, `${key}-other@school.kr`, 'viewer', host.id)
    await accept(invite.token, key)
    const [req] = await service.listJoinRequests(ws.id)
    return { requester, req }
  }

  it('host가 목록을 보고 수락하면 멤버 추가 + 승인(via join_request)', async () => {
    const { requester, req } = await makeRequest()
    const list = await request(app).get(`/api/workspaces/${ws.id}/join-requests`).set('x-test-user', 'host')
    expect(list.status).toBe(200)
    expect(list.body.requests.map((r) => r.id)).toEqual([req.id])
    const res = await request(app).post(`/api/workspaces/${ws.id}/join-requests/${req.id}/accept`).set('x-test-user', 'host')
    expect(res.status).toBe(200)
    expect(await service.getMemberRole(ws.id, requester.id)).toBe('viewer')
    expect(approval.approveIfPending).toHaveBeenCalledWith(requester.id, { via: 'join_request', by: host.id })
    // 두 번 수락은 409
    expect((await request(app).post(`/api/workspaces/${ws.id}/join-requests/${req.id}/accept`).set('x-test-user', 'host')).status).toBe(409)
  })

  it('거절하면 멤버가 되지 않고, 거절한 요청은 수락할 수 없다', async () => {
    const { requester, req } = await makeRequest('rej')
    const res = await request(app).post(`/api/workspaces/${ws.id}/join-requests/${req.id}/reject`).set('x-test-user', 'owner')
    expect(res.status).toBe(200)
    expect(await service.getMemberRole(ws.id, requester.id)).toBeNull()
    expect((await request(app).post(`/api/workspaces/${ws.id}/join-requests/${req.id}/accept`).set('x-test-user', 'host')).status).toBe(409)
    expect(approval.approveIfPending).not.toHaveBeenCalled()
  })

  it('편집자(editor)는 참여 요청을 보거나 처리할 수 없다', async () => {
    const { req } = await makeRequest('ed')
    const editor = addUser('editor')
    await service.addMember(ws.id, editor.id, 'editor')
    expect((await request(app).get(`/api/workspaces/${ws.id}/join-requests`).set('x-test-user', 'editor')).status).toBe(403)
    expect((await request(app).post(`/api/workspaces/${ws.id}/join-requests/${req.id}/accept`).set('x-test-user', 'editor')).status).toBe(403)
  })
})

describe('멤버 관리', () => {
  it('host가 기존 가입자를 이메일로 직접 추가하면 승인 대기일 때 승인(via member_add)', async () => {
    const target = { id: 'target-user', email: 'target@school.kr', created_at: '2026-10-12T00:00:00Z', app_metadata: {} }
    approval.findAuthUserByEmail.mockResolvedValueOnce(target)
    const res = await request(app).post(`/api/workspaces/${ws.id}/invite`).set('x-test-user', 'host').send({ email: 'TARGET@school.kr' })
    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('added')
    expect(approval.findAuthUserByEmail).toHaveBeenCalledWith('target@school.kr')
    expect(approval.approveIfPending).toHaveBeenCalledWith(target, { via: 'member_add', by: host.id })
  })

  it('다른 host의 역할은 소유자만 바꿀 수 있다', async () => {
    const host2 = addUser('host2')
    await service.addMember(ws.id, host2.id, 'host')
    const byHost = await request(app).put(`/api/workspaces/${ws.id}/members/${host2.id}`).set('x-test-user', 'host').send({ role: 'editor' })
    expect(byHost.status).toBe(403)
    const byOwner = await request(app).put(`/api/workspaces/${ws.id}/members/${host2.id}`).set('x-test-user', 'owner').send({ role: 'editor' })
    expect(byOwner.status).toBe(200)
    expect(await service.getMemberRole(ws.id, host2.id)).toBe('editor')
  })

  it('host는 편집자의 역할은 바꿀 수 있다(종전과 같음)', async () => {
    const ed = addUser('ed2')
    await service.addMember(ws.id, ed.id, 'editor')
    const res = await request(app).put(`/api/workspaces/${ws.id}/members/${ed.id}`).set('x-test-user', 'host').send({ role: 'viewer' })
    expect(res.status).toBe(200)
  })

  it('멤버를 제거하면 그 사용자의 소켓을 워크스페이스 프로젝트 방에서 내보낸다', async () => {
    const leaver = addUser('leaver')
    await service.addMember(ws.id, leaver.id, 'editor')
    const p1 = await service.createProject(ws.id, { title: 'P1' })
    const p2 = await service.createProject(ws.id, { title: 'P2' })
    const makeSocket = (userId, rooms) => {
      const s = { user: { id: userId }, rooms: new Set(rooms), leave: vi.fn((r) => s.rooms.delete(r)), emit: vi.fn() }
      return s
    }
    const leaverSocket = makeSocket(leaver.id, [p1.id, p2.id, 'other-room'])
    const otherSocket = makeSocket(host.id, [p1.id])
    const io = { of: () => ({ sockets: new Map([['s1', leaverSocket], ['s2', otherSocket]]) }) }
    const res = await request(buildApp(io)).delete(`/api/workspaces/${ws.id}/members/${leaver.id}`).set('x-test-user', 'host')
    expect(res.status).toBe(200)
    expect(leaverSocket.leave).toHaveBeenCalledWith(p1.id)
    expect(leaverSocket.leave).toHaveBeenCalledWith(p2.id)
    expect(leaverSocket.rooms.has('other-room')).toBe(true)
    expect(leaverSocket.emit).toHaveBeenCalledWith('workspace_access_revoked', expect.objectContaining({ workspaceId: ws.id }))
    expect(otherSocket.leave).not.toHaveBeenCalled()
  })

  it('evictUserFromWorkspaceRooms: io가 없거나 프로젝트가 없으면 0', async () => {
    expect(await evictUserFromWorkspaceRooms(null, ws.id, 'u')).toBe(0)
    expect(await evictUserFromWorkspaceRooms({ of: () => ({ sockets: new Map() }) }, ws.id, 'u', { listProjects: async () => [] })).toBe(0)
  })
})
