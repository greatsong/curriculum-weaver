// @vitest-environment happy-dom
/**
 * 약식 기록 보드 양식 — 설문지처럼 빈 칸에 적고 저장하면 AI를 거치지 않고 보드에 들어간다.
 * 조언 체크가 켜져 있을 때만 저장 뒤 AI에게 짧은 조언을 청한다.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn(async () => true), toast: vi.fn() }))
vi.mock('../../stores/chatStore', () => ({ useChatStore: (sel) => sel({ sendMessage: mocks.sendMessage }) }))
vi.mock('../../stores/toastStore', () => ({ pushToast: mocks.toast }))

import BriefBoardForm from '../BriefBoardForm'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import { BOARD_TYPES } from 'curriculum-weaver-shared/constants.js'

const schema = BOARD_SCHEMAS[BOARD_TYPES['A-1-2']]
let host, root
const store = new Map()

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

async function render(updateBoard, board = null) {
  await act(async () => root.render(
    <BriefBoardForm projectId="p1" procedureCode="A-1-2" schema={schema} board={board} updateBoard={updateBoard} />
  ))
}

function setInput(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

it('필수 칸에는 *, 선택 칸에는 "선택"을 붙이고 나머지 칸은 접어 둔다', async () => {
  await render(vi.fn())
  const form = host.querySelector('[data-testid="brief-board-form"]')
  const labels = [...form.querySelectorAll('label')].map((l) => l.textContent)
  expect(labels.some((t) => t.startsWith('최종 선정 주제') && t.includes('*'))).toBe(true)
  expect(labels.some((t) => t.startsWith('선정 근거') && t.includes('선택'))).toBe(true)
  expect(labels.some((t) => t.startsWith('주제 후보'))).toBe(false)
  expect(form.textContent).toContain('다른 칸 더 보기')
})

it('저장하면 적은 문장 그대로 보드에 저장하고, 조언이 켜져 있으면 AI에게 짧은 조언을 청한다', async () => {
  const updateBoard = vi.fn(async () => ({}))
  await render(updateBoard)
  const input = host.querySelector('[data-testid="brief-board-form"] input:not([type="checkbox"])')
  await act(async () => setInput(input, '시와 노랫말 속 감정을 근거로 해석하기'))
  const save = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('저장'))
  await act(async () => save.click())
  expect(updateBoard).toHaveBeenCalledTimes(1)
  const [, code, content] = updateBoard.mock.calls[0]
  expect(code).toBe('A-1-2')
  expect(content.selectedTopic).toBe('시와 노랫말 속 감정을 근거로 해석하기')
  expect(mocks.sendMessage).toHaveBeenCalledWith('p1', expect.stringMatching(/^\[보드 저장\]/), 'A-1-2')
})

it('조언 체크를 끄면 저장만 하고 AI를 부르지 않는다', async () => {
  const updateBoard = vi.fn(async () => ({}))
  await render(updateBoard)
  const check = host.querySelector('input[type="checkbox"]')
  await act(async () => check.click())
  const save = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('저장'))
  await act(async () => save.click())
  expect(updateBoard).toHaveBeenCalledTimes(1)
  expect(mocks.sendMessage).not.toHaveBeenCalled()
  expect(store.get('cw_brief_advice_p1')).toBe('off')
})

it('저장에 실패하면 알리고 AI를 부르지 않는다', async () => {
  const updateBoard = vi.fn(async () => { throw new Error('생략된 절차입니다') })
  await render(updateBoard)
  const save = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('저장'))
  await act(async () => save.click())
  expect(mocks.sendMessage).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
})
