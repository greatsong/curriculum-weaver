/**
 * 작업 공간을 옮길 때의 경합(2026-10-03 검토)
 * - 늦게 도착한 이전 작업 공간의 응답이 지금 화면을 덮지 않는다.
 * - 다른 작업 공간으로 옮기면 이전 데이터를 바로 비운다(이전 설정이 새 화면에 보이거나 저장되지 않게).
 * - 상세 조회 실패는 목록 화면의 loading·error를 건드리지 않고 detailError에 남는다.
 * - 약식 기록 설정은 지금 연 프로젝트의 작업 공간 것만 쓴다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pending = vi.hoisted(() => new Map())
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn((path) => new Promise((resolve, reject) => { pending.set(path, { resolve, reject }) })),
  apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiUploadFile: vi.fn(),
  apiStreamPost: vi.fn(), apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

import { useWorkspaceStore } from '../workspaceStore.js'
import { useProjectStore } from '../projectStore.js'
import { workflowConfigForProject } from '../../lib/projectWorkspace.js'

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  pending.clear()
  useWorkspaceStore.setState({ currentWorkspace: null, detailError: null, loading: false, error: null, errorStatus: 0 })
  useProjectStore.setState({ projects: [], projectsWorkspaceId: null, loading: false, error: null })
})

describe('작업 공간 상세 조회', () => {
  it('늦게 도착한 이전 작업 공간 응답은 무시한다', async () => {
    const a = useWorkspaceStore.getState().fetchWorkspace('A')
    const b = useWorkspaceStore.getState().fetchWorkspace('B')
    pending.get('/api/workspaces/B').resolve({ id: 'B', name: '비' })
    await b
    pending.get('/api/workspaces/A').resolve({ id: 'A', name: '에이' })
    await a
    expect(useWorkspaceStore.getState().currentWorkspace.id).toBe('B')
  })

  it('다른 작업 공간으로 옮기면 이전 데이터를 바로 비운다', async () => {
    useWorkspaceStore.setState({ currentWorkspace: { id: 'A', name: '에이' } })
    useWorkspaceStore.getState().fetchWorkspace('B').catch(() => {})
    expect(useWorkspaceStore.getState().currentWorkspace).toBeNull()
  })

  it('같은 작업 공간을 다시 불러오면 화면을 비우지 않는다', async () => {
    useWorkspaceStore.setState({ currentWorkspace: { id: 'A', name: '에이' } })
    useWorkspaceStore.getState().fetchWorkspace('A').catch(() => {})
    expect(useWorkspaceStore.getState().currentWorkspace.id).toBe('A')
  })

  it('실패는 detailError에만 남기고 목록의 loading·error는 그대로 둔다', async () => {
    const p = useWorkspaceStore.getState().fetchWorkspace('X')
    const err = Object.assign(new Error('워크스페이스를 찾을 수 없습니다.'), { status: 404 })
    pending.get('/api/workspaces/X').reject(err)
    await expect(p).rejects.toThrow()
    const s = useWorkspaceStore.getState()
    expect(s.detailError).toEqual({ id: 'X', message: '워크스페이스를 찾을 수 없습니다.', status: 404 })
    expect(s.error).toBeNull()
    expect(s.loading).toBe(false)
  })

  it('이전 요청의 늦은 실패는 지금 화면에 오류로 남지 않는다', async () => {
    const a = useWorkspaceStore.getState().fetchWorkspace('A')
    const b = useWorkspaceStore.getState().fetchWorkspace('B')
    pending.get('/api/workspaces/B').resolve({ id: 'B' })
    await b
    pending.get('/api/workspaces/A').reject(Object.assign(new Error('x'), { status: 500 }))
    await a.catch(() => {})
    expect(useWorkspaceStore.getState().detailError).toBeNull()
    expect(useWorkspaceStore.getState().currentWorkspace.id).toBe('B')
  })
})

describe('프로젝트 목록 조회', () => {
  it('늦게 도착한 이전 작업 공간의 목록은 무시하고, 옮기면 이전 목록을 비운다', async () => {
    useProjectStore.setState({ projects: [{ id: 'old' }], projectsWorkspaceId: 'A' })
    const b = useProjectStore.getState().fetchProjects('B')
    expect(useProjectStore.getState().projects).toEqual([])
    const a = useProjectStore.getState().fetchProjects('A2')
    pending.get('/api/workspaces/A2/projects').resolve({ projects: [{ id: 'a2' }] })
    await a
    pending.get('/api/workspaces/B/projects').resolve({ projects: [{ id: 'b1' }] })
    await b
    await flush()
    expect(useProjectStore.getState().projects).toEqual([{ id: 'a2' }])
    expect(useProjectStore.getState().projectsWorkspaceId).toBe('A2')
  })
})

describe('지금 프로젝트의 작업 공간 설정만 쓰기', () => {
  it('작업 공간이 다르면 설정을 쓰지 않는다', () => {
    expect(workflowConfigForProject({ workspace_id: 'B' }, { id: 'A', workflow_config: { briefMode: true } })).toBeNull()
    expect(workflowConfigForProject({ workspace_id: 'A' }, { id: 'A', workflow_config: { briefMode: true } })).toEqual({ briefMode: true })
    expect(workflowConfigForProject(null, { id: 'A', workflow_config: { briefMode: true } })).toEqual({ briefMode: true })
    expect(workflowConfigForProject({ workspace_id: 'A' }, null)).toBeNull()
  })
})
