/**
 * 절차 이동 기록 — 팀이 절차를 옮길 때 채팅에 남기는 AI 안내. 정해진 문구라 AI를 부르지 않는다.
 * - 앞으로 넘어가면 떠나는 절차의 상태를 한마디 남긴다. 아무것도 하지 않았으면 생략 여부를 확인한다.
 * - 이미 다녀간 절차로 오면 보드 현황을 짧게 다시 안내한다.
 * - 실수로 누르거나 여러 절차를 빠르게 둘러보면(BROWSE_WINDOW_MS 안, 그사이 대화·보드 변경 없음)
 *   직전 이동 기록과 그때 생긴 첫 안내를 지우고 출발 절차 기준으로 한 건만 남긴다.
 *
 * 표식: messages 테이블에 메타 칸이 없어서 AI 메시지의 sender_name(화면에 쓰이지 않음)에 표식을,
 * sender_subject에 이동 정보(JSON)를 둔다. 스키마 변경 없이 운영 DB에 그대로 쓸 수 있다.
 */
import { PROCEDURE_LIST, UNSKIPPABLE_PROCEDURES, getProcedureLabel, getProcedureDisplayCode } from './constants.js'
import { getBriefStatus, getFilledFieldLabels, isBriefValueFilled } from './briefMode.js'

export const MOVE_NOTE_SENDER = 'procedure_move'
/** 이 시간 안에 아무것도 하지 않고 다시 옮기면 지나쳐 간 것으로 본다 */
export const BROWSE_WINDOW_MS = 3 * 60 * 1000
/** 같은 이동이 이 시간 안에 또 오면(동시 클릭·재전송) 한 번만 남긴다 */
export const DUPLICATE_WINDOW_MS = 15 * 1000

const ORDER = PROCEDURE_LIST.map((p) => p.code)

export function isMoveNote(message) {
  return !!message && message.sender_type === 'ai' && message.sender_name === MOVE_NOTE_SENDER
}

export function encodeMoveMeta(meta) {
  return JSON.stringify(meta)
}

export function decodeMoveMeta(message) {
  try {
    const meta = JSON.parse(message?.sender_subject || '')
    return meta && typeof meta === 'object' ? meta : null
  } catch {
    return null
  }
}

const procedureOf = (m) => m?.stage_context || m?.procedure_context
const timeOf = (value) => {
  const t = Date.parse(value || '')
  return Number.isFinite(t) ? t : 0
}
const label = (code) => getProcedureLabel(code) || code
const shortName = (code) => getProcedureDisplayCode(code) || label(code)

function hasBoardContent(content) {
  return !!content && typeof content === 'object' && Object.values(content).some(isBriefValueFilled)
}

function missingRequired(code, content) {
  return (getBriefStatus(code, content)?.a || []).filter((x) => !x.filled).map((x) => x.label)
}

/** 떠나는 절차의 상태 */
function departureOf(code, { designByCode, messages, skipped }) {
  if (skipped.has(code)) return { kind: 'skipped' }
  const content = designByCode.get(code)?.content
  if (hasBoardContent(content)) {
    const missing = missingRequired(code, content)
    return missing.length ? { kind: 'partial', missing } : { kind: 'done' }
  }
  const talked = messages.some((m) => m.sender_type === 'teacher' && procedureOf(m) === code)
  return { kind: talked ? 'talked' : 'untouched' }
}

/** 다시 온 절차의 보드 현황 */
export function buildReturnStatus(code, content) {
  const guide = '처음 안내는 채팅 위쪽의 [절차 안내 보기]에서 다시 볼 수 있습니다.'
  const filled = getFilledFieldLabels(code, content)
  if (!filled.length) return `보드는 아직 비어 있습니다. ${guide}`
  const shown = filled.length > 4 ? `${filled.slice(0, 3).join(', ')} 등 ${filled.length}개` : filled.join(', ')
  const missing = missingRequired(code, content)
  return [
    `보드에는 ${shown} 칸이 채워져 있습니다.`,
    missing.length ? `비어 있는 필수 칸은 ${missing.join(', ')}입니다.` : '필수 칸은 모두 채워져 있습니다.',
    `고칠 내용을 말씀해 주세요. ${guide}`,
  ].join(' ')
}

