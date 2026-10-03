// @vitest-environment happy-dom
/**
 * 주제 렌즈 검색(2026-10-03 검토 반영)
 * - 의미 검색을 쓸 수 없으면 일반 검색으로 이어 가고 그 사실을 표시한다.
 * - 둘 다 실패하면 오류와 [다시 시도]를 보여 준다.
 * - 늦게 도착한 이전 검색어의 응답은 버린다.
 * - 검색 중에 검색어를 지우면 로딩 표시가 사라진다.
 */
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

const api = vi.hoisted(() => ({ handlers: [] }))
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn((path, params) => new Promise((resolve, reject) => api.handlers.push({ path, q: params?.q, resolve, reject }))),
  apiPost: vi.fn(), API_BASE: '', getHeaders: vi.fn(),
}))

import ThemeLens from '../lenses/ThemeLens'

const std = (code, extra = {}) => ({ key: code, code, subject: '통합과학1', subject_group: '과학', content: `${code} 내용`, school_level: '고등학교', ...extra })

let host, root
function Harness() {
  const [query, setQuery] = useState('')
  return <ThemeLens graph={null} query={query} onQuery={setQuery} level="" basket={new Set()} onToggleBasket={() => {}} onOpenNeighbor={() => {}} />
}
const input = () => host.querySelector('input')
async function type(value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input(), value)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const pendingFor = (path, q) => api.handlers.find((h) => h.path === path && h.q === q)

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  api.handlers = []
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<Harness />))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })

it('의미 검색이 되면 그 결과를 보여 주고 일반 검색 안내는 없다', async () => {
  await type('기후변화')
  await act(async () => vi.advanceTimersByTime(500))
  await act(async () => pendingFor('/api/standards/semantic-search', '기후변화').resolve([std('[10통과1-01-04]', { _similarity: 0.62 })]))
  expect(host.textContent).toContain('[10통과1-01-04]')
  expect(host.textContent).not.toContain('일반 검색 결과')
})

it('의미 검색이 503이면 일반 검색으로 이어 가고 표시한다', async () => {
  await type('기후변화')
  await act(async () => vi.advanceTimersByTime(500))
  await act(async () => pendingFor('/api/standards/semantic-search', '기후변화').reject(Object.assign(new Error('사용 불가'), { status: 503 })))
  await act(async () => pendingFor('/api/standards/search', '기후변화').resolve([std('[10통사1-05-02]')]))
  expect(host.textContent).toContain('[10통사1-05-02]')
  expect(host.textContent).toContain('일반 검색 결과')
  expect(host.textContent).not.toContain('검색하지 못했습니다')
})

it('둘 다 실패하면 오류와 다시 시도를 보여 주고, 다시 시도로 회복한다', async () => {
  await type('기후변화')
  await act(async () => vi.advanceTimersByTime(500))
  await act(async () => pendingFor('/api/standards/semantic-search', '기후변화').reject(new Error('연결 실패')))
  await act(async () => pendingFor('/api/standards/search', '기후변화').reject(new Error('연결 실패')))
  expect(host.textContent).toContain('검색하지 못했습니다')
  api.handlers = []
  const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === '다시 시도')
  await act(async () => retry.click())
  await act(async () => vi.advanceTimersByTime(500))
  await act(async () => pendingFor('/api/standards/semantic-search', '기후변화').resolve([std('[10통과1-01-04]', { _similarity: 0.6 })]))
  expect(host.textContent).not.toContain('검색하지 못했습니다')
  expect(host.textContent).toContain('[10통과1-01-04]')
})

it('늦게 도착한 이전 검색어의 응답은 버린다', async () => {
  await type('기후')
  await act(async () => vi.advanceTimersByTime(500))
  await type('에너지')
  await act(async () => vi.advanceTimersByTime(500))
  await act(async () => pendingFor('/api/standards/semantic-search', '에너지').resolve([std('[에너지]', { _similarity: 0.7 })]))
  await act(async () => pendingFor('/api/standards/semantic-search', '기후').resolve([std('[기후]', { _similarity: 0.7 })]))
  expect(host.textContent).toContain('[에너지]')
  expect(host.textContent).not.toContain('[기후]')
})

it('검색 중에 검색어를 지우면 로딩 표시와 결과가 사라진다', async () => {
  await type('기후변화')
  expect(host.textContent).toContain('검색 중')
  await type('')
  expect(host.textContent).not.toContain('검색 중')
  await act(async () => vi.advanceTimersByTime(1000))
  expect(api.handlers).toHaveLength(0)
})
