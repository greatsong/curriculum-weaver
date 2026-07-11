/**
 * 인증 캐시 회귀 테스트 (2026-07-12 성능 개선)
 * - 토큰 검증 60초 캐시: TTL 내 재요청은 Supabase Auth 왕복 없음
 * - 무효 토큰은 캐시하지 않음 (갱신 직후 토큰 거부 고착 방지)
 * - users 프로필 upsert: 동일 내용 스로틀, 내용 변경 시 즉시 재기록
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// requireAuth의 "Supabase 미설정" 가드를 통과시키기 위한 테스트 env 스텁
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'

const getUserMock = vi.fn()
const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null })

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: {
    auth: { getUser: (...a) => getUserMock(...a) },
    from: () => ({ upsert: (...a) => upsertMock(...a) }),
  },
}))
vi.mock('../../lib/supabaseService.js', () => ({ getMemberRole: vi.fn() }))

const { verifyTokenCached, requireAuth } = await import('../auth.js')

function makeUser(id, meta = {}) {
  return { id, email: `${id}@test.local`, user_metadata: meta }
}

function mockReqRes(token) {
  const req = { headers: { authorization: `Bearer ${token}` } }
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  return { req, res }
}

beforeEach(() => {
  getUserMock.mockReset()
  upsertMock.mockClear()
})

describe('verifyTokenCached', () => {
  it('TTL 내 동일 토큰 재검증은 Auth 왕복 없이 캐시로 응답', async () => {
    getUserMock.mockResolvedValue({ data: { user: makeUser('u1') }, error: null })
    const a = await verifyTokenCached('token-cache-1')
    const b = await verifyTokenCached('token-cache-1')
    expect(a.id).toBe('u1')
    expect(b.id).toBe('u1')
    expect(getUserMock).toHaveBeenCalledTimes(1)
  })

  it('무효 토큰은 null 반환 + 캐시하지 않음 (다음 호출에서 재검증)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
    expect(await verifyTokenCached('bad-token')).toBeNull()
    // 이후 유효해지면(재로그인 등) 즉시 통과해야 함
    getUserMock.mockResolvedValue({ data: { user: makeUser('u2') }, error: null })
    expect((await verifyTokenCached('bad-token'))?.id).toBe('u2')
    expect(getUserMock).toHaveBeenCalledTimes(2)
  })

  it('네트워크 예외는 throw로 전파 (호출부 catch 경로 유지)', async () => {
    getUserMock.mockRejectedValue(new Error('network down'))
    await expect(verifyTokenCached('token-neterr')).rejects.toThrow('network down')
  })
})

describe('requireAuth 프로필 upsert 스로틀', () => {
  it('동일 프로필 연속 요청은 upsert 1회만', async () => {
    getUserMock.mockResolvedValue({ data: { user: makeUser('u3', { display_name: '교사A' }) }, error: null })
    for (let i = 0; i < 3; i++) {
      const { req, res } = mockReqRes('token-u3')
      await new Promise((r) => requireAuth(req, res, r))
      expect(req.user.id).toBe('u3')
    }
    expect(upsertMock).toHaveBeenCalledTimes(1)
  })

  it('프로필 내용이 바뀌면 즉시 다시 기록 (신선도 보장)', async () => {
    getUserMock.mockResolvedValue({ data: { user: makeUser('u4', { display_name: '이름1' }) }, error: null })
    {
      const { req, res } = mockReqRes('token-u4-a')
      await new Promise((r) => requireAuth(req, res, r))
    }
    // 이름 변경된 새 토큰 (메타데이터 갱신)
    getUserMock.mockResolvedValue({ data: { user: makeUser('u4', { display_name: '이름2' }) }, error: null })
    {
      const { req, res } = mockReqRes('token-u4-b')
      await new Promise((r) => requireAuth(req, res, r))
    }
    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(upsertMock.mock.calls[1][0].display_name).toBe('이름2')
  })

  it('무효 토큰이면 401 (dev bypass 비활성 환경)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })
    const { req, res } = mockReqRes('token-expired')
    await requireAuth(req, res, () => { throw new Error('next가 호출되면 안 됨') })
    expect(res.status).toHaveBeenCalledWith(401)
  })
})
