/**
 * 새 배포 안내 막대 — 문구·버튼, [새로고침] 전 안전 확인, 경로 이동 때 감시 장치 호출
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiStreamPost: vi.fn(), API_BASE: '', getHeaders: vi.fn() }))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

import DeployUpdateBanner, { DEPLOY_BANNER_MESSAGE } from '../DeployUpdateBanner'
import DeployWatcher from '../DeployWatcher'

let host, root
const buttonByText = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent === text)
const click = async (el) => { expect(el).toBeTruthy(); await act(async () => el.click()) }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

it('열리면 상단 고정 안내와 [새로고침] 버튼을 보이고, 안전하면 바로 새로고침한다', async () => {
  const onReload = vi.fn()
  const onDismiss = vi.fn()
  await act(async () => root.render(
    <DeployUpdateBanner open onReload={onReload} onDismiss={onDismiss} checkSafety={() => ({ safe: true, reasons: [] })} />,
  ))
  expect(host.textContent).toContain(DEPLOY_BANNER_MESSAGE)
  expect(DEPLOY_BANNER_MESSAGE).not.toMatch(/—|자리/)
  expect(host.querySelector('[data-deploy-banner]').style.position).toBe('fixed')
  expect(host.querySelector('[role="status"]')).toBeTruthy()

  await click(buttonByText('새로고침'))
  expect(onReload).toHaveBeenCalledTimes(1)

  await click(host.querySelector('button[aria-label="안내 닫기"]'))
  expect(onDismiss).toHaveBeenCalledTimes(1)

  await act(async () => root.render(<DeployUpdateBanner open={false} onReload={onReload} onDismiss={onDismiss} />))
  expect(host.textContent).toBe('')
})

it('보내지 않은 글이 있으면 [새로고침]을 눌러도 바로 하지 않고 무엇이 사라지는지 묻는다', async () => {
  const onReload = vi.fn()
  await act(async () => root.render(
    <DeployUpdateBanner open onReload={onReload} onDismiss={() => {}} checkSafety={() => ({ safe: false, reasons: ['chat-input'] })} />,
  ))
  await click(buttonByText('새로고침'))
  expect(onReload).not.toHaveBeenCalled()
  const warning = host.querySelector('[data-testid="deploy-banner-warning"]')
  expect(warning.textContent).toContain('대화 입력창에 보내지 않은 글이 있습니다.')
  expect(warning.textContent).toContain('지금 새로고침하면 이 내용이 사라질 수 있습니다.')

  await click(buttonByText('취소'))
  expect(host.querySelector('[data-testid="deploy-banner-warning"]')).toBeNull()
  expect(onReload).not.toHaveBeenCalled()

  await click(buttonByText('새로고침'))
  await click(buttonByText('그래도 새로고침'))
  expect(onReload).toHaveBeenCalledTimes(1)
})

it('안전 판정이 오류를 내면 바로 새로고침하지 않는다', async () => {
  const onReload = vi.fn()
  await act(async () => root.render(
    <DeployUpdateBanner open onReload={onReload} onDismiss={() => {}} checkSafety={() => { throw new Error('boom') }} />,
  ))
  await click(buttonByText('새로고침'))
  expect(onReload).not.toHaveBeenCalled()
  expect(host.textContent).toContain('화면 상태를 확인하지 못했습니다.')
})

function fakeWatcher(initial) {
  let state = initial
  const listeners = new Set()
  return {
    start: vi.fn(),
    stop: vi.fn(),
    handleRouteChange: vi.fn(() => false),
    reloadNow: vi.fn(),
    dismiss: vi.fn(() => { state = { ...state, dismissed: true }; listeners.forEach((l) => l()) }),
    getState: () => state,
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
    push(patch) { state = { ...state, ...patch }; listeners.forEach((l) => l()) },
  }
}

let navigateTo
function NavProbe() {
  navigateTo = useNavigate()
  return null
}

it('감시 장치 상태를 따라 안내를 보이고, 경로가 바뀔 때만 handleRouteChange를 부른다', async () => {
  const watcher = fakeWatcher({ updateAvailable: false, dismissed: false })
  await act(async () => root.render(
    <MemoryRouter initialEntries={['/workspaces']}>
      <DeployWatcher watcher={watcher} checkSafety={() => ({ safe: true, reasons: [] })} />
      <NavProbe />
    </MemoryRouter>,
  ))
  expect(watcher.start).toHaveBeenCalledTimes(1)
  expect(watcher.handleRouteChange).not.toHaveBeenCalled() // 첫 화면은 이동이 아니다
  expect(host.querySelector('[data-deploy-banner]')).toBeNull()

  await act(async () => watcher.push({ updateAvailable: true }))
  expect(host.textContent).toContain(DEPLOY_BANNER_MESSAGE)

  await act(async () => navigateTo('/workspaces?tab=projects')) // 같은 경로의 쿼리 변경은 이동이 아니다
  expect(watcher.handleRouteChange).not.toHaveBeenCalled()
  await act(async () => navigateTo('/workspaces/w1'))
  expect(watcher.handleRouteChange).toHaveBeenCalledTimes(1)

  await click(host.querySelector('button[aria-label="안내 닫기"]'))
  expect(host.querySelector('[data-deploy-banner]')).toBeNull()
})

it('감시 장치가 없으면(dev 서버) 아무것도 그리지 않는다', async () => {
  await act(async () => root.render(
    <MemoryRouter><DeployWatcher watcher={null} /></MemoryRouter>,
  ))
  expect(host.innerHTML).toBe('')
})
