// 열람 전용 멤버(viewer) 화면 — 입력창·올리기·재분석·삭제 대신 안내를 보여 준다(2026-10-11).
// 정밀 모드 선택도 화면에서 뺐다.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(),
  apiUploadFile: vi.fn(), apiGetMaterialAnalysis: vi.fn(),
  apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }))
vi.mock('../../stores/chatStore', () => ({
  useChatStore: Object.assign(
    (selector) => selector({ messages: [], pendingSuggestions: [], streaming: false, introCache: {} }),
    { getState: () => ({ streaming: false }) },
  ),
}))
import MaterialUploadBar from '../MaterialUploadBar.jsx'
import ChatPanel from '../ChatPanel.jsx'
import { useProcedureStore } from '../../stores/procedureStore.js'

let root, container
beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('localStorage', { getItem: () => 'precise', setItem: vi.fn() })
  useProcedureStore.getState().reset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  useProcedureStore.getState().stopAllMaterialPolling()
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const material = { id: 'm1', file_name: '수업.txt', category: 'reference', file_type: 'txt', processing_status: 'completed', ai_analysis: { summary: '요약' } }

it('열람자에게는 채팅 입력창 대신 "열람 전용 멤버입니다" 안내', async () => {
  await act(async () => root.render(<ChatPanel projectId="p1" stage="T-1-1" memberRole="viewer" />))
  expect(container.querySelector('textarea')).toBeNull()
  expect(container.textContent).toContain('열람 전용 멤버입니다')
})

it('편집자에게는 입력창이 그대로 있다', async () => {
  await act(async () => root.render(<ChatPanel projectId="p1" stage="T-1-1" memberRole="editor" />))
  expect(container.querySelector('textarea')).not.toBeNull()
  expect(container.textContent).not.toContain('열람 전용 멤버입니다')
})

it('정밀 모드 선택 버튼이 없다(예전에 고른 값이 남아 있어도)', async () => {
  await act(async () => root.render(<ChatPanel projectId="p1" stage="T-1-1" memberRole="editor" />))
  expect(container.textContent).not.toContain('정밀')
  expect(container.textContent).not.toContain('빠른')
})

it('열람자에게는 자료 올리기·URL·재분석·삭제 버튼을 감추고 안내를 보여 준다', async () => {
  useProcedureStore.setState({ materials: [material] })
  await act(async () => root.render(<MaterialUploadBar projectId="p1" open onOpenChange={() => {}} hideToggle memberRole="viewer" />))
  expect(container.textContent).toContain('열람 전용 멤버입니다')
  expect(container.querySelector('input[type="file"]')).toBeNull()
  expect(container.textContent).not.toContain('URL 추가')
  expect(container.querySelector('button[aria-label="재분석"]')).toBeNull()
  expect(container.querySelector('button[aria-label="자료 삭제"]')).toBeNull()
  // 자료 목록은 볼 수 있다
  expect(container.textContent).toContain('수업.txt')
})

it('편집자에게는 자료 올리기·재분석·삭제가 보인다', async () => {
  useProcedureStore.setState({ materials: [material] })
  await act(async () => root.render(<MaterialUploadBar projectId="p1" open onOpenChange={() => {}} hideToggle memberRole="editor" />))
  expect(container.querySelector('input[type="file"]')).not.toBeNull()
  expect(container.querySelector('button[aria-label="재분석"]')).not.toBeNull()
  expect(container.querySelector('button[aria-label="자료 삭제"]')).not.toBeNull()
})
