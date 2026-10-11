// @vitest-environment happy-dom
/**
 * 가입 승인 대기 화면 (2026-10-11)
 * - 승인 대기·거절 계정은 보호된 화면 대신 승인 대기 화면(로그아웃·초대 링크 안내)
 * - 초대 링크 화면은 승인 대기여도 열린다. 이메일이 달라 참여 요청이 되면 안내를 보여 준다
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn(async () => ({ error: null })) } } }))
vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn() }))

import { apiGet, apiPost } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { privacyConsentMetadata } from '../../lib/privacyConsent'
import ProtectedRoute from '../ProtectedRoute'
import InviteAcceptPage from '../../pages/InviteAcceptPage'

let host, root
const consentedUser = { id: 'u1', email: 'new@school.kr', user_metadata: { display_name: '새 교사', ...privacyConsentMetadata() } }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(apiGet).mockReset()
  vi.mocked(apiPost).mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

async function renderAt(path, approvalStatus) {
  useAuthStore.setState({ user: consentedUser, session: { access_token: 't' }, loading: false, approvalStatus })
  await act(async () => root.render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/workspaces" element={<ProtectedRoute><div id="app">서비스 화면</div></ProtectedRoute>} />
        <Route path="/invite/:token" element={<ProtectedRoute allowPending><InviteAcceptPage /></ProtectedRoute>} />
        <Route path="/login" element={<div id="login">로그인</div>} />
      </Routes>
    </MemoryRouter>,
  ))
}

describe('보호된 화면', () => {
  it('승인 대기 계정에는 승인 대기 화면(초대 링크 안내·로그아웃)을 보여 준다', async () => {
    await renderAt('/workspaces', 'pending')
    expect(host.querySelector('#app')).toBeNull()
    expect(host.querySelector('[data-testid="pending-approval"]')).not.toBeNull()
    expect(host.textContent).toContain('관리자 승인을 기다리고 있습니다')
    expect(host.textContent).toContain('초대 링크를 받았다면 그 링크를 다시 열어 주세요.')
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === '로그아웃')).toBe(true)
  })

  it('거절된 계정은 관리자 문의 안내', async () => {
    await renderAt('/workspaces', 'rejected')
    expect(host.textContent).toContain('가입이 승인되지 않았습니다')
    expect(host.querySelector('#app')).toBeNull()
  })

  it('승인된 계정은 서비스 화면', async () => {
    await renderAt('/workspaces', 'approved')
    expect(host.querySelector('#app')).not.toBeNull()
  })

  it('승인 상태를 아직 모르면 확인을 요청하고, 확인 실패(error)면 막지 않는다', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('network'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await renderAt('/workspaces', 'unknown')
    await vi.waitFor(() => expect(host.querySelector('#app')).not.toBeNull())
    expect(apiGet).toHaveBeenCalledWith('/api/auth/me')
    warn.mockRestore()
  })

  it('[다시 확인]으로 승인되면 바로 서비스 화면이 열린다', async () => {
    await renderAt('/workspaces', 'pending')
    vi.mocked(apiGet).mockResolvedValue({ id: 'u1', approved: true, approval_status: 'approved' })
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('다시 확인'))
    await act(async () => btn.click())
    await vi.waitFor(() => expect(host.querySelector('#app')).not.toBeNull())
  })
})

describe('초대 링크 화면', () => {
  it('승인 대기여도 열리고, 이메일이 다르면 참여 요청 안내를 보여 준다', async () => {
    vi.mocked(apiPost).mockResolvedValue({ kind: 'requested', message: '초대한 팀의 호스트가 확인하면 들어갈 수 있습니다.', workspace_id: 'w1', role: 'editor' })
    await renderAt('/invite/tok1', 'pending')
    await vi.waitFor(() => expect(host.textContent).toContain('참여 요청을 보냈습니다'))
    expect(host.textContent).toContain('초대한 팀의 호스트가 확인하면 들어갈 수 있습니다.')
    expect(apiPost).toHaveBeenCalledTimes(1)
    expect(apiPost).toHaveBeenCalledWith('/api/invites/tok1/accept', {})
  })

  it('이메일이 같아 참여하면 승인 상태를 다시 확인한다', async () => {
    vi.mocked(apiPost).mockResolvedValue({ kind: 'joined', message: '워크스페이스에 참여했습니다.', workspace_id: 'w1', role: 'editor' })
    vi.mocked(apiGet).mockImplementation(async (path) => (path === '/api/auth/me'
      ? { id: 'u1', approved: true, approval_status: 'approved' }
      : { id: 'w1', name: '융합 팀', members: [], projects: [] }))
    await renderAt('/invite/tok2', 'pending')
    await vi.waitFor(() => expect(host.textContent).toContain('참여 완료'))
    expect(useAuthStore.getState().approvalStatus).toBe('approved')
  })
})
