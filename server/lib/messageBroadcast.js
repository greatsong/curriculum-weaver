/**
 * 서버가 저장한 AI 메시지(원문)를 같은 프로젝트의 다른 탭에 보낸다(2026-10-05).
 *
 * 배경: 예전에는 요청한 탭이 자기 화면의 streamingText로 만든 메시지를 소켓 ai_response_done으로 보내고
 * 서버(index.js)가 그대로 message_added로 중계했다. 한 탭에서 두 AI 답이 섞이면(교사 전송과 수락 후
 * 자동 안내가 4ms 차로 겹친 운영 사고) 섞인 글이 팀원 화면에도 퍼졌다. 임시 id라 서버 원문(코드 치환 등
 * 후처리 반영본)과도 달랐다. 이제 저장이 끝난 행을 서버가 직접 보낸다.
 *
 * 옛 탭 호환 규칙(새 탭과 옛 탭이 섞여 있어도 한 응답은 한 경로로만 전달된다):
 * - 새 탭: 요청 본문에 socket_id(자기 소켓 id)를 싣고, ai_response_done은 보내지 않는다.
 *   서버는 저장 직후 그 탭만 빼고(except) 방 전체에 message_added로 저장 행을 보낸다.
 * - 배포 전에 열린 옛 탭: socket_id 없이 요청하고 ai_response_done을 보낸다. 서버는 이 요청을
 *   방송하지 않고, index.js의 ai_response_done 중계가 종전처럼 팀원에게 전달한다.
 * - 그래서 팀원 화면에 같은 답이 두 번(임시 id + 서버 id) 붙는 일이 없다.
 * - 저장에 실패하면 방송하지 않는다. 방송이 실패해도 요청한 탭의 응답은 그대로 끝난다.
 */

// socket.io 4 소켓 id는 base64url 20자다(base64id). 형식이 다르면 방송하지 않는다 —
// 이때 팀원은 탭 복귀·재연결 때 메시지 목록을 다시 받아 확인한다(안전 쪽 실패).
const SOCKET_ID_PATTERN = /^[\w-]{1,64}$/

/**
 * 요청 본문에서 요청한 탭의 소켓 id를 읽는다. 없거나 문자열이 아니면 null(= 방송하지 않음).
 * @param {object} body
 * @returns {string|null}
 */
export function readRequesterSocketId(body) {
  const value = body?.socket_id
  return typeof value === 'string' && SOCKET_ID_PATTERN.test(value) ? value : null
}

/**
 * 저장 행을 화면이 쓰는 형태로 맞춘다. GET /api/chat/:sessionId의 별칭 규칙과 같다
 * (procedure_context → stage_context, project_id → session_id).
 * @param {object} row
 */
export function toClientMessage(row) {
  return {
    ...row,
    stage_context: row.procedure_context || row.stage_context,
    session_id: row.project_id || row.session_id,
  }
}

/**
 * 저장한 AI 메시지를 요청한 탭을 뺀 같은 프로젝트 방 전체에 message_added로 보낸다.
 * @param {import('socket.io').Server|null|undefined} io
 * @param {{ projectId: string, row: object|null|undefined, requesterSocketId: string|null }} params
 * @returns {boolean} 보냈으면 true
 */
export function broadcastSavedAiMessage(io, { projectId, row, requesterSocketId }) {
  // 저장 실패(행 없음)·옛 탭(socket_id 없음)·소켓 서버 없음이면 보내지 않는다
  if (!io || !projectId || !row?.id || !requesterSocketId) return false
  try {
    io.to(projectId).except(requesterSocketId).emit('message_added', toClientMessage(row))
    return true
  } catch (err) {
    console.warn('[chat] 저장한 AI 메시지 방송 실패(응답은 계속):', err?.message || err)
    return false
  }
}
