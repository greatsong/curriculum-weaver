// @vitest-environment happy-dom
/**
 * 개인정보 동의 (2026-10-04) — Google로 처음 로그인했거나 동의 기록이 없는 기존 회원에게 한 번 묻는다.
 * 동의는 두 항목(수집·이용, 국외 이전) 모두 필수. 기록 저장이 실패해도 이번 접속은 시작할 수 있다.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: { auth: { updateUser: vi.fn() } } }))
vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPut: vi.fn() }))

import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { RequirePrivacyConsent } from '../PrivacyConsentGate'
import { PRIVACY_CONSENT_VERSION, hasPrivacyConsent, privacyConsentMetadata } from '../../lib/privacyConsent'

let host, root
const store = new Map()
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  store.clear()
  vi.stubGlobal('sessionStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  supabase.auth.updateUser.mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const googleUser = { id: 'u1', email: 'teacher@school.kr', user_metadata: { full_name: '김교사', avatar_url: 'https://x' } }
const session = { access_token: 'real-token' }

async function renderGate(user) {
  useAuthStore.setState({ user, session, logout: vi.fn() })
  const App = () => {
    const u = useAuthStore((s) => s.user)
    return <RequirePrivacyConsent user={u}><div id="inside">서비스 화면</div></RequirePrivacyConsent>
  }
  await act(async () => root.render(<App />))
}
const gate = () => host.querySelector('[data-testid="privacy-consent-gate"]')
const inside = () => host.querySelector('#inside')
const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(text))
const check = async (id) => act(async () => host.querySelector(`#${id}`).click())

describe('동의 화면 노출', () => {
  it('Google로 처음 로그인한 사용자(동의 기록 없음)에게는 동의 화면을 먼저 보여 준다', async () => {
    await renderGate(googleUser)
    expect(gate()).not.toBeNull()
    expect(inside()).toBeNull()
    expect(host.textContent).toContain('[필수] 개인정보 수집·이용 동의')
    expect(host.textContent).toContain('[필수] 개인정보 국외 이전 동의')
    expect(host.textContent).toContain('teacher@school.kr')
  })

  it('현재 버전 동의 기록이 있으면 바로 서비스 화면', async () => {
    await renderGate({ ...googleUser, user_metadata: { ...googleUser.user_metadata, ...privacyConsentMetadata() } })
    expect(gate()).toBeNull()
    expect(inside()).not.toBeNull()
  })

  it('예전 버전 동의 기록이면 다시 묻는다', async () => {
    await renderGate({ ...googleUser, user_metadata: { privacy_consent_version: '2020-01-01', privacy_consent_at: '2020-01-01T00:00:00Z' } })
    expect(gate()).not.toBeNull()
  })
})

describe('동의하기', () => {
  it('두 항목을 모두 체크해야 버튼이 눌린다', async () => {
    await renderGate(googleUser)
    expect(button('동의하고 계속하기').disabled).toBe(true)
    await check('gate-collection')
    expect(button('동의하고 계속하기').disabled).toBe(true)
    await check('gate-transfer')
    expect(button('동의하고 계속하기').disabled).toBe(false)
  })

  it('동의하면 버전·시각을 계정 메타데이터에 저장하고 서비스 화면으로 들어간다', async () => {
    supabase.auth.updateUser.mockImplementation(async ({ data }) => ({ data: { user: { ...googleUser, user_metadata: { ...googleUser.user_metadata, ...data } } }, error: null }))
    await renderGate(googleUser)
    await check('gate-collection'); await check('gate-transfer')
    await act(async () => button('동의하고 계속하기').click())
    const sent = supabase.auth.updateUser.mock.calls[0][0].data
    expect(sent.privacy_consent_version).toBe(PRIVACY_CONSENT_VERSION)
    expect(Number.isNaN(Date.parse(sent.privacy_consent_at))).toBe(false)
    expect(sent.privacy_consent_items).toEqual(['collection', 'overseas_transfer'])
    expect(hasPrivacyConsent(useAuthStore.getState().user)).toBe(true)
    expect(useAuthStore.getState().user.user_metadata.full_name).toBe('김교사') // 기존 메타데이터 유지
    expect(gate()).toBeNull()
    expect(inside()).not.toBeNull()
  })

  it('저장에 실패하면 안내하고, 이번 접속만 시작할 수 있다(다음 접속 때 다시 묻는다)', async () => {
    supabase.auth.updateUser.mockResolvedValue({ data: null, error: new Error('network') })
    await renderGate(googleUser)
    await check('gate-collection'); await check('gate-transfer')
    await act(async () => button('동의하고 계속하기').click())
    expect(host.querySelector('[role="alert"]').textContent).toContain('동의 기록 저장에 실패했습니다')
    expect(inside()).toBeNull()
    await act(async () => button('이번 접속만 시작').click())
    expect(inside()).not.toBeNull()
    expect(hasPrivacyConsent(useAuthStore.getState().user)).toBe(false)
    // 같은 탭의 다른 화면도 통과, 다른 사용자는 다시 묻는다
    await act(async () => root.unmount()); root = createRoot(host)
    await renderGate(googleUser)
    expect(inside()).not.toBeNull()
    await act(async () => root.unmount()); root = createRoot(host)
    await renderGate({ ...googleUser, id: 'u2' })
    expect(gate()).not.toBeNull()
  })

  it('동의하지 않고 나가기는 로그아웃한다', async () => {
    await renderGate(googleUser)
    await act(async () => button('동의하지 않고 나가기').click())
    expect(useAuthStore.getState().logout).toHaveBeenCalledTimes(1)
  })
})
