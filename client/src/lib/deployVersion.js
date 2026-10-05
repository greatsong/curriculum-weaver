/**
 * 새 배포 감지 — 순수 로직 (버전 비교, 새로고침 안전 판정, 자동 새로고침 횟수 제한).
 *
 * 화면·네트워크·스토어를 읽지 않는다. 읽은 값은 호출하는 쪽(deployWatcher.js, reloadSafety.js)이 넘긴다.
 * 판정이 불확실하면 항상 "새로고침하지 않음" 쪽으로 기운다.
 */

// 커밋 SHA(40자 16진수)나 build-YYYYMMDD… 같은 값만 받는다
const BUILD_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

/** 빌드 식별자를 정리한다. 형식에 맞지 않으면 null. */
export function normalizeBuildId(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return BUILD_ID_PATTERN.test(trimmed) ? trimmed : null
}

/**
 * /version.json 응답에서 빌드 식별자를 꺼낸다.
 * SPA 폴백으로 index.html이 오거나(파일이 아직 없는 옛 배포), 본문이 JSON이 아니거나,
 * 형식이 다르면 null — 호출자는 이를 "업데이트 없음"으로 다룬다(오탐 금지).
 *
 * @param {{ ok: boolean, contentType?: string|null, text: string }} response
 * @returns {string|null}
 */
export function parseVersionResponse(response) {
  if (!response || response.ok !== true) return null
  const contentType = String(response.contentType || '').toLowerCase()
  if (contentType.includes('text/html')) return null
  const text = typeof response.text === 'string' ? response.text.trim() : ''
  if (!text || text[0] !== '{') return null
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  return normalizeBuildId(body.buildId)
}

/** 두 식별자가 모두 유효하고 서로 다를 때만 새 배포로 본다. */
export function hasNewDeploy(currentId, remoteId) {
  const current = normalizeBuildId(currentId)
  const remote = normalizeBuildId(remoteId)
  return Boolean(current && remote && current !== remote)
}

// ── 새로고침 안전 판정 ────

/** 안전하지 않은 이유 → 화면 문구 (합쇼체, 짧게) */
export const RELOAD_BLOCK_LABELS = {
  'ai-streaming': 'AI가 답하는 중입니다.',
  'chat-input': '대화 입력창에 보내지 않은 글이 있습니다.',
  'pending-suggestion': '수락하거나 거절하지 않은 AI 제안이 있습니다.',
  'board-edit': '저장하지 않은 보드 편집이 있습니다.',
  'typed-field': '작성 중인 입력란이 있습니다.',
  'focused-field': '작성 중인 입력란이 있습니다.',
  saving: '저장 요청을 처리하는 중입니다.',
  handoff: '대화 입력창으로 옮기는 글이 있습니다.',
  dialog: '열려 있는 창이 있습니다.',
  setup: '워크스페이스 설정을 진행하는 중입니다.',
  simulation: '시뮬레이션을 만드는 중입니다.',
  unknown: '화면 상태를 확인하지 못했습니다.',
}

/** 이유 목록을 화면 문구 목록으로 바꾼다(같은 문구는 한 번만). */
export function describeReloadBlocks(reasons) {
  const labels = []
  for (const reason of Array.isArray(reasons) ? reasons : []) {
    const label = RELOAD_BLOCK_LABELS[reason] || RELOAD_BLOCK_LABELS.unknown
    if (!labels.includes(label)) labels.push(label)
  }
  return labels
}

/**
 * 지금 새로고침해도 잃는 것이 없는지 판정한다.
 * 모든 항목이 "확실히 안전"일 때만 safe. 값이 없거나 형식이 다르면 'unknown'으로 막는다.
 *
 * @param {object} snapshot
 * @param {boolean} snapshot.streaming        AI 응답 중인지 (chatStore.streaming)
 * @param {boolean} snapshot.chatInputEmpty    대화 입력창이 비었는지
 * @param {boolean} snapshot.pendingSuggestions 수락/거절 대기 중인 AI 제안이 있는지
 * @param {boolean} snapshot.pendingHandoff    입력창으로 옮길 글이 메모리에 있는지 (composerDraft)
 * @param {string[]} snapshot.unsavedWork      컴포넌트가 신고한 미저장 작업 (board-edit, setup, simulation…)
 * @param {number} snapshot.pendingRequests    끝나지 않은 쓰기 요청 수
 * @param {'none'|'chat-composer'|'field'} snapshot.focusedField 초점이 있는 입력란 종류
 * @param {number} snapshot.typedFields        사용자가 고친 뒤 아직 화면에 남아 있는 입력란 수
 * @param {boolean} snapshot.openDialog        열려 있는 대화상자가 있는지
 * @returns {{ safe: boolean, reasons: string[] }}
 */
