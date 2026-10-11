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
  updateProject, deleteProject, getProjectSkips,
  getMemberRole, logActivity, countMessagesByProject,
} from '../lib/supabaseService.js'
import { PROCEDURES, getProcedureLabel } from 'curriculum-weaver-shared/constants.js'
import { requireWritableProject } from '../lib/projectGuards.js'

const router = Router()

// 모든 라우트에 인증 적용
router.use(requireAuth)

// ── 입력 검증 ──
// 사용자가 PUT으로 바꿀 수 있는 프로젝트 상태 (DB 제약 00014의 값 중 일부)
export const USER_PROJECT_STATUSES = Object.freeze(['active', 'completed', 'archived'])
// 서버만 쓰는 상태 — 시뮬레이션 결과물(simulation)·AI 생성 중(generating)·생성 실패(failed)
export const SYSTEM_PROJECT_STATUSES = Object.freeze(['simulation', 'generating', 'failed'])
// learner_context 안에서 서버만 정하는 표식 — 시연 모드(demo, routes/demo.js)·시뮬레이션 정보(simulation_meta)
export const SYSTEM_LEARNER_CONTEXT_KEYS = Object.freeze(['demo', 'simulation_meta'])

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

// '[시뮬레이션]'으로 시작하는 제목은 읽기 전용 판정(lib/projectGuards.js)에 쓰인다.
// 사용자가 이 제목을 붙이면 되돌릴 수 없게 잠기므로 일반 경로에서는 받지 않는다.
const RESERVED_TITLE_PREFIX = '[시뮬레이션]'

/**
 * 사용자가 보낸 learner_context에서 서버 전용 표식을 빼고, 기존 값의 표식은 그대로 유지한다.
 * 일반 생성·수정 경로로 시연 모드 표식을 켜거나 끄지 못하게 한다.
 * @param {object|null|undefined} existing - 현재 저장된 learner_context
 * @param {object} incoming - 사용자가 보낸 learner_context (plain object)
 * @returns {object}
 */
export function sanitizeLearnerContext(existing, incoming) {
  const next = {}
  for (const [k, v] of Object.entries(incoming || {})) {
    if (!SYSTEM_LEARNER_CONTEXT_KEYS.includes(k)) next[k] = v
  }
  if (isPlainObject(existing)) {
    for (const k of SYSTEM_LEARNER_CONTEXT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(existing, k)) next[k] = existing[k]
    }
  }
  return next
}

// ── 프로젝트 목록 캐시 (워크스페이스별, 10초 TTL) ──
// 수업 시작에 학급 전원(30명)이 같은 워크스페이스 목록을 동시에 열면
// 요청마다 목록 조회 + 프로젝트별 메시지 count(N+1)가 반복된다.
// 목록은 사실상 같은 응답이므로 10초 캐시로 흡수하고, 이 프로세스에서
// 발생하는 생성/수정/삭제 시 즉시 무효화한다 (단일 인스턴스 전제).
// message_count가 최대 10초 뒤처질 수 있으나 목록 구분용이라 무해.
const PROJECT_LIST_TTL_MS = 10_000
const projectListCache = new Map() // workspaceId → { projects, expiresAt }

function getCachedProjectList(workspaceId) {
  const hit = projectListCache.get(workspaceId)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    projectListCache.delete(workspaceId)
    return null
  }
  return hit.projects
}

