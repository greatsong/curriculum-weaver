// @vitest-environment happy-dom
/**
 * 약식 기록 막대 — 약식 팀에만 보이고, 보드 내용만으로 필수 칸 상태와 다음 절차 버튼을 보여 준다.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(async () => ({})), apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(),
  apiUploadFile: vi.fn(), apiStreamPost: vi.fn(), apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

import BriefModeBar from '../BriefModeBar'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useProcedureStore } from '../../stores/procedureStore'
import { useProjectStore } from '../../stores/projectStore'

let host, root
const handlers = { onInsertTemplate: vi.fn(), onHelp: vi.fn(), onAdvance: vi.fn() }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useProjectStore.setState({ currentProject: { id: 'p1', learner_context: {} } })
  useProcedureStore.setState({ boards: {}, skippedProcedures: [] })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

async function render(props = {}) {
  await act(async () => root.render(
    <BriefModeBar procedureCode="T-2-1" busy={false} hasPendingSuggestions={false} {...handlers} {...props} />
  ))
}

it('약식을 켜지 않은 팀에는 보이지 않는다', async () => {
  useWorkspaceStore.setState({ currentWorkspace: { workflow_config: {} } })
  await render()
  expect(host.querySelector('[data-testid="brief-mode-bar"]')).toBeNull()
})

it('필수 칸 상태와 도움 버튼, 다음 절차 버튼을 보여 준다', async () => {
  useWorkspaceStore.setState({ currentWorkspace: { workflow_config: { briefMode: true } } })
  await render()
  const bar = host.querySelector('[data-testid="brief-mode-bar"]')
  expect(bar).not.toBeNull()
  expect(bar.textContent).toContain('○역할 배분')
  expect(bar.textContent).toContain('역할 예시')
  expect(bar.textContent).toContain('다음 절차 · T-4 →')

  const help = [...bar.querySelectorAll('button')].find((b) => b.textContent === '역할 예시')
  await act(async () => help.click())
  expect(handlers.onHelp).toHaveBeenCalledWith('역할 예시')

  const next = [...bar.querySelectorAll('button')].find((b) => b.textContent.startsWith('다음 절차'))
  await act(async () => next.click())
  expect(handlers.onAdvance).toHaveBeenCalledWith('T-2-2')
})

it('보드가 채워지면 체크 표시로 바뀌고, 생략한 다음 절차는 건너뛴다', async () => {
  useWorkspaceStore.setState({ currentWorkspace: { workflow_config: { briefMode: true } } })
  useProcedureStore.setState({
    boards: { role_assignment: { content: { roles: [{ name: '김', subject: '영어' }] } } },
    skippedProcedures: [{ procedure_code: 'T-2-2' }],
  })
  await render()
  const bar = host.querySelector('[data-testid="brief-mode-bar"]')
  expect(bar.textContent).toContain('✓역할 배분')
  expect(bar.textContent).toContain('다음 절차 · T-5 →')
})

it('시연 모드 프로젝트에는 보이지 않는다', async () => {
  useWorkspaceStore.setState({ currentWorkspace: { workflow_config: { briefMode: true } } })
  useProjectStore.setState({ currentProject: { id: 'p1', learner_context: { demo: true } } })
  await render()
  expect(host.querySelector('[data-testid="brief-mode-bar"]')).toBeNull()
})

it('다른 작업 공간의 설정이 남아 있으면(옮긴 직후) 약식 막대를 보이지 않는다', async () => {
  useWorkspaceStore.setState({ currentWorkspace: { id: 'A', workflow_config: { briefMode: true } } })
  useProjectStore.setState({ currentProject: { id: 'p2', workspace_id: 'B', learner_context: {} } })
  await render()
  expect(host.querySelector('[data-testid="brief-mode-bar"]')).toBeNull()
  await act(async () => useWorkspaceStore.setState({ currentWorkspace: { id: 'B', workflow_config: { briefMode: true } } }))
  expect(host.querySelector('[data-testid="brief-mode-bar"]')).not.toBeNull()
})

it('마지막 절차(E-2)에서는 다음 절차 대신 [보고서 작성하기]로 보고서 창을 연다', async () => {
  useWorkspaceStore.setState({ currentWorkspace: { workflow_config: { briefMode: true } } })
  const onOpenReport = vi.fn()
  await render({ procedureCode: 'E-2-1', onOpenReport })
  const bar = host.querySelector('[data-testid="brief-mode-bar"]')
  expect(bar.textContent).not.toContain('다음 절차')
  const btn = [...bar.querySelectorAll('button')].find((b) => b.textContent.startsWith('보고서 작성하기'))
  expect(btn).toBeTruthy()
  await act(async () => btn.click())
  expect(onOpenReport).toHaveBeenCalledTimes(1)
})

it('뒤 절차가 모두 생략되면 그 앞 절차에서도 [보고서 작성하기]가 나온다', async () => {
  useWorkspaceStore.setState({ currentWorkspace: { workflow_config: { briefMode: true } } })
  useProcedureStore.setState({ boards: {}, skippedProcedures: [{ procedure_code: 'E-2-1' }] })
  await render({ procedureCode: 'E-1-1', onOpenReport: vi.fn() })
  const bar = host.querySelector('[data-testid="brief-mode-bar"]')
  expect(bar.textContent).toContain('보고서 작성하기')
})
