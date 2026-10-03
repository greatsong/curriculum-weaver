/**
 * 절차 인트로 중복 방지 (2026-10-03 건너뛰기 왕복 테스트에서 발견)
 * 건너뛰기 해제가 introCache를 지워, 해제 후 다른 절차에 갔다가 돌아오면 같은 인트로가 한 번 더 저장됐다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(),
  apiDelete: vi.fn(async () => ({ skips: [] })),
  apiUploadFile: vi.fn(), apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
  apiStreamPost: vi.fn(async () => {}),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

import { apiStreamPost } from '../../lib/api'
import { useChatStore } from '../chatStore.js'
import { useProcedureStore } from '../procedureStore.js'
import { useProjectStore } from '../projectStore.js'

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  apiStreamPost.mockClear()
  useProjectStore.setState({ currentProject: { id: 'p1', status: 'active', title: 't' } })
  useChatStore.setState({ streaming: false, messages: [], introCache: {} })
})

describe('절차 인트로 중복 방지', () => {
  it('건너뛰기를 해제해도 그 절차의 인트로 기록(캐시)을 지우지 않는다', async () => {
    useChatStore.setState({ introCache: { 'T-2-2': '팀 규칙 안내' } })
    await useProcedureStore.getState().unskipProcedure('p1', 'T-2-2')
    expect(useChatStore.getState().introCache['T-2-2']).toBe('팀 규칙 안내')
    await useChatStore.getState().requestProcedureIntro('p1', 'T-2-2')
    expect(apiStreamPost).not.toHaveBeenCalled()
  })

  it('캐시가 비어도 대화에 그 절차의 AI 메시지가 있으면 인트로를 다시 만들지 않고 캐시를 복원한다', async () => {
    useChatStore.setState({ messages: [{ id: 'm1', sender_type: 'ai', procedure_context: 'T-2-2', content: '팀 규칙 안내' }] })
    await useChatStore.getState().requestProcedureIntro('p1', 'T-2-2')
    expect(apiStreamPost).not.toHaveBeenCalled()
    expect(useChatStore.getState().introCache['T-2-2']).toBe('팀 규칙 안내')
  })

  it('처음 들어가는 절차는 예전처럼 인트로를 요청한다', async () => {
    useChatStore.setState({ messages: [{ id: 'm1', sender_type: 'ai', procedure_context: 'T-2-2', content: 'x' }] })
    await useChatStore.getState().requestProcedureIntro('p1', 'T-2-3')
    expect(apiStreamPost).toHaveBeenCalledTimes(1)
  })

  it('교사 메시지만 있는 절차는 인트로가 없으므로 요청한다', async () => {
    useChatStore.setState({ messages: [{ id: 't1', sender_type: 'teacher', procedure_context: 'T-2-3', content: '질문' }] })
    await useChatStore.getState().requestProcedureIntro('p1', 'T-2-3')
    expect(apiStreamPost).toHaveBeenCalledTimes(1)
  })
})