function bustProjectListCache(workspaceId) {
  if (workspaceId) projectListCache.delete(workspaceId)
}

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

    // 캐시 히트 시 DB 조회·count 전부 생략 (status 필터는 캐시 위에 적용)
    let projects = getCachedProjectList(workspaceId)

    if (!projects) {
      projects = await getProjectsByWorkspace(workspaceId)

      // 메시지 수 보강 — 동일 제목 프로젝트를 목록에서 구분할 수 있게 한다(best-effort).
      // 실패해도 목록 조회 자체는 성공시킨다.
      projects = await Promise.all(projects.map(async (p) => {
        try {
          return { ...p, message_count: await countMessagesByProject(p.id) }
        } catch {
          return { ...p, message_count: null }
        }
      }))

      projectListCache.set(workspaceId, {
        projects,
        expiresAt: Date.now() + PROJECT_LIST_TTL_MS,
      })
    }

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

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: '프로젝트 제목은 필수입니다.' })
    }
    if (title.trim().startsWith(RESERVED_TITLE_PREFIX)) {
      return res.status(400).json({ error: `제목은 ${RESERVED_TITLE_PREFIX}로 시작할 수 없습니다.` })
    }
    if (learner_context !== undefined && learner_context !== null && !isPlainObject(learner_context)) {
      return res.status(400).json({ error: 'learner_context 형식이 올바르지 않습니다.' })
    }

    const cleanTitle = title.trim()

    // 더블서브밋 방지(멱등성): 같은 워크스페이스에 동일 제목 프로젝트가 방금(10초 이내)
    // 생성됐다면 새로 만들지 않고 그 프로젝트를 반환한다. 생성 버튼 중복 클릭으로 동일 제목
    // 쌍둥이 프로젝트가 생겨 목록을 오염시키고 "대화가 사라진 것처럼" 보이던 버그를 차단한다.
    // (10초 넘게 떨어진 동일 제목은 의도적 별개 프로젝트로 보고 허용.)
    try {
      const existing = await getProjectsByWorkspace(workspaceId)
      const dupe = (existing || []).find((p) =>
        (p.title || '').trim() === cleanTitle &&
        p.created_at && (Date.now() - new Date(p.created_at).getTime()) < 10_000
      )
      if (dupe) {
        console.warn('[projects] 더블서브밋 감지 — 기존 프로젝트 반환:', dupe.id)
        return res.status(200).json(dupe)
      }
    } catch (dupeErr) {
      console.warn('[projects] 중복 체크 실패 (생성 계속):', dupeErr.message)
    }

    const project = await createProject(workspaceId, {
      title: cleanTitle,
      description: description?.trim() || null,
      grade: grade || null,
      subjects: subjects || [],
      // 시연 모드 표식은 /api/demo/bootstrap만 붙인다 — 일반 생성 경로에서는 뺀다
      learner_context: sanitizeLearnerContext(null, learner_context || {}),
    })
    bustProjectListCache(workspaceId)

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
  // 스킵 목록 포함 — 클라 초기 로드 시 진행률·네비·AI 경로가 스킵을 인식하는 원천
  let skipped = []
  try {
    skipped = await getProjectSkips(req.params.id)
  } catch (err) {
    console.warn('[projects] 스킵 목록 조회 실패 (프로젝트 조회는 계속):', err.message)
  }
  res.json({ ...req.project, my_role: req.memberRole, skipped_procedures: skipped })
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
// requireWritableProject: simulation 프로젝트의 status를 active로 되돌려
// 읽기 전용을 우회하는 것을 차단. 삭제(DELETE)는 정리 가능하도록 막지 않음.
router.put('/projects/:id', checkProjectAccess, requireWritableProject, async (req, res) => {
  try {
    // viewer는 수정 불가
    if (req.memberRole === 'viewer') {
      return res.status(403).json({ error: '프로젝트 수정 권한이 없습니다. (editor 이상 필요)' })
    }

    const { title, description, current_procedure, status, learner_context } = req.body
    const updateData = {}

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: '프로젝트 제목은 비어 있지 않은 문자열이어야 합니다.' })
      }
      if (title.trim().startsWith(RESERVED_TITLE_PREFIX)) {
        return res.status(400).json({ error: `제목은 ${RESERVED_TITLE_PREFIX}로 시작할 수 없습니다.` })
      }
      updateData.title = title.trim()
    }
    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        return res.status(400).json({ error: 'description 형식이 올바르지 않습니다.' })
      }
      updateData.description = description
    }
    if (status !== undefined) {
      // 시스템 전용 상태(simulation 등)로는 바꿀 수 없다 — 읽기 전용 판정·시뮬레이션 복구와 얽힌 값
      if (SYSTEM_PROJECT_STATUSES.includes(status)) {
        return res.status(403).json({ error: '이 상태는 시스템만 설정할 수 있습니다.' })
      }
      if (!USER_PROJECT_STATUSES.includes(status)) {
        return res.status(400).json({ error: `유효하지 않은 상태입니다. 허용: ${USER_PROJECT_STATUSES.join(', ')}` })
      }
      updateData.status = status
    }
    if (learner_context !== undefined) {
      if (!isPlainObject(learner_context)) {
        return res.status(400).json({ error: 'learner_context 형식이 올바르지 않습니다.' })
      }
      // 시연 모드 표식 등 서버 전용 키는 기존 값을 유지한다
      updateData.learner_context = sanitizeLearnerContext(req.project?.learner_context, learner_context)
    }

    // current_procedure 유효성 검증
    if (current_procedure !== undefined) {
      if (!PROCEDURES[current_procedure]) {
        return res.status(400).json({
          error: `유효하지 않은 절차 코드입니다: ${current_procedure}`
        })
      }
      // 팀 커서를 스킵된 절차 위에 둘 수 없음 (심층 방어 — 클라는 이미 로컬 뷰만 이동)
      const skips = await getProjectSkips(req.params.id)
      if (skips.some((s) => s.procedure_code === current_procedure)) {
        return res.status(400).json({
          error: `${getProcedureLabel(current_procedure)} 절차는 팀 결정으로 생략되어 이동할 수 없습니다. 먼저 건너뛰기를 해제하세요.`,
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
    bustProjectListCache(req.project?.workspace_id)

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
    bustProjectListCache(req.project?.workspace_id)
    res.json({ message: '프로젝트가 삭제되었습니다.' })
  } catch (err) {
    console.error('[projects] 삭제 오류:', err.message)
    res.status(500).json({ error: '프로젝트 삭제에 실패했습니다.' })
  }
})

export default router
