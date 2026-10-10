/**
 * 로컬 dev 인증 바이패스의 dev 유저 조회 회귀 테스트
 *
 * 종전에는 dev 유저가 이미 있으면 listUsers({ page: 1, perPage: 1000 }) 한 쪽에서만 찾아,
 * 가입자가 1,000명을 넘고 dev 유저가 뒤쪽에 있으면 바이패스가 꺼졌다.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createFakeAuthAdmin, makeTeachers } from '../../lib/__tests__/fakeAuthAdmin.js'

const DEV_EMAIL = 'dev@curriculum-weaver.local'

const fake = vi.hoisted(() => ({ client: null }))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: new Proxy({}, { get: (_, prop) => fake.client[prop] }),
}))
vi.mock('../../lib/supabaseService.js', () => ({ getMemberRole: vi.fn() }))

let requireAuth
let calls

beforeAll(async () => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
  vi.stubEnv('DEV_AUTH_BYPASS', 'true')
  vi.stubEnv('NODE_ENV', 'test')

  const teachers = makeTeachers(1500)
  teachers[1199] = { id: 'dev-user-id', email: DEV_EMAIL, user_metadata: { display_name: '개발자' } }
  // dev 유저는 미러에 없다고 가정해 전체 탐색 경로를 지나게 한다
  const mirrorRows = teachers.filter((u) => u.email !== DEV_EMAIL).map((u) => ({ id: u.id, email: u.email }))
  const created = createFakeAuthAdmin({ authUsers: teachers, mirrorRows })
  fake.client = created.client
  calls = created.calls

  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ;({ requireAuth } = await import('../auth.js'))
})

afterAll(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('DEV_AUTH_BYPASS dev 유저 조회', () => {
  it('가입자 1,500명 중 1,200번째에 있는 dev 유저도 찾아 req.user로 쓴다', async () => {
    const req = { headers: {} }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(req.user.id).toBe('dev-user-id')
    expect(calls.listUsers.map((p) => p.page)).toEqual([1, 2])
    expect(calls.upsert).toEqual([expect.objectContaining({ id: 'dev-user-id', email: DEV_EMAIL })])
  })
})
