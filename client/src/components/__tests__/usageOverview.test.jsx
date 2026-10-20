// @vitest-environment happy-dom
/**
 * 관리자 사용 현황 탭 (UsageOverview, 2026-10-20)
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ apiGet: vi.fn() }))

import { apiGet } from '../../lib/api'
import UsageOverview, { formatLastActivity, usd, overviewErrorMessage } from '../UsageOverview'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(apiGet).mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

function overview(days = 30) {
  const daily = Array.from({ length: days }, (_, i) => ({
    day: new Date(Date.UTC(2026, 9, 20) - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    teacher_messages: i === days - 2 ? 12 : 0, active_accounts: i === days - 2 ? 1 : 0, ai_calls: 0, ai_cost: 0,
  }))
  return {
    generated_at: '2026-10-20T03:00:00Z',
    window: { days, since: '2026-09-20T15:00:00Z' },
    procedure_steps: 18,
    totals: {
      accounts: 3, admins: 1, approval: { approved: 2, pending: 1, rejected: 0, unknown: 0 },
      workspaces: 2, active_workspaces_window: 1, projects: 2, simulations: 1,
      teacher_messages: 50, teacher_messages_window: 12, active_accounts_window: 1, never_active_accounts: 1,
      unattributed_teacher_messages: 7, simulation_teacher_messages: 4,
    },
    ai: {
      tracking_since: '2026-10-12T02:10:29Z', calls_window: 13, errors_window: 0,
      cost_window: 1.15, teacher_cost_window: 0.0073, admin_cost_window: 1.1427, cost_total: 1.15, unpriced_window: 0,
      by_model_route: [
        { provider: 'anthropic', model: 'claude-sonnet-5-5', route: 'futures_lab', calls: 1, errors: 0, cost: 1.1427, unpriced: 0 },
        { provider: 'openai', model: 'gpt-6-luna', route: 'chat', calls: 12, errors: 0, cost: 0.0073, unpriced: 0 },
      ],
    },
    daily,
    workspaces: [
      {
        id: 'w1', name: '기후위기 생물다양성 윤리', owner_name: 'J T', created_at: '2026-10-19T00:00:00Z', members: 1, projects: 1, simulations: 1,
        teacher_messages: 12, teacher_messages_window: 12, active_members_window: 1, ai_calls_window: 12, ai_cost_window: 0.0073, ai_cost_total: 0.0073,
        furthest: { code: 'T-1-1', label: 'T-1 공동 비전 설정', step: 1 }, last_activity_at: '2026-10-19T05:00:00Z',
        project_list: [{ id: 'p1', title: '생물다양성', simulation: false, procedure: { code: 'T-1-1', label: 'T-1 공동 비전 설정', step: 1 }, teacher_messages: 12, last_activity_at: '2026-10-19T05:00:00Z' }],
      },
      {
        id: 'w2', name: '빈 팀', owner_name: '교사3', created_at: '2026-10-16T00:00:00Z', members: 1, projects: 0, simulations: 0,
        teacher_messages: 0, teacher_messages_window: 0, active_members_window: 0, ai_calls_window: 0, ai_cost_window: 0, ai_cost_total: 0,
        furthest: null, last_activity_at: null, project_list: [],
      },
    ],
    accounts: [
      { id: 'a1', name: 'J T', email: 'jt@x.kr', school_name: '', role: 'teacher', approval: 'approved', joined_at: '2026-10-09T00:00:00Z', workspaces: 2, owned_workspaces: 2, teacher_messages: 80, teacher_messages_window: 12, board_saves_window: 3, ai_calls_window: 12, ai_cost_window: 0.0073, ai_cost_total: 0.0073, last_activity_at: '2026-10-19T05:00:00Z' },
      { id: 'a2', name: '관리자', email: 'admin@x.kr', school_name: '', role: 'admin', approval: 'approved', joined_at: '2026-04-04T00:00:00Z', workspaces: 6, owned_workspaces: 3, teacher_messages: 175, teacher_messages_window: 0, board_saves_window: 0, ai_calls_window: 1, ai_cost_window: 1.1427, ai_cost_total: 1.1427, last_activity_at: '2026-10-20T01:00:00Z' },
      { id: 'a3', name: '교사3', email: 't3@y.kr', school_name: '목동고등학교', role: 'teacher', approval: 'pending', joined_at: '2026-10-16T00:00:00Z', workspaces: 1, owned_workspaces: 1, teacher_messages: 0, teacher_messages_window: 0, board_saves_window: 0, ai_calls_window: 0, ai_cost_window: 0, ai_cost_total: 0, last_activity_at: null },
    ],
    truncated: [],
    approval_loaded: true,
    cached: false,
  }
}

describe('표시 도우미', () => {
  it('마지막 활동은 한국 시간 날짜와 상대 날짜로', () => {
    const now = Date.parse('2026-10-20T03:00:00Z')
    expect(formatLastActivity('2026-10-19T16:00:00Z', now).text).toBe('10. 20. (오늘)')
    expect(formatLastActivity('2026-10-19T05:00:00Z', now).text).toBe('10. 19. (어제)')
    expect(formatLastActivity('2026-10-10T05:00:00Z', now).text).toBe('10. 10. (10일 전)')
    expect(formatLastActivity(null, now).text).toBe('없음')
  })
  it('비용은 0·1센트 미만·달러로', () => {
    expect(usd(0)).toBe('$0')
    expect(usd(0.0073)).toBe('<$0.01')
    expect(usd(1.1427)).toBe('$1.14')
  })
  it('오류 안내는 권한·연결·기타로 나눈다', () => {
    expect(overviewErrorMessage(403)).toBe('관리자 권한이 필요합니다.')
    expect(overviewErrorMessage(0)).toContain('연결하지 못했습니다')
    expect(overviewErrorMessage(500)).toContain('불러오지 못했습니다')
  })
})

describe('사용 현황 탭', () => {
  it('요약 숫자·AI 비용·워크스페이스·계정을 보여 준다', async () => {
    vi.mocked(apiGet).mockResolvedValue(overview())
    await act(async () => root.render(<UsageOverview />))
    expect(apiGet).toHaveBeenCalledWith('/api/admin/overview', { days: 30 })
    const text = host.textContent
    expect(text).toContain('승인 대기 1')
    expect(text).toContain('활동 기록 없음 1')
    expect(text).toContain('최근 30일 교사 메시지')
    expect(text).toContain('미래보기')
    expect(text).toContain('설계 채팅')
    expect(text).toContain('2026년 10월 12일부터') // AI 기록 시작일
    expect(host.querySelectorAll('[data-testid="workspace-table"] tbody tr')).toHaveLength(2)
    expect(host.querySelectorAll('[data-testid="account-table"] tbody tr')).toHaveLength(3)
    expect(text).toContain('승인 대기')
    expect(text).toContain('시뮬레이션 프로젝트 1개의 가상 교사 메시지 4건')
    expect(text).toContain('예전 교사 메시지 7건')
  })

  it('기간을 바꾸면 그 기간으로 다시 읽고, 새로고침은 fresh로 읽는다', async () => {
    vi.mocked(apiGet).mockImplementation(async (_p, params) => overview(params.days))
    await act(async () => root.render(<UsageOverview />))
    await act(async () => button('최근 7일').click())
    expect(apiGet).toHaveBeenLastCalledWith('/api/admin/overview', { days: 7 })
    await act(async () => button('새로고침').click())
    expect(apiGet).toHaveBeenLastCalledWith('/api/admin/overview', { days: 7, fresh: 1 })
    expect(host.querySelectorAll('[data-testid="daily-table"] tbody tr')).toHaveLength(7)
  })

  it('워크스페이스를 누르면 프로젝트 목록이 펼쳐지고, 활동한 곳만 보기로 거른다', async () => {
    vi.mocked(apiGet).mockResolvedValue(overview())
    await act(async () => root.render(<UsageOverview />))
    const rowsBefore = host.querySelectorAll('[data-testid="workspace-table"] tbody tr').length
    await act(async () => button('▸기후위기 생물다양성 윤리').click())
    expect(host.querySelectorAll('[data-testid="workspace-table"] tbody tr').length).toBe(rowsBefore + 1)
    expect(host.textContent).toContain('생물다양성')
    const checkbox = host.querySelector('input[type="checkbox"]')
    await act(async () => checkbox.click())
    expect(host.textContent).not.toContain('빈 팀')
  })

  it('계정 검색은 이름·이메일·학교로 거른다', async () => {
    vi.mocked(apiGet).mockResolvedValue(overview())
    await act(async () => root.render(<UsageOverview />))
    const input = host.querySelector('input[type="search"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setter.call(input, '목동')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const rows = host.querySelectorAll('[data-testid="account-table"] tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('교사3')
  })

  it('403이면 권한 안내만, 다른 오류는 다시 불러오기 버튼', async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(Object.assign(new Error('관리자 전용 기능입니다.'), { status: 403 }))
    await act(async () => root.render(<UsageOverview />))
    expect(host.textContent).toContain('관리자 권한이 필요합니다.')
    expect(button('다시 불러오기')).toBeUndefined()
  })

  it('연결 실패 뒤 다시 불러오기를 누르면 새로 읽는다', async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(Object.assign(new Error('timeout'), { status: 0 })).mockResolvedValueOnce(overview())
    await act(async () => root.render(<UsageOverview />))
    expect(host.textContent).toContain('서버에 연결하지 못했습니다')
    await act(async () => button('다시 불러오기').click())
    expect(apiGet).toHaveBeenLastCalledWith('/api/admin/overview', { days: 30, fresh: 1 })
    expect(host.querySelector('[data-testid="usage-overview"]')).not.toBeNull()
  })
})
