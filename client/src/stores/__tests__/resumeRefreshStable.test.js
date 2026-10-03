/**
 * 탭 복귀 재로딩 안정화 회귀 테스트 (2026-10-03)
 *
 * 탭에서 나갔다 돌아오면 바뀐 내용이 없어도 상태가 새 객체로 교체돼 채팅이 맨 아래로
 * 미끄러지고 보드 재로딩이 연쇄로 한 번 더 돌았다. 서버 응답이 같으면 기존 참조를 유지하고,
 * 다르면 예전처럼 새 값으로 바꾸는지 고정한다. 안내 캐시(introCache)는 메시지가 같아도 복원돼야
 * 같은 절차 안내를 중복 생성하지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiUploadFile: vi.fn(),
  apiGetMaterialAnalysis: vi.fn(),
  apiReanalyzeMaterial: vi.fn(),
  apiDeleteMaterial: vi.fn(),
  apiStreamPost: vi.fn(),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

import { apiGet } from '../../lib/api'
import { useChatStore } from '../chatStore.js'
import { useProjectStore } from '../projectStore.js'
import { useProcedureStore } from '../procedureStore.js'
import { sameJson } from '../../lib/sameJson'

const clone = (v) => JSON.parse(JSON.stringify(v))

describe('sameJson', () => {
  it('같은 내용이면 참, 다르면 거짓, 비교 실패는 거짓(예전 동작으로 복귀)', () => {
    expect(sameJson({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false)
    const cyc = {}; cyc.self = cyc
    expect(sameJson(cyc, {})).toBe(false)
  })
})

describe('채팅 loadMessages', () => {
  const server = [
    { id: 'm1', sender_type: 'ai', content: '준비 안내', procedure_context: 'prep' },
    { id: 'm2', sender_type: 'teacher', content: '안녕하세요' },
  ]
  beforeEach(() => {
    useChatStore.setState({ messages: [], introCache: {}, streaming: false })
    apiGet.mockReset()
  })

  it('서버 응답이 같으면 메시지 배열 참조를 유지한다 (자동 스크롤·재렌더 없음)', async () => {
    apiGet.mockResolvedValueOnce(clone(server))
    await useChatStore.getState().loadMessages('p1')
    const first = useChatStore.getState().messages
    apiGet.mockResolvedValueOnce(clone(server))
    await useChatStore.getState().loadMessages('p1')
    expect(useChatStore.getState().messages).toBe(first)
  })

  it('서버에 새 메시지가 있으면 예전처럼 교체한다', async () => {
    apiGet.mockResolvedValueOnce(clone(server))
    await useChatStore.getState().loadMessages('p1')
    apiGet.mockResolvedValueOnce([...clone(server), { id: 'm3', sender_type: 'ai', content: '팀원 메시지' }])
    await useChatStore.getState().loadMessages('p1')
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('메시지가 같아도 비어 있는 안내 캐시는 복원한다 (안내 중복 생성 방지)', async () => {
    // 소켓으로만 받은 인트로: 메시지는 있으나 캐시는 비어 있는 상태
    useChatStore.setState({ messages: clone(server), introCache: {} })
    const before = useChatStore.getState().messages
    apiGet.mockResolvedValueOnce(clone(server))
    await useChatStore.getState().loadMessages('p1')
    expect(useChatStore.getState().messages).toBe(before)
    expect(useChatStore.getState().introCache.prep).toBe('준비 안내')
  })

  it('스트리밍 중에는 기존처럼 건드리지 않는다', async () => {
    useChatStore.setState({ streaming: true, messages: [] })
    apiGet.mockResolvedValueOnce(clone(server))
    await useChatStore.getState().loadMessages('p1')
    expect(useChatStore.getState().messages).toEqual([])
    expect(apiGet).not.toHaveBeenCalled()
  })
})

describe('프로젝트 fetchProject', () => {
  const project = { id: 'p1', title: '기후', current_procedure: 'T-1-1', skipped_procedures: [] }
  beforeEach(() => { useProjectStore.setState({ currentProject: null }); apiGet.mockReset() })

  it('같은 내용이면 currentProject 참조를 유지한다 (연쇄 재로딩 없음)', async () => {
    apiGet.mockResolvedValueOnce(clone(project))
    await useProjectStore.getState().fetchProject('p1')
    const first = useProjectStore.getState().currentProject
    apiGet.mockResolvedValueOnce(clone(project))
    const ret = await useProjectStore.getState().fetchProject('p1')
    expect(useProjectStore.getState().currentProject).toBe(first)
    expect(ret).toBe(first)
    expect(useProjectStore.getState().loading).toBe(false)
  })

  it('팀 커서가 바뀌었으면 새 값으로 교체한다 (팀원 절차 이동 반영)', async () => {
    apiGet.mockResolvedValueOnce(clone(project))
    await useProjectStore.getState().fetchProject('p1')
    apiGet.mockResolvedValueOnce({ ...clone(project), current_procedure: 'T-1-2' })
    await useProjectStore.getState().fetchProject('p1')
    expect(useProjectStore.getState().currentProject.current_procedure).toBe('T-1-2')
  })
})

describe('보드 loadBoards', () => {
  const design = { id: 'd1', procedure_code: 'T-1-1', content: { commonVision: '비전' } }
  beforeEach(() => { useProcedureStore.setState({ boards: {}, loading: false }); apiGet.mockReset() })

  it('같은 보드면 boards 참조를 유지하고 로딩 표시는 끈다', async () => {
    apiGet.mockResolvedValueOnce(clone(design))
    await useProcedureStore.getState().loadBoards('p1', 'T-1-1')
    const first = useProcedureStore.getState().boards
    apiGet.mockResolvedValueOnce(clone(design))
    await useProcedureStore.getState().loadBoards('p1', 'T-1-1')
    expect(useProcedureStore.getState().boards).toBe(first)
    expect(useProcedureStore.getState().loading).toBe(false)
  })

  it('팀원이 보드를 고쳤으면 새 내용으로 교체한다', async () => {
    apiGet.mockResolvedValueOnce(clone(design))
    await useProcedureStore.getState().loadBoards('p1', 'T-1-1')
    apiGet.mockResolvedValueOnce({ ...clone(design), content: { commonVision: '고친 비전' } })
    await useProcedureStore.getState().loadBoards('p1', 'T-1-1')
    expect(useProcedureStore.getState().boards.team_vision.content.commonVision).toBe('고친 비전')
  })
})
