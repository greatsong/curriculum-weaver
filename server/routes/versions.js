/**
 * 버전 라우트
 *
 * 설계 캔버스의 버전 스냅샷 관리.
 * AI 수락, 수동 저장, 절차 완료 시점에 자동/수동으로 스냅샷 생성.
 *
 * 라우트:
 * - GET  /api/designs/:designId/versions   — 버전 목록 조회
 * - POST /api/designs/:designId/versions   — 수동 버전 스냅샷 생성
 * - GET  /api/versions/:id                 — 단일 버전 상세 조회
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getDesignById, getVersions, createVersion, getVersion,
  getProject, getMemberRole, logActivity,
} from '../lib/supabaseService.js'

const router = Router()

// 모든 라우트에 인증 적용
router.use(requireAuth)

/**
 * 설계 캔버스 접근 + 권한 확인 미들웨어
 *
 * designId로 설계 캔버스 조회 후, 해당 프로젝트→워크스페이스 멤버십 확인.
 * req.design, req.project, req.memberRole 설정.
 */
async function checkVersionAccess(req, res, next) {
  try {
    const design = await getDesignById(req.params.designId)
    if (!design) {
      return res.status(404).json({ error: '설계 캔버스를 찾을 수 없습니다.' })
    }

    const project = await getProject(design.project_id)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
    }

    req.design = design
    req.project = project
    req.memberRole = role
    next()
  } catch (err) {
    console.error('[versions] 접근 권한 확인 오류:', err.message)
    res.status(500).json({ error: '버전 접근 확인 중 오류가 발생했습니다.' })
  }
}

/**
 * GET /api/designs/:designId/versions
 * 설계 캔버스의 버전 목록 조회
 *
 * 최신순으로 정렬하여 반환.
 *
 * @param {string} designId - 설계 캔버스 ID
 * @returns {{ versions: object[] }}
 */
router.get('/designs/:designId/versions', checkVersionAccess, async (req, res) => {
  try {
    const versions = await getVersions(req.params.designId)
    res.json({ versions })
  } catch (err) {
    console.error('[versions] 목록 조회 오류:', err.message)
    res.status(500).json({ error: '버전 목록 조회에 실패했습니다.' })
  }
})

/**
 * POST /api/designs/:designId/versions
 * 수동 버전 스냅샷 생성
 *
 * 현재 설계 캔버스의 content를 그대로 스냅샷으로 저장.
 * trigger_type은 클라이언트에서 지정 가능 ('manual_save' 기본값).
 *
 * @param {string} designId - 설계 캔버스 ID
 * @body {{ trigger_type?: 'ai_accept' | 'manual_save' | 'step_complete', snapshot?: object }}
 * @returns {object} 생성된 버전
 */
router.post('/designs/:designId/versions', checkVersionAccess, async (req, res) => {
  try {
    // viewer는 버전 생성 불가
    if (req.memberRole === 'viewer') {
      return res.status(403).json({ error: '버전 생성 권한이 없습니다. (editor 이상 필요)' })
    }

    const { trigger_type = 'manual_save', snapshot } = req.body

    // trigger_type 유효성 검증
    const validTriggers = ['ai_accept', 'manual_save', 'step_complete']
    if (!validTriggers.includes(trigger_type)) {
      return res.status(400).json({
        error: `유효하지 않은 trigger_type입니다. 허용: ${validTriggers.join(', ')}`
      })
    }

    // snapshot이 없으면 현재 설계 캔버스의 content를 사용
    const snapshotData = snapshot || req.design.content || {}

    const version = await createVersion(
      req.params.designId,
      snapshotData,
      trigger_type,
      req.user.id
    )

    // 활동 로그 기록 (실패해도 본 작업에 영향 없음)
    try {
      await logActivity({
        project_id: req.design.project_id,
        user_id: req.user.id,
        action_type: 'version_created',
        procedure_code: req.design.procedure_code,
        after_data: { trigger_type, version_id: version.id },
      })
    } catch (logErr) {
      console.warn('[versions] 활동 로그 기록 실패 (본 작업은 성공):', logErr.message)
    }

    res.status(201).json(version)
  } catch (err) {
    console.error('[versions] 생성 오류:', err.message)
    res.status(500).json({ error: '버전 생성에 실패했습니다.' })
  }
})

/**
 * GET /api/versions/:id
 * 단일 버전 상세 조회
 *
 * 스냅샷 데이터 전체를 포함하여 반환.
 * 프로젝트 → 워크스페이스 멤버십 확인.
 *
 * @param {string} id - 버전 ID
 * @returns {object} 버전 상세 (snapshot 포함)
 */
router.get('/versions/:id', async (req, res) => {
  try {
    const version = await getVersion(req.params.id)
    if (!version) {
      return res.status(404).json({ error: '버전을 찾을 수 없습니다.' })
    }

    // 권한 확인: 설계 → 프로젝트 → 워크스페이스 멤버십
    const design = await getDesignById(version.design_id)
    if (!design) {
      return res.status(404).json({ error: '설계 캔버스를 찾을 수 없습니다.' })
    }

    const project = await getProject(design.project_id)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 버전에 접근 권한이 없습니다.' })
    }

    res.json(version)
  } catch (err) {
    console.error('[versions] 상세 조회 오류:', err.message)
    res.status(500).json({ error: '버전 조회에 실패했습니다.' })
  }
})

export default router
