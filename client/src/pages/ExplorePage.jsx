/**
 * 수업 아이디어 탐색 시작 화면 (/explore)
 *
 * 1) 먼저 "탐색 결과를 넣을 곳"(진행 중인 프로젝트 / 새 프로젝트)을 고른다. URL에 기록: ?project=<id> | ?for=new
 * 2) 세 단계(성취기준 고르기 → 수업 아이디어 비교 → 프로젝트로 보내기)를 보여 주고, 기존 도구를 각 단계에 배치한다.
 * 3) 이 목적지로 담은 성취기준을 아래에 모아 보여 준다(저장 전).
 * 탐색은 팀의 진행 절차를 바꾸지 않는다(이 화면은 어떤 쓰기 요청도 보내지 않는다).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Hash, Link2, BookMarked, Globe, ChevronRight, Check, Info, LogOut, ArrowRight } from 'lucide-react'
import Logo from '../components/Logo'
import Button from '../components/ui/Button'
import StatusChip from '../components/ui/StatusChip'
import { useDestinationProject } from '../components/useDestinationProject'
import { useAuthStore } from '../stores/authStore'
import { apiGet } from '../lib/api'
import { EXPLORE_COPY } from '../lib/explorationCopy'
import { UI_COPY } from '../lib/uiCopy'
import {
  parseDestination, projectDestination, NEW_DESTINATION, readBasket, clearBasket, readBasketMeta,
  compareAvailability, futuresUrl, graphUrl, destinationAccess,
} from '../lib/exploreDestination'
import { readDraft, safeLocalStorage, safeSessionStorage } from '../lib/explorationDraft'
import { readRecentProjects } from '../lib/recentProjects'
import { codeFromKey, subjectFromKey } from '../lib/standardKey'
import { getProcedureDisplayCode } from 'curriculum-weaver-shared/constants.js'

const C = EXPLORE_COPY.hub

/** 보낼 수 있는 프로젝트만 — 시연·시뮬레이션·생성 중·실패 프로젝트는 목록에서 뺀다 */
function sendable(project) {
  return project && !destinationAccess(project).blocked &&
    project.status !== 'simulation' && !String(project.title || '').startsWith('[시뮬레이션]')
}

function useProjectOptions(get) {
  const [state, setState] = useState({ status: 'loading', items: [] })
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await get('/api/workspaces')
        const workspaces = (data?.workspaces ?? data ?? []).filter((ws) => !ws?.workflow_config?.personal)
        const lists = await Promise.allSettled(workspaces.map((ws) => get(`/api/workspaces/${encodeURIComponent(ws.id)}/projects`)
          .then((d) => (d?.projects ?? d ?? []).map((p) => ({ ...p, workspace_name: ws.name })))))
        const items = lists.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter(sendable)
        const failed = lists.some((r) => r.status === 'rejected')
        // 최근에 연 프로젝트를 앞으로
        const order = new Map(readRecentProjects(safeLocalStorage()).map((e, i) => [e.id, i]))
        items.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
        if (alive) setState({ status: failed && items.length === 0 ? 'error' : 'ready', items })
      } catch {
        if (alive) setState({ status: 'error', items: [] })
      }
    })()
    return () => { alive = false }
  }, [get])
  return state
}

