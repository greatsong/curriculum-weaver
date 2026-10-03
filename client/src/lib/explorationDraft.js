/**
 * 미래보기 탐색 초안 — 프로젝트별로 이 브라우저의 localStorage에 하나씩 둔다.
 * 키: cw_exploration_draft:<projectId>
 *
 * 상태(저장되는 값):
 *   arrived      초안 도착 — 보내기를 눌렀고 아직 대화에 보내지 않았다
 *   sent         대화에 보냄 — 초안이 담긴 메시지를 대화로 보냈다
 *   reflected    보드에 반영됨 — 초안에서 나온 제안을 수락했고 저장 응답을 받았다
 *   rejected     반영하지 않음 — 초안에서 나온 제안을 거부했다
 *   unconfirmed  저장 확인 필요 — 수락했지만 저장 결과를 확인하지 못했다
 * "제안 검토 중"은 저장하지 않는다. 제안 카드는 새로고침하면 사라지므로, 화면에서
 * sent + 대기 중인 제안이 있을 때만 파생해 보여 준다(viewStatus).
 *
 * 이 상태는 교사 한 사람의 브라우저에만 있다(서버에 저장하지 않음).
 */

export const DRAFT_VERSION = 1
const PREFIX = 'cw_exploration_draft:'
const EVENT = 'cw:exploration-draft'
const STATUSES = new Set(['arrived', 'sent', 'reflected', 'rejected', 'unconfirmed'])
const MAX_TEXT = 60_000

export function draftStorageKey(projectId) {
  return `${PREFIX}${projectId}`
}

function makeId(now) {
  return `d${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 새 초안 객체 (아직 저장 전) */
export function createDraft({ projectId, text, standards = [], keywords = [], ideaTitle = '', now = Date.now() }) {
  return {
    v: DRAFT_VERSION,
    id: makeId(now),
    projectId,
    text: String(text || '').slice(0, MAX_TEXT),
    summary: {
      standards: standards.map((s) => ({ code: s.code || '', subject: s.subject || '' })).slice(0, 20),
      keywords: keywords.filter(Boolean).slice(0, 20),
      ideaTitle: ideaTitle || '',
    },
    status: 'arrived',
    createdAt: now,
    sentAt: null,
    resolvedAt: null,
    attemptAt: null,
    reflectedLabel: '',
  }
}

/** 저장값 검증 — 모양이 다르거나 다른 프로젝트 것이면 버린다 */
export function isValidDraft(value, projectId) {
  return !!value && typeof value === 'object' && value.v === DRAFT_VERSION &&
    typeof value.id === 'string' && value.projectId === projectId &&
    typeof value.text === 'string' && STATUSES.has(value.status) && typeof value.createdAt === 'number'
}

export function readDraft(storage, projectId) {
  if (!projectId) return null
  try {
    const raw = storage?.getItem(draftStorageKey(projectId))
    if (!raw) return null
    const value = JSON.parse(raw)
    return isValidDraft(value, projectId) ? value : null
  } catch {
    return null
  }
}

function notify(projectId) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId } }))
    }
  } catch { /* 알림 실패는 무시 */ }
}

export function saveDraft(storage, draft) {
  try {
    storage.setItem(draftStorageKey(draft.projectId), JSON.stringify(draft))
    notify(draft.projectId)
    return true
  } catch {
    return false
  }
}

export function removeDraft(storage, projectId) {
  try {
    storage.removeItem(draftStorageKey(projectId))
    notify(projectId)
    return true
  } catch {
    return false
  }
}

/**
 * 상태 전이 (순수 함수). 해당하지 않는 사건이면 같은 객체를 그대로 돌려준다.
 * 사건:
 *   { type: 'sent', draftId, at }                       초안 메시지를 대화로 보냄
 *   { type: 'accepted', draftId, persisted, at, label } 초안에서 나온 제안 수락
 *   { type: 'rejected', draftId, at }                   초안에서 나온 제안 거부
 *   { type: 'rechecked', board }                        저장 확인 필요 상태에서 보드를 다시 읽음
 */
export function nextDraft(draft, event) {
  if (!draft || !event) return draft
  if (event.draftId && event.draftId !== draft.id) return draft
  switch (event.type) {
    case 'sent':
      if (draft.status === 'arrived' || draft.status === 'rejected') {
        return { ...draft, status: 'sent', sentAt: event.at ?? Date.now(), resolvedAt: null }
      }
      return draft
    case 'accepted':
      if (draft.status === 'sent' || draft.status === 'rejected' || draft.status === 'unconfirmed') {
        const at = event.at ?? Date.now()
        return event.persisted
          ? { ...draft, status: 'reflected', resolvedAt: at, attemptAt: at, reflectedLabel: event.label || draft.reflectedLabel || '' }
          : { ...draft, status: 'unconfirmed', attemptAt: at, reflectedLabel: event.label || draft.reflectedLabel || '' }
      }
      return draft
    case 'rejected':
      // 같은 응답의 다른 제안을 이미 수락해 반영됐으면 그대로 둔다
      if (draft.status === 'sent') return { ...draft, status: 'rejected', resolvedAt: event.at ?? Date.now() }
      return draft
    case 'rechecked': {
      if (draft.status !== 'unconfirmed') return draft
      const updated = Date.parse(event.board?.updated_at || '')
      if (Number.isFinite(updated) && draft.attemptAt && updated >= draft.attemptAt - 5_000) {
        return { ...draft, status: 'reflected', resolvedAt: updated }
      }
      return draft
    }
    default:
      return draft
  }
}

/** 저장된 초안에 사건을 적용하고 저장한다. 바뀐 초안(또는 null)을 돌려준다. */
export function applyDraftEvent(storage, projectId, event) {
  const draft = readDraft(storage, projectId)
  if (!draft) return null
  const next = nextDraft(draft, event)
  if (next !== draft) saveDraft(storage, next)
  return next
}

/** 화면에 보일 상태 — sent이면서 이 초안에서 나온 제안이 대기 중이면 '검토 중' */
export function viewStatus(draft, pendingSuggestions = []) {
  if (!draft) return 'none'
  if (draft.status === 'sent' && pendingSuggestions.some((s) => s?.status === 'pending' && s?.fromExploration === draft.id)) {
    return 'reviewing'
  }
  return draft.status
}

/** 다른 탭·같은 탭의 변경을 구독한다. 해제 함수를 돌려준다. */
export function subscribeDraft(projectId, callback) {
  if (typeof window === 'undefined') return () => {}
  const onCustom = (e) => { if (!e?.detail?.projectId || e.detail.projectId === projectId) callback() }
  const onStorage = (e) => { if (!e?.key || e.key === draftStorageKey(projectId)) callback() }
  window.addEventListener(EVENT, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

/** localStorage 접근 자체가 막힌 환경을 위한 안전한 핸들 */
export function safeLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function safeSessionStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}
