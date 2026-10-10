/**
 * 워크스페이스 이메일 초대 회귀 테스트
 *
 * 배경: 초대 라우트가 auth.admin.listUsers()를 인자 없이 불러 첫 페이지(기본 50명)에서만
 * 이메일을 찾았다. 가입자가 50명을 넘자 이미 가입한 교사를 찾지 못하고 토큰 초대로 처리해
 * 즉시 멤버로 추가되지 않았다.
 *
 * 가짜 관리 클라이언트는 실제처럼 per_page가 없으면 50명만 돌려준다(fakeAuthAdmin.js).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createFakeAuthAdmin, makeTeachers } from '../../lib/__tests__/fakeAuthAdmin.js'

const state = vi.hoisted(() => ({
  client: null,
  roles: new Map(),
}))

// 실제 supabaseAdmin처럼 환경변수가 없으면 속성에 접근하는 순간 throw한다
vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: new Proxy({}, {
    get(_, prop) {
      if (!state.client) throw new Error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수를 설정하세요.')
      return state.client[prop]
    },
  }),
}))

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, res, next) => {
    const id = req.get('x-test-user')
    if (!id) return res.status(401).json({ error: '인증이 필요합니다.' })
    req.user = { id }
    next()
  },
}))

vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getMemberRole: vi.fn(async (workspaceId, userId) => state.roles.get(`${workspaceId}:${userId}`) || null),
  addMember: vi.fn(async (workspaceId, userId, role) => ({ workspace_id: workspaceId, user_id: userId, role })),
  createInvite: vi.fn(async (workspaceId, email, role) => ({
    workspace_id: workspaceId, email, role, token: 'tok123', expires_at: '2026-10-17T00:00:00.000Z',
  })),
}))

const { default: workspacesRouter } = await import('../workspaces.js')
const { addMember, createInvite } = await import('../../lib/supabaseService.js')

const app = express()
app.use(express.json())
app.use('/api/workspaces', workspacesRouter)

function invite(email, role) {
  return request(app)
    .post('/api/workspaces/w1/invite')
    .set('x-test-user', 'host-user')
    .send(role ? { email, role } : { email })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.client = null
  state.roles.clear()
  state.roles.set('w1:host-user', 'owner')
})

describe('POST /api/workspaces/:id/invite — 가입자 50명 초과', () => {
  it('가입자 120명 중 87번째 교사를 초대하면 토큰이 아니라 즉시 멤버로 추가한다', async () => {
    const teachers = makeTeachers(120)
    state.client = createFakeAuthAdmin({ authUsers: teachers }).client

    const res = await invite('teacher0087@school.kr')

    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('added')
    expect(res.body.member).toMatchObject({ user_id: 'user-0087', role: 'editor', email: 'teacher0087@school.kr' })
    expect(addMember).toHaveBeenCalledWith('w1', 'user-0087', 'editor')
    expect(createInvite).not.toHaveBeenCalled()
  })

  it('프로필 미러에 없는 가입자(가입만 하고 서버 요청 전)도 끝 페이지까지 찾아 추가한다', async () => {
    const teachers = makeTeachers(2500)
    // 마지막 교사만 미러에 없다
    const mirrorRows = teachers.slice(0, -1).map((u) => ({ id: u.id, email: u.email }))
    state.client = createFakeAuthAdmin({ authUsers: teachers, mirrorRows }).client

    const res = await invite('teacher2500@school.kr', 'viewer')

    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('added')
    expect(addMember).toHaveBeenCalledWith('w1', 'user-2500', 'viewer')
    expect(createInvite).not.toHaveBeenCalled()
  })

  it('대문자·공백이 섞인 입력도 같은 교사로 찾는다', async () => {
    state.client = createFakeAuthAdmin({ authUsers: makeTeachers(120) }).client

    const res = await invite('  Teacher0099@School.KR ')

    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('added')
    expect(addMember).toHaveBeenCalledWith('w1', 'user-0099', 'editor')
  })

  it('이미 멤버인 가입자는 409이고 다시 추가하지 않는다', async () => {
    state.client = createFakeAuthAdmin({ authUsers: makeTeachers(120) }).client
    state.roles.set('w1:user-0087', 'editor')

    const res = await invite('teacher0087@school.kr')

    expect(res.status).toBe(409)
    expect(addMember).not.toHaveBeenCalled()
    expect(createInvite).not.toHaveBeenCalled()
  })

  it('가입하지 않은 이메일은 토큰 초대 링크를 만든다', async () => {
    state.client = createFakeAuthAdmin({ authUsers: makeTeachers(120) }).client

    const res = await invite('Newcomer@School.kr')

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ kind: 'link', email: 'newcomer@school.kr', invite_path: '/invite/tok123' })
    expect(createInvite).toHaveBeenCalledWith('w1', 'newcomer@school.kr', 'editor', 'host-user')
    expect(addMember).not.toHaveBeenCalled()
  })
})

describe('POST /api/workspaces/:id/invite — Supabase 미설정(로컬) 폴백', () => {
  it('관리 클라이언트가 없으면 조회를 건너뛰고 토큰 초대로 처리한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.client = null

    const res = await invite('teacher0087@school.kr')

    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('link')
    expect(createInvite).toHaveBeenCalledWith('w1', 'teacher0087@school.kr', 'editor', 'host-user')
    expect(addMember).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
