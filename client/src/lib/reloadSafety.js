/**
 * 새로고침 안전 판정에 쓸 현재 상태를 모은다 (화면·스토어를 읽기만 한다).
 * 판정 자체는 deployVersion.js의 evaluateReloadSafety(순수 함수)가 한다.
 *
 * 읽는 것
 * - chatStore: streaming(AI 응답 중), pendingSuggestions(수락 대기 제안), composerDraft(입력창으로 옮길 글)
 * - [data-chat-composer] 입력창의 값 (ChatPanel)
 * - unsavedWork 신고 (BoardEditor 초안, 설정 마법사, 시뮬레이션 생성)
 * - pendingRequests: 끝나지 않은 쓰기 요청 수 (api.js)
 * - 초점이 있는 입력란, 사용자가 고친 입력란(typedFields), 열린 대화상자
 * 어느 하나라도 읽다가 실패하면 그 항목은 비워 둔다 → 판정이 'unknown'으로 막는다.
 */
import { useChatStore } from '../stores/chatStore'
import { listUnsavedWork } from './unsavedWork'
import { getPendingWriteCount } from './pendingRequests'
import { createTypedFieldTracker, isEditableFocusTarget } from './typedFields'
import { evaluateReloadSafety } from './deployVersion'

/** 앱 전체가 함께 쓰는 입력란 추적기 (DeployWatcher가 start) */
export const typedFieldTracker = createTypedFieldTracker()

export const CHAT_COMPOSER_SELECTOR = '[data-chat-composer]'
export const DEPLOY_BANNER_SELECTOR = '[data-deploy-banner]'
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]'

function isShown(el) {
  try {
    return el.getClientRects().length > 0
  } catch {
    return true // 알 수 없으면 보이는 것으로 본다(안전 쪽)
  }
}

/** 초점이 있는 요소 종류: 없음 / 대화 입력창 / 다른 입력란 */
export function readFocusedField(doc) {
  const el = doc.activeElement
  if (!el || el === doc.body || el === doc.documentElement) return 'none'
  if (el.closest?.(DEPLOY_BANNER_SELECTOR)) return 'none'
  if (el.matches?.(CHAT_COMPOSER_SELECTOR)) return 'chat-composer'
  return isEditableFocusTarget(el) ? 'field' : 'none'
}

/** 대화 입력창이 모두 비었는지 (입력창이 없으면 잃을 글도 없으므로 true) */
export function readChatInputEmpty(doc) {
  return [...doc.querySelectorAll(CHAT_COMPOSER_SELECTOR)].every((el) => String(el.value ?? '').trim() === '')
}

/** 보이는 대화상자가 열려 있는지 (안내 막대 안쪽은 제외) */
export function readOpenDialog(doc) {
  return [...doc.querySelectorAll(DIALOG_SELECTOR)].some((el) => !el.closest(DEPLOY_BANNER_SELECTOR) && isShown(el))
}

/**
 * @param {{ doc?: Document, chat?: object, tracker?: { countTypedFields: () => number } }} [deps]
 */
export function collectReloadSafetySnapshot(deps = {}) {
  const snapshot = {}
  const read = (key, fn) => {
    try {
      snapshot[key] = fn()
    } catch {
      snapshot[key] = undefined
    }
  }
  const doc = 'doc' in deps ? deps.doc : (typeof document !== 'undefined' ? document : null)
  const chat = deps.chat ?? useChatStore.getState()
  const tracker = deps.tracker ?? typedFieldTracker

  read('streaming', () => (typeof chat.streaming === 'boolean' ? chat.streaming : undefined))
  read('pendingSuggestions', () =>
    Array.isArray(chat.pendingSuggestions) ? chat.pendingSuggestions.some((s) => s?.status === 'pending') : undefined)
  read('pendingHandoff', () => chat.composerDraft != null)
  read('unsavedWork', () => listUnsavedWork())
  read('pendingRequests', () => getPendingWriteCount())
  read('typedFields', () => tracker.countTypedFields())
  read('chatInputEmpty', () => readChatInputEmpty(doc))
  read('focusedField', () => readFocusedField(doc))
  read('openDialog', () => readOpenDialog(doc))
  return snapshot
}

/** 지금 새로고침해도 되는지 — { safe, reasons } */
export function checkReloadSafety(deps) {
  try {
    return evaluateReloadSafety(collectReloadSafetySnapshot(deps))
  } catch {
    return { safe: false, reasons: ['unknown'] }
  }
}
