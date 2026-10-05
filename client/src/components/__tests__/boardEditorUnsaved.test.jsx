/**
 * 보드 편집기가 저장하지 않은 편집을 신고하는지 — 새 배포 자동 새로고침이 편집 초안을 지우지 않게 한다
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect } from 'vitest'
import BoardEditor from '../BoardEditor'
import { listUnsavedWork, resetUnsavedWorkForTest } from '../../lib/unsavedWork'

const schema = {
  fields: [
    { name: 'title', label: '제목', type: 'text' },
    { name: 'memo', label: '메모', type: 'textarea' },
  ],
  empty: { title: '', memo: '' },
}

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetUnsavedWorkForTest()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function typeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

it('열기만 하면 신고하지 않고, 고치면 board-edit을 신고하며, 원래대로 되돌리거나 닫으면 해제한다', async () => {
  const content = { title: '기후 융합 수업', memo: '' }
  await act(async () => root.render(<BoardEditor schema={schema} content={content} onSave={() => {}} onCancel={() => {}} />))
  expect(listUnsavedWork()).toEqual([])

  const memo = host.querySelector('textarea')
  await act(async () => typeValue(memo, '2차시 활동 초안'))
  expect(listUnsavedWork()).toEqual(['board-edit'])

  await act(async () => typeValue(memo, ''))
  expect(listUnsavedWork()).toEqual([])

  await act(async () => typeValue(memo, '다시 적음'))
  expect(listUnsavedWork()).toEqual(['board-edit'])
  await act(async () => root.render(<div />)) // 저장 뒤 편집기가 닫힘
  expect(listUnsavedWork()).toEqual([])
})
