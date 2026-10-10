/**
 * 프로젝트 화면 탐색 초안 안내 줄 (예전 A3ExplorationEntry 테스트의 단언을 옮김)
 * - 초안이 없으면 아무것도 그리지 않는다(미래보기 제거로 탐색 입구·다시 열기 링크 없음)
 * - A-3 밖에서는 안내만, 절차 이동 요청 없음. A-3에서만 대화 입력창에 넣기
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiStreamPost: vi.fn(), API_BASE: '', getHeaders: vi.fn() }))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true } }))

import ExplorationDraftStrip from '../ExplorationDraftStrip'
import { useChatStore } from '../../stores/chatStore'
import { apiPost, apiPatch } from '../../lib/api'
import { createDraft, saveDraft, readDraft, nextDraft } from '../../lib/explorationDraft'

function memoryStorage() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)) }, removeItem: (k) => { map.delete(k) } }
}
let host, root
const project = { id: 'p1', workspace_id: 'w1', title: '고1 기후·에너지 융합 수업', status: 'active', my_role: 'owner' }
const buttons = () => [...host.querySelectorAll('button')].map((b) => b.textContent)
const click = async (text) => { const b = [...host.querySelectorAll('button')].find((x) => x.textContent === text); expect(b).toBeTruthy(); await act(async () => b.click()) }
async function render(props) {
  await act(async () => root.render(<MemoryRouter><ExplorationDraftStrip project={project} procedure="A-2-1" {...props} /></MemoryRouter>))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('localStorage', memoryStorage())
  useChatStore.setState({ pendingSuggestions: [], composerDraft: null, explorationDraftLink: null })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  vi.clearAllMocks()
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

it('초안이 없으면 A-3를 포함한 어느 절차·시연 모드에서도 아무것도 그리지 않는다', async () => {
  await render()
  expect(host.textContent).toBe('')
  expect(host.querySelector('a')).toBeNull()
  await render({ procedure: 'A-2-2' })
  expect(host.textContent).toBe('')
  await render({ project: { ...project, learner_context: { demo: true } } })
  expect(host.textContent).toBe('')
})

it('A-3 밖에서는 초안이 도착했다는 안내만 하고 절차를 옮기지 않는다', async () => {
  saveDraft(localStorage, createDraft({ projectId: 'p1', text: '초안 본문' }))
  await render({ procedure: 'A-1-2' })
  expect(host.textContent).toContain('A-3에서 검토할 탐색 초안 1건')
  expect(host.textContent).toContain('현재 절차를 옮기지 않습니다')
  expect(buttons()).not.toContain('대화 입력창에 넣기')
  await click('초안 보기')
  expect(host.textContent).toContain('초안 본문')
  expect(apiPost).not.toHaveBeenCalled(); expect(apiPatch).not.toHaveBeenCalled()
})

it('A-3에서는 대화 입력창에 넣기 — 보내지 않고 입력창 초안만 둔다', async () => {
  const draft = createDraft({ projectId: 'p1', text: '초안 본문' })
  saveDraft(localStorage, draft)
  const onInserted = vi.fn()
  await render({ onInserted })
  await click('대화 입력창에 넣기')
  expect(useChatStore.getState().composerDraft).toMatchObject({ text: '초안 본문', projectId: 'p1', draftId: draft.id })
  expect(onInserted).toHaveBeenCalled()
  expect(host.textContent).toContain('대화 입력창에 넣었습니다')
  expect(apiPost).not.toHaveBeenCalled()
})

it('읽기 전용 프로젝트에서는 입력창에 넣을 수 없다', async () => {
  saveDraft(localStorage, createDraft({ projectId: 'p1', text: '초안' }))
  await render({ readOnly: true })
  const insert = [...host.querySelectorAll('button')].find((b) => b.textContent === '대화 입력창에 넣기')
  expect(insert.disabled).toBe(true)
})

it('보낸 초안에서 나온 제안이 대기 중이면 제안 검토 중, 반영되면 반영됨·닫기', async () => {
  const sent = nextDraft(createDraft({ projectId: 'p1', text: '초안' }), { type: 'sent', at: Date.parse('2026-10-03T01:42:00Z') })
  saveDraft(localStorage, sent)
  useChatStore.setState({ pendingSuggestions: [{ id: 's1', status: 'pending', fromExploration: sent.id }] })
  await render()
  expect(host.textContent).toContain('대화에 보냄')
  expect(host.textContent).toContain('제안 검토 중')
  saveDraft(localStorage, nextDraft(sent, { type: 'accepted', persisted: true, at: Date.now(), label: 'A-3 주제의 상세 내용 분석' }))
  await act(async () => {})
  expect(host.textContent).toContain('보드에 반영됨')
  expect(host.textContent).toContain('A-3 주제의 상세 내용 분석')
  await act(async () => host.querySelector('button[aria-label="안내 닫기"]').click())
  expect(readDraft(localStorage, 'p1')).toBeNull()
})

it('저장 확인 필요는 보드를 다시 읽어 수락 뒤 저장이 확인되면 반영으로 바꾼다', async () => {
  const at = Date.parse('2026-10-03T05:00:00Z')
  const draft = nextDraft(nextDraft(createDraft({ projectId: 'p1', text: '초안' }), { type: 'sent', at: at - 1000 }), { type: 'accepted', persisted: false, at })
  saveDraft(localStorage, draft)
  const get = vi.fn().mockResolvedValueOnce({ updated_at: new Date(at - 60_000).toISOString() }).mockResolvedValueOnce({ updated_at: new Date(at + 1000).toISOString() })
  await render({ get })
  expect(host.textContent).toContain('저장 확인 필요')
  await click('다시 확인')
  expect(get).toHaveBeenCalledWith('/api/projects/p1/designs/A-2-1')
  expect(host.textContent).toContain('저장 기록을 찾지 못했습니다')
  await click('다시 확인')
  expect(readDraft(localStorage, 'p1').status).toBe('reflected')
  expect(host.textContent).toContain('보드에 반영됨')
})
