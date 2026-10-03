/**
 * 제안 수락 후 AI 안내 (2026-10-03 제보: 수락 뒤 AI 반응이 없고, AI가 수락 사실을 몰랐다)
 * - 수락하면 보드 저장 뒤 "✓ AI 제안을 '…' 보드에 반영했어요" 메시지로 AI에 알린다(sendMessage 경로 재사용)
 * - 같은 응답의 제안이 남아 있으면 마지막 처리 때 한 번만, 모두 거부·스트리밍 중이면 보내지 않는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(async () => ({ designs: [] })),
  apiPost: vi.fn(async () => ({})),
  apiPut: vi.fn(async (_p, body) => ({ content: body?.content })),
  apiPatch: vi.fn(), apiDelete: vi.fn(), apiUploadFile: vi.fn(),
  apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(), apiStreamPost: vi.fn(),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

import { useChatStore } from '../chatStore.js'
import { useProcedureStore } from '../procedureStore.js'
import { apiPut } from '../../lib/api'

const sug = (id, procedureCode, value) => ({ id, procedureCode, type: 'board_update', field: null, value, rationale: '', status: 'pending' })
let sendMessage

beforeEach(() => {
  sendMessage = vi.fn(async () => {})
  useChatStore.setState({ pendingSuggestions: [], _acceptedBoardsInBatch: [], streaming: false, sendMessage })
  useProcedureStore.setState({ boards: {}, currentProcedure: 'T-2-3' })
  apiPut.mockClear()
})

describe('제안 수락 후 AI 안내', () => {
  it('제안 하나를 수락하면 보드 저장 뒤 한 번 알린다 (보드 이름 포함)', async () => {
    useChatStore.setState({ pendingSuggestions: [sug('s1', 'T-2-3', { schedule: [{ date: '10/6' }] })] })
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    expect(apiPut).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    const [pid, note, code] = sendMessage.mock.calls[0]
    expect(pid).toBe('p1')
    expect(note).toContain("✓ AI 제안을 '팀 일정' 보드에 반영했어요")
    expect(code).toBe('T-2-3')
  })

  it('같은 응답의 제안이 남아 있으면 기다렸다가 마지막 처리 때 한 번만 알린다', async () => {
    useChatStore.setState({ pendingSuggestions: [sug('s1', 'T-2-3', { a: 1 }), sug('s2', 'T-2-2', { b: 1 })] })
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    expect(sendMessage).not.toHaveBeenCalled()
    await useChatStore.getState().rejectSuggestion('s2', 'p1')
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][1]).toContain("'팀 일정' 보드")
    expect(sendMessage.mock.calls[0][1]).not.toContain('팀 규칙')
  })

  it('둘 다 수락하면 두 보드를 한 메시지로 알린다', async () => {
    useChatStore.setState({ pendingSuggestions: [sug('s1', 'T-2-3', { a: 1 }), sug('s2', 'T-2-2', { b: 1 })] })
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    await useChatStore.getState().acceptSuggestion('s2', 'p1')
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][1]).toContain("'팀 일정', '팀 규칙' 보드")
  })

  it('모두 거부하면 AI를 부르지 않는다', async () => {
    useChatStore.setState({ pendingSuggestions: [sug('s1', 'T-2-3', { a: 1 })] })
    await useChatStore.getState().rejectSuggestion('s1', 'p1')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('다른 AI 응답이 진행 중이면 보내지 않는다 (보드 반영은 그대로)', async () => {
    useChatStore.setState({ pendingSuggestions: [sug('s1', 'T-2-3', { a: 1 })], streaming: true })
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    expect(apiPut).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalled()
    expect(useChatStore.getState()._acceptedBoardsInBatch).toEqual([])
  })

  it('편집 후 수락은 "고쳐서 반영"으로 알린다', async () => {
    useChatStore.setState({ pendingSuggestions: [sug('s1', 'T-2-3', { a: 1 })] })
    await useChatStore.getState().editAcceptSuggestion('s1', { a: 2 }, 'p1')
    expect(sendMessage.mock.calls[0][1]).toContain("✓ AI 제안을 고쳐서 '팀 일정' 보드에 반영했어요")
  })

  it('편집 값을 읽지 못해 반영하지 않으면 알리지 않는다', async () => {
    useChatStore.setState({ pendingSuggestions: [sug('s1', 'T-2-3', { a: 1 })] })
    await useChatStore.getState().editAcceptSuggestion('s1', '깨진 {json', 'p1')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('서버가 보드 저장을 거부하면(예: 생략된 절차 403) 오류를 알리고 AI에는 반영했다고 하지 않는다', async () => {
    apiPut.mockRejectedValueOnce(Object.assign(new Error('팀 결정으로 생략된 절차는 수정할 수 없습니다.'), { status: 403 }))
    useChatStore.setState({ pendingSuggestions: [sug('s1', 'T-2-3', { a: 1 })] })
    await useChatStore.getState().acceptSuggestion('s1', 'p1')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('수락 버튼을 빠르게 두 번 누르거나 캔버스·채팅 카드를 둘 다 눌러도 한 번만 처리한다', async () => {
    useChatStore.setState({ pendingSuggestions: [sug('s1', 'T-2-3', { a: 1 })] })
    await Promise.all([
      useChatStore.getState().acceptSuggestion('s1', 'p1'),
      useChatStore.getState().acceptSuggestion('s1', 'p1'),
      useChatStore.getState().editAcceptSuggestion('s1', { a: 2 }, 'p1'),
    ])
    expect(apiPut).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
})
