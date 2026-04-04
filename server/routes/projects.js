/**
 * 프로젝트 라우트
 *
 * 워크스페이스 내 프로젝트 CRUD.
 * 기존 sessions.js를 대체하는 프로젝트 기반 라우트.
 *
 * 라우트:
 * - GET    /api/workspaces/:workspaceId/projects       — 워크스페이스 내 프로젝트 목록
 * - POST   /api/workspaces/:workspaceId/projects       — 프로젝트 생성
 * - GET    /api/projects/:id                           — 프로젝트 상세 (설계 캔버스 포함)
 * - PUT    /api/projects/:id                           — 프로젝트 수정
 * - DELETE /api/projects/:id                           — 프로젝트 삭제 (owner만)
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getProjectsByWorkspace, createProject, getProject,
  updateProject, deleteProject,
  getMemberRole, logActivity,
} from '../lib/supabaseService.js'
import { PROCEDURES } from 'curriculum-weaver-shared/constants.js'

const router = Router()

// 모든 라우트에 인증 적용
router.use(requireAuth)

// ============================================================
// 워크스페이스 내 프로젝트 라우트
// ============================================================

/**
 * GET /api/workspaces/:workspaceId/projects
 * 워크스페이스 내 프로젝트 목록 조회
 *
 * 워크스페이스 멤버만 접근 가능.
 *
 * @param {string} workspaceId - 워크스페이스 ID
 * @query {string} [status] - 프로젝트 상태 필터 ('active' | 'completed' | 'archived')
 * @returns {{ projects: object[] }}
 */
router.get('/workspaces/:workspaceId/projects', async (req, res) => {
  try {
    const { workspaceId } = req.params

    // 멤버십 확인
    const role = await getMemberRole(workspaceId, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 워크스페이스에 접근 권한이 없습니다.' })
    }

    let projects = await getProjectsByWorkspace(workspaceId)

    // status 필터
    const { status } = req.query
    if (status) {
      projects = projects.filter(p => p.status === status)
    }

    res.json({ projects })
  } catch (err) {
    console.error('[projects] 목록 조회 오류:', err.message)
    res.status(500).json({ error: '프로젝트 목록 조회에 실패했습니다.' })
  }
})

/**
 * POST /api/workspaces/:workspaceId/projects
 * 프로젝트 생성
 *
 * editor 이상 역할만 생성 가능.
 *
 * @param {string} workspaceId - 워크스페이스 ID
 * @body {{ title: string, description?: string, grade?: string, subjects?: string[], learner_context?: object }}
 * @returns {object} 생성된 프로젝트
 */
router.post('/workspaces/:workspaceId/projects', async (req, res) => {
  try {
    const { workspaceId } = req.params

    // 멤버십 + 역할 확인 (viewer는 생성 불가)
    const role = await getMemberRole(workspaceId, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 워크스페이스에 접근 권한이 없습니다.' })
    }
    if (role === 'viewer') {
      return res.status(403).json({ error: '프로젝트 생성 권한이 없습니다. (editor 이상 필요)' })
    }

    const { title, description, grade, subjects, learner_context } = req.body

    if (!title?.trim()) {
      return res.status(400).json({ error: '프로젝트 제목은 필수입니다.' })
    }

    const project = await createProject(workspaceId, {
      title: title.trim(),
      description: description?.trim() || null,
      grade: grade || null,
      subjects: subjects || [],
      learner_context: learner_context || {},
    })

    // 활동 로그 기록 (실패해도 본 작업에 영향 없음)
    try {
      await logActivity({
        project_id: project.id,
        user_id: req.user.id,
        action_type: 'project_created',
        after_data: { title: project.title },
      })
    } catch (logErr) {
      console.warn('[projects] 활동 로그 기록 실패 (본 작업은 성공):', logErr.message)
    }

    res.status(201).json(project)
  } catch (err) {
    console.error('[projects] 생성 오류:', err.message)
    res.status(500).json({ error: '프로젝트 생성에 실패했습니다.' })
  }
})

// ============================================================
// 개별 프로젝트 라우트
// ============================================================

