/**
 * 최근에 연 프로젝트 — 홈의 "이어서 하기"용. 이 브라우저의 localStorage에만 둔다.
 * 키: cw_recent_projects, 값: [{ id, workspaceId, title, visitedAt }] 최근 순 최대 5개.
 * 시연 모드 프로젝트는 기록하지 않는다(호출부에서 판단해 넘기지 않는다).
 */

export const RECENT_PROJECTS_KEY = 'cw_recent_projects'
export const RECENT_PROJECTS_MAX = 5

function isEntry(e) {
  return !!e && typeof e === 'object' && typeof e.id === 'string' && e.id &&
    typeof e.workspaceId === 'string' && e.workspaceId && typeof e.visitedAt === 'number'
}

export function readRecentProjects(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(RECENT_PROJECTS_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    const seen = new Set()
    return parsed
      .filter(isEntry)
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
      .slice(0, RECENT_PROJECTS_MAX)
      .map((e) => ({ id: e.id, workspaceId: e.workspaceId, title: typeof e.title === 'string' ? e.title : '', visitedAt: e.visitedAt }))
  } catch {
    return []
  }
}

/** 방문 기록. 같은 프로젝트는 맨 앞으로 옮기고 최대 개수를 넘으면 오래된 것부터 뺀다. */
export function recordRecentProject(storage, project, now = Date.now()) {
  if (!project?.id || !project?.workspaceId) return false
  try {
    const rest = readRecentProjects(storage).filter((e) => e.id !== project.id)
    const next = [{ id: project.id, workspaceId: project.workspaceId, title: project.title || '', visitedAt: now }, ...rest]
      .slice(0, RECENT_PROJECTS_MAX)
    storage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

export function removeRecentProject(storage, id) {
  try {
    const next = readRecentProjects(storage).filter((e) => e.id !== id)
    storage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

/**
 * 기록을 서버로 확인한다. fetchProject(id)는 프로젝트를 돌려주거나 오류를 던진다.
 * - 404·403: 지워졌거나 권한이 없어진 프로젝트 → 결과에서 빼고 기록에서도 지운다(removed에 담음)
 * - 그 밖의 실패: "없음"으로 단정하지 않고 { state: 'error' }로 남긴다
 * - 시연 모드 프로젝트: 결과에서 뺀다
 */
export async function resolveRecentProjects(entries, fetchProject) {
  const results = await Promise.all(entries.map(async (entry) => {
    try {
      const project = await fetchProject(entry.id)
      if (!project || project.learner_context?.demo === true) return { entry, state: 'removed' }
      return { entry, state: 'ok', project }
    } catch (err) {
      const status = err?.status
      if (status === 404 || status === 403) return { entry, state: 'removed' }
      return { entry, state: 'error', error: err?.message || '' }
    }
  }))
  return {
    items: results.filter((r) => r.state !== 'removed'),
    removed: results.filter((r) => r.state === 'removed').map((r) => r.entry.id),
  }
}
