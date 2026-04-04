/**
 * 활동 로그 라우트
 *
 * 프로젝트 내 모든 활동(편집, AI 수락, 절차 이동 등)의 감사 로그.
 * 페이지네이션 + 필터 지원.
 *
 * 라우트:
 * - GET /api/projects/:projectId/logs — 활동 로그 조회 (페이지네이션/필터)
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getProject, getMemberRole, getActivityLogs,
} from '../lib/supabaseService.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const router = Router()

// 모든 라우트에 인증 적용
router.use(requireAuth)

/**
 * GET /api/projects/:projectId/logs
 * 프로젝트 활동 로그 조회
 *
 * 워크스페이스 멤버만 접근 가능.
 * 페이지네이션과 필터를 지원하여 대량 로그 탐색 가능.
 *
 * @param {string} projectId - 프로젝트 ID
 * @query {string}  [procedure]    - 절차 코드 필터 (예: 'T-1-1')
 * @query {string}  [action_type]  - 액션 타입 필터 (예: 'ai_accept', 'design_updated')
 * @query {number}  [limit=50]     - 페이지 크기 (최대 200)
 * @query {number}  [offset=0]     - 오프셋
 * @returns {{ logs: object[], total: number, limit: number, offset: number }}
 */
router.get('/projects/:projectId/logs', async (req, res) => {
  try {
    const { projectId } = req.params

    // 프로젝트 존재 확인
    const project = await getProject(projectId)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    // 워크스페이스 멤버십 확인
    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
    }

    // 쿼리 파라미터 파싱
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = parseInt(req.query.offset) || 0
    const { procedure, action_type } = req.query

    // Supabase 직접 쿼리 (필터 지원)
    // getActivityLogs는 기본 조회만 지원하므로, 필터가 있으면 직접 쿼리
    const result = await getFilteredLogs(projectId, {
      procedure: procedure || null,
      action_type: action_type || null,
      limit,
      offset,
    })
    res.json({
      logs: result.logs,
      total: result.total,
      limit,
      offset,
    })
  } catch (err) {
    console.error('[activityLogs] 조회 오류:', err.message)
    res.status(500).json({ error: '활동 로그 조회에 실패했습니다.' })
  }
})

/**
 * 필터 적용된 활동 로그 조회 (내부 헬퍼)
 *
 * Supabase 사용 가능 시 직접 쿼리, 불가 시 인메모리 필터링.
 *
 * @param {string} projectId
 * @param {{ procedure?: string, action_type?: string, limit: number, offset: number }} filters
 * @returns {Promise<object[]>}
 */
async function getFilteredLogs(projectId, { procedure, action_type, limit, offset }) {
  try {
    // 1) 전체 건수 조회
    let countQuery = supabaseAdmin
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
    if (procedure) countQuery = countQuery.eq('procedure_code', procedure)
    if (action_type) countQuery = countQuery.eq('action_type', action_type)
    const { count: totalCount } = await countQuery

    // 2) 페이지 데이터 조회
    let query = supabaseAdmin
      .from('activity_logs')
      .select('*, users:user_id(display_name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (procedure) {
      query = query.eq('procedure_code', procedure)
    }
    if (action_type) {
      query = query.eq('action_type', action_type)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query
    if (error) throw error
    return { logs: data || [], total: totalCount ?? (data?.length || 0) }
  } catch {
    // Supabase 사용 불가 시 인메모리 폴백
    const allLogs = await getActivityLogs(projectId, 1000)
    let filtered = allLogs

    if (procedure) {
      filtered = filtered.filter(l => l.procedure_code === procedure)
    }
    if (action_type) {
      filtered = filtered.filter(l => l.action_type === action_type)
    }

    return { logs: filtered.slice(offset, offset + limit), total: filtered.length }
  }
}

export default router
