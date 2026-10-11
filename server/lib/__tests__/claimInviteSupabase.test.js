/**
 * 초대 링크 원자적 사용 처리·참여 요청 처리의 Supabase 쿼리 조건 확인.
 * (인메모리 경로는 routes/__tests__/inviteJoinFlow.test.js가 본다)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

const calls = vi.hoisted(() => ({ list: [], result: { data: [], error: null } }))

vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: (table) => {
      const q = {
        update(patch) { calls.list.push(['update', table, patch]); return q },
        eq(k, v) { calls.list.push(['eq', k, v]); return q },
        is(k, v) { calls.list.push(['is', k, v]); return q },
        gt(k, v) { calls.list.push(['gt', k, v]); return q },
        select() { calls.list.push(['select']); return Promise.resolve(calls.result) },
      }
      return q
    },
  },
}))

const { claimInvite, resolveJoinRequest } = await import('../supabaseService.js')

beforeEach(() => {
  calls.list.length = 0
  calls.result = { data: [], error: null }
})

describe('claimInvite (Supabase)', () => {
  it('used_at IS NULL·만료 전 조건으로만 갱신하고, 바뀐 행이 없으면 null', async () => {
    expect(await claimInvite('tok1')).toBeNull()
    expect(calls.list[0]).toEqual(['update', 'invites', { used_at: expect.any(String) }])
    expect(calls.list).toContainEqual(['eq', 'token', 'tok1'])
    expect(calls.list).toContainEqual(['is', 'used_at', null])
    expect(calls.list.some(([op, k]) => op === 'gt' && k === 'expires_at')).toBe(true)
  })

  it('갱신된 행이 있으면 그 행을 돌려준다', async () => {
    calls.result = { data: [{ token: 'tok2', workspace_id: 'w1' }], error: null }
    expect(await claimInvite('tok2')).toEqual({ token: 'tok2', workspace_id: 'w1' })
  })

  it('DB 오류는 던진다', async () => {
    calls.result = { data: null, error: { message: 'boom' } }
    await expect(claimInvite('tok3')).rejects.toThrow('초대 사용 처리 실패')
  })
})

describe('resolveJoinRequest (Supabase)', () => {
  it('status=pending인 행만 바꾼다', async () => {
    calls.result = { data: [{ id: 'r1', status: 'accepted' }], error: null }
    expect(await resolveJoinRequest('w1', 'r1', { status: 'accepted', resolvedBy: 'h1' })).toEqual({ id: 'r1', status: 'accepted' })
    expect(calls.list).toContainEqual(['eq', 'status', 'pending'])
    expect(calls.list).toContainEqual(['eq', 'workspace_id', 'w1'])
  })
  it('이미 처리된 요청이면 null', async () => {
    expect(await resolveJoinRequest('w1', 'r1', { status: 'rejected', resolvedBy: 'h1' })).toBeNull()
  })
})
