import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import KeywordGraph from '../KeywordGraph'

vi.mock('../../../lib/futures/measureText', () => ({ measureText: text => String(text).length * 8, fontsReady: () => Promise.resolve() }))
vi.mock('../../../lib/futures/nebulaLayout', async importOriginal => {
  const original = await importOriginal()
  return { ...original, nebulaLayout: (...args) => ({ ...original.nebulaLayout(...args), ok: false }) }
})
const standards = [
  { key: 'a', code: '[a]', subject: '국어', subject_group: '국어' },
  { key: 'b', code: '[b]', subject: '과학', subject_group: '과학' },
  { key: 'c', code: '[c]', subject: '영어', subject_group: '영어' },
]
const bridges = { status: 'ready', data: {
  keywords: { a: ['보고서'], b: ['에너지'], c: ['정보'] },
  concepts: [{ label: '공동 제안', why: '세 과목의 근거를 함께 쓴다.', ends: [{ key: 'a', word: '보고서' }, { key: 'b', word: '에너지' }, { key: 'c', word: '정보' }] }],
} }
let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

it.each([390, 1280])('폭 %i 및 배치 품질 미달에도 실험실의 지도와 다자 연결을 유지한다', async width => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
  await act(async () => root.render(<KeywordGraph standards={standards} bridges={bridges} multiEndpoint navigable />))
  expect(host.querySelector('.fu-graph-svg')).toBeTruthy()
  expect(host.querySelectorAll('.fu-node')).toHaveLength(3)
  expect(host.querySelectorAll('.fu-chain')).toHaveLength(2)
  const evidence = host.querySelector('details')
  expect(evidence.open).toBe(false)
  expect(evidence.textContent).toContain('세 과목의 근거를 함께 쓴다.')
  expect(evidence.querySelectorAll('.fu-conn-row .fu-end')).toHaveLength(3)
  const scale = () => Number(host.querySelector('output').textContent.replace('%', ''))
  const initial = scale()
  await act(async () => host.querySelector('[aria-label="연결 지도 확대"]').click())
  expect(scale()).toBeGreaterThan(initial)
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '전체 보기').click())
  expect(scale()).toBe(initial)
})

it('기존 화면은 목록 대안을 유지한다', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390)
  await act(async () => root.render(<KeywordGraph standards={standards} bridges={bridges} multiEndpoint />))
  expect(host.querySelector('.fu-graph-svg')).toBeNull()
  expect(host.querySelector('.fu-conn.list-mode')).toBeTruthy()
})
