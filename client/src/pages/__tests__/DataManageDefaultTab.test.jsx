// @vitest-environment happy-dom
/**
 * 교육과정 데이터 관리(/data) 처음 화면 (2026-10-19)
 * - 들어가면 가입 승인 탭이 먼저 열린다(탭 순서도 맨 앞)
 * - 성취기준 통계("현재 데이터")는 성취기준 보기 탭에서만 보인다
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() }))

import { apiGet } from '../../lib/api'
import DataManage from '../DataManage'

let host, root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(apiGet).mockReset()
  vi.mocked(apiGet).mockImplementation(async (url) => {
    if (url === '/api/admin/users/pending') return { since: '2026-10-11T06:00:00Z', pending: [], without_profile: 0 }
    if (url === '/api/standards/all') return [{ code: '[12정01-01]', subject: '정보', grade_group: '고1~3' }]
    if (url === '/api/standards/subjects') return ['정보']
    if (url === '/api/standards/grades') return ['고1~3']
    if (url === '/api/standards/links/reports') return { items: [], total: 0 }
    return {}
  })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

async function render() {
  await act(async () => root.render(<MemoryRouter><DataManage /></MemoryRouter>))
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

const tabButtons = () => [...host.querySelectorAll('button')].filter((b) => ['가입 승인', '성취기준 보기', '데이터 업로드', '신고 검토'].some((l) => b.textContent.startsWith(l)))

describe('/data 처음 화면', () => {
  it('가입 승인 탭이 맨 앞이고 처음부터 열려 있다', async () => {
    await render()
    expect(tabButtons()[0].textContent.startsWith('가입 승인')).toBe(true)
    expect(host.querySelector('[data-testid="approval-queue"]')).not.toBeNull()
  })

  it('성취기준 통계는 가입 승인 화면에 없고, 성취기준 보기 탭에서 보인다', async () => {
    await render()
    expect(host.textContent).not.toContain('현재 데이터')
    const browse = tabButtons().find((b) => b.textContent.startsWith('성취기준 보기'))
    await act(async () => { browse.click() })
    expect(host.textContent).toContain('현재 데이터')
    expect(host.querySelector('[data-testid="approval-queue"]')).toBeNull()
  })
})
