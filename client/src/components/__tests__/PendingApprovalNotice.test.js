import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ apiGet: vi.fn() }))

import { longestWaitDays } from '../PendingApprovalNotice.jsx'

describe('가입 승인 대기 일수', () => {
  const now = Date.parse('2026-11-10T00:00:00Z')
  it('가장 먼저 가입한 사람을 기준으로 센다', () => {
    expect(longestWaitDays([{ created_at: '2026-11-05T00:00:00Z' }, { created_at: '2026-10-12T00:00:00Z' }], now)).toBe(29)
  })
  it('목록이 비었거나 날짜를 읽지 못하면 0이다', () => {
    expect(longestWaitDays([], now)).toBe(0)
    expect(longestWaitDays([{ created_at: 'x' }], now)).toBe(0)
    expect(longestWaitDays(null, now)).toBe(0)
  })
})
