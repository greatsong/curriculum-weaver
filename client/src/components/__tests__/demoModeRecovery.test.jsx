// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
const m = vi.hoisted(() => ({ navigate: vi.fn(), get: vi.fn(), user: { id: 'u' } }))
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }))
vi.mock('../../lib/api', () => ({ API_BASE: '', apiGet: m.get, getHeaders: async () => ({}) }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ user: m.user, initialized: true }) }))
vi.mock('../Logo', () => ({ default: () => null }))
import DemoMode from '../DemoMode'
let host, root
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  m.get.mockImplementation(async path => path === '/api/workspaces' ? [{ id: 'w', name: '시험 공간' }] : { status: 'simulation' })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
async function fill() {
  await act(async () => root.render(<DemoMode/>))
  await act(async () => { button('1학년').click(); button('국어').click(); button('과학').click() })
  await act(async () => {
    const input = host.querySelector('input[maxlength="100"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '기후 변화')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function response(events) {
  return { ok: true, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''))); c.close() } }) }
}
it('시작 이벤트 직후 연결이 끝나도 기존 프로젝트를 즉시 찾아 이동한다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response([{ type: 'started', projectId: 'p', workspaceId: 'w' }])))
  await fill()
  await act(async () => button('시뮬레이션 시작').click())
  expect(m.navigate).toHaveBeenCalledWith('/workspaces/w/projects/p')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('시작 이벤트 없는 EOF는 멈춘 로딩 화면 대신 재시도를 안내하고 요청 ID를 유지한다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response([])))
  await fill()
  await act(async () => button('시뮬레이션 시작').click())
  expect(host.textContent).toContain('시작 상태를 확인하지 못했습니다')
  const requestId = JSON.parse(fetch.mock.calls[0][1].body).requestId
  await act(async () => button('시뮬레이션 시작').click())
  expect(JSON.parse(fetch.mock.calls[1][1].body).requestId).toBe(requestId)
})
it('중복 요청 응답의 프로젝트를 복구하며 추가 요청을 만들지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ projectId: 'p', workspaceId: 'w' }) })))
  await fill()
  await act(async () => button('시뮬레이션 시작').click())
  expect(m.navigate).toHaveBeenCalledWith('/workspaces/w/projects/p')
  expect(fetch).toHaveBeenCalledTimes(1)
})
