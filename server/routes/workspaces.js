/**
 * 워크스페이스 라우트
 *
 * 워크스페이스 CRUD + 멤버 관리.
 * 모든 엔드포인트는 인증 필수 (requireAuth).
 */
import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  createWorkspace, getWorkspace, getWorkspacesByUser,
  updateWorkspace, deleteWorkspace,
  addMember, removeMember, updateMemberRole, getMemberRole,
  getProjectsByWorkspace,
  createInvite,
  listJoinRequests, resolveJoinRequest, reopenJoinRequest,
} from '../lib/supabaseService.js'
import { findAuthUserByEmail, approveIfPending, isUuid } from '../lib/approval.js'

/**
 * 워크스페이스에서 빠진 사용자의 소켓을 그 워크스페이스 프로젝트 방에서 내보낸다.
 * 방 이름은 프로젝트 id다(server/index.js의 join_project가 socket.join(projectId)).
 * 단일 인스턴스 전제라 이 프로세스의 소켓 목록만 본다. 실패해도 멤버 제거는 유지한다.
 * @returns {Promise<number>} 방에서 내보낸 소켓 수
 */
export async function evictUserFromWorkspaceRooms(io, workspaceId, userId, { listProjects = getProjectsByWorkspace } = {}) {
  if (!io || !workspaceId || !userId) return 0
  const projects = await listProjects(workspaceId).catch(() => [])
  const roomIds = new Set((projects || []).map((p) => p?.id).filter(Boolean))
  if (roomIds.size === 0) return 0
  const sockets = io.of?.('/')?.sockets || io.sockets?.sockets
  if (!sockets) return 0
  let evicted = 0
  for (const socket of sockets.values()) {
    if (socket?.user?.id !== userId) continue
    for (const roomId of roomIds) {
      if (socket.rooms?.has(roomId)) {
        socket.leave(roomId)
        try { socket.emit('workspace_access_revoked', { workspaceId, projectId: roomId }) } catch { /* 알림 실패는 무시 */ }
        evicted++
      }
    }
  }
  return evicted
}

const router = Router()

// 모든 라우트에 인증 적용
router.use(requireAuth)

/**
 * GET /api/workspaces
 * 현재 사용자의 워크스페이스 목록
 *
 * @returns {{ workspaces: object[] }}
 */
router.get('/', async (req, res) => {
  try {
    const workspaces = await getWorkspacesByUser(req.user.id)
    res.json({ workspaces })
  } catch (err) {
    console.error('[workspaces] 목록 조회 오류:', err.message)
    res.status(500).json({ error: '워크스페이스 목록 조회에 실패했습니다.' })
  }
})

/**
 * POST /api/workspaces
 * 워크스페이스 생성
 *
 * @body {{ name: string, description?: string, ai_config?: object, workflow_config?: object }}
 * @returns {object} 생성된 워크스페이스
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, ai_config, workflow_config } = req.body

    if (!name?.trim()) {
      return res.status(400).json({ error: '워크스페이스 이름은 필수입니다.' })
    }

    const workspace = await createWorkspace({
      name: name.trim(),
      description: description || null,
      owner_id: req.user.id,
      ai_config: ai_config || {},
      workflow_config: workflow_config || {},
    })

    res.status(201).json(workspace)
  } catch (err) {
    console.error('[workspaces] 생성 오류:', err.message)
    res.status(500).json({ error: '워크스페이스 생성에 실패했습니다.' })
  }
})

/**
 * GET /api/workspaces/:id
 * 워크스페이스 상세 조회 (멤버 + 프로젝트 포함)
 *
 * @param {string} id - 워크스페이스 ID
 * @returns {object} 워크스페이스 + members[] + projects[]
 */
router.get('/:id', async (req, res) => {
  try {
    // 멤버십 확인
    const role = await getMemberRole(req.params.id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 워크스페이스에 접근 권한이 없습니다.' })
    }

    const workspace = await getWorkspace(req.params.id)
    if (!workspace) {
      return res.status(404).json({ error: '워크스페이스를 찾을 수 없습니다.' })
    }

    // 프로젝트 목록도 함께 반환
    const projects = await getProjectsByWorkspace(req.params.id)

    res.json({ ...workspace, projects, my_role: role })
  } catch (err) {
    console.error('[workspaces] 상세 조회 오류:', err.message)
    res.status(500).json({ error: '워크스페이스 조회에 실패했습니다.' })
  }
})

