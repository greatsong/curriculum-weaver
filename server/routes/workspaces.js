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
} from '../lib/supabaseService.js'

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
    res.json({ message: '멤버가 제거되었습니다.' })
  } catch (err) {
    console.error('[workspaces] 멤버 제거 오류:', err.message)
    res.status(500).json({ error: '멤버 제거에 실패했습니다.' })
  }
})

export default router
