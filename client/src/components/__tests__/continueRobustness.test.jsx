// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), toast: vi.fn(), get: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../../lib/api', () => ({ API_BASE: '', apiGet: mocks.get, getHeaders: async () => ({}) }))
vi.mock('../../stores/toastStore', () => ({ pushToast: mocks.toast }))
import ContinueSimulationButton from '../ContinueSimulationButton'
let host, root
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); mocks.get.mockResolvedValue({ status: 'failed' }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); vi.stubGlobal('confirm', () => true) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
async function run(events) {
  const text = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close() } })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body })))
  await act(async () => root.render(<ContinueSimulationButton projectId="source" workspaceId="w"/>))
  await act(async () => host.querySelector('button').click())
}
it('정상 완료 이벤트가 오면 복제본으로 이동한다', async () => {
  await run([{ type: 'complete', projectId: 'clone', workspaceId: 'w' }])
  expect(mocks.navigate).toHaveBeenCalledWith('/workspaces/w/projects/clone')
})
it('시작 후 완료 이벤트 없이 EOF가 오면 조용히 초기화하지 않고 복구 안내를 보여야 한다', async () => {
  await run([{ type: 'started', projectId: 'clone', remaining: ['Ds-1-1'] }])
  expect(mocks.navigate).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalled()
})
it('완료 이벤트가 유실돼도 조회 결과가 완료이면 기존 복제본으로 이동한다', async () => {
  mocks.get.mockResolvedValue({ status: 'simulation' })
  await run([{ type: 'started', projectId: 'clone', workspaceId: 'w' }])
  expect(mocks.get).toHaveBeenCalledWith('/api/projects/clone')
  expect(mocks.navigate).toHaveBeenCalledWith('/workspaces/w/projects/clone')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('시작 이벤트조차 유실된 요청을 재시도할 때 같은 요청 ID를 보낸다', async () => {
  await run([])
  const first = JSON.parse(fetch.mock.calls[0][1].body).requestId
  await act(async () => host.querySelector('button').click())
  expect(JSON.parse(fetch.mock.calls[1][1].body).requestId).toBe(first)
  expect(mocks.toast).toHaveBeenCalled()
})
it('서버가 이미 생성한 요청을 반환하면 추가 생성 없이 해당 결과를 복구한다', async () => {
  mocks.get.mockResolvedValue({ status: 'simulation' })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ projectId: 'old-clone', workspaceId: 'w', status: 'succeeded' }) })))
  await act(async () => root.render(<ContinueSimulationButton projectId="source" workspaceId="w"/>))
  await act(async () => host.querySelector('button').click())
  expect(mocks.navigate).toHaveBeenCalledWith('/workspaces/w/projects/old-clone')
  expect(fetch).toHaveBeenCalledTimes(1)
})
