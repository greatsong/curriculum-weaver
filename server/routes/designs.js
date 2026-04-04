/**
 * 설계 캔버스 라우트
 *
 * 절차(Procedure) 기반 설계 CRUD.
 * 기존 boards.js를 대체하는 프로젝트→절차 기반 라우트.
 *
 * 라우트:
 * - GET /api/projects/:projectId/designs                           — 프로젝트의 모든 설계 캔버스
 * - GET /api/projects/:projectId/designs/:procedureCode            — 특정 절차 설계 조회
 * - PUT /api/projects/:projectId/designs/:procedureCode            — 설계 upsert (내용 저장)
 * - PUT /api/projects/:projectId/designs/:procedureCode/status     — save_status 변경
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getProject, getDesignsByProject, getDesign,
  upsertDesign, updateDesignStatus,
  getMemberRole, logActivity,
} from '../lib/supabaseService.js'
import { PROCEDURES } from 'curriculum-weaver-shared/constants.js'

const router = Router()

// 모든 라우트에 인증 적용
router.use(requireAuth)

/**
 * 프로젝트 접근 + 멤버십 확인 미들웨어
 *
 * req.params.projectId로 프로젝트 조회 후 워크스페이스 멤버십 확인.
 * req.project, req.memberRole 설정.
 */
async function checkDesignAccess(req, res, next) {
  try {
    const project = await getProject(req.params.projectId)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
    }

    req.project = project
    req.memberRole = role
    next()
  } catch (err) {
    console.error('[designs] 접근 권한 확인 오류:', err.message)
    res.status(500).json({ error: '설계 접근 확인 중 오류가 발생했습니다.' })
  }
}

/**
 * GET /api/projects/:projectId/designs
 * 프로젝트의 모든 설계 캔버스 조회
 *
 * @param {string} projectId - 프로젝트 ID
 * @returns {{ designs: object[] }}
 */
router.get('/projects/:projectId/designs', checkDesignAccess, async (req, res) => {
  try {
    const designs = await getDesignsByProject(req.params.projectId)
    res.json({ designs })
  } catch (err) {
    console.error('[designs] 목록 조회 오류:', err.message)
    res.status(500).json({ error: '설계 캔버스 목록 조회에 실패했습니다.' })
  }
})

/**
 * GET /api/projects/:projectId/designs/:procedureCode
 * 특정 절차의 설계 캔버스 조회
 *
 * 절차 코드가 유효하지 않으면 400 반환.
 * 설계가 아직 없으면 빈 content로 반환.
 *
 * @param {string} projectId - 프로젝트 ID
 * @param {string} procedureCode - 절차 코드 (예: 'T-1-1')
 * @returns {object} 설계 캔버스 또는 빈 설계
 */
router.get('/projects/:projectId/designs/:procedureCode', checkDesignAccess, async (req, res) => {
  try {
    const { projectId, procedureCode } = req.params

    // 절차 코드 유효성 검증
    if (!PROCEDURES[procedureCode]) {
      return res.status(400).json({
        error: `유효하지 않은 절차 코드입니다: ${procedureCode}`
      })
    }

    const design = await getDesign(projectId, procedureCode)

    if (!design) {
      // 아직 설계가 없으면 빈 껍데기 반환 (아직 DB에 생성하지 않음)
      return res.json({
        project_id: projectId,
        procedure_code: procedureCode,
        content: {},
        save_status: 'draft',
        created: false,
      })
    }

    res.json(design)
  } catch (err) {
    console.error('[designs] 상세 조회 오류:', err.message)
    res.status(500).json({ error: '설계 캔버스 조회에 실패했습니다.' })
  }
})

/**
 * PUT /api/projects/:projectId/designs/:procedureCode
 * 설계 캔버스 upsert (내용 저장)
 *
 * editor 이상만 저장 가능. locked 상태에서는 수정 불가.
 * Socket.IO를 통해 design_updated 이벤트 전파.
 *
 * @param {string} projectId - 프로젝트 ID
 * @param {string} procedureCode - 절차 코드
 * @body {{ content: object }}
 * @returns {object} 저장된 설계 캔버스
 */