/**
 * 프로젝트 접근 권한 확인 미들웨어
 *
 * 프로젝트를 조회한 뒤, 해당 워크스페이스의 멤버인지 확인.
 * req.project에 프로젝트 객체, req.memberRole에 역할 설정.
 */
async function checkProjectAccess(req, res, next) {
  try {
    const project = await getProject(req.params.id)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    // 워크스페이스 멤버십 확인
    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
    }

    req.project = project
    req.memberRole = role
    next()
  } catch (err) {
    console.error('[projects] 접근 권한 확인 오류:', err.message)
    res.status(500).json({ error: '프로젝트 접근 확인 중 오류가 발생했습니다.' })
  }
}

/**
 * GET /api/projects/:id
 * 프로젝트 상세 조회 (설계 캔버스 포함)
 *
 * @param {string} id - 프로젝트 ID
 * @returns {object} 프로젝트 + designs[]
 */
router.get('/projects/:id', checkProjectAccess, async (req, res) => {
  res.json({ ...req.project, my_role: req.memberRole })
})

/**
 * PUT /api/projects/:id
 * 프로젝트 수정
 *
 * editor 이상 역할만 수정 가능.
 * 수정 가능 필드: title, description, current_procedure, status, learner_context
 *
 * @param {string} id - 프로젝트 ID
 * @body {{ title?: string, description?: string, current_procedure?: string, status?: string, learner_context?: object }}
 * @returns {object} 수정된 프로젝트
 */
router.put('/projects/:id', checkProjectAccess, async (req, res) => {
  try {
    // viewer는 수정 불가
    if (req.memberRole === 'viewer') {
      return res.status(403).json({ error: '프로젝트 수정 권한이 없습니다. (editor 이상 필요)' })
    }

    const { title, description, current_procedure, status, learner_context } = req.body
    const updateData = {}

    if (title !== undefined) updateData.title = title.trim()
    if (description !== undefined) updateData.description = description
    if (status !== undefined) updateData.status = status
    if (learner_context !== undefined) updateData.learner_context = learner_context

    // current_procedure 유효성 검증
    if (current_procedure !== undefined) {
      if (!PROCEDURES[current_procedure]) {
        return res.status(400).json({
          error: `유효하지 않은 절차 코드입니다: ${current_procedure}`
        })
      }
      updateData.current_procedure = current_procedure
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' })
    }

    const updated = await updateProject(req.params.id, updateData)
    if (!updated) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    // 활동 로그: 절차 변경 시 별도 기록 (실패해도 본 작업에 영향 없음)
    if (current_procedure) {
      try {
        await logActivity({
          project_id: req.params.id,
          user_id: req.user.id,
          action_type: 'procedure_changed',
          procedure_code: current_procedure,
          before_data: { procedure: req.project.current_procedure },
          after_data: { procedure: current_procedure },
        })
      } catch (logErr) {
        console.warn('[projects] 활동 로그 기록 실패 (본 작업은 성공):', logErr.message)
      }
    }

    res.json(updated)
  } catch (err) {
    console.error('[projects] 수정 오류:', err.message)
    res.status(500).json({ error: '프로젝트 수정에 실패했습니다.' })
  }
})

/**
 * DELETE /api/projects/:id
 * 프로젝트 삭제 (owner만)
 *
 * 워크스페이스 owner만 프로젝트를 삭제할 수 있음.
 *
 * @param {string} id - 프로젝트 ID
 */
router.delete('/projects/:id', checkProjectAccess, async (req, res) => {
  try {
    // owner만 삭제 가능
    if (req.memberRole !== 'owner') {
      return res.status(403).json({ error: '프로젝트 삭제는 워크스페이스 소유자만 가능합니다.' })
    }

    await deleteProject(req.params.id)
    res.json({ message: '프로젝트가 삭제되었습니다.' })
  } catch (err) {
    console.error('[projects] 삭제 오류:', err.message)
    res.status(500).json({ error: '프로젝트 삭제에 실패했습니다.' })
  }
})

export default router