function EntryRow({ to, icon: Icon, entry }) {
  return (
    <li className="border-t border-bg-tertiary last:border-b">
      <Link to={to} className="group flex items-start gap-3 min-h-[64px] py-3 px-1 text-text-primary no-underline hover:bg-bg-primary rounded-md">
        <span aria-hidden="true" className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-bg-tertiary text-text-body shrink-0">
          <Icon size={16} strokeWidth={2} />
        </span>
        <span className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-xs text-text-secondary">{entry.when}</span>
          <strong className="text-sm font-semibold">{entry.name}</strong>
          <span className="text-[13px] leading-snug text-text-body">{entry.body}</span>
        </span>
        <ChevronRight aria-hidden="true" size={16} className="text-text-secondary shrink-0 mt-2 transition group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}

function StepCard({ n, id, title, body, children }) {
  return (
    <section aria-labelledby={id} className="bg-bg-secondary border border-border rounded-lg p-5 flex flex-col gap-3.5 min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full bg-[var(--color-action)] text-white text-[13px] font-bold shrink-0">{n}</span>
        <h2 id={id} className="m-0 text-base font-bold text-text-primary">{title}</h2>
      </div>
      {body && <p className="m-0 text-[13px] leading-relaxed text-text-body">{body}</p>}
      {children}
    </section>
  )
}

const LADDER_INDEX = { none: 0, arrived: 0, sent: 1, rejected: 1, unconfirmed: 1, reflected: 2 }

export default function ExplorePage({ get = apiGet }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, logout } = useAuthStore()
  const urlDestination = parseDestination(searchParams)
  const wantsProject = urlDestination.type === 'project' || searchParams.get('for') === 'project'
  const [mode, setMode] = useState(wantsProject ? 'project' : 'new')
  const options = useProjectOptions(get)

  // 프로젝트를 고르라고 왔는데 URL에 프로젝트가 없으면, 목록의 첫 프로젝트(최근 연 것)를 고른다
  const selectedId = mode === 'project'
    ? (urlDestination.projectId || (options.status === 'ready' ? options.items[0]?.id || '' : ''))
    : ''
  const destination = useMemo(() => (mode === 'project' && selectedId ? projectDestination(selectedId) : NEW_DESTINATION), [mode, selectedId])
  const projectState = useDestinationProject(destination.projectId, { get })
  const project = projectState.project

  // 고른 목적지를 URL에 기록 — 새로고침·뒤로 가기에도 같은 목적지
  useEffect(() => {
    const next = new URLSearchParams()
    if (mode === 'project') { if (selectedId) next.set('project', selectedId); else next.set('for', 'project') }
    else next.set('for', 'new')
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [mode, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 이 목적지로 담은 성취기준
  const [basketTick, setBasketTick] = useState(0)
  const basket = useMemo(() => readBasket(safeSessionStorage(), destination), [destination, basketTick]) // eslint-disable-line react-hooks/exhaustive-deps
  const meta = useMemo(() => readBasketMeta(safeSessionStorage()), [basketTick])
  const [clearConfirm, setClearConfirm] = useState(false)
  const compare = compareAvailability(basket.length)

  // 진행 중인 프로젝트에 등록된 성취기준 수 (담은 것이 없을 때 미래보기가 가져오는 수)
  const [registered, setRegistered] = useState(null)
  useEffect(() => {
    setRegistered(null)
    if (!destination.projectId) return undefined
    let alive = true
    get(`/api/standards/project/${encodeURIComponent(destination.projectId)}`)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : rows?.standards
        if (alive && Array.isArray(list)) setRegistered(list.length)
      })
      .catch(() => { if (alive) setRegistered(null) })
    return () => { alive = false }
  }, [destination.projectId, get])

  const draft = destination.projectId ? readDraft(safeLocalStorage(), destination.projectId) : null
  const ladderAt = LADDER_INDEX[draft?.status || 'none'] ?? 0
  const access = project ? destinationAccess(project) : null
  const teamCode = project?.current_procedure ? getProcedureDisplayCode(project.current_procedure) : ''
  const subjects = new Set(basket.map((k) => meta[k] || subjectFromKey(k)).filter(Boolean))
  const futuresHref = basket.length > 0 ? (compare.ok ? futuresUrl({ keys: basket, destination }) : '') : futuresUrl({ keys: [], destination })
  const optionList = options.items.some((p) => p.id === selectedId) || !project ? options.items : [project, ...options.items]

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }) }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <header className="bg-bg-secondary border-b border-border">
        <div className="max-w-[1120px] mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link to="/workspaces" className="flex items-center gap-2.5 min-h-[44px] no-underline">
              <Logo size={28} />
              <span className="text-base font-bold text-text-primary">커리큘럼 위버</span>
            </Link>
            <span aria-hidden="true" className="text-border-strong">/</span>
            <span aria-current="page" className="text-sm font-semibold text-text-primary">{C.title}</span>
          </div>
          <nav aria-label="주 메뉴" className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" to="/workspaces">{EXPLORE_COPY.common.myWorkspaces}</Button>
            {user?.email && <span className="hidden sm:inline px-2 text-[13px] text-text-secondary">{user.email}</span>}
            <Button variant="ghost" icon={LogOut} onClick={handleLogout}>{EXPLORE_COPY.common.logout}</Button>
          </nav>
        </div>
      </header>

      <main className="max-w-[1120px] mx-auto px-6 pt-8 pb-12 flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-2xl font-bold tracking-tight">{C.title}</h1>
          <p className="m-0 text-sm leading-relaxed text-text-body">{C.intro}</p>
        </div>

        {/* 1. 결과를 넣을 곳 */}
        <fieldset className="m-0 p-5 border border-border rounded-lg bg-bg-secondary flex flex-col gap-3.5 min-w-0">
          <legend className="px-1.5 text-[15px] font-bold">{C.destinationLegend}</legend>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
            <div className={`flex flex-col gap-3 p-4 rounded-lg min-w-0 ${mode === 'project' ? 'border-2 border-[var(--color-primary-hover)] bg-[var(--ui-tone-info-bg)]' : 'border border-border bg-bg-secondary'}`}>
              <label htmlFor="dest-project" className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                <input type="radio" id="dest-project" name="dest" value="project" checked={mode === 'project'} onChange={() => setMode('project')}
                  className="w-[18px] h-[18px] mt-0.5 shrink-0 accent-[var(--color-primary-hover)]" />
                <span className="flex flex-col gap-1">
                  <strong className="text-[15px] font-semibold">{C.projectOption}</strong>
                  <span className="text-[13px] leading-relaxed text-text-body">{C.projectOptionBody}</span>
                </span>
              </label>
              {mode === 'project' && (
                <div className="flex flex-col gap-1.5 pl-[30px]">
                  <label htmlFor="dest-project-select" className="text-xs font-semibold text-text-body">{C.projectSelectLabel}</label>
                  {options.status === 'loading' && !project
                    ? <span className="text-[13px] text-text-secondary">{C.projectListLoading}</span>
                    : (
                      <select id="dest-project-select" value={selectedId}
                        onChange={(e) => setSearchParams(new URLSearchParams({ project: e.target.value }), { replace: true })}
                        className="min-h-[44px] bg-bg-secondary text-text-primary">
                        {!selectedId && <option value="">{C.projectSelectPlaceholder}</option>}
                        {optionList.map((p) => (
                          <option key={p.id} value={p.id}>{p.workspace_name ? `${p.title} · ${p.workspace_name}` : p.title}</option>
                        ))}
                      </select>
                    )}
                  {options.status === 'error' && <span role="status" className="text-xs text-[var(--ui-tone-warning-fg)]">{C.projectListFailed}</span>}
                  {options.status === 'ready' && options.items.length === 0 && !project && <span className="text-xs text-text-secondary">{C.projectListEmpty}</span>}
                  {project && (
                    <span className="flex items-start gap-1.5 text-xs leading-relaxed text-text-body">
                      <Info aria-hidden="true" size={14} className="shrink-0 mt-0.5 text-[var(--ui-tone-info-dot)]" />
                      {teamCode ? C.teamProcedure(teamCode) : C.teamProcedureUnknown}
                    </span>
                  )}
                  {access?.readOnly && <StatusChip status="readOnly" className="self-start" />}
                </div>
              )}
            </div>
            <div className={`flex flex-col gap-3 p-4 rounded-lg min-w-0 ${mode === 'new' ? 'border-2 border-[var(--color-primary-hover)] bg-[var(--ui-tone-info-bg)]' : 'border border-border bg-bg-secondary'}`}>
              <label htmlFor="dest-new" className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                <input type="radio" id="dest-new" name="dest" value="new" checked={mode === 'new'} onChange={() => setMode('new')}
                  className="w-[18px] h-[18px] mt-0.5 shrink-0 accent-[var(--color-primary-hover)]" />
                <span className="flex flex-col gap-1">
                  <strong className="text-[15px] font-semibold">{C.newOption}</strong>
                  <span className="text-[13px] leading-relaxed text-text-body">{C.newOptionBody}</span>
                </span>
              </label>
            </div>
          </div>
        </fieldset>

        {/* 2. 세 단계 */}
        <div className="grid gap-4 items-stretch [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
          <StepCard n={1} id="step1" title={C.step1Title} body={C.step1Body}>
            <ul className="list-none m-0 p-0 flex flex-col">
              <EntryRow to={graphUrl({ mode: 'design', lens: 'theme', destination })} icon={Hash} entry={C.entries.theme} />
              <EntryRow to={graphUrl({ mode: 'design', lens: 'pair', destination })} icon={Link2} entry={C.entries.pair} />
              <EntryRow to={graphUrl({ mode: 'design', lens: 'neighbor', destination })} icon={BookMarked} entry={C.entries.neighbor} />
              <EntryRow to={graphUrl({ mode: 'explore', destination })} icon={Globe} entry={C.entries.map} />
            </ul>
            <p className="m-0 text-xs leading-relaxed text-text-secondary">{C.step1Footer}</p>
          </StepCard>

          <StepCard n={2} id="step2" title={C.step2Title} body={C.step2Body}>
            <div className="flex flex-col gap-1.5 p-3.5 rounded-md bg-bg-primary border border-bg-tertiary">
              <span className="text-xs text-text-secondary">{C.step2Count}</span>
              <span className="flex items-baseline gap-1.5">
                <strong className="text-[22px] font-bold tabular-nums">{basket.length}개</strong>
                {subjects.size > 0 && <span className="text-[13px] text-text-body">{C.step2Subjects(subjects.size)}</span>}
              </span>
              {basket.length > 0 ? (
                <span className={`flex items-center gap-1.5 text-[13px] font-medium ${compare.ok ? 'text-[var(--ui-tone-success-fg)]' : 'text-[var(--ui-tone-warning-fg)]'}`}>
                  {compare.ok && <Check aria-hidden="true" size={14} strokeWidth={2.5} />}
                  {compare.ok ? C.step2Ready : compare.reason === 'tooMany' ? C.step2TooMany : C.step2TooFew}
                </span>
              ) : destination.type === 'project' && (
                <span className="text-[13px] leading-relaxed text-text-body">
                  {C.step2FromProject}{registered != null && ` (${registered}개)`}
                </span>
              )}
            </div>
            <Button variant="primary" block to={futuresHref || undefined} disabled={!futuresHref} iconRight={ArrowRight}>{C.step2Open}</Button>
            <p className="m-0 text-xs leading-relaxed text-text-secondary">{C.step2Footer}</p>
          </StepCard>

          <StepCard n={3} id="step3" title={C.step3Title} body={destination.type === 'project' ? C.step3BodyProject : C.step3BodyNew}>
            {destination.type === 'project' ? (
              <>
                {draft && <StatusChip status={draft.status} className="self-start" />}
                <ol aria-label={C.ladderLabel} className="list-none m-0 p-0 flex flex-col">
                  {C.ladder.map((step, i) => (
                    <li key={step.key} className={`flex gap-3 py-2.5 ${i > 0 ? 'border-t border-dashed border-border' : ''}`}
                      aria-current={i === ladderAt ? 'step' : undefined}>
                      <span aria-hidden="true" className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full shrink-0 ${
                        i < ladderAt ? 'bg-[var(--ui-tone-success-dot)]' : i === ladderAt ? 'bg-text-body' : 'border-2 border-border-strong'}`}>
                        {i < ladderAt ? <Check size={12} strokeWidth={3} className="text-white" /> : i === ladderAt ? <span className="w-2 h-2 rounded-full bg-white" /> : null}
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <strong className="text-[13px] font-semibold">{step.title}{i === ladderAt && <span className="font-medium text-text-body"> {C.ladderNow}</span>}</strong>
                        <span className="text-xs leading-relaxed text-text-body">{step.body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="m-0 text-xs leading-relaxed text-text-secondary">{EXPLORE_COPY.send.newFooterNote}</p>
            )}
          </StepCard>
        </div>

        {/* 3. 담은 성취기준 */}
        <section aria-labelledby="hub-basket" className="bg-bg-secondary border border-border rounded-lg p-5 flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 id="hub-basket" className="m-0 text-base font-bold">{C.basketTitle(basket.length)}</h2>
                <StatusChip status="exploring" />
              </div>
              <span className="text-[13px] text-text-body">
                {destination.type === 'project' ? C.basketFromDest(project?.title || EXPLORE_COPY.common.unknownProject) : C.basketForNew}
              </span>
            </div>
            {basket.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {clearConfirm ? (
                  <span className="flex items-center gap-1 text-[13px]">
                    <span className="text-text-body">{C.basketClearConfirm}</span>
                    <Button variant="ghost" size="sm" onClick={() => { clearBasket(safeSessionStorage(), destination); setClearConfirm(false); setBasketTick((n) => n + 1) }}>{C.basketClear}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setClearConfirm(false)}>{UI_COPY.actions.cancel}</Button>
                  </span>
                ) : (
                  <Button variant="ghost" onClick={() => setClearConfirm(true)}>{C.basketClear}</Button>
                )}
                <Button variant="primary" to={compare.ok ? futuresHref : undefined} disabled={!compare.ok}>{C.basketCompare}</Button>
              </div>
            )}
          </div>
          {basket.length === 0 ? (
            <p className="m-0 text-[13px] text-text-secondary">{C.basketEmpty}</p>
          ) : (
            <ul className="list-none m-0 p-0 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))]">
              {basket.map((key) => (
                <li key={key} className="flex items-center gap-2 px-3.5 py-2.5 border border-bg-tertiary rounded-md bg-bg-primary min-w-0">
                  {(meta[key] || subjectFromKey(key)) && (
                    <span className="px-2 py-px rounded-full bg-bg-tertiary text-[11px] font-semibold text-text-body whitespace-nowrap">{meta[key] || subjectFromKey(key)}</span>
                  )}
                  <span className="font-mono text-xs font-semibold text-text-body truncate">{codeFromKey(key)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

      </main>
    </div>
  )
}
