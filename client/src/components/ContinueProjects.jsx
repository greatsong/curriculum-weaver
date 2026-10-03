/**
 * 홈의 "이어서 하기" — 이 브라우저에서 최근에 연 프로젝트(최대 5개)를 서버로 확인해 보여 준다.
 * - 404·403은 조용히 빼고 기록에서도 지운다
 * - 네트워크 실패는 "없음"으로 단정하지 않고 카드에 확인 실패를 표시한다
 * - 기록이 없으면 이 영역을 그리지 않는다
 */
import { useCallback, useEffect, useState } from 'react'
import { Compass, Inbox, AlertTriangle } from 'lucide-react'
import { apiGet } from '../lib/api'
import { readRecentProjects, removeRecentProject, resolveRecentProjects } from '../lib/recentProjects'
import { readDraft, safeLocalStorage } from '../lib/explorationDraft'
import { EXPLORE_COPY, roleLabel } from '../lib/explorationCopy'
import { UI_COPY } from '../lib/uiCopy'
import { projectDestination, exploreHubUrl } from '../lib/exploreDestination'
import Button from './ui/Button'
import ProcedureBadge from './ui/ProcedureBadge'
import Notice from './ui/Notice'

const H = EXPLORE_COPY.home

function ProjectCard({ entry, project, state, workspaceName, onRetry }) {
  const title = project?.title || entry.title || EXPLORE_COPY.common.unknownProject
  const workspaceId = project?.workspace_id || entry.workspaceId
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(entry.id)}`
  const draft = state === 'ok' ? readDraft(safeLocalStorage(), entry.id) : null
  const draftLine = draft ? EXPLORE_COPY.homeDraftLine[draft.status] : ''
  const role = roleLabel(project?.my_role)
  return (
    <article className="bg-bg-secondary border border-border rounded-lg shadow-sm p-5 flex flex-col gap-3.5 min-w-0">
      <div className="flex flex-col gap-1 min-w-0">
        {workspaceName && <span className="text-xs text-text-secondary">{workspaceName}</span>}
        <h3 className="m-0 text-base font-semibold text-text-primary break-words">{title}</h3>
      </div>
      {state === 'ok' && (project.current_procedure || role) && (
        <div className="flex flex-wrap items-center gap-2">
          {project.current_procedure && <>
            <span className="text-xs text-text-secondary">{H.currentProcedure}</span>
            <ProcedureBadge code={project.current_procedure} state="current" />
          </>}
          {role && <span className="text-xs text-text-secondary">{role}</span>}
        </div>
      )}
      {state === 'loading' && <p className="m-0 text-[13px] text-text-secondary">{H.checking}</p>}
      {state === 'error' && (
        <Notice tone="warning" icon={AlertTriangle} role="status" title={H.checkFailed}
          actions={<Button variant="link" size="sm" onClick={onRetry}>{UI_COPY.actions.retry}</Button>} />
      )}
      {draftLine && <Notice tone="info" icon={Inbox} title={draftLine} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" to={path}>{H.openProject}</Button>
        <Button variant="secondary" to={exploreHubUrl(projectDestination(entry.id))} icon={Compass}>{H.exploreWithProject}</Button>
      </div>
    </article>
  )
}

export default function ContinueProjects({ workspaces = [], get = apiGet }) {
  const [entries] = useState(() => readRecentProjects(safeLocalStorage()))
  const [items, setItems] = useState(() => entries.map((entry) => ({ entry, state: 'loading' })))
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (entries.length === 0) return undefined
    let alive = true
    setItems((prev) => prev.map((item) => (item.state === 'error' ? { ...item, state: 'loading' } : item)))
    resolveRecentProjects(entries, (id) => get(`/api/projects/${encodeURIComponent(id)}`)).then(({ items: next, removed }) => {
      if (!alive) return
      const storage = safeLocalStorage()
      removed.forEach((id) => removeRecentProject(storage, id))
      setItems(next)
    })
    return () => { alive = false }
  }, [entries, get, tick])

  const retry = useCallback(() => setTick((n) => n + 1), [])
  if (items.length === 0) return null
  const nameOf = (id) => workspaces.find((ws) => ws.id === id)?.name || ''

  return (
    <section aria-labelledby="continue-title" className="mb-10 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="continue-title" className="m-0 text-lg font-bold text-text-primary">{H.continueTitle}</h2>
        <span className="text-[13px] text-text-secondary">{H.continueHint}</span>
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
        {items.map(({ entry, state, project }) => (
          <ProjectCard key={entry.id} entry={entry} project={project} state={state}
            workspaceName={nameOf(project?.workspace_id || entry.workspaceId)} onRetry={retry} />
        ))}
      </div>
    </section>
  )
}
