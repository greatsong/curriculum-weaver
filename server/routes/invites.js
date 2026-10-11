/**
 * 초대 라우트
 *
 * 이메일 기반 워크스페이스 초대 생성, 조회, 수락.
 * 토큰 기반으로 동작한다.
 *
 * 수락 규칙 (2026-10-11):
 * - 로그인한 계정의 확인된 이메일(구글 로그인 또는 이메일 확인 완료)이 초대 이메일과 같으면
 *   바로 멤버가 되고, 가입 승인 대기 중이면 승인한다(approved_via='invite').
 * - 다르면 워크스페이스 참여 요청을 만든다. host·owner가 멤버 화면에서 수락해야 들어간다.
 * - 어느 쪽이든 초대 링크는 한 번만 쓸 수 있다(used_at IS NULL 조건부 갱신으로 원자적 처리).
 * - 조회·수락은 승인 대기 사용자도 할 수 있다(초대 링크가 승인 경로이기 때문).
 */
import { Router } from 'express'
import { requireAuth, requireAuthAllowPending } from '../middleware/auth.js'
import {
  createInvite, getInviteByToken, claimInvite, releaseInvite,
  getMemberRole, getWorkspace, addMember, createJoinRequest,
} from '../lib/supabaseService.js'
import { verifiedEmailOf, normalizeEmail, approveIfPending } from '../lib/approval.js'

/** 이메일이 달라 참여 요청이 되었을 때 화면에 보여 줄 안내 */
export const JOIN_REQUESTED_MESSAGE = '초대한 팀의 호스트가 확인하면 들어갈 수 있습니다.'

const router = Router()

/**
 * POST /api/invites
 * 초대 생성 (owner/host만)
 *
 * @body {{ workspace_id: string, email: string, role?: string }}
 * @returns {object} 초대 객체 (토큰 포함)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { workspace_id, email, role = 'editor' } = req.body

    // 입력값 검증
    if (!workspace_id) {
      return res.status(400).json({ error: '워크스페이스 ID는 필수입니다.' })
    }
    if (!email?.trim()) {
      return res.status(400).json({ error: '초대할 이메일 주소는 필수입니다.' })
    }

    // 이메일 형식 기본 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' })
    }

    const validRoles = ['host', 'editor', 'viewer']
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: `유효하지 않은 역할입니다. 허용: ${validRoles.join(', ')}`
      })
    }

    // 권한 확인: owner 또는 host만 초대 가능
    const callerRole = await getMemberRole(workspace_id, req.user.id)
    if (!callerRole || !['owner', 'host'].includes(callerRole)) {
      return res.status(403).json({ error: '초대 권한이 없습니다. owner 또는 host만 초대할 수 있습니다.' })
    }

    // 이미 멤버인 이메일인지 확인은 수락 시점에 처리 (이메일→userId 매핑 필요)

    const invite = await createInvite(workspace_id, email.trim(), role, req.user.id)

    res.status(201).json({
      ...invite,
      invite_url: `/invite/${invite.token}`, // 클라이언트에서 전체 URL 조합
    })
  } catch (err) {
    console.error('[invites] 생성 오류:', err.message)
    res.status(500).json({ error: '초대 생성에 실패했습니다.' })
  }
})

/**
 * GET /api/invites/:token
 * 초대 상세 조회 (수락 페이지용)
 *
 * 인증 불필요 — 토큰만으로 초대 정보 확인 가능.
 * 민감하지 않은 정보만 반환 (워크스페이스 이름, 역할 등).
 *
 * @param {string} token - 초대 토큰
 * @returns {object} 초대 정보
 */
router.get('/:token', async (req, res) => {
  try {
    const invite = await getInviteByToken(req.params.token)

    if (!invite) {
      return res.status(404).json({ error: '초대를 찾을 수 없습니다.' })
    }

    // 만료 확인
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: '만료된 초대입니다.' })
    }

    // 이미 사용된 초대
    if (invite.used_at) {
      return res.status(410).json({ error: '이미 사용된 초대입니다.' })
    }

    // 워크스페이스 기본 정보 포함
    let workspaceName = '알 수 없음'
    let workspaceDescription = null
    if (invite.workspaces) {
      workspaceName = invite.workspaces.name
      workspaceDescription = invite.workspaces.description
    } else {
      const ws = await getWorkspace(invite.workspace_id)
      if (ws) {
        workspaceName = ws.name
        workspaceDescription = ws.description
      }
    }

    res.json({
      workspace_id: invite.workspace_id,
      workspace_name: workspaceName,
      workspace_description: workspaceDescription,
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at,
    })
  } catch (err) {
    console.error('[invites] 조회 오류:', err.message)
    res.status(500).json({ error: '초대 조회에 실패했습니다.' })
  }
})