/**
 * PUT /api/workspaces/:id
 * 워크스페이스 수정 (owner/host만)
 *
 * @param {string} id - 워크스페이스 ID
 * @body {{ name?: string, description?: string, ai_config?: object, workflow_config?: object }}
 * @returns {object} 수정된 워크스페이스
 */
router.put('/:id', requireRole('owner', 'host'), async (req, res) => {
  try {
    const { name, description, ai_config, workflow_config } = req.body
    const updateData = {}

    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description
    if (ai_config !== undefined) updateData.ai_config = ai_config
    if (workflow_config !== undefined) updateData.workflow_config = workflow_config

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' })
    }

    const workspace = await updateWorkspace(req.params.id, updateData)
    if (!workspace) {
      return res.status(404).json({ error: '워크스페이스를 찾을 수 없습니다.' })
    }

    res.json(workspace)
  } catch (err) {
    console.error('[workspaces] 수정 오류:', err.message)
    res.status(500).json({ error: '워크스페이스 수정에 실패했습니다.' })
  }
})

/**
 * DELETE /api/workspaces/:id
 * 워크스페이스 삭제 (owner만)
 *
 * @param {string} id - 워크스페이스 ID
 */
router.delete('/:id', requireRole('owner'), async (req, res) => {
  try {
    await deleteWorkspace(req.params.id)
    res.json({ message: '워크스페이스가 삭제되었습니다.' })
  } catch (err) {
    console.error('[workspaces] 삭제 오류:', err.message)
    res.status(500).json({ error: '워크스페이스 삭제에 실패했습니다.' })
  }
})

// ============================================================
// 초대
// ============================================================

/**
 * POST /api/workspaces/:id/invite
 * 이메일로 멤버 초대 (owner/host만)
 *
 * @param {string} id - 워크스페이스 ID
 * @body {{ email: string, role?: string }}
 * @returns {object} 추가된 멤버
 */
router.post('/:id/invite', requireRole('owner', 'host'), async (req, res) => {
  try {
    const { email, role = 'member' } = req.body
    const workspaceId = req.params.id

    if (!email?.trim()) {
      return res.status(400).json({ error: '이메일을 입력하세요.' })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // 역할 매핑 및 검증
    const mappedRole = role === 'member' ? 'editor' : role
    const validRoles = ['host', 'editor', 'viewer']
    if (!validRoles.includes(mappedRole)) {
      return res.status(400).json({ error: `유효하지 않은 역할입니다. 허용: ${validRoles.join(', ')}` })
    }

    // Supabase Admin API로 이메일 조회 (가입된 사용자면 즉시 멤버로 추가).
    // 기본 listUsers는 50명만 주므로 페이지 끝까지 본다(대소문자 무시).
    let targetUser = null
    try {
      targetUser = await findAuthUserByEmail(normalizedEmail)
    } catch (err) {
      // Supabase 미설정(로컬 개발) 환경에서는 토큰 초대로 폴백
      console.warn('[workspaces] 사용자 조회 실패, 토큰 초대로 폴백:', err.message)
    }

    if (targetUser) {
      const existingRole = await getMemberRole(workspaceId, targetUser.id)
      if (existingRole) {
        return res.status(409).json({ error: '이미 이 워크스페이스의 멤버입니다.' })
      }
      const member = await addMember(workspaceId, targetUser.id, mappedRole)
      // host가 직접 추가한 기존 가입자가 승인 대기 중이면 승인한다
      try {
        await approveIfPending(targetUser, { via: 'member_add', by: req.user.id })
      } catch (approveErr) {
        console.error('[workspaces] 멤버 추가 승인 처리 실패:', approveErr?.message || approveErr)
      }
      return res.status(201).json({
        kind: 'added',
        member: { ...member, email: targetUser.email },
      })
    }

    // 미가입자: 토큰 초대 링크 생성 (7일 유효)
    const invite = await createInvite(workspaceId, normalizedEmail, mappedRole, req.user.id)
    return res.status(201).json({
      kind: 'link',
      email: normalizedEmail,
      token: invite.token,
      expires_at: invite.expires_at,
      invite_path: `/invite/${invite.token}`,
    })
  } catch (err) {
    console.error('[workspaces] 초대 오류:', err.message)
    res.status(500).json({ error: '초대에 실패했습니다.' })
  }
})

// ============================================================
// 멤버 관리
// ============================================================

/**
 * POST /api/workspaces/:id/members
 * 멤버 추가 (owner/host만)
 *
 * @param {string} id - 워크스페이스 ID
 * @body {{ user_id: string, role: string }}
 * @returns {object} 추가된 멤버
 */
router.post('/:id/members', requireRole('owner', 'host'), async (req, res) => {
  try {
    const { user_id, role } = req.body

    if (!user_id || !role) {
      return res.status(400).json({ error: '사용자 ID와 역할은 필수입니다.' })
    }

    const validRoles = ['host', 'editor', 'viewer']
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: `유효하지 않은 역할입니다. 허용: ${validRoles.join(', ')}`
      })
    }

    // 이미 멤버인지 확인
    const existingRole = await getMemberRole(req.params.id, user_id)
    if (existingRole) {
      return res.status(409).json({ error: '이미 이 워크스페이스의 멤버입니다.' })
    }

    const member = await addMember(req.params.id, user_id, role)
    res.status(201).json(member)
  } catch (err) {
    console.error('[workspaces] 멤버 추가 오류:', err.message)
    res.status(500).json({ error: '멤버 추가에 실패했습니다.' })
  }
})

