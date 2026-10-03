/**
 * 보드 불러오기 경합(2026-10-03 제보: 약식 양식이 '보드를 불러오는 중'에 멈추고 탭에 다녀와야 풀림)
 * 프로젝트를 열면 기본 절차(T-1)와 팀 진행 위치(E-2)의 요청이 겹친다. 먼저 보낸 요청의 응답이
 * 늦게 와도 지금 절차의 보드를 덮지 않아야 한다. 실패하면 boardsLoadError로 다시 시도할 수 있어야 한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pending = vi.hoisted(() => new Map())
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn((path) => new Promise((resolve, reject) => { pending.set(path, { resolve, reject }) })),
  apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiUploadFile: vi.fn(),
  apiStreamPost: vi.fn(), apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

import { useProcedureStore } from '../procedureStore.js'

beforeEach(() => {
  pending.clear()
  useProcedureStore.setState({ boards: {}, boardsLoadedFor: null, boardsLoadError: null, loading: false })
})

describe('보드 불러오기', () => {
  it('먼저 보낸 요청이 늦게 와도 나중 절차의 보드와 완료 표시를 덮지 않는다', async () => {
    const first = useProcedureStore.getState().loadBoards('p1', 'T-1-1')
    const second = useProcedureStore.getState().loadBoards('p1', 'E-2-1')
    pending.get('/api/projects/p1/designs/E-2-1').resolve({ procedure_code: 'E-2-1', content: { operatingPrinciples: ['회의는 30분'] } })
    await second
    pending.get('/api/projects/p1/designs/T-1-1').resolve({ procedure_code: 'T-1-1', content: { commonVision: '옛 응답' } })
    await first
    const s = useProcedureStore.getState()
    expect(s.boardsLoadedFor).toBe('E-2-1')
    expect(s.boards.process_reflection?.content.operatingPrinciples).toEqual(['회의는 30분'])
    expect(s.boards.team_vision).toBeUndefined()
    expect(s.loading).toBe(false)
  })

  it('지금 절차를 불러오지 못하면 boardsLoadError로 알리고, 다시 불러오면 풀린다', async () => {
    const p = useProcedureStore.getState().loadBoards('p1', 'E-2-1')
    pending.get('/api/projects/p1/designs/E-2-1').reject(new Error('연결 실패'))
    await new Promise((r) => setTimeout(r, 0))
    pending.get('/api/boards/p1/E-2-1').reject(new Error('연결 실패'))
    await p
    expect(useProcedureStore.getState().boardsLoadError).toBe('E-2-1')
    expect(useProcedureStore.getState().boardsLoadedFor).not.toBe('E-2-1')

    const retry = useProcedureStore.getState().loadBoards('p1', 'E-2-1')
    pending.get('/api/projects/p1/designs/E-2-1').resolve({ procedure_code: 'E-2-1', content: {} })
    await retry
    expect(useProcedureStore.getState().boardsLoadedFor).toBe('E-2-1')
    expect(useProcedureStore.getState().boardsLoadError).toBeNull()
  })

  it('이전 요청의 늦은 실패는 지금 절차에 오류로 남지 않는다', async () => {
    const first = useProcedureStore.getState().loadBoards('p1', 'T-1-1')
    const second = useProcedureStore.getState().loadBoards('p1', 'E-2-1')
    pending.get('/api/projects/p1/designs/E-2-1').resolve({ procedure_code: 'E-2-1', content: {} })
    await second
    pending.get('/api/projects/p1/designs/T-1-1').reject(new Error('x'))
    await new Promise((r) => setTimeout(r, 0))
    pending.get('/api/boards/p1/T-1-1')?.reject(new Error('x'))
    await first
    expect(useProcedureStore.getState().boardsLoadError).toBeNull()
    expect(useProcedureStore.getState().boardsLoadedFor).toBe('E-2-1')
  })
})
