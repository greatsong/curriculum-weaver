/**
 * Socket.IO 방 참여 검사
 *
 * 방 ID는 클라이언트가 보낸 값이라 형식부터 확인한다. 배열을 그대로 socket.join에 넘기면
 * 원소마다 방에 들어가므로, 문자열이 아닌 값은 조회 전에 거절한다.
 * 운영(Supabase 설정됨)에서는 프로젝트 조회가 실패하면 참여를 막는다(안전 쪽 실패).
 */

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function isValidRoomId(roomId) {
  return typeof roomId === 'string' && ROOM_ID_PATTERN.test(roomId)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @param {object} args
 * @param {string} args.projectId
 * @param {string} args.userId
 * @param {(id: string) => Promise<object|null>} args.getProject
 * @param {(workspaceId: string, userId: string) => Promise<string|null>} args.getMemberRole
 * @param {boolean} args.strict - Supabase가 설정된 환경이면 true (조회 실패 시 거절)
 * @param {number} [args.retryDelayMs] - 일시 장애 대비 재시도 전 대기
 * @returns {Promise<{ ok: boolean, reason?: 'invalid'|'unavailable'|'forbidden' }>}
 */
export async function checkJoinAccess({ projectId, userId, getProject, getMemberRole, strict, retryDelayMs = 400 }) {
  if (!isValidRoomId(projectId)) return { ok: false, reason: 'invalid' }

  let project
  try {
    project = await getProject(projectId)
  } catch {
    if (!strict) return { ok: true } // 로컬 인메모리·레거시 세션
    // 연수 중 일시적인 DB 지연으로 실시간 동기화가 끊기지 않도록 한 번 더 시도한다
    await wait(retryDelayMs)
    try {
      project = await getProject(projectId)
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
  }

  if (project?.workspace_id) {
    const role = await getMemberRole(project.workspace_id, userId)
    if (!role) return { ok: false, reason: 'forbidden' }
  }
  return { ok: true }
}
