/**
 * 프로젝트 읽기 전용 가드 — 단일 정의
 *
 * simulation(데모/시뮬레이션 결과물)·generating(AI 생성 중)·failed(생성 실패)
 * 프로젝트는 내용 쓰기가 금지된다. 클라이언트 UI뿐 아니라 서버 라우트에서도
 * 반드시 이 가드로 차단해야 API 직접 호출 우회를 막을 수 있다.
 *
 * 주의: 삭제(DELETE)는 막지 않는다 — 시뮬레이션 정리가 불가능해지기 때문.
 * 클라이언트에도 동일 판정 로직이 있으므로(chatStore.js, ProjectPage.jsx)
 * 조건 변경 시 반드시 함께 수정할 것.
 */

export function isReadOnlyProject(project) {
  return project?.status === 'simulation' ||
    project?.status === 'generating' ||
    project?.status === 'failed' ||
    project?.title?.startsWith('[시뮬레이션]')
}

/**
 * Express 미들웨어: 읽기 전용 프로젝트에 대한 쓰기 요청을 403으로 차단.
 * req.project를 세팅하는 접근 확인 미들웨어(checkDesignAccess 등) 뒤에 사용할 것.
 */
export function requireWritableProject(req, res, next) {
  if (isReadOnlyProject(req.project)) {
    return res.status(403).json({ error: '읽기 전용 프로젝트(시뮬레이션/생성 중/실패)는 수정할 수 없습니다.' })
  }
  next()
}
