/**
 * 처리방침 변경 안내 막대 — 보이기·닫기·기간·처리방침 화면 숨김
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import PolicyNoticeBanner, { POLICY_NOTICE_KEY, POLICY_NOTICE_TITLE } from '../PolicyNoticeBanner'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
const DURING = new Date('2026-10-11T09:00:00+09:00')

function mount(path, now = DURING) {
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}><PolicyNoticeBanner now={now} /></MemoryRouter>)
  })
}

function memoryStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('PolicyNoticeBanner', () => {
  it('안내와 처리방침 링크가 보인다', () => {
    mount('/workspaces')
    expect(container.textContent).toContain(POLICY_NOTICE_TITLE)
    expect(container.querySelector('a').getAttribute('href')).toBe('/privacy')
  })

  it('닫으면 사라지고 다시 열어도 보이지 않는다', () => {
    mount('/workspaces')
    act(() => container.querySelector('button[aria-label="안내 닫기"]').click())
    expect(container.textContent).not.toContain(POLICY_NOTICE_TITLE)
    expect(localStorage.getItem(POLICY_NOTICE_KEY)).toBe('1')
    act(() => root.unmount())
    root = createRoot(container)
    mount('/workspaces')
    expect(container.textContent).not.toContain(POLICY_NOTICE_TITLE)
  })

  it('처리방침 화면에서는 보이지 않는다', () => {
    mount('/privacy')
    expect(container.textContent).not.toContain(POLICY_NOTICE_TITLE)
  })

  it('안내 기간이 지나면 보이지 않는다', () => {
    mount('/', new Date('2026-11-01T00:00:00+09:00'))
    expect(container.textContent).not.toContain(POLICY_NOTICE_TITLE)
  })
})
