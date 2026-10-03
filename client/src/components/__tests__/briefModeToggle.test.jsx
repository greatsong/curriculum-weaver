// @vitest-environment happy-dom
/** 약식 기록 켜기 — 켜면 '핵심 절차는 정식으로 진행' 체크가 나타나고 값을 바꿀 수 있다. */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import BriefModeToggle from '../BriefModeToggle'

let host, root
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

it('약식을 끄면 하위 체크가 없고, 켜면 핵심 절차 목록과 함께 나타난다', async () => {
  const onCore = vi.fn()
  await act(async () => root.render(<BriefModeToggle checked={false} onChange={() => {}} coreFormal onCoreFormalChange={onCore} />))
  expect(host.querySelector('#brief-core-formal-toggle')).toBeNull()
  await act(async () => root.render(<BriefModeToggle checked onChange={() => {}} coreFormal onCoreFormalChange={onCore} />))
  const sub = host.querySelector('#brief-core-formal-toggle')
  expect(sub).not.toBeNull()
  expect(sub.checked).toBe(true)
  expect(host.textContent).toContain('핵심 절차(T-1, T-2, A-2, A-3, A-4)는')
  await act(async () => sub.click())
  expect(onCore).toHaveBeenCalledWith(false)
})
