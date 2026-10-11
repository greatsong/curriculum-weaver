// @vitest-environment happy-dom
/**
 * 관리자 가입 승인 탭·참여 요청 목록·오늘 AI 사용 카드 (2026-10-11)
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }))

import { apiGet, apiPost } from '../../lib/api'
import ApprovalQueue, { providerLabel } from '../ApprovalQueue'
import JoinRequestList from '../JoinRequestList'
import AiBudgetStatus from '../AiBudgetStatus'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(apiGet).mockReset()
  vi.mocked(apiPost).mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

describe('가입 승인 탭', () => {
  const pending = [
    { id: 'u-1', email: 'new1@school.kr', name: '새 교사', provider: 'google', email_confirmed: true, created_at: '2026-10-11T07:00:00Z' },
    { id: 'u-2', email: 'new2@school.kr', name: '', provider: 'email', email_confirmed: false, created_at: '2026-10-11T08:00:00Z' },
  ]

  it('이메일·이름·가입 방식·가입 시각과 승인/거절 버튼을 보여 준다', async () => {
    vi.mocked(apiGet).mockResolvedValue({ since: '2026-10-11T06:00:00Z', pending })
    const onCount = vi.fn()
    await act(async () => root.render(<ApprovalQueue onCountChange={onCount} />))
    expect(host.textContent).toContain('new1@school.kr')
    expect(host.textContent).toContain('새 교사')
    expect(host.textContent).toContain('구글')
    expect(host.textContent).toContain('메일 미확인')
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(onCount).toHaveBeenCalledWith(2)
  })

  it('승인을 누르면 승인 API를 부르고 목록을 다시 읽는다', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ pending }).mockResolvedValueOnce({ pending: pending.slice(1) })
    vi.mocked(apiPost).mockResolvedValue({ approved: true })
    await act(async () => root.render(<ApprovalQueue />))
    await act(async () => host.querySelectorAll('tbody tr')[0].querySelector('button').click())
    expect(apiPost).toHaveBeenCalledWith('/api/admin/users/u-1/approve', {})
    await vi.waitFor(() => expect(host.querySelectorAll('tbody tr')).toHaveLength(1))
  })

  it('거절은 확인을 거쳐 거절 API를 부른다', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.mocked(apiGet).mockResolvedValue({ pending })
    vi.mocked(apiPost).mockResolvedValue({ rejected: true })
    await act(async () => root.render(<ApprovalQueue />))
    const rejectBtn = [...host.querySelectorAll('tbody tr')[1].querySelectorAll('button')].find((b) => b.textContent === '거절')
    await act(async () => rejectBtn.click())
    expect(apiPost).toHaveBeenCalledWith('/api/admin/users/u-2/reject', {})
  })

  it('관리자가 아니면(403) 안내만', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('관리자 전용 기능입니다.'))
    await act(async () => root.render(<ApprovalQueue />))
    expect(host.textContent).toContain('관리자 권한 필요')
  })

  it('가입 방식 표시', () => {
    expect(providerLabel('google')).toBe('구글')
    expect(providerLabel('email')).toBe('이메일')
    expect(providerLabel(undefined)).toBe('이메일')
  })
})

describe('참여 요청 목록 (host·owner)', () => {
  it('요청이 있으면 보여 주고 수락하면 API 호출 + 멤버 새로고침', async () => {
    const req = { id: 'r1', user_email: 'other@school.kr', user_name: '박교사', invited_email: 'kim@school.kr', requested_role: 'editor', created_at: '2026-10-11T07:00:00Z' }
    vi.mocked(apiGet).mockResolvedValueOnce({ requests: [req] }).mockResolvedValueOnce({ requests: [] })
    vi.mocked(apiPost).mockResolvedValue({})
    const onAccepted = vi.fn()
    await act(async () => root.render(<JoinRequestList workspaceId="w1" onAccepted={onAccepted} />))
    expect(host.textContent).toContain('참여 요청 1건')
    expect(host.textContent).toContain('other@school.kr')
    expect(host.textContent).toContain('kim@school.kr')
    expect(host.textContent).toContain('편집자')
    await act(async () => button('수락').click())
    expect(apiPost).toHaveBeenCalledWith('/api/workspaces/w1/join-requests/r1/accept', {})
    expect(onAccepted).toHaveBeenCalled()
    expect(host.querySelector('[data-testid="join-requests"]')).toBeNull()
  })

  it('요청이 없으면 아무것도 그리지 않는다', async () => {
    vi.mocked(apiGet).mockResolvedValue({ requests: [] })
    await act(async () => root.render(<JoinRequestList workspaceId="w1" />))
    expect(host.querySelector('[data-testid="join-requests"]')).toBeNull()
  })
})

describe('오늘 AI 사용 카드', () => {
  it('비용·한도·초과 여부를 보여 준다', async () => {
    vi.mocked(apiGet).mockResolvedValue({ budget: { enabled: true, today_cost_usd: 10.5, budget_usd: 10, exceeded: true, user_daily_limit: 400 } })
    await act(async () => root.render(<AiBudgetStatus />))
    const card = host.querySelector('[data-testid="ai-budget-status"]')
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('$10.50')
    expect(card.textContent).toContain('$10.00')
    expect(card.textContent).toContain('한도 도달')
    expect(card.textContent).toContain('400회')
  })

  it('관리자가 아니면(403) 그리지 않는다', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('관리자 전용 기능입니다.'))
    await act(async () => root.render(<AiBudgetStatus />))
    expect(host.querySelector('[data-testid="ai-budget-status"]')).toBeNull()
  })
})
