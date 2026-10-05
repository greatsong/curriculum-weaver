/**
 * 새로고침 안전 판정에 쓰는 상태 수집 — 대화 입력창, 초점, 고친 입력란, 대화상자,
 * 미저장 작업 신고, 끝나지 않은 쓰기 요청 (화면은 happy-dom)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { collectReloadSafetySnapshot, checkReloadSafety, readFocusedField } from '../reloadSafety'
import { createTypedFieldTracker } from '../typedFields'
import { holdUnsavedWork, listUnsavedWork, resetUnsavedWorkForTest } from '../unsavedWork'
import { beginWriteRequest, getPendingWriteCount, resetPendingWritesForTest } from '../pendingRequests'

const idleChat = { streaming: false, pendingSuggestions: [], composerDraft: null }
let host
let tracker

function typeInto(el, value) {
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  resetUnsavedWorkForTest()
  resetPendingWritesForTest()
  host = document.createElement('div')
  document.body.append(host)
  tracker = createTypedFieldTracker()
  tracker.start(document)
})
afterEach(() => {
  tracker.stop()
  host.remove()
  document.activeElement?.blur?.()
})

const check = (chat = idleChat) => checkReloadSafety({ doc: document, chat, tracker })

describe('상태 수집', () => {
  it('아무것도 없으면 안전', () => {
    host.innerHTML = '<textarea data-chat-composer></textarea><button>보내기</button>'
    expect(check()).toEqual({ safe: true, reasons: [] })
  })

  it('AI 응답 중이면 막는다', () => {
    expect(check({ ...idleChat, streaming: true }).reasons).toContain('ai-streaming')
  })

  it('수락 대기 제안과 입력창으로 옮길 글이 있으면 막는다', () => {
    const chat = { ...idleChat, pendingSuggestions: [{ status: 'accepted' }, { status: 'pending' }], composerDraft: { text: '초안' } }
    expect(check(chat).reasons).toEqual(expect.arrayContaining(['pending-suggestion', 'handoff']))
    expect(check({ ...idleChat, pendingSuggestions: [{ status: 'accepted' }] }).safe).toBe(true)
  })

  it('대화 입력창에 글이 있으면 막고, 비우면 풀린다(초점이 있어도 비었으면 안전)', () => {
    host.innerHTML = '<textarea data-chat-composer></textarea>'
    const composer = host.querySelector('textarea')
    composer.value = '보내지 않은 질문'
    expect(check().reasons).toContain('chat-input')
    composer.value = ''
    composer.focus()
    expect(readFocusedField(document)).toBe('chat-composer')
    expect(check().safe).toBe(true)
  })

  it('다른 입력란에 초점이 있으면 막는다', () => {
    host.innerHTML = '<input type="text" />'
    host.querySelector('input').focus()
    expect(check().reasons).toContain('focused-field')
  })

  it('체크박스·버튼 초점은 입력란으로 보지 않는다', () => {
    host.innerHTML = '<input type="checkbox" /><button>확인</button>'
    host.querySelector('input').focus()
    expect(readFocusedField(document)).toBe('none')
    host.querySelector('button').focus()
    expect(readFocusedField(document)).toBe('none')
  })

  it('사용자가 고친 입력란이 화면에 남아 있으면 막고, 비우거나 닫으면 풀린다', () => {
    host.innerHTML = '<textarea id="comment"></textarea>'
    const comment = host.querySelector('#comment')
    typeInto(comment, '댓글 초안')
    comment.blur()
    expect(check().reasons).toContain('typed-field')
    comment.value = '' // 전송 뒤 비움
    expect(check().safe).toBe(true)
    typeInto(comment, '다시 적음')
    comment.remove() // 창을 닫음
    expect(check().safe).toBe(true)
  })

  it('프로그램이 넣은 값(사용자 입력 없음)은 고친 입력란으로 세지 않는다', () => {
    host.innerHTML = '<input type="search" />'
    host.querySelector('input').value = '불러온 값'
    expect(check().safe).toBe(true)
  })

  it('보이는 대화상자가 열려 있으면 막는다', () => {
    host.innerHTML = '<div role="dialog" aria-modal="true">설정</div>'
    const dialog = host.querySelector('[role="dialog"]')
    dialog.getClientRects = () => [{ width: 10, height: 10 }]
    expect(check().reasons).toContain('dialog')
    dialog.getClientRects = () => []
    expect(check().safe).toBe(true)
  })

  it('미저장 작업 신고와 끝나지 않은 쓰기 요청을 반영한다', () => {
    const release = holdUnsavedWork('board-edit')
    expect(check().reasons).toContain('board-edit')
    release()
    release() // 두 번 불러도 안전
    expect(listUnsavedWork()).toEqual([])

    const end = beginWriteRequest('POST')
    beginWriteRequest('GET')() // 읽기 요청은 세지 않는다
    expect(getPendingWriteCount()).toBe(1)
    expect(check().reasons).toContain('saving')
    end()
    end()
    expect(getPendingWriteCount()).toBe(0)
    expect(check().safe).toBe(true)
  })

  it('화면을 읽지 못하면 unknown으로 막는다', () => {
    const snapshot = collectReloadSafetySnapshot({ doc: null, chat: idleChat, tracker })
    expect(snapshot.chatInputEmpty).toBeUndefined()
    expect(checkReloadSafety({ doc: null, chat: idleChat, tracker })).toMatchObject({ safe: false })
  })
})
