/**
 * ExplorationDraftStrip — 프로젝트 화면의 탐색 초안 안내 줄 (예전 A3ExplorationEntry를 대체).
 *
 * 초안을 만들던 미래보기 화면은 제거했다. 이 브라우저에 이미 도착한 초안이 있을 때만 그린다
 * (초안이 없으면 아무것도 그리지 않는다. 예전의 탐색 입구·다시 열기 링크는 없앴다).
 *
 * - 모든 절차에서 보인다. A-3가 아닌 절차에서는 안내만 하고, 절차를 옮기지 않는다
 *   (팀 커서 PATCH·소켓·인트로 요청 없음 — 이 부품은 절차 변경 함수를 받지도 않는다).
 * - A-3에서는 "대화 입력창에 넣기"로 초안을 채팅 입력창에 넣는다. 자동으로 보내지 않는다.
 * - 상태(대화에 보냄 → 제안 검토 중 → 보드에 반영/반영하지 않음/저장 확인 필요)는 이 브라우저에서만 판단한다.
 * - 시연 모드 프로젝트에는 그리지 않는다.
 */
import { useCallback, useEffect, useState } from 'react'
import { Compass, Inbox, Check, X, AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react'
import Notice from './ui/Notice'
import Button from './ui/Button'
import StatusChip from './ui/StatusChip'
import { useChatStore } from '../stores/chatStore'
import { apiGet } from '../lib/api'
import { EXPLORE_COPY } from '../lib/explorationCopy'
import { UI_COPY } from '../lib/uiCopy'
import { A3_PROCEDURE, readDraft, removeDraft, applyDraftEvent, subscribeDraft, viewStatus, safeLocalStorage } from '../lib/explorationDraft'

const T = EXPLORE_COPY.strip

function timeOf(ts) {
  if (!ts) return ''
  try { return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) } catch { return '' }
}

export function useExplorationDraft(projectId) {
  const [draft, setDraft] = useState(() => readDraft(safeLocalStorage(), projectId))
  useEffect(() => {
    const refresh = () => setDraft(readDraft(safeLocalStorage(), projectId))
    refresh()
    return subscribeDraft(projectId, refresh)
  }, [projectId])
  return draft
}

