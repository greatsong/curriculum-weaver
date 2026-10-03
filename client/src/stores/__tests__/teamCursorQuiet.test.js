/**
 * 건너뛰기 후 팀 커서 사본 동기화 회귀 테스트 (2026-10-03 교사 동선 점검)
 *
 * 서버는 건너뛴 절차가 팀 커서면 다음 절차로 커서를 보정한다. 예전에는 각 화면의 사본
 * (currentProject.current_procedure)이 옛 값으로 남아, 다음 탭 복귀 때 화면이 팀 위치로 튀었다.
 * 해제한 절차를 다시 쓰던 호스트가 다음 절차로 넘어가고 편집창이 닫혔다.
 * 사본은 맞추되 화면은 옮기지 않는다(원격 스킵 때 팀원 화면을 옮기지 않는 기존 설계 유지).
 * 또 보던 절차를 건너뛰어 화면이 옮겨지면 skipProcedure가 movedTo로 알려 안내를 요청하게 한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  apiUploadFile: vi.fn(),
  apiGetMaterialAnalysis: vi.fn(),
  apiReanalyzeMaterial: vi.fn(),
  apiDeleteMaterial: vi.fn(),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }))

import { apiPost, apiDelete } from '../../lib/api'
import { socket } from '../../lib/socket'
import { useProjectStore, consumeQuietCursor } from '../projectStore.js'
import { useProcedureStore } from '../procedureStore.js'

const project = (cursor = 'T-2-2') => ({ id: 'p1', title: '융합', current_procedure: cursor, my_role: 'owner' })

beforeEach(() => {
  vi.mocked(apiPost).mockReset()
  vi.mocked(apiDelete).mockReset()
  vi.mocked(socket.on).mockClear()
  consumeQuietCursor() // 이전 테스트의 표식 제거
  useProjectStore.setState({ currentProject: project(), projects: [] })
  useProcedureStore.setState({ currentProcedure: 'T-2-2', skippedProcedures: [] })
})

describe('syncTeamCursorQuietly / consumeQuietCursor', () => {
  it('사본만 바꾸고 표식을 남긴다. 표식은 한 번만 소비된다', () => {
    useProjectStore.getState().syncTeamCursorQuietly('p1', 'T-2-3')
    const cur = useProjectStore.getState().currentProject
    expect(cur.current_procedure).toBe('T-2-3')
    expect(cur.my_role).toBe('owner')
    expect(consumeQuietCursor('p1', 'T-2-3')).toBe(true)
    expect(consumeQuietCursor('p1', 'T-2-3')).toBe(false)
  })

  it('다른 프로젝트·같은 값·빈 값이면 아무것도 바꾸지 않는다', () => {
    const before = useProjectStore.getState().currentProject
    useProjectStore.getState().syncTeamCursorQuietly('p2', 'T-2-3')
    useProjectStore.getState().syncTeamCursorQuietly('p1', 'T-2-2')
    useProjectStore.getState().syncTeamCursorQuietly('p1', '')
    useProjectStore.getState().syncTeamCursorQuietly('p1', undefined)
    expect(useProjectStore.getState().currentProject).toBe(before)
    expect(consumeQuietCursor('p1', 'T-2-3')).toBe(false)
  })

  it('다른 값으로 확인하면 거짓이고 표식은 지워진다(남은 표식이 진짜 이동을 막지 않음)', () => {
    useProjectStore.getState().syncTeamCursorQuietly('p1', 'T-2-3')
    expect(consumeQuietCursor('p1', 'A-1-1')).toBe(false)
    expect(consumeQuietCursor('p1', 'T-2-3')).toBe(false)
  })
})

describe('skipProcedure', () => {
  it('보던 절차가 팀 커서여서 보정되면 화면을 옮기고 movedTo와 사본을 맞춘다', async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({ skips: [{ procedure_code: 'T-2-2' }], current_procedure: 'T-2-3' })
    const result = await useProcedureStore.getState().skipProcedure('p1', 'T-2-2')
    expect(result.movedTo).toBe('T-2-3')
    expect(useProcedureStore.getState().currentProcedure).toBe('T-2-3')
    expect(useProjectStore.getState().currentProject.current_procedure).toBe('T-2-3')
    // 사본 변경은 조용한 변경으로 표시돼 커서 effect가 화면을 다시 옮기지 않는다
    expect(consumeQuietCursor('p1', 'T-2-3')).toBe(true)
  })

  it('팀 커서가 다른 곳이면 사본은 그대로, 화면은 팀 커서로 옮기고 movedTo로 알린다', async () => {
    useProjectStore.setState({ currentProject: project('T-1-1') })
    vi.mocked(apiPost).mockResolvedValueOnce({ skips: [{ procedure_code: 'T-2-2' }], current_procedure: 'T-1-1' })
    const result = await useProcedureStore.getState().skipProcedure('p1', 'T-2-2')
    expect(result.movedTo).toBe('T-1-1')
    expect(useProcedureStore.getState().currentProcedure).toBe('T-1-1')
    expect(useProjectStore.getState().currentProject.current_procedure).toBe('T-1-1')
    expect(consumeQuietCursor('p1', 'T-1-1')).toBe(false)
  })

  it('다른 절차를 보고 있었으면 화면을 옮기지 않고 movedTo는 null이다', async () => {
    useProcedureStore.setState({ currentProcedure: 'A-1-1' })
    vi.mocked(apiPost).mockResolvedValueOnce({ skips: [{ procedure_code: 'T-2-2' }], current_procedure: 'T-2-3' })
    const result = await useProcedureStore.getState().skipProcedure('p1', 'T-2-2')
    expect(result.movedTo).toBeNull()
    expect(useProcedureStore.getState().currentProcedure).toBe('A-1-1')
    expect(useProjectStore.getState().currentProject.current_procedure).toBe('T-2-3')
  })

  it('해제는 커서를 바꾸지 않는다', async () => {
    vi.mocked(apiDelete).mockResolvedValueOnce({ skips: [], current_procedure: 'T-2-2' })
    const before = useProjectStore.getState().currentProject
    await useProcedureStore.getState().unskipProcedure('p1', 'T-2-2')
    expect(useProjectStore.getState().currentProject).toBe(before)
    expect(consumeQuietCursor('p1', 'T-2-2')).toBe(false)
  })
})

describe('procedure_skips_changed 수신(팀원 화면)', () => {
  it('사본은 조용히 맞추고 보던 화면은 옮기지 않는다', () => {
    useProcedureStore.getState().subscribeBoardUpdates('p1')
    const handler = vi.mocked(socket.on).mock.calls.find(([e]) => e === 'procedure_skips_changed')[1]
    handler({ projectId: 'p1', skips: [{ procedure_code: 'T-2-2' }], current_procedure: 'T-2-3' })

    expect(useProcedureStore.getState().skippedProcedures).toHaveLength(1)
    expect(useProcedureStore.getState().currentProcedure).toBe('T-2-2')
    expect(useProjectStore.getState().currentProject.current_procedure).toBe('T-2-3')
    expect(consumeQuietCursor('p1', 'T-2-3')).toBe(true)
    useProcedureStore.getState().unsubscribeBoardUpdates()
  })

  it('다른 프로젝트 이벤트는 사본을 건드리지 않는다', () => {
    useProcedureStore.getState().subscribeBoardUpdates('p1')
    const handler = vi.mocked(socket.on).mock.calls.find(([e]) => e === 'procedure_skips_changed')[1]
    handler({ projectId: 'p9', skips: [], current_procedure: 'T-2-3' })
    expect(useProjectStore.getState().currentProject.current_procedure).toBe('T-2-2')
    useProcedureStore.getState().unsubscribeBoardUpdates()
  })
})
