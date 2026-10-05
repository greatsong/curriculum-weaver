import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { apiGet, apiPost } from '../../lib/api'
import { NEW_DESTINATION, writeBasket, mergeBasketMeta, readBasket } from '../../lib/exploreDestination'

// 프로젝트 만들기 모달: 교과·학년을 골라도 성취기준을 추천·자동 체크하지 않는다(2026-10-05).
// 그래프에서 담아온 성취기준(designBasket)은 그대로 새 프로젝트에 들어간다.

vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), API_BASE: '', getHeaders: vi.fn() }))

const stores = vi.hoisted(() => ({ workspace: null, project: null, auth: null }))
vi.mock('../../stores/workspaceStore', () => ({ useWorkspaceStore: () => stores.workspace }))
vi.mock('../../stores/projectStore', () => ({ useProjectStore: () => stores.project }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => stores.auth }))

import WorkspaceDetailPage from '../WorkspaceDetailPage'

let host, root

function memoryStorage() {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: k => { map.delete(k) }, clear: () => map.clear(), get length() { return map.size },
  }
}

async function mount(entry = '/workspaces/w1?createProject=1') {
  await act(async () => root.render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
        <Route path="/workspaces/:workspaceId/projects/:projectId" element={<div data-testid="project-page" />} />
      </Routes>
    </MemoryRouter>
  ))
}

const form = () => host.querySelector('form')
const findButton = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const submitButton = () => form().querySelector('button[type="submit"]')

async function clickChip(text) {
  const button = findButton(text)
  expect(button).toBeTruthy()
  await act(async () => button.click())
}

// React 제어 입력은 네이티브 setter로 값을 넣고 이벤트를 보내야 onChange가 불린다
async function setValue(el, value, eventName) {
  const proto = Object.getPrototypeOf(el)
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  await act(async () => el.dispatchEvent(new Event(eventName, { bubbles: true })))
}

async function chooseSubjectsAndGrade() {
  await clickChip('수학')
  await clickChip('과학')
  await setValue(form().querySelector('select'), '고등학교', 'change')
  await act(async () => { await Promise.resolve() })
}

async function submit() {
  await act(async () => {
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  sessionStorage.clear()
  // Node 25의 전역 localStorage가 테스트 환경 것을 가리므로 메모리 저장소로 바꿔 끼운다
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('alert', vi.fn())
  apiGet.mockReset()
  apiPost.mockReset()
  apiPost.mockResolvedValue({ ok: true })
  stores.workspace = {
    currentWorkspace: { id: 'w1', name: '융합 수업 팀', owner_id: 'u1', my_role: 'host', ai_config: {}, workflow_config: {}, members: [] },
    detailError: null,
    fetchWorkspace: vi.fn(async () => {}),
    updateWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    inviteMember: vi.fn(),
  }
  stores.project = {
    projects: [{ id: 'p0', title: '기존 프로젝트', status: 'active' }],
    projectsWorkspaceId: 'w1',
    loading: false,
    fetchProjects: vi.fn(),
    createProject: vi.fn(async () => ({ id: 'new1' })),
    deleteProject: vi.fn(),
  }
  stores.auth = { user: { id: 'u1', email: 'teacher@example.com' }, logout: vi.fn() }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

it('교과·학년을 골라도 성취기준을 불러오거나 자동으로 넣지 않는다', async () => {
  await mount()
  expect(form()).toBeTruthy()
  await setValue(form().querySelector('input'), '기후 융합 수업', 'input')
  await chooseSubjectsAndGrade()

  expect(apiGet).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('추천 성취기준')
  expect(submitButton().textContent).toBe('만들기')

  await submit()
  expect(stores.project.createProject).toHaveBeenCalledWith('w1', expect.objectContaining({
    title: '기후 융합 수업', subjects: ['수학', '과학'], grade: '고등학교',
  }))
  // 담아온 성취기준이 없으므로 성취기준 저장 요청을 보내지 않는다
  expect(apiPost).not.toHaveBeenCalled()
  expect(host.querySelector('[data-testid="project-page"]')).toBeTruthy()
})

it('그래프에서 담아온 성취기준은 그대로 새 프로젝트에 저장하고 담기를 비운다', async () => {
  const keys = ['[12수학01-01]', '[10공과1-01-01]|통합과학1']
  writeBasket(sessionStorage, NEW_DESTINATION, keys)
  mergeBasketMeta(sessionStorage, [[keys[0], '수학'], [keys[1], '과학']])

  await mount()
  // 담기의 교과 메타로 교과 칩과 제목 초안이 채워진다
  expect(host.textContent).toContain('[12수학01-01]')
  expect(form().querySelector('input').value).toBe('수학·과학 융합 수업')
  expect(submitButton().textContent).toBe('만들기 (성취기준 2개 포함)')

  // 학년을 바꿔도 추천을 불러오지 않고, 포함 개수도 그대로다
  await setValue(form().querySelector('select'), '고등학교', 'change')
  expect(apiGet).not.toHaveBeenCalled()
  expect(submitButton().textContent).toBe('만들기 (성취기준 2개 포함)')

  await submit()
  expect(stores.project.createProject).toHaveBeenCalledWith('w1', expect.objectContaining({
    subjects: ['수학', '과학'], grade: '고등학교',
  }))
  expect(apiPost).toHaveBeenCalledTimes(1)
  expect(apiPost).toHaveBeenCalledWith('/api/standards/project/new1/bulk', { standard_codes: keys })
  expect(readBasket(sessionStorage, NEW_DESTINATION)).toEqual([])
  expect(globalThis.alert).not.toHaveBeenCalled()
})
