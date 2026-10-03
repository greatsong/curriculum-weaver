import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import StandardSearch from '../StandardSearch'
import ExplorationLaunchpad from '../ExplorationLaunchpad'
import { apiGet, apiPost, apiDelete } from '../../lib/api'

const state = vi.hoisted(() => ({ currentProject: { id: 'p1', title: '우리 동네 탐구', my_role: 'owner', status: 'active' } }))
vi.mock('../../stores/projectStore', () => ({ useProjectStore: selector => selector(state) }))
vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }))
const standard = { id: 's1', code: '[기준1]', key: 's1', subject: '국어', content: '자료를 비교한다.' }
let host, root, saved
const status = () => document.querySelector('[aria-label="탐색 대상과 반영 상태"]').textContent
async function mount() {
  await act(async () => root.render(<StandardSearch sessionId="p1" onClose={() => {}} />))
  await act(async () => vi.advanceTimersByTime(350))
}
async function add() {
  const button = document.querySelector('button[title="추가"]')
  expect(button).toBeTruthy()
  await act(async () => button.click())
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(); vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  state.currentProject = { id: 'p1', title: '우리 동네 탐구', my_role: 'owner', status: 'active' }
  saved = []
  apiGet.mockImplementation(async url => {
    if (url === '/api/standards/project/p1') return saved
    if (url === '/api/standards/search') return [standard]
    return []
  })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })

it('홈의 주요 탐색과 보조 체험을 구분하고 기존 프로젝트 진입 위치를 안내한다', async () => {
  await act(async () => root.render(<MemoryRouter><ExplorationLaunchpad /></MemoryRouter>))
  expect([...host.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['/graph?mode=explore', '/graph?mode=design&lens=pair', '/futures-lab', '/graph?mode=design&lens=theme', '/guide'])
  // 진행 중인 프로젝트는 어디서 이어 가는지(A-3 절차) 안내해야 한다(2026-10-03 밝은 카드로 문구 정리)
  expect(host.textContent).toContain('진행 중인 프로젝트')
  expect(host.textContent).toContain('A-3')
})

it('검색 결과를 저장으로 표시하지 않고 실제 프로젝트 이름과 서버 목록을 표시한다', async () => {
  await mount()
  expect(status()).toContain('우리 동네 탐구')
  expect(status()).toContain('프로젝트에 저장된 성취기준 0개')
  expect(document.body.textContent).toContain('자료를 비교한다.')
  expect(apiPost).not.toHaveBeenCalled()
})

it('낙관적 칩은 저장 중으로 표시하고 서버 확인 후에만 저장된 수를 늘린다', async () => {
  let finish
  apiPost.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await mount(); await add()
  expect(status()).toContain('변경 저장 중 · 완료 전')
  expect(status()).not.toContain('저장된 성취기준 1개')
  saved = [{ id: 'saved1', curriculum_standards: standard }]
  await act(async () => finish({}))
  expect(status()).toContain('프로젝트에 저장된 성취기준 1개')
})

it('서버 요청 실패는 저장 완료로 표시하지 않고 재확인으로 복구한다', async () => {
  apiPost.mockRejectedValue(new Error('네트워크 중단'))
  await mount(); await add()
  expect(status()).toContain('추가 결과 확인 필요')
  saved = [{ id: 'saved1', curriculum_standards: standard }]
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === '저장 상태 다시 확인').click())
  expect(status()).toContain('프로젝트에 저장된 성취기준 1개')
})

it('저장은 성공해도 재조회 실패하면 저장 상태 확인 실패를 표시한다', async () => {
  apiPost.mockImplementation(async () => { apiGet.mockImplementation(async url => { if (url === '/api/standards/project/p1') throw new Error('재조회 중단'); return [] }); return {} })
  await mount(); await add()
  expect(status()).toContain('저장 상태 확인 실패')
  expect(status()).not.toContain('저장된 성취기준 1개')
})

it('첫 조회 실패를 저장된 기준 0개로 잘못 표시하지 않는다', async () => {
  apiGet.mockImplementation(async url => { if (url === '/api/standards/project/p1') throw new Error('권한 오류'); return [] })
  await mount()
  expect(status()).toContain('저장 상태 확인 실패')
  expect(status()).not.toContain('저장된 성취기준 0개')
})

it('저장 목록 형식이 잘못된 응답을 빈 목록으로 간주하지 않는다', async () => {
  apiGet.mockImplementation(async url => url === '/api/standards/project/p1' ? { unexpected: true } : [])
  await mount()
  expect(status()).toContain('저장 상태 확인 실패')
})

it('제거 요청 실패도 성공으로 표시하지 않고 서버 확인 전까지 경고를 유지한다', async () => {
  saved = [{ id: 'saved1', curriculum_standards: standard }]
  apiDelete.mockRejectedValue(new Error('연결 끊김'))
  await mount()
  await act(async () => document.querySelector('button[title="제거"]').click())
  expect(status()).toContain('제거 결과 확인 필요')
  await act(async () => vi.advanceTimersByTime(5000))
  expect(status()).toContain('제거 결과 확인 필요')
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === '저장 상태 다시 확인').click())
  expect(status()).toContain('저장된 성취기준 1개')
})

it.each([{ my_role: 'viewer' }, { status: 'simulation' }, { status: 'generating' }, { status: 'failed' }])('읽기 전용 상태에서 추가 요청을 보내지 않는다 (%j)', async patch => {
  Object.assign(state.currentProject, patch)
  await mount(); await add()
  expect(status()).toContain('읽기 전용')
  expect(apiPost).not.toHaveBeenCalled()
  expect(apiDelete).not.toHaveBeenCalled()
})