/**
 * PUT /api/workspaces/:id/members/:userId
 * 멤버 역할 변경 (owner/host만)
 *
 * @param {string} id - 워크스페이스 ID
 * @param {string} userId - 대상 사용자 ID
 * @body {{ role: string }}
 * @returns {object} 수정된 멤버
 */
router.put('/:id/members/:userId', requireRole('owner', 'host'), async (req, res) => {
  try {
    const { role } = req.body
    const { id: workspaceId, userId } = req.params

    if (!role) {
      return res.status(400).json({ error: '역할을 지정해 주세요.' })
    }

    const validRoles = ['host', 'editor', 'viewer']
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: `유효하지 않은 역할입니다. 허용: ${validRoles.join(', ')}`
      })
    }

    // owner 역할은 변경 불가
    const currentRole = await getMemberRole(workspaceId, userId)
    if (currentRole === 'owner') {
      return res.status(403).json({ error: '워크스페이스 소유자의 역할은 변경할 수 없습니다.' })
    }

    // 다른 host의 역할은 소유자만 바꿀 수 있다 (제거 규칙과 같은 기준)
    if (currentRole === 'host' && req.memberRole !== 'owner') {
      return res.status(403).json({ error: 'host 멤버의 역할은 소유자만 변경할 수 있습니다.' })
    }

    // 자기 자신의 역할 변경 방지 (host가 자신을 viewer로 변경하는 등)
    if (userId === req.user.id) {
      return res.status(403).json({ error: '자신의 역할은 변경할 수 없습니다.' })
    }

    const member = await updateMemberRole(workspaceId, userId, role)
    if (!member) {
      return res.status(404).json({ error: '해당 멤버를 찾을 수 없습니다.' })
    }

    res.json(member)
  } catch (err) {
    console.error('[workspaces] 멤버 역할 변경 오류:', err.message)
    res.status(500).json({ error: '멤버 역할 변경에 실패했습니다.' })
  }
})

/**
 * DELETE /api/workspaces/:id/members/:userId
 * 멤버 제거 (owner/host만, owner 제거 불가)
 *
 * @param {string} id - 워크스페이스 ID
 * @param {string} userId - 대상 사용자 ID
 */
router.delete('/:id/members/:userId', requireRole('owner', 'host'), async (req, res) => {
  try {
    const { id: workspaceId, userId } = req.params

    // owner는 제거 불가
    const targetRole = await getMemberRole(workspaceId, userId)
    if (targetRole === 'owner') {
      return res.status(403).json({ error: '워크스페이스 소유자는 제거할 수 없습니다.' })
    }

    // host는 owner만 제거 가능
    if (targetRole === 'host' && req.memberRole !== 'owner') {
      return res.status(403).json({ error: 'host 멤버는 소유자만 제거할 수 있습니다.' })
    }

    await removeMember(workspaceId, userId)

    // 제거된 사용자가 열어 둔 프로젝트 화면의 실시간 연결을 끊는다
    try {
      await evictUserFromWorkspaceRooms(req.app?.get?.('io'), workspaceId, userId)
    } catch (evictErr) {
      console.warn('[workspaces] 제거된 멤버 소켓 정리 실패:', evictErr?.message || evictErr)
    }

    res.json({ message: '멤버가 제거되었습니다.' })
  } catch (err) {
    console.error('[workspaces] 멤버 제거 오류:', err.message)
    res.status(500).json({ error: '멤버 제거에 실패했습니다.' })
  }
})