router.put('/projects/:projectId/designs/:procedureCode', checkDesignAccess, async (req, res) => {
  try {
    const { projectId, procedureCode } = req.params

    // viewer는 수정 불가
    if (req.memberRole === 'viewer') {
      return res.status(403).json({ error: '설계 수정 권한이 없습니다. (editor 이상 필요)' })
    }

    // 절차 코드 유효성 검증
    if (!PROCEDURES[procedureCode]) {
      return res.status(400).json({
        error: `유효하지 않은 절차 코드입니다: ${procedureCode}`
      })
    }

    const { content } = req.body
    if (content === undefined) {
      return res.status(400).json({ error: 'content 필드가 필요합니다.' })
    }

    // locked 상태 확인
    const existing = await getDesign(projectId, procedureCode)
    if (existing?.save_status === 'locked') {
      return res.status(423).json({ error: '이 설계 캔버스는 잠금 상태입니다. 잠금을 해제한 후 수정하세요.' })
    }

    const design = await upsertDesign(projectId, procedureCode, content, req.user.id)

    // 활동 로그 기록
    await logActivity({
      project_id: projectId,
      user_id: req.user.id,
      action_type: 'design_updated',
      procedure_code: procedureCode,
      after_data: { content_keys: Object.keys(content || {}) },
    })

    // Socket.IO 이벤트 전파 (io는 req.app에서 가져옴)
    const io = req.app.get('io')
    if (io) {
      io.to(projectId).emit('design_updated', {
        projectId,
        procedureCode,
        design,
        updatedBy: req.user.id,
      })
    }

    res.json(design)
  } catch (err) {
    console.error('[designs] 저장 오류:', err.message)
    res.status(500).json({ error: '설계 캔버스 저장에 실패했습니다.' })
  }
})

/**
 * PUT /api/projects/:projectId/designs/:procedureCode/status
 * 설계 캔버스 상태 변경
 *
 * save_status: 'draft' → 'confirmed' → 'locked' (또는 역방향)
 * host/owner만 locked 설정 가능.
 *
 * @param {string} projectId - 프로젝트 ID
 * @param {string} procedureCode - 절차 코드
 * @body {{ save_status: 'draft' | 'confirmed' | 'locked' }}
 * @returns {object} 수정된 설계 캔버스
 */
router.put('/projects/:projectId/designs/:procedureCode/status', checkDesignAccess, async (req, res) => {
  try {
    const { projectId, procedureCode } = req.params

    // viewer는 변경 불가
    if (req.memberRole === 'viewer') {
      return res.status(403).json({ error: '설계 상태 변경 권한이 없습니다.' })
    }

    // 절차 코드 유효성 검증
    if (!PROCEDURES[procedureCode]) {
      return res.status(400).json({
        error: `유효하지 않은 절차 코드입니다: ${procedureCode}`
      })
    }

    const { save_status } = req.body
    const validStatuses = ['draft', 'confirmed', 'locked']
    if (!validStatuses.includes(save_status)) {
      return res.status(400).json({
        error: `유효하지 않은 상태입니다. 허용: ${validStatuses.join(', ')}`
      })
    }

    // locked 설정은 host/owner만 가능
    if (save_status === 'locked' && !['owner', 'host'].includes(req.memberRole)) {
      return res.status(403).json({ error: '잠금 설정은 host 또는 owner만 가능합니다.' })
    }

    const design = await updateDesignStatus(projectId, procedureCode, save_status)
    if (!design) {
      return res.status(404).json({ error: '해당 설계 캔버스를 찾을 수 없습니다.' })
    }

    // 활동 로그 기록
    await logActivity({
      project_id: projectId,
      user_id: req.user.id,
      action_type: 'design_status_changed',
      procedure_code: procedureCode,
      after_data: { save_status },
    })

    // Socket.IO 이벤트 전파
    const io = req.app.get('io')
    if (io) {
      io.to(projectId).emit('design_status_changed', {
        projectId,
        procedureCode,
        save_status,
        changedBy: req.user.id,
      })
    }

    res.json(design)
  } catch (err) {
    console.error('[designs] 상태 변경 오류:', err.message)
    res.status(500).json({ error: '설계 상태 변경에 실패했습니다.' })
  }
})

export default router
