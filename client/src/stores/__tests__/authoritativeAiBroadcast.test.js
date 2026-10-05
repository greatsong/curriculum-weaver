/**
 * AI 답이 섞이거나 섞인 글이 팀원에게 퍼지는 경로를 막는다(2026-10-05 운영 사고 후속).
 * - 화면 글(streamingText)을 ai_response_done으로 팀원에게 중계하지 않는다. 대신 요청 본문에 socket_id를
 *   싣고, 서버가 저장한 원문을 이 탭만 빼고 보낸다(routes/chat.js)
 * - 절차 안내도 요청 번호(_streamSeq)를 쓴다. 늦게 끝난 이전 요청의 글자·마무리·오류가 지금 요청을 건드리지 않는다
 * - 서버 저장 번호(message_saved)로 화면 메시지를 붙여, 소켓 재연결로 자기 방송을 받아도 중복되지 않는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  streams: [],
  socket: { id: 'sockA', on: null, off: null, emit: null, connected: true },
}))

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(async () => ([])),
  apiPost: vi.fn(async (url, body) => (url === '/api/chat/teacher' ? { id: `t-${body.content}`, sender_type: 'teacher', content: body.content } : {})),
  apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiUploadFile: vi.fn(),
  apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
  // 스트림마다 콜백과 끝내기 함수를 남겨, 테스트가 순서를 직접 정한다
  apiStreamPost: vi.fn((url, body, cbs) => new Promise((resolve) => { h.streams.push({ url, body, cbs, resolve }) })),
}))
vi.mock('../../lib/socket', () => ({ socket: h.socket }))

const store = new Map()
vi.stubGlobal('localStorage', { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() })

import { useChatStore } from '../chatStore.js'
import { useProjectStore } from '../projectStore.js'
import { apiStreamPost } from '../../lib/api'

const lastStream = () => h.streams[h.streams.length - 1]
const waitStreams = (n) => vi.waitFor(() => expect(h.streams.length).toBe(n))
const emittedEvents = () => h.socket.emit.mock.calls.map(([event]) => event)

beforeEach(() => {
  h.streams.length = 0
  h.socket.id = 'sockA'
  h.socket.on = vi.fn()
  h.socket.off = vi.fn()
  h.socket.emit = vi.fn()
  vi.mocked(apiStreamPost).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useProjectStore.setState({ currentProject: { id: 'p1', status: 'active', title: '팀' } })
  useChatStore.setState({ messages: [], streaming: false, streamingText: '', pendingSuggestions: [], introCache: {}, _streamSeq: 0, _lastAiMessageId: null })
})

describe('절차 안내도 요청 번호를 쓴다', () => {
  it('안내 스트림 도중 다른 요청 번호가 되면 안내 글자가 붙지 않고 마무리도 하지 않는다', async () => {
    const p = useChatStore.getState().requestProcedureIntro('p1', 'T-2-2')
    await waitStreams(1)
    expect(useChatStore.getState()._streamSeq).toBe(1) // 안내도 번호를 올린다
    const { onText, onDone } = lastStream().cbs
    onText('팀 규칙 안내 ')
    expect(useChatStore.getState().streamingText).toBe('팀 규칙 안내 ')

    useChatStore.setState({ _streamSeq: 99, streamingText: '다른 답 ' }) // 다른 요청이 시작된 상황
    onText('섞이면 안 되는 글자')
    expect(useChatStore.getState().streamingText).toBe('다른 답 ')
    onDone()
    expect(useChatStore.getState().messages).toHaveLength(0) // 이전 안내를 붙이지 않는다
    expect(useChatStore.getState().streaming).toBe(true)     // 지금 요청의 잠금을 풀지 않는다
    lastStream().resolve(); await p
    expect(useChatStore.getState().streaming).toBe(true)     // 늦은 finally도 풀지 않는다
    expect(useChatStore.getState().streamingText).toBe('다른 답 ')
  })

  it('지금 요청인 안내는 끝나면 반드시 잠금을 푼다', async () => {
    const p = useChatStore.getState().requestProcedureIntro('p1', 'T-2-2')
    await waitStreams(1)
    lastStream().cbs.onText('팀 규칙 안내')
    lastStream().cbs.onDone()
    lastStream().resolve(); await p
    const s = useChatStore.getState()
    expect(s.streaming).toBe(false)
    expect(s.messages.map((m) => m.content)).toEqual(['팀 규칙 안내'])
    expect(s.introCache['T-2-2']).toBe('팀 규칙 안내')
  })

  it('끝 신호 없이 스트림이 닫혀도 지금 요청이면 잠금을 푼다', async () => {
    const p = useChatStore.getState().requestProcedureIntro('p1', 'T-2-2')
    await waitStreams(1)
    lastStream().resolve(); await p
    expect(useChatStore.getState().streaming).toBe(false)
  })
})

describe('이전 요청의 늦은 마무리·오류', () => {
  it('이전 대화 요청의 늦은 onError·finally가 지금 요청의 streaming·streamingText를 지우지 않는다', async () => {
    const first = useChatStore.getState().sendMessage('p1', '첫 질문', 'A-2-1')
    await waitStreams(1)
    const old = lastStream()
    old.cbs.onError('서버 오류') // 지금 요청일 때의 오류 → 잠금을 푼다(교사가 다시 보낼 수 있게)
    expect(useChatStore.getState().streaming).toBe(false)

    const second = useChatStore.getState().sendMessage('p1', '다시 질문', 'A-2-1')
    await waitStreams(2)
    const cur = lastStream()
    cur.cbs.onText('지금 답')

    old.cbs.onError('늦게 온 오류')
    old.cbs.onText('늦게 온 글자')
    old.cbs.onBoardSuggestions([{ procedure: 'A-2-1', content: { x: 1 } }])
    old.resolve(); await first
    let s = useChatStore.getState()
    expect(s.streaming).toBe(true)
    expect(s.streamingText).toBe('지금 답')
    expect(s.pendingSuggestions).toHaveLength(0)

    cur.cbs.onDone()
    cur.resolve(); await second
    s = useChatStore.getState()
    expect(s.streaming).toBe(false)
    expect(s.messages.filter((m) => m.sender_type === 'ai').map((m) => m.content)).toEqual(['지금 답'])
  })

  it('이전 안내 요청의 늦은 onError·finally가 지금 대화 요청을 지우지 않는다', async () => {
    const intro = useChatStore.getState().requestProcedureIntro('p1', 'T-2-2')
    await waitStreams(1)
    const old = lastStream()
    old.cbs.onError('연결 끊김')
    expect(useChatStore.getState().streaming).toBe(false)

    const send = useChatStore.getState().sendMessage('p1', '질문', 'T-2-2')
    await waitStreams(2)
    const cur = lastStream()
    cur.cbs.onText('지금 답')
    old.cbs.onError('늦게 온 오류')
    old.resolve(); await intro
    expect(useChatStore.getState().streaming).toBe(true)
    expect(useChatStore.getState().streamingText).toBe('지금 답')
    cur.cbs.onDone(); cur.resolve(); await send
    expect(useChatStore.getState().streaming).toBe(false)
  })
})

describe('팀원에게는 서버 원문만 간다', () => {
  it('대화·안내 요청 본문에 이 탭의 socket_id를 싣는다', async () => {
    const send = useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    await waitStreams(1)
    expect(lastStream().url).toBe('/api/chat/message')
    expect(lastStream().body.socket_id).toBe('sockA')
    lastStream().cbs.onDone(); lastStream().resolve(); await send

    const intro = useChatStore.getState().requestProcedureIntro('p1', 'T-2-2')
    await waitStreams(2)
    expect(lastStream().url).toBe('/api/chat/stage-intro')
    expect(lastStream().body.socket_id).toBe('sockA')
    lastStream().resolve(); await intro
  })

  it('소켓이 연결 전이라 id가 없으면 socket_id를 싣지 않는다(서버는 방송하지 않음)', async () => {
    h.socket.id = undefined
    const send = useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    await waitStreams(1)
    expect(lastStream().body.socket_id).toBeUndefined()
    expect(JSON.parse(JSON.stringify(lastStream().body))).not.toHaveProperty('socket_id')
    lastStream().resolve(); await send
  })

  it('AI 답·안내가 끝나도 ai_response_done을 보내지 않는다', async () => {
    const send = useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    await waitStreams(1)
    lastStream().cbs.onText('답입니다')
    lastStream().cbs.onDone(); lastStream().resolve(); await send

    const intro = useChatStore.getState().requestProcedureIntro('p1', 'T-2-2')
    await waitStreams(2)
    lastStream().cbs.onText('안내입니다')
    lastStream().cbs.onDone(); lastStream().resolve(); await intro

    expect(useChatStore.getState().messages.filter((m) => m.sender_type === 'ai')).toHaveLength(2)
    expect(emittedEvents()).not.toContain('ai_response_done')
    expect(emittedEvents()).toContain('new_message') // 교사 메시지 중계는 종전대로
  })
})

describe('서버 저장 번호로 붙여 자기 방송과 중복되지 않는다', () => {
  const messageAddedHandler = () => h.socket.on.mock.calls.find(([event]) => event === 'message_added')[1]

  it('저장 번호를 받으면 그 번호로 붙인다', async () => {
    const send = useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    await waitStreams(1)
    lastStream().cbs.onText('답입니다')
    lastStream().cbs.onMessageSaved({ messageId: 'srv-1' })
    lastStream().cbs.onDone(); lastStream().resolve(); await send
    const ai = useChatStore.getState().messages.filter((m) => m.sender_type === 'ai')
    expect(ai.map((m) => m.id)).toEqual(['srv-1'])
    expect(useChatStore.getState()._lastAiMessageId).toBe('srv-1')
  })

  it('재연결로 자기 방송이 끝 신호보다 먼저 와도 한 번만 보인다(서버 원문 유지)', async () => {
    useChatStore.getState().subscribe('p1')
    const send = useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    await waitStreams(1)
    lastStream().cbs.onText('T-1-2 답')
    lastStream().cbs.onMessageSaved({ messageId: 'srv-1' })
    messageAddedHandler()({ id: 'srv-1', sender_type: 'ai', content: 'T-2 답', stage_context: 'A-2-1' })
    lastStream().cbs.onDone(); lastStream().resolve(); await send
    const ai = useChatStore.getState().messages.filter((m) => m.sender_type === 'ai')
    expect(ai).toHaveLength(1)
    expect(ai[0]).toMatchObject({ id: 'srv-1', content: 'T-2 답' })
  })

  it('끝 신호 뒤에 자기 방송이 와도 같은 번호라 덮어쓸 뿐 늘지 않는다', async () => {
    useChatStore.getState().subscribe('p1')
    const send = useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    await waitStreams(1)
    lastStream().cbs.onText('T-1-2 답')
    lastStream().cbs.onMessageSaved({ messageId: 'srv-1' })
    lastStream().cbs.onDone(); lastStream().resolve(); await send
    messageAddedHandler()({ id: 'srv-1', sender_type: 'ai', content: 'T-2 답', stage_context: 'A-2-1' })
    const ai = useChatStore.getState().messages.filter((m) => m.sender_type === 'ai')
    expect(ai).toHaveLength(1)
    expect(ai[0].content).toBe('T-2 답')
  })

  it('안내도 저장 번호로 붙이고, 먼저 온 자기 방송과 겹치지 않는다', async () => {
    useChatStore.getState().subscribe('p1')
    const intro = useChatStore.getState().requestProcedureIntro('p1', 'T-2-2')
    await waitStreams(1)
    lastStream().cbs.onText('팀 규칙 안내')
    lastStream().cbs.onMessageSaved({ messageId: 'srv-intro' })
    messageAddedHandler()({ id: 'srv-intro', sender_type: 'ai', content: '팀 규칙 안내', stage_context: 'T-2-2' })
    lastStream().cbs.onDone(); lastStream().resolve(); await intro
    const s = useChatStore.getState()
    expect(s.messages.map((m) => m.id)).toEqual(['srv-intro'])
    expect(s.introCache['T-2-2']).toBe('팀 규칙 안내')
    expect(s.streaming).toBe(false)
  })

  it('저장 번호를 못 받으면(옛 서버) 종전처럼 임시 번호로 붙인다', async () => {
    const send = useChatStore.getState().sendMessage('p1', '질문', 'A-2-1')
    await waitStreams(1)
    lastStream().cbs.onText('답입니다')
    lastStream().cbs.onDone(); lastStream().resolve(); await send
    const [ai] = useChatStore.getState().messages.filter((m) => m.sender_type === 'ai')
    expect(ai.id).toMatch(/^ai-\d+$/)
  })
})
