/**
 * 시연 모드(임용 실연 준비) 라우트
 *
 * 남은 엔드포인트는 POST /api/demo/bootstrap 하나다.
 * 예전의 AI 수업 설계 시뮬레이션(/generate)과 이어서 시뮬레이션(/continue)은 제거했다.
 * 이미 만들어진 시뮬레이션 프로젝트(status: 'simulation')는 읽기 전용으로 계속 열린다.
 */

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createProject, ensurePersonalWorkspace, getProjectsByWorkspace } from '../lib/supabaseService.js'

export const demoRouter = Router()

// ============================================================
// 시연 모드(임용 실연 준비) 부트스트랩
// ============================================================
//
// 로그인 사용자가 팀/워크스페이스/초대/닉네임 계층 없이 즉시 시연 준비를 시작할 수 있게,
// 개인 워크스페이스(owner 단독)와 demo 프로젝트를 idempotent하게 확보한다.
// - 개인 워크스페이스: ensurePersonalWorkspace (workflow_config.personal=true 표식)
// - demo 프로젝트: learner_context.demo=true 표식 (신규 테이블·컬럼 0건, 기존 jsonb 재활용)
// 반복 진입 시 기존 demo 프로젝트를 재사용해 프로젝트가 누적되지 않게 한다.
//
// POST /api/demo/bootstrap → { workspaceId, projectId }

demoRouter.post('/bootstrap', requireAuth, async (req, res) => {
  try {
    const ws = await ensurePersonalWorkspace(req.user)

    // 기존 demo 프로젝트 재사용 (없으면 생성)
    const projects = await getProjectsByWorkspace(ws.id)
    let project = (projects || []).find(
      (p) => p?.learner_context?.demo === true && p.status !== 'archived'
    )
    if (!project) {
      project = await createProject(ws.id, {
        title: '임용 실연 준비',
        description: null,
        grade: null,
        subjects: [],
        learner_context: { demo: true },
      })
    }

    res.json({ workspaceId: ws.id, projectId: project.id })
  } catch (err) {
    console.error('[demo] 시연 부트스트랩 오류:', err.message)
    res.status(500).json({ error: '시연 준비 공간을 준비하지 못했습니다.' })
  }
})