/**
 * POST /api/invites/:token/accept
 * 초대 수락 (인증 필수, 승인 대기 사용자도 가능)
 *
 * @param {string} token - 초대 토큰
 * @returns {{ kind: 'joined', message, workspace_id, role } | { kind: 'requested', message, workspace_id, role }}
 */
router.post('/:token/accept', requireAuthAllowPending, async (req, res) => {
  const { token } = req.params
  try {
    // 초대 확인
    const invite = await getInviteByToken(token)
    if (!invite) {
      return res.status(404).json({ error: '초대를 찾을 수 없습니다.' })
    }

    // 만료 확인
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: '만료된 초대입니다.' })
    }

    // 이미 사용된 초대
    if (invite.used_at) {
      return res.status(410).json({ error: '이미 사용된 초대입니다.' })
    }

    // 이미 멤버인지 확인 — 멤버가 링크를 다시 열어도 링크를 소모하지 않는다
    const existingRole = await getMemberRole(invite.workspace_id, req.user.id)
    if (existingRole) {
      return res.status(409).json({
        error: '이미 이 워크스페이스의 멤버입니다.',
        workspace_id: invite.workspace_id,
        role: existingRole,
      })
    }

    // 링크 사용 처리(원자적) — 동시에 두 번 눌러도 한 번만 통과한다
    const claimed = await claimInvite(token)
    if (!claimed) {
      return res.status(410).json({ error: '이미 사용된 초대입니다.' })
    }

    const inviteEmail = normalizeEmail(invite.email)
    const userEmail = verifiedEmailOf(req.user)
    const emailMatches = Boolean(inviteEmail && userEmail && inviteEmail === userEmail)

    if (emailMatches) {
      try {
        await addMember(invite.workspace_id, req.user.id, invite.role)
      } catch (memberErr) {
        console.error('[invites] 멤버 추가 실패, 링크 사용 되돌림:', memberErr.message)
        await releaseInvite(token)
        return res.status(500).json({ error: '초대 수락에 실패했습니다.' })
      }
      // 초대받은 본인이 확인되었으므로 가입 승인 대기 중이면 승인한다
      try {
        await approveIfPending(req.user, { via: 'invite', by: invite.created_by || null })
      } catch (approveErr) {
        console.error('[invites] 초대 승인 처리 실패:', approveErr?.message || approveErr)
      }
      return res.json({
        kind: 'joined',
        message: '워크스페이스에 참여했습니다.',
        workspace_id: invite.workspace_id,
        role: invite.role,
      })
    }

    // 이메일이 다르거나 확인되지 않았다 → 참여 요청. 링크는 사용된 것으로 남긴다.
    try {
      await createJoinRequest({
        workspace_id: invite.workspace_id,
        user_id: req.user.id,
        invite_id: invite.id || null,
        requested_role: invite.role,
        invited_email: inviteEmail || null,
        user_email: normalizeEmail(req.user.email) || null,
        user_name: req.user.user_metadata?.display_name || req.user.user_metadata?.full_name || null,
      })
    } catch (requestErr) {
      console.error('[invites] 참여 요청 저장 실패, 링크 사용 되돌림:', requestErr.message)
      await releaseInvite(token)
      return res.status(500).json({ error: '참여 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' })
    }
    return res.status(202).json({
      kind: 'requested',
      message: JOIN_REQUESTED_MESSAGE,
      workspace_id: invite.workspace_id,
      role: invite.role,
    })
  } catch (err) {
    console.error('[invites] 수락 오류:', err.message)
    res.status(500).json({ error: '초대 수락에 실패했습니다.' })
  }
})

export default router
