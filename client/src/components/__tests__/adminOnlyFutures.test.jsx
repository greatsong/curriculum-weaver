// @vitest-environment happy-dom
/**
 * 미래보기 관리자 전용 (2026-10-19)
 * - /futures-lab 경로는 관리자만 연다. 관리자가 아니면 연결 지도(/graph)로 보낸다
 * - 상단 주 메뉴의 미래보기 링크는 관리자에게만 보인다
 * - 관리자 여부 조회가 실패하면 관리자가 아닌 것으로 본다
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn(async () => ({ error: null })) } } }))
vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn() }))

import { apiGet } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { privacyConsentMetadata } from '../../lib/privacyConsent'
import { _clearSiteAdminCache } from '../../lib/siteAdmin'
import AdminRoute from '../AdminRoute'
import MainNav from '../MainNav'

let host, root
const user = (id) => ({ id, email: `${id}@school.kr`, user_metadata: { display_name: '교사', ...privacyConsentMetadata() } })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(apiGet).mockReset()
  _clearSiteAdminCache()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

function meResponds(role) {
  vi.mocked(apiGet).mockImplementation(async (url) => {
    if (url === '/api/auth/me') {
      if (role instanceof Error) throw role
      return { id: 'x', role }
    }
    return {}
  })
}

async function renderAt(path, id = 'u1') {
  useAuthStore.setState({ user: user(id), session: { access_token: 't' }, loading: false, approvalStatus: 'approved' })
  await act(async () => root.render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/futures-lab" element={<AdminRoute><div id="futures">미래보기 화면</div></AdminRoute>} />
        <Route path="/graph" element={<div id="graph">연결 지도</div>} />
        <Route path="/nav" element={<MainNav />} />
        <Route path="/login" element={<div id="login">로그인</div>} />
      </Routes>
    </MemoryRouter>,
  ))
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

describe('미래보기 경로', () => {
  it('관리자는 미래보기 화면을 연다', async () => {
    meResponds('admin')
    await renderAt('/futures-lab', 'admin-1')
    expect(host.querySelector('#futures')).not.toBeNull()
  })

  it('관리자가 아니면 연결 지도로 보낸다', async () => {
    meResponds('teacher')
    await renderAt('/futures-lab', 'teacher-1')
    expect(host.querySelector('#futures')).toBeNull()
    expect(host.querySelector('#graph')).not.toBeNull()
  })

  it('관리자 여부를 확인하지 못하면 열지 않는다', async () => {
    meResponds(new Error('네트워크'))
    await renderAt('/futures-lab', 'unknown-1')
    expect(host.querySelector('#futures')).toBeNull()
    expect(host.querySelector('#graph')).not.toBeNull()
  })

  it('로그인하지 않았으면 로그인 화면으로 보낸다', async () => {
    meResponds('admin')
    useAuthStore.setState({ user: null, session: null, loading: false, approvalStatus: 'unknown' })
    await act(async () => root.render(
      <MemoryRouter initialEntries={['/futures-lab']}>
        <Routes>
          <Route path="/futures-lab" element={<AdminRoute><div id="futures">미래보기 화면</div></AdminRoute>} />
          <Route path="/login" element={<div id="login">로그인</div>} />
        </Routes>
      </MemoryRouter>,
    ))
    expect(host.querySelector('#login')).not.toBeNull()
  })
})

describe('상단 주 메뉴', () => {
  const hrefs = () => [...host.querySelectorAll('nav a')].map((a) => a.getAttribute('href'))

  it('관리자에게만 미래보기 링크를 보인다', async () => {
    meResponds('admin')
    await renderAt('/nav', 'admin-2')
    expect(hrefs()).toContain('/futures-lab')
    expect(host.textContent).toContain('미래보기')
  })

  it('교사에게는 미래보기 링크가 없다', async () => {
    meResponds('teacher')
    await renderAt('/nav', 'teacher-2')
    expect(hrefs()).toEqual(['/explore', '/graph?mode=explore'])
    expect(host.textContent).not.toContain('미래보기')
  })
})