// ============================================================
// 참여 요청 (초대 이메일과 다른 계정으로 링크를 연 경우, 00031)
// ============================================================

/**
 * GET /api/workspaces/:id/join-requests
 * 대기 중인 참여 요청 목록 (owner/host만)
 *
 * @returns {{ requests: object[] }}
 */
router.get('/:id/join-requests', requireRole('owner', 'host'), async (req, res) => {
  try {
    const requests = await listJoinRequests(req.params.id, { status: 'pending' })
    res.json({ requests })
  } catch (err) {
    console.error('[workspaces] 참여 요청 목록 오류:', err.message)
    res.status(500).json({ error: '참여 요청 목록을 불러오지 못했습니다.' })
  }
})

/**
 * POST /api/workspaces/:id/join-requests/:requestId/accept
 * 참여 요청 수락 (owner/host만) — 멤버로 추가하고, 가입 승인 대기 중이면 승인한다.
 *
 * @returns {{ request: object, member: object|null, already_member: boolean }}
 */
router.post('/:id/join-requests/:requestId/accept', requireRole('owner', 'host'), async (req, res) => {
  const { id: workspaceId, requestId } = req.params
  if (!isUuid(requestId)) return res.status(404).json({ error: '참여 요청을 찾을 수 없습니다.' })
  try {
    // 대기 중인 요청만 원자적으로 처리 — 두 사람이 동시에 눌러도 한 번만 반영된다
    const request = await resolveJoinRequest(workspaceId, requestId, { status: 'accepted', resolvedBy: req.user.id })
    if (!request) {
      return res.status(409).json({ error: '이미 처리되었거나 없는 참여 요청입니다.' })
    }

    // 역할은 초대를 만들 때 정한 값(invites.role)을 그대로 쓴다
    const role = ['host', 'editor', 'viewer'].includes(request.requested_role) ? request.requested_role : 'editor'

    let member = null
    const existingRole = await getMemberRole(workspaceId, request.user_id)
    if (!existingRole) {
      try {
        member = await addMember(workspaceId, request.user_id, role)
      } catch (memberErr) {
        console.error('[workspaces] 참여 요청 멤버 추가 실패, 요청 되돌림:', memberErr.message)
        await reopenJoinRequest(requestId)
        return res.status(500).json({ error: '멤버 추가에 실패했습니다.' })
      }
    }

    try {
      await approveIfPending(request.user_id, { via: 'join_request', by: req.user.id })
    } catch (approveErr) {
      console.error('[workspaces] 참여 요청 승인 처리 실패:', approveErr?.message || approveErr)
    }

    res.json({ request, member, already_member: Boolean(existingRole) })
  } catch (err) {
    console.error('[workspaces] 참여 요청 수락 오류:', err.message)
    res.status(500).json({ error: '참여 요청을 수락하지 못했습니다.' })
  }
})

/**
 * POST /api/workspaces/:id/join-requests/:requestId/reject
 * 참여 요청 거절 (owner/host만)
 */
router.post('/:id/join-requests/:requestId/reject', requireRole('owner', 'host'), async (req, res) => {
  const { id: workspaceId, requestId } = req.params
  if (!isUuid(requestId)) return res.status(404).json({ error: '참여 요청을 찾을 수 없습니다.' })
  try {
    const request = await resolveJoinRequest(workspaceId, requestId, { status: 'rejected', resolvedBy: req.user.id })
    if (!request) {
      return res.status(409).json({ error: '이미 처리되었거나 없는 참여 요청입니다.' })
    }
    res.json({ request })
  } catch (err) {
    console.error('[workspaces] 참여 요청 거절 오류:', err.message)
    res.status(500).json({ error: '참여 요청을 거절하지 못했습니다.' })
  }
})

export default router