export default function ExplorationDraftStrip({ project, procedure, readOnly = false, onInserted, get = apiGet }) {
  const projectId = project?.id
  const draft = useExplorationDraft(projectId)
  const pendingSuggestions = useChatStore((s) => s.pendingSuggestions)
  const setComposerDraft = useChatStore((s) => s.setComposerDraft)
  const [showText, setShowText] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [note, setNote] = useState('')
  const [rechecking, setRechecking] = useState(false)
  useEffect(() => { setShowText(false); setConfirmDiscard(false); setNote('') }, [draft?.id, draft?.status])

  const atA3 = procedure === A3_PROCEDURE
  const canWrite = !readOnly && project?.my_role !== 'viewer'

  const insert = useCallback(() => {
    if (!draft || !canWrite) return
    setComposerDraft({ text: draft.text, projectId, draftId: draft.id })
    setNote(T.inserted)
    onInserted?.()
  }, [draft, canWrite, projectId, setComposerDraft, onInserted])

  const recheck = async () => {
    setRechecking(true); setNote('')
    try {
      const board = await get(`/api/projects/${encodeURIComponent(projectId)}/designs/${A3_PROCEDURE}`)
      const next = applyDraftEvent(safeLocalStorage(), projectId, { type: 'rechecked', board })
      if (next?.status === 'unconfirmed') setNote(T.recheckNotFound)
    } catch {
      setNote(T.recheckFailed)
    } finally {
      setRechecking(false)
    }
  }

  if (!project || project.learner_context?.demo === true) return null
  if (!draft) return null

  const view = viewStatus(draft, pendingSuggestions)
  const viewButton = (
    <Button variant="ghost" size="sm" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>{showText ? T.hide : T.view}</Button>
  )
  const discard = confirmDiscard ? (
    <span className="flex items-center gap-1 text-xs">
      <span className="text-text-body">{T.discardConfirm}</span>
      <Button variant="ghost" size="sm" onClick={() => removeDraft(safeLocalStorage(), projectId)}>{T.discard}</Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(false)}>{UI_COPY.actions.cancel}</Button>
    </span>
  ) : <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)}>{T.discard}</Button>

  let notice
  if (view === 'arrived') {
    notice = atA3 ? (
      <Notice flush tone="info" icon={Inbox} title={T.arrivedTitle} aria-label={T.regionLabel}
        actions={<>{viewButton}{discard}<Button variant="primary" size="sm" onClick={insert} disabled={!canWrite} title={canWrite ? undefined : T.readOnlyInsert}>{T.insert}</Button></>}>
        {canWrite ? T.arrivedBody : T.readOnlyInsert}
      </Notice>
    ) : (
      <Notice flush tone="info" icon={Inbox} title={T.beforeA3Title} aria-label={T.regionLabel}
        actions={<>{viewButton}{discard}</>}>
        {T.beforeA3Body}
      </Notice>
    )
  } else if (view === 'sent' || view === 'reviewing') {
    notice = (
      <Notice flush tone="info" icon={Compass} title={T.sentTitle} aria-label={T.regionLabel}
        actions={viewButton}>
        <ol aria-label={T.stepsLabel} className="list-none m-0 mt-1 p-0 flex flex-wrap items-center gap-1.5">
          <li><StatusChip status="sent" label={`${T.steps.sent} ${timeOf(draft.sentAt)}`.trim()} live={false} /></li>
          <li aria-hidden="true"><ChevronRight size={14} className="text-text-secondary" /></li>
          <li aria-current={view === 'reviewing' ? 'step' : undefined}>
            {view === 'reviewing' ? <StatusChip status="reviewing" /> : <StatusChip tone="muted" label={T.steps.reviewing} live={false} />}
          </li>
          <li aria-hidden="true"><ChevronRight size={14} className="text-text-secondary" /></li>
          <li><StatusChip tone="muted" label={T.steps.reflected} live={false} /></li>
        </ol>
        <span className="block mt-1">{view === 'reviewing' ? T.reviewingBody : T.sentWaiting}</span>
      </Notice>
    )
  } else if (view === 'reflected') {
    notice = (
      <Notice flush tone="success" icon={Check} role="status" aria-label={T.regionLabel}
        title={T.reflectedTitle}
        actions={<Button variant="ghost" size="sm" aria-label={T.dismiss} icon={X} onClick={() => removeDraft(safeLocalStorage(), projectId)} />}>
        {[draft.reflectedLabel, timeOf(draft.resolvedAt)].filter(Boolean).join(' · ')}
      </Notice>
    )
  } else if (view === 'rejected') {
    notice = (
      <Notice flush tone="muted" icon={X} title={T.rejectedTitle} aria-label={T.regionLabel}
        actions={<>{viewButton}{discard}{atA3 && canWrite && <Button variant="secondary" size="sm" onClick={insert}>{T.reinsert}</Button>}</>}>
        {T.rejectedBody}
      </Notice>
    )
  } else {
    notice = (
      <Notice flush tone="warning" icon={AlertTriangle} role="alert" title={T.unconfirmedTitle} aria-label={T.regionLabel}
        actions={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={recheck} disabled={rechecking}>{rechecking ? T.rechecking : T.recheck}</Button>}>
        {T.unconfirmedBody}
      </Notice>
    )
  }

  return (
    <div className="shrink-0">
      {notice}
      {note && <p role="status" className="m-0 px-4 py-1.5 text-xs text-text-body bg-bg-secondary border-b border-border">{note}</p>}
      {showText && (
        <pre className="m-0 px-4 py-3 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed font-sans text-text-body bg-bg-primary border-b border-border">{draft.text}</pre>
      )}
    </div>
  )
}
