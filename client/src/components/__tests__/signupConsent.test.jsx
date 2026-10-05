// @vitest-environment happy-dom
/** 회원가입 화면의 개인정보 동의 — 수집·이용 항목을 체크해야 가입 요청을 보내고, 빠지면 안내한다. 국외 이전은 안내(동의 항목 아님). */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPut: vi.fn() }))

import { useAuthStore } from '../../stores/authStore'
import LoginPage from '../../pages/LoginPage'

let host, root
const signup = vi.fn(async () => ({ user: { id: 'n1' }, session: null }))
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  signup.mockClear()
  useAuthStore.setState({ signup, error: null })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<MemoryRouter><LoginPage /></MemoryRouter>))
  const toggle = [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === '회원가입')
  await act(async () => toggle.click())
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

function type(placeholder, value) {
  const input = host.querySelector(`input[placeholder="${placeholder}"]`)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function fillAndSubmit() {
  await act(async () => {
    type('예: 김교사', '김교사')
    type('seoul@sen.go.kr', 'kim@school.kr')
    type('6자 이상 입력', 'secret1')
  })
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

it('수집·이용 동의를 빼면 가입 요청을 보내지 않고 안내한다', async () => {
  await fillAndSubmit()
  expect(signup).not.toHaveBeenCalled()
  expect(host.textContent).toContain('필수 개인정보 동의 항목을 체크해야 가입을 진행할 수 있습니다.')
})

it('국외 이전은 따로 체크하지 않는다 — 수집·이용에 동의하면 가입 요청을 보낸다', async () => {
  expect(host.querySelector('#signup-transfer')).toBeNull()
  await act(async () => host.querySelector('#signup-collection').click())
  await fillAndSubmit()
  expect(signup).toHaveBeenCalledWith('kim@school.kr', 'secret1', '김교사', expect.objectContaining({ privacyConsent: true }))
})
