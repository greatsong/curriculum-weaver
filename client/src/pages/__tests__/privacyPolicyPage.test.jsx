// @vitest-environment happy-dom
/**
 * 개인정보 처리방침 공개 페이지(/privacy, 2026-10-05) — 개인정보 보호법 제30조가 요구하는 내용이 보이는지 확인한다.
 * 보호책임자는 사용자 지시로 비워 둔다.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, it, expect } from 'vitest'
import PrivacyPolicyPage from '../PrivacyPolicyPage'
import { POLICY_SECTIONS, PRIVACY_OFFICER } from '../../lib/privacyPolicy'

let host, root
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<MemoryRouter><PrivacyPolicyPage /></MemoryRouter>))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

it('절 제목이 번호와 함께 모두 보인다', () => {
  const headings = [...host.querySelectorAll('h2')].map((h) => h.textContent)
  expect(headings).toHaveLength(POLICY_SECTIONS.length)
  expect(headings[0]).toBe('1. 개인정보의 처리 목적')
  expect(headings).toContain('6. 개인정보 처리 위탁과 국외 이전')
  expect(headings).toContain('11. 개인정보 보호책임자')
})

it('수집 항목·국외 이전(이전받는 곳 메일 포함)·구제 기관·시행일이 보인다', () => {
  const text = host.textContent
  expect(text).toContain('시행일 2026년 10월 11일')
  expect(text).toContain('이름, 이메일, 소속 학교(선택)')
  for (const mail of ['privacy@anthropic.com', 'privacy@openai.com', 'privacy@supabase.com', 'privacy@railway.com', 'privacy@vercel.com']) expect(text).toContain(mail)
  for (const country of ['미국', '일본(도쿄)', '싱가포르']) expect(text).toContain(country)
  for (const agency of ['개인정보분쟁조정위원회', '1833-6972', '개인정보침해신고센터', '118', '대검찰청', '1301', '경찰청', '182']) expect(text).toContain(agency)
})

it('보호책임자 칸은 비어 있다(값만 채우면 표시된다)', () => {
  expect(PRIVACY_OFFICER).toEqual({ name: '', email: '' })
  const cells = [...host.querySelectorAll('[data-testid="privacy-officer"] td')].map((td) => td.textContent)
  expect(cells).toEqual(['', ''])
})
