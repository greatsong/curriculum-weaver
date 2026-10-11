/**
 * Socket.IO 접속자 정보와 방 중계 페이로드 정리
 *
 * 클라이언트가 보낸 값은 그대로 펼치거나 중계하지 않는다.
 * - 접속자 정보: 서버가 검증한 socket.user의 id + 허용한 표시 필드(이름·교과)만, 각 50자
 * - 중계 이벤트: 페이로드 크기 상한과 필수 필드 형식을 검사하고, 보낸 사람 정보는 서버 기준으로 덮어쓴다
 * 형식이 틀린 중계는 조용히 버린다(옛 탭 호환 때문에 이벤트 자체는 유지).
 */
import { PROCEDURES, isDemoBoardCode } from 'curriculum-weaver-shared/constants.js'

export const MEMBER_FIELD_MAX_CHARS = 50
// routes/chat.js의 교사 메시지 저장 상한과 같다
export const TEACHER_MESSAGE_MAX_CHARS = 5000

export const RELAY_LIMITS = Object.freeze({
  // 교사 메시지: 5,000자(한글 약 15KB) + 메타데이터
  teacherMessageBytes: 20 * 1024,
  // 옛 탭의 AI 응답 중계: 정리된 본문 + 제안(ai_suggestions)이 교사 메시지보다 길다
  aiMessageBytes: 64 * 1024,
  // 보드 내용 중계: 같은 변경을 REST 저장 라우트가 이미 방송하므로 넉넉히만 막는다
  boardBytes: 256 * 1024,
  // 절차 이동 등 짧은 이벤트
  smallBytes: 2 * 1024,
})

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/** 제어 문자를 빼고 앞뒤 공백을 지운 뒤 길이를 자른다. 문자열이 아니면 빈 문자열 */
export function clampText(value, max = MEMBER_FIELD_MAX_CHARS) {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)
}

/** 페이로드의 JSON 크기(바이트). 직렬화할 수 없으면 Infinity(=거절) */
export function payloadBytes(payload) {
  try {
    const json = JSON.stringify(payload)
    return json === undefined ? 0 : Buffer.byteLength(json, 'utf8')
  } catch {
    return Infinity
  }
}

/** socket.user의 프로필 이름 — 클라이언트(chatStore·ProjectPage)가 쓰는 순서와 같다 */
function profileName(socketUser) {
  const meta = socketUser?.user_metadata || {}
  return clampText(meta.display_name || meta.full_name || meta.name || '')
}

/** socket.user의 소속·교과 — chatStore가 교사 메시지에 붙이는 값과 같은 규칙 */
function profileSubject(socketUser) {
  const meta = socketUser?.user_metadata || {}
  if (!meta.subject && !meta.school_name) return ''
  return clampText([meta.school_name, meta.subject].filter((v) => typeof v === 'string' && v).join(' '))
}

/**
 * 접속자 목록에 넣을 정보. 클라이언트가 보낸 user 객체는 펼치지 않는다.
 * @param {object} socketUser - 서버가 검증한 socket.user
 * @param {unknown} clientUser - join_project/join_session의 user (name·subject만 사용)
 * @param {{socketId: string, isHost: boolean}} meta
 */
export function buildMemberInfo(socketUser, clientUser, { socketId, isHost }) {
  const client = isPlainObject(clientUser) ? clientUser : {}
  return {
    id: socketUser?.id ? String(socketUser.id) : null,
    name: clampText(client.name) || profileName(socketUser) || '교사',
    subject: clampText(client.subject),
    socketId,
    isHost: Boolean(isHost),
  }
}

function isValidMessageId(id) {
  if (typeof id === 'string') return id.length > 0 && id.length <= 64
  return typeof id === 'number' && Number.isFinite(id)
}

/**
 * 방 중계 메시지(new_message·ai_response_done) 정리.
 * @param {unknown} message
 * @param {{kind: 'teacher'|'ai', roomId: string, socketUser: object, member?: object}} opts
 * @returns {object|null} 중계할 메시지, 형식이 틀리면 null
 */
export function sanitizeRelayMessage(message, { kind, roomId, socketUser, member }) {
  if (!isPlainObject(message)) return null
  if (!isValidMessageId(message.id)) return null
  if (typeof message.content !== 'string' || !message.content) return null

  const maxBytes = kind === 'teacher' ? RELAY_LIMITS.teacherMessageBytes : RELAY_LIMITS.aiMessageBytes
  if (payloadBytes(message) > maxBytes) return null

  const out = { ...message }
  if ('project_id' in out) out.project_id = roomId
  if ('session_id' in out) out.session_id = roomId

  if (kind === 'teacher') {
    if (message.content.length > TEACHER_MESSAGE_MAX_CHARS) return null
    // 보낸 사람은 서버가 검증한 사용자로 덮어쓴다(다른 교사 이름으로 중계하지 못하게)
    out.sender_type = 'teacher'
    out.user_id = socketUser?.id ? String(socketUser.id) : null
    out.sender_name = profileName(socketUser) || member?.name || clampText(message.sender_name) || '교사'
    out.sender_subject = profileSubject(socketUser) || member?.subject || clampText(message.sender_subject)
    return out
  }

  // AI 응답 중계(옛 탭 호환): 교사 메시지로 위장하지 못하게 AI로 고정하고 사람 정보는 지운다
  out.sender_type = 'ai'
  out.user_id = null
  out.sender_name = null
  out.sender_subject = null
  return out
}

/** 절차(설계 보드) 코드인지 — 협력 절차 또는 시연 모드 보드 */
export function isRelayProcedureCode(code) {
  return typeof code === 'string' && (Boolean(PROCEDURES[code]) || isDemoBoardCode(code))
}

/**
 * 보드·절차 중계 페이로드 검사. 통과하면 true.
 * @param {'design'|'board'|'procedure'} kind
 */
export function isValidRelayPayload(kind, payload) {
  if (!isPlainObject(payload)) return false
  if (kind === 'design') {
    return isRelayProcedureCode(payload.procedureCode)
      && isPlainObject(payload.design)
      && payloadBytes(payload) <= RELAY_LIMITS.boardBytes
  }
  if (kind === 'board') {
    return isPlainObject(payload.board) && payloadBytes(payload) <= RELAY_LIMITS.boardBytes
  }
  if (kind === 'procedure') {
    const code = payload.procedureCode ?? payload.stage
    return isRelayProcedureCode(code) && payloadBytes(payload) <= RELAY_LIMITS.smallBytes
  }
  return false
}
