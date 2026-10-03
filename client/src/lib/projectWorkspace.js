/**
 * 지금 연 프로젝트의 작업 공간 설정만 돌려준다.
 *
 * 작업 공간 스토어의 currentWorkspace는 다른 작업 공간으로 옮긴 직후 잠깐 이전 값일 수 있다.
 * 그대로 읽으면 이전 팀의 약식 기록·AI 역할 설정이 새 프로젝트에 적용된다(2026-10-03 검토).
 * 프로젝트에 workspace_id가 없으면(예전 데이터) 종전처럼 currentWorkspace를 쓴다.
 * @param {object|null} project - projectStore.currentProject
 * @param {object|null} workspace - workspaceStore.currentWorkspace
 * @returns {object|null} workflow_config 또는 null
 */
export function workflowConfigForProject(project, workspace) {
  if (!workspace) return null
  if (project?.workspace_id && workspace.id !== project.workspace_id) return null
  return workspace.workflow_config || null
}
