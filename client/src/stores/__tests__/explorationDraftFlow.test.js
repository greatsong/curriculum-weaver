/**
 * 탐색 초안(이 브라우저에 이미 도착한 것) → A-3 대화 → 제안 수락·거부 → 초안 상태 (이 브라우저에만 기록)
 * - 입력창에 넣은 초안을 머리글째 보내면 '대화에 보냄', 그 응답의 제안에 초안 id가 붙는다
 * - 수락 저장 성공은 '보드에 반영됨', 저장 실패는 '저장 확인 필요', 거부는 '반영하지 않음'
 * - 교사가 머리글을 지우고 보내면 초안과 잇지 않는다(상태 그대로)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(async () => ({ designs: [] })),
  apiPost: vi.fn(async (_p, body) => ({ id: `m-${Date.now()}`, content: body?.content, sender_type: 'teacher' })),
  apiPut: vi.fn(async (_p, body) => ({ content: body?.content })),
  apiPatch: vi.fn(), apiDelete: vi.fn(), apiUploadFile: vi.fn(),
  apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
  apiStreamPost: vi.fn(async (_path, _body, handlers) => {
    handlers.onBoardSuggestions?.([{ procedure: 'A-2-1', type: 'board_update', content: { duplicateCheck: '통합 조정 초안' } }])
    handlers.onDone?.()
  }),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

import { useChatStore } from '../chatStore.js'
import { useProcedureStore } from '../procedureStore.js'
import { useProjectStore } from '../projectStore.js'
import { apiPut } from '../../lib/api'
import { createDraft, saveDraft, readDraft, HANDOFF_HEADER } from '../../lib/explorationDraft'

function memoryStorage() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)) }, removeItem: (k) => { map.delete(k) } }
}

// 수락 뒤 AI 안내 요청을 막으려고 sendMessage를 바꿔 끼우는 테스트가 있어, 원래 함수를 매번 되돌린다
const realSendMessage = useChatStore.getState().sendMessage
const TEXT = `${HANDOFF_HEADER}\n참고 프로젝트: 고1 기후·에너지 융합 수업\n선택한 성취기준\n- 통합과학 [10통과2-02-06]: 원문`
let draft

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  draft = createDraft({ projectId: 'p1', text: TEXT })
  saveDraft(localStorage, draft)
  useProjectStore.setState({ currentProject: { id: 'p1', status: 'active', title: '고1 기후·에너지 융합 수업' } })
  useProcedureStore.setState({ boards: {}, currentProcedure: 'A-2-1' })
  useChatStore.setState({ messages: [], pendingSuggestions: [], _acceptedBoardsInBatch: [], streaming: false, composerDraft: null, explorationDraftLink: null, sendMessage: realSendMessage })
  apiPut.mockClear()
})
afterEach(() => { vi.unstubAllGlobals() })

async function sendDraft(content = TEXT) {
  useChatStore.getState().setComposerDraft({ text: TEXT, projectId: 'p1', draftId: draft.id })
  expect(useChatStore.getState().composerDraft.text).toBe(TEXT)
  useChatStore.getState().consumeComposerDraft()
  await useChatStore.getState().sendMessage('p1', content, { procedureCode: 'A-2-1' })
}

describe('탐색 초안 상태 흐름', () => {
  it('머리글째 보내면 대화에 보냄, 그 응답의 제안에 초안 id가 붙는다', async () => {
    await sendDraft()
    expect(readDraft(localStorage, 'p1').status).toBe('sent')
    expect(useChatStore.getState().explorationDraftLink).toBeNull()
    const pending = useChatStore.getState().pendingSuggestions
    expect(pending.length).toBeGreaterThan(0)
    expect(pending.every((s) => s.fromExploration === draft.id)).toBe(true)
  })

  it('제안을 수락하고 저장되면 보드에 반영됨 (A-3 표시 코드로 기록)', async () => {
    await sendDraft()
    const id = useChatStore.getState().pendingSuggestions[0].id
    useChatStore.setState({ sendMessage: vi.fn(async () => {}) }) // 수락 뒤 AI 안내 요청은 생략
    await useChatStore.getState().acceptSuggestion(id, 'p1')
    const saved = readDraft(localStorage, 'p1')
    expect(saved.status).toBe('reflected')
    expect(saved.reflectedLabel).toBe('A-3 주제의 상세 내용 분석')
    expect(saved.reflectedLabel).not.toContain('A-2-1')
  })

  it('저장이 실패하면 반영으로 표시하지 않고 저장 확인 필요', async () => {
    await sendDraft()
    const id = useChatStore.getState().pendingSuggestions[0].id
    useChatStore.setState({ sendMessage: vi.fn(async () => {}) })
    apiPut.mockRejectedValueOnce(new Error('잠김'))
    await useChatStore.getState().acceptSuggestion(id, 'p1')
    expect(readDraft(localStorage, 'p1').status).toBe('unconfirmed')
  })

  it('제안을 거부하면 반영하지 않음', async () => {
    await sendDraft()
    const id = useChatStore.getState().pendingSuggestions[0].id
    await useChatStore.getState().rejectSuggestion(id, 'p1')
    expect(readDraft(localStorage, 'p1').status).toBe('rejected')
  })

  it('머리글을 지우고 보내면 초안과 잇지 않는다', async () => {
    await sendDraft('직접 쓴 다른 질문')
    expect(readDraft(localStorage, 'p1').status).toBe('arrived')
    expect(useChatStore.getState().pendingSuggestions.every((s) => !s.fromExploration)).toBe(true)
    expect(useChatStore.getState().explorationDraftLink).toEqual({ projectId: 'p1', draftId: draft.id })
  })

  it('다른 프로젝트에서 보낸 메시지는 초안과 잇지 않는다', async () => {
    useChatStore.getState().setComposerDraft({ text: TEXT, projectId: 'p1', draftId: draft.id })
    useProjectStore.setState({ currentProject: { id: 'p2', status: 'active' } })
    await useChatStore.getState().sendMessage('p2', TEXT, { procedureCode: 'A-2-1' })
    expect(readDraft(localStorage, 'p1').status).toBe('arrived')
  })
})
