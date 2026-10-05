import { describe, it, expect, vi } from 'vitest'
import { isValidRoomId, checkJoinAccess } from '../socketJoinGuard.js'

const UUID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'

describe('isValidRoomId', () => {
  it('UUID 문자열과 레거시 세션 ID를 허용한다', () => {
    expect(isValidRoomId(UUID)).toBe(true)
    expect(isValidRoomId('proj-1')).toBe(true)
  })

  it('배열·객체·빈 값·구분자가 든 문자열을 거절한다', () => {
    expect(isValidRoomId([UUID, 'x'])).toBe(false)
    expect(isValidRoomId({ id: UUID })).toBe(false)
    expect(isValidRoomId('')).toBe(false)
    expect(isValidRoomId(undefined)).toBe(false)
    expect(isValidRoomId(`${UUID},x`)).toBe(false)
    expect(isValidRoomId('a'.repeat(65))).toBe(false)
  })
})

describe('checkJoinAccess', () => {
  const base = { userId: 'u1', retryDelayMs: 0 }

  it('배열 projectId는 조회 없이 거절한다', async () => {
    const getProject = vi.fn()
    const result = await checkJoinAccess({ ...base, projectId: [UUID, 'x'], getProject, getMemberRole: vi.fn(), strict: true })
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(getProject).not.toHaveBeenCalled()
  })

  it('멤버는 참여한다', async () => {
    const result = await checkJoinAccess({
      ...base, projectId: UUID, strict: true,
      getProject: async () => ({ id: UUID, workspace_id: 'w1' }),
      getMemberRole: async () => 'editor',
    })
    expect(result).toEqual({ ok: true })
  })

  it('멤버가 아니면 거절한다', async () => {
    const result = await checkJoinAccess({
      ...base, projectId: UUID, strict: true,
      getProject: async () => ({ id: UUID, workspace_id: 'w1' }),
      getMemberRole: async () => null,
    })
    expect(result).toEqual({ ok: false, reason: 'forbidden' })
  })

  it('운영에서 조회가 계속 실패하면 거절한다', async () => {
    const getProject = vi.fn().mockRejectedValue(new Error('db'))
    const result = await checkJoinAccess({ ...base, projectId: UUID, strict: true, getProject, getMemberRole: vi.fn() })
    expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(getProject).toHaveBeenCalledTimes(2)
  })

  it('운영에서 첫 조회만 실패하면 재시도로 참여한다', async () => {
    const getProject = vi.fn()
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce({ id: UUID, workspace_id: 'w1' })
    const result = await checkJoinAccess({ ...base, projectId: UUID, strict: true, getProject, getMemberRole: async () => 'host' })
    expect(result).toEqual({ ok: true })
  })

  it('로컬(Supabase 미설정)에서는 조회 실패를 통과시킨다', async () => {
    const result = await checkJoinAccess({
      ...base, projectId: 'proj-1', strict: false,
      getProject: async () => { throw new Error('none') },
      getMemberRole: vi.fn(),
    })
    expect(result).toEqual({ ok: true })
  })
})