export function evaluateReloadSafety(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { safe: false, reasons: ['unknown'] }
  const reasons = []
  const add = (reason) => { if (!reasons.includes(reason)) reasons.push(reason) }
  const flag = (value, reason) => {
    if (value === false) return
    add(value === true ? reason : 'unknown')
  }

  flag(snapshot.streaming, 'ai-streaming')
  // chatInputEmpty는 뜻이 반대라 따로 본다
  if (snapshot.chatInputEmpty !== true) add(snapshot.chatInputEmpty === false ? 'chat-input' : 'unknown')
  flag(snapshot.pendingSuggestions, 'pending-suggestion')
  flag(snapshot.pendingHandoff, 'handoff')
  flag(snapshot.openDialog, 'dialog')

  if (!Array.isArray(snapshot.unsavedWork)) add('unknown')
  else for (const work of snapshot.unsavedWork) add(RELOAD_BLOCK_LABELS[work] ? work : 'unknown')

  const count = (value, reason) => {
    if (value === 0) return
    add(Number.isInteger(value) && value > 0 ? reason : 'unknown')
  }
  count(snapshot.pendingRequests, 'saving')
  count(snapshot.typedFields, 'typed-field')

  // 대화 입력창에 초점이 있는 것은 괜찮다(비었는지는 chatInputEmpty가 본다). 다른 입력란은 막는다.
  if (snapshot.focusedField === 'field') add('focused-field')
  else if (snapshot.focusedField !== 'none' && snapshot.focusedField !== 'chat-composer') add('unknown')

  return { safe: reasons.length === 0, reasons }
}

// ── 자동 새로고침을 하지 않는 경로 ────
// 열릴 때 한 번만 하는 일(로그인 코드 교환, 초대 수락, 시연 준비)이 있어 다시 불러오면 안 된다.
const NO_AUTO_RELOAD_PREFIXES = ['/auth/', '/invite/', '/demo-prep']

export function isAutoReloadPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return false
  return !NO_AUTO_RELOAD_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix))
}

// ── 무한 새로고침 방지 (sessionStorage) ────
// 같은 탭에서 "이 빌드 → 저 빌드" 자동 새로고침은 한 번만 한다. 새로고침 뒤에도 옛 빌드면
// (CDN 전파 지연 등) 다시 시도하지 않고 안내만 남긴다.

export const AUTO_RELOAD_RECORD_KEY = 'cw-deploy-auto-reload'

function readRecord(storage) {
  const raw = storage.getItem(AUTO_RELOAD_RECORD_KEY)
  if (!raw) return null
  try {
    const rec = JSON.parse(raw)
    if (rec && typeof rec === 'object' && typeof rec.from === 'string' && typeof rec.to === 'string') return rec
  } catch { /* 깨진 기록은 없는 것으로 본다 */ }
  return null
}

/**
 * 이 탭에서 currentId → remoteId 자동 새로고침을 해도 되는지.
 * 저장소를 못 쓰면(차단·오류) 횟수를 보장할 수 없으므로 false.
 */
export function canAutoReload(storage, currentId, remoteId) {
  if (!storage || !hasNewDeploy(currentId, remoteId)) return false
  try {
    const rec = readRecord(storage)
    return !(rec && rec.from === currentId && rec.to === remoteId)
  } catch {
    return false
  }
}

/** 자동 새로고침 직전에 기록한다. 기록에 실패하면 false(호출자는 새로고침하지 않는다). */
export function rememberAutoReload(storage, currentId, remoteId, at = Date.now()) {
  if (!storage) return false
  try {
    storage.setItem(AUTO_RELOAD_RECORD_KEY, JSON.stringify({ from: currentId, to: remoteId, at }))
    const rec = readRecord(storage)
    return Boolean(rec && rec.from === currentId && rec.to === remoteId)
  } catch {
    return false
  }
}

/**
 * 페이지를 연 직후 부른다. 자동 새로고침으로 새 빌드에 도착했으면 기록을 지우고 arrived: true.
 * 새로고침했는데도 옛 빌드면 기록을 남겨 같은 시도를 막는다. 다른 빌드로 넘어간 오래된 기록은 지운다.
 */
export function settleAutoReload(storage, currentId) {
  if (!storage) return { arrived: false }
  try {
    const rec = readRecord(storage)
    if (!rec) return { arrived: false }
    if (rec.to === currentId) {
      storage.removeItem(AUTO_RELOAD_RECORD_KEY)
      return { arrived: true }
    }
    if (rec.from !== currentId) storage.removeItem(AUTO_RELOAD_RECORD_KEY)
    return { arrived: false }
  } catch {
    return { arrived: false }
  }
}
