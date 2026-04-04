/**
 * 초대 라우트
 *
 * 이메일 기반 워크스페이스 초대 생성, 조회, 수락.
 * 토큰 기반으로 동작하며, 수락 시 멤버로 자동 추가.
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  createInvite, getInviteByToken, useInvite,
  getMemberRole, getWorkspace,
} from '../lib/supabaseService.js'

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
 * 초대 수락 (인증 필수)
 *
 * 토큰 유효성 확인 후 사용자를 워크스페이스 멤버로 추가.
 *
 * @param {string} token - 초대 토큰
 * @returns {{ message: string, workspace_id: string, role: string }}
 */
router.post('/:token/accept', requireAuth, async (req, res) => {
  try {
    const { token } = req.params

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

    // 이미 멤버인지 확인
    const existingRole = await getMemberRole(invite.workspace_id, req.user.id)
    if (existingRole) {
      return res.status(409).json({
        error: '이미 이 워크스페이스의 멤버입니다.',
        workspace_id: invite.workspace_id,
        role: existingRole,
      })
    }

    // 초대 수락: 멤버 추가 + 초대 사용 처리
    await useInvite(token, req.user.id)

    res.json({
      message: '워크스페이스에 참여했습니다.',
      workspace_id: invite.workspace_id,
      role: invite.role,
    })
  } catch (err) {
    console.error('[invites] 수락 오류:', err.message)

    // useInvite에서 throw한 에러 메시지 전달
    if (err.message.includes('만료') || err.message.includes('사용된')) {
      return res.status(410).json({ error: err.message })
    }

    res.status(500).json({ error: '초대 수락에 실패했습니다.' })
  }
})

export default router
