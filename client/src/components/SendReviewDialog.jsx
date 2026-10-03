/**
 * SendReviewDialog — 미래보기에서 고른 결과를 보내기 전에 "어디로, 무엇이, 보낸 뒤 무엇을" 확인하는 창.
 *
 * mode 'project': 진행 중인 프로젝트의 A-3로 보낸다. 확인하면 부모가 초안을 이 브라우저에 저장하고
 *                 같은 탭에서 프로젝트로 돌아간다(onSubmit). 프로젝트 데이터·진행 절차는 바꾸지 않는다.
 *                 읽기 전용(시뮬레이션·열람·A-3 생략)은 보내기를 막고 초안 복사만 둔다.
 * mode 'new':     새 프로젝트 만들기 화면으로 가져간다. 같은 워크스페이스에 같은 이름의 프로젝트가 있는지만
 *                 확인하고, 있으면 그 프로젝트의 A-3로 보내도록 권한다(중복 프로젝트 방지).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Info, AlertTriangle, Send, Copy, Plus } from 'lucide-react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Notice from './ui/Notice'
import { EXPLORE_COPY } from '../lib/explorationCopy'
import { UI_COPY } from '../lib/uiCopy'
import { A3_PROCEDURE, a3BoardStatus, buildA3Handoff, sendPolicy } from '../lib/futuresProjectHandoff'
import { getProcedureDisplayCode, getProcedureLabel } from 'curriculum-weaver-shared/constants.js'
import { exploreHubUrl, projectDestination, destinationAccess } from '../lib/exploreDestination'

const S = EXPLORE_COPY.send

function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      {title && <h3 className="m-0 text-sm font-bold text-text-primary">{title}</h3>}
      {children}
    </div>
  )
}

function CheckRow({ id, checked, disabled, onChange, title, children }) {
  return (
    <label htmlFor={id} className={`flex gap-3 px-3.5 py-3 border border-border rounded-md ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={onChange}
        className="w-[18px] h-[18px] mt-0.5 shrink-0 accent-[var(--color-action)]" />
      <span className="flex flex-col gap-1 min-w-0">
        <strong className="text-sm font-semibold text-text-primary">{title}</strong>
        {children}
      </span>
    </label>
  )
}

function ProjectBody({ project, design, boardCheck, onRecheckBoard, standards, bridges, future, registeredKeys, existingDraft, text, include, setInclude, copyNote }) {
  const a3Label = getProcedureLabel(A3_PROCEDURE)
  // 표시 코드가 없는 절차(준비)는 이름으로 부른다 — 내부 코드는 화면에 내지 않는다
  const teamCode = project?.current_procedure
    ? (getProcedureDisplayCode(project.current_procedure) || getProcedureLabel(project.current_procedure))
    : ''
  const policy = sendPolicy(project, design)
  const keywordCount = bridges?.concepts?.length || 0
  const registered = standards.filter((s) => registeredKeys.has(s.key)).length
  return (
    <>
      <Section>
        <div className="flex items-center gap-3 pl-3.5 pr-2 py-3 border border-border rounded-lg">
          <span aria-hidden="true" className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-[var(--ui-tone-success-bg)] text-[var(--ui-tone-success-fg)] shrink-0">
            <FolderOpen size={18} />
          </span>
          <span className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-xs text-text-secondary">{EXPLORE_COPY.common.destinationLabel}</span>
            <strong className="text-[15px] font-semibold text-text-primary break-words">{project?.title}</strong>
            <span className="text-[13px] text-text-body">{a3Label}</span>
          </span>
          <Button variant="link" size="sm" to={exploreHubUrl(projectDestination(project?.id))}>{UI_COPY.actions.change}</Button>
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-xs text-text-body">
          <span>{S.boardLine(boardCheck === 'error' ? S.boardRecheckFailed : a3BoardStatus(design))}</span>
          <Button variant="link" size="sm" disabled={boardCheck === 'loading'} onClick={onRecheckBoard}>
            {boardCheck === 'loading' ? S.boardRechecking : S.boardRecheck}
          </Button>
        </p>
        {boardCheck === 'checked' && <p role="status" className="m-0 text-xs text-text-body">{S.boardRechecked}</p>}
        <Notice tone="info" icon={Info}>
          {project?.current_procedure === A3_PROCEDURE ? S.teamAtA3 : teamCode ? S.teamProcedure(teamCode) : S.teamProcedureUnknown}
        </Notice>
        {(policy.readOnly || design?.save_status === 'locked') && (
          <Notice tone="warning" icon={AlertTriangle}>{policy.readOnly ? `${S.readOnlyReason} ${policy.note}` : policy.note}</Notice>
        )}
        {existingDraft?.status === 'arrived' && <Notice tone="warning" icon={AlertTriangle}>{S.replaceWarning}</Notice>}
      </Section>

      <fieldset className="m-0 p-0 border-0 flex flex-col gap-2 min-w-0">
        <legend className="p-0 mb-2 text-sm font-bold text-text-primary">{S.contentLegend}</legend>
        {future && (
          <CheckRow id="send-idea" checked={include.idea} onChange={(e) => setInclude((v) => ({ ...v, idea: e.target.checked }))} title={S.ideaItem}>
            <span className="text-[13px] text-text-body break-words">{future.title}</span>
            <span className="text-xs leading-relaxed text-text-secondary">{S.ideaItemNote}</span>
          </CheckRow>
        )}
        {keywordCount > 0 && (
          <CheckRow id="send-keywords" checked={include.bridges} onChange={(e) => setInclude((v) => ({ ...v, bridges: e.target.checked }))} title={S.keywordItem(keywordCount)}>
            <span className="flex flex-wrap gap-1.5">
              {bridges.concepts.slice(0, 8).map((c) => (
                <span key={c.label} className="px-2.5 py-0.5 rounded-full bg-bg-tertiary text-xs text-text-body">{c.label}</span>
              ))}
            </span>
          </CheckRow>
        )}
        <CheckRow id="send-standards" checked disabled title={S.standardsItem(standards.length)}>
          <span className="text-xs leading-relaxed text-text-secondary">{S.standardsAlways} {S.standardsRegistered(registered, standards.length)}</span>
        </CheckRow>
        {future && <p className="m-0 mt-1 text-xs leading-relaxed text-text-secondary">{S.notSent}</p>}
      </fieldset>

      <Section title={S.afterTitle}>
        <ol className="list-none m-0 p-0 flex flex-col gap-2">
          {S.after.map((line, i) => (
            <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed text-text-body">
              <span className="inline-flex items-center justify-center w-5 h-5 mt-px rounded-full bg-bg-tertiary text-[11px] font-bold text-text-primary shrink-0">{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </Section>

      <details className="text-[13px]">
        <summary className="cursor-pointer min-h-[32px] flex items-center font-medium text-link">{S.draftDetails}</summary>
        <label htmlFor="send-draft-text" className="sr-only">{S.draftTextLabel}</label>
        <textarea id="send-draft-text" readOnly value={text} onFocus={(e) => e.target.select()}
          className="send-draft-text mt-2 w-full h-56 text-xs leading-relaxed font-mono bg-bg-primary text-text-body resize-y" />
      </details>
      {copyNote && <p role="status" className="m-0 text-[13px] text-text-body">{copyNote}</p>}
    </>
  )
}

function useWorkspaceProjects(get, enabled) {
  const [workspaces, setWorkspaces] = useState({ status: 'loading', items: [] })
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    get('/api/workspaces')
      .then((d) => { if (alive) setWorkspaces({ status: 'ready', items: (d?.workspaces ?? d ?? []).filter((ws) => !ws?.workflow_config?.personal) }) })
      .catch(() => { if (alive) setWorkspaces({ status: 'error', items: [] }) })
    return () => { alive = false }
  }, [get, enabled])
  return workspaces
}

function NewBody({ get, standards, workspaceId, setWorkspaceId, workspaces, title, setTitle, desc, setDesc, duplicate, duplicateFailed, onSwitchToProject }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="send-new-ws" className="text-[13px] font-semibold text-text-body">{S.workspaceLabel}</label>
        {workspaces.status === 'loading' && <span className="text-[13px] text-text-secondary">{S.workspaceLoading}</span>}
        {workspaces.status === 'error' && <span role="status" className="text-[13px] text-[var(--ui-tone-warning-fg)]">{S.workspaceFailed}</span>}
        {workspaces.status === 'ready' && workspaces.items.length === 0 && <span className="text-[13px] text-text-secondary">{S.workspaceEmpty}</span>}
        {workspaces.status === 'ready' && workspaces.items.length > 0 && (
          <select id="send-new-ws" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="min-h-[44px] bg-bg-secondary text-text-primary">
            {workspaces.items.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
          </select>
        )}
      </div>
      {duplicate && (
        <Notice tone="warning" icon={AlertTriangle} role="note" title={S.duplicateTitle}
          actions={<Button variant="secondary" size="sm" onClick={() => onSwitchToProject(duplicate.id)}>{S.duplicateAction}</Button>}>
          {S.duplicateBody(duplicate.title)}
        </Notice>
      )}
      {duplicateFailed && <p role="status" className="m-0 text-xs text-text-secondary">{S.duplicateCheckFailed}</p>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="send-new-title" className="text-[13px] font-semibold text-text-body">{S.nameLabel}</label>
        <input id="send-new-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="min-h-[44px] text-text-primary" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="send-new-desc" className="text-[13px] font-semibold text-text-body">{S.descLabel}</label>
        <textarea id="send-new-desc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className="text-text-primary resize-y" />
        <span className="text-xs text-text-secondary">{S.descNote}</span>
      </div>
      <Section title={S.standardsItem(standards.length)}>
        <ul className="list-none m-0 p-0 flex flex-wrap gap-1.5">
          {standards.map((s) => (
            <li key={s.key} className="px-2.5 py-1 rounded-full bg-bg-tertiary font-mono text-xs font-semibold text-text-body">{s.code}</li>
          ))}
        </ul>
      </Section>
      <p className="m-0 px-3 py-2.5 rounded-md bg-bg-primary text-[13px] leading-relaxed text-text-body">{S.notCarriedNew}</p>
    </>
  )
}

export default function SendReviewDialog({
  mode, onClose, get, standards, bridges, future,
  // 진행 중인 프로젝트
  project, design, boardCheck, onRecheckBoard, registeredKeys = new Set(), existingDraft, revision, onCopied, onSubmit,
  // 새 프로젝트
  onSubmitNew, onSwitchToProject,
}) {
  const [include, setInclude] = useState({ idea: true, bridges: true })
  const [copyNote, setCopyNote] = useState('')
  const [saveError, setSaveError] = useState('')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const text = useMemo(() => (mode === 'project' && project
    ? buildA3Handoff({ project, standards, bridges: include.bridges ? bridges : null, future: include.idea ? future : null })
    : ''), [mode, project, standards, bridges, future, include])
  const policy = mode === 'project' ? sendPolicy(project, design) : null

  // 새 프로젝트
  const workspaces = useWorkspaceProjects(get, mode === 'new')
  const [workspaceId, setWorkspaceId] = useState('')
  const [title, setTitle] = useState(future?.title || '')
  const [desc, setDesc] = useState([future?.driving_question, future?.situation].find(Boolean) || '')
  const [duplicate, setDuplicate] = useState(null)
  const [duplicateFailed, setDuplicateFailed] = useState(false)
  useEffect(() => {
    if (mode === 'new' && !workspaceId && workspaces.items[0]) setWorkspaceId(workspaces.items[0].id)
  }, [mode, workspaceId, workspaces.items])
  const [projectsOfWs, setProjectsOfWs] = useState({ id: '', items: null })
  useEffect(() => {
    if (mode !== 'new' || !workspaceId) return undefined
    let ok = true
    setDuplicateFailed(false)
    get(`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`)
      .then((d) => { if (ok) setProjectsOfWs({ id: workspaceId, items: d?.projects ?? d ?? [] }) })
      .catch(() => { if (ok) { setProjectsOfWs({ id: workspaceId, items: null }); setDuplicateFailed(true) } })
    return () => { ok = false }
  }, [mode, workspaceId, get])
  useEffect(() => {
    const wanted = title.trim()
    const match = wanted && projectsOfWs.id === workspaceId && projectsOfWs.items
      ? projectsOfWs.items.find((p) => String(p.title || '').trim() === wanted && destinationAccess(p).canSend && !String(p.title).startsWith('[시뮬레이션]'))
      : null
    setDuplicate(match || null)
  }, [title, projectsOfWs, workspaceId])

  const copy = async () => {
    const token = revision
    try {
      await navigator.clipboard.writeText(text)
      if (!alive.current) return
      setCopyNote(S.copied)
      onCopied?.(true, token)
    } catch {
      if (!alive.current) return
      setCopyNote(S.copyFailed)
      onCopied?.(false, token)
    }
  }
  const submitProject = () => {
    setSaveError('')
    const ok = onSubmit?.({ text, include })
    if (ok === false) setSaveError(S.saveFailed)
  }

  const footer = mode === 'project' ? (
    <>
      <span className="text-xs text-text-body">{saveError || S.footerNote}</span>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onClose}>{UI_COPY.actions.cancel}</Button>
        <Button variant="secondary" icon={Copy} onClick={copy}>{S.copy}</Button>
        <Button variant="primary" icon={Send} onClick={submitProject} disabled={!policy?.canSend}
          title={policy?.canSend ? undefined : S.readOnlyReason}>{S.submit}</Button>
      </div>
    </>
  ) : (
    <>
      <span className="text-xs text-text-body">{S.newFooterNote}</span>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onClose}>{UI_COPY.actions.cancel}</Button>
        <Button variant="primary" icon={Plus} disabled={!workspaceId || !title.trim()}
          onClick={() => onSubmitNew?.({ workspaceId, title: title.trim(), desc: desc.trim() })}>{S.newSubmit}</Button>
      </div>
    </>
  )

  return (
    <Modal onClose={onClose} title={mode === 'project' ? S.projectTitle : S.newTitle} footer={footer} className="send-review-dialog">
      {mode === 'project'
        ? <ProjectBody project={project} design={design} boardCheck={boardCheck} onRecheckBoard={onRecheckBoard}
            standards={standards} bridges={bridges} future={future} registeredKeys={registeredKeys} existingDraft={existingDraft}
            text={text} include={include} setInclude={setInclude} copyNote={copyNote} />
        : <NewBody get={get} standards={standards} workspaceId={workspaceId} setWorkspaceId={setWorkspaceId} workspaces={workspaces}
            title={title} setTitle={setTitle} desc={desc} setDesc={setDesc} duplicate={duplicate} duplicateFailed={duplicateFailed}
            onSwitchToProject={onSwitchToProject} />}
    </Modal>
  )
}