export function buildMoveNoteText({ origin, to, forward, departure, gap = [], status = null }) {
  const parts = []
  const leftEmpty = forward && ['untouched', 'talked', 'partial'].includes(departure?.kind)
  if (forward) {
    if (departure?.kind === 'untouched') parts.push(`${label(origin)} 단계는 생략하시는 거죠? 알겠습니다.`)
    else if (departure?.kind === 'talked') parts.push(`${label(origin)} 보드는 아직 비어 있습니다. 나중에 돌아와 채울 수 있습니다.`)
    else if (departure?.kind === 'partial') parts.push(`${label(origin)}의 ${departure.missing.join(', ')} 칸이 아직 비어 있습니다. 나중에 돌아와 채울 수 있습니다.`)
    else if (departure?.kind === 'done') parts.push(`${label(origin)} 단계를 마쳤습니다.`)
  }
  parts.push(forward ? `${label(to)} 단계로 넘어갑니다.` : `${label(to)} 단계로 돌아왔습니다.`)
  if (leftEmpty && UNSKIPPABLE_PROCEDURES.includes(origin)) {
    parts.push(`이후 절차에서 ${shortName(origin)} 내용을 참고하므로 나중에 채워 주시면 좋습니다.`)
  }
  if (forward && gap.length) {
    const particle = departure?.kind === 'untouched' || departure?.kind === 'talked' ? '도' : '는'
    parts.push(gap.length === 1
      ? `사이에 있는 ${shortName(gap[0])} 단계${particle} 아직 비어 있습니다.`
      : `사이에 있는 ${shortName(gap[0])} 등 ${gap.length}개 단계${particle} 아직 비어 있습니다.`)
  }
  const text = parts.join(' ')
  return status ? `${text}\n\n${status}` : text
}

/**
 * 이동 한 번을 기록하는 계획. 입출력이 없는 순수 함수라 서버 라우트와 테스트가 함께 쓴다.
 * @param {object} p
 * @param {object[]} p.messages - 프로젝트 최근 메시지(시간순)
 * @param {object[]} p.designs - 프로젝트 보드 행 { procedure_code, content, updated_at }
 * @param {string[]} [p.skippedCodes] - 팀이 생략 표시한 절차
 * @param {string} p.from - 떠나는 절차
 * @param {string} p.to - 도착 절차
 * @param {number} [p.now]
 * @param {boolean} [p.visitedHint] - 클라이언트가 이미 그 절차 안내를 갖고 있음
 * @returns {{ duplicate: object } | { removeIds: string[], content: string, meta: { from, to, origin } }}
 */
export function planProcedureMove({ messages = [], designs = [], skippedCodes = [], from, to, now = Date.now(), visitedHint = false }) {
  const skipped = new Set(skippedCodes)
  const designByCode = new Map(designs.map((d) => [d.procedure_code, d]))
  const prev = messages.filter(isMoveNote).at(-1) || null
  const prevMeta = prev ? decodeMoveMeta(prev) : null
  const prevAt = prev ? timeOf(prev.created_at) : 0

  if (prevMeta && prevMeta.from === from && prevMeta.to === to && now - prevAt < DUPLICATE_WINDOW_MS) {
    return { duplicate: prev }
  }

  // 직전 기록으로 막 도착한 절차를, 대화도 보드 변경도 없이 곧바로 떠나면 지나쳐 간 것으로 본다
  const passedThrough = !!prevMeta && prevMeta.to === from && now - prevAt < BROWSE_WINDOW_MS
    && !messages.some((m) => m.sender_type === 'teacher' && timeOf(m.created_at) > prevAt)
    && !(timeOf(designByCode.get(from)?.updated_at) > prevAt)

  const removeIds = []
  let origin = from
  if (passedThrough) {
    origin = ORDER.includes(prevMeta.origin) ? prevMeta.origin : prevMeta.from
    removeIds.push(prev.id)
    // 지나가며 생긴 첫 안내만 지운다. 그 절차에 다른 메시지가 있으면 건드리지 않는다
    // (다음에 제대로 들어오면 안내가 다시 만들어진다)
    const arrivedLater = messages.filter((m) => procedureOf(m) === from && m.sender_type !== 'system'
      && !isMoveNote(m) && timeOf(m.created_at) >= prevAt)
    if (arrivedLater.length === 1 && arrivedLater[0].sender_type === 'ai') removeIds.push(arrivedLater[0].id)
  }

  const forward = ORDER.indexOf(to) > ORDER.indexOf(origin)
  const departure = forward ? departureOf(origin, { designByCode, messages, skipped }) : null
  const gap = forward
    ? ORDER.slice(ORDER.indexOf(origin) + 1, ORDER.indexOf(to))
      .filter((code) => !skipped.has(code) && !hasBoardContent(designByCode.get(code)?.content))
    : []
  const visited = to === origin || visitedHint || messages.some((m) => m.sender_type === 'ai' && !isMoveNote(m)
    && procedureOf(m) === to && !removeIds.includes(m.id))
  const status = visited ? buildReturnStatus(to, designByCode.get(to)?.content) : null

  return {
    removeIds,
    content: buildMoveNoteText({ origin, to, forward, departure, gap, status }),
    meta: { from, to, origin },
  }
}
