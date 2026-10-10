/**
 * ExplorationContextBar — 탐색 화면 머리 줄. "보낼 곳"과 반영 상태를 한 줄에 한 번만 보여 준다.
 * (예전 ExplorationStatus를 대체. 접근성 이름 "탐색 대상과 반영 상태"는 그대로 유지)
 *
 * 모든 화면에서 기존 밝은 앱 색(index.css 토큰)으로 그린다. 교육과정 성운에서도
 * 장면 위에 겹치지 않고, 어두운 장면 영역 바로 위의 밝은 줄로 둔다(2026-10-03 사용자 결정).
 * status: 공용 상태 사전의 키(UI_COPY.status) — 예: 'exploring', 'readOnly'.
 *         사전에 없는 상태만 statusLabel·statusTone으로 직접 준다.
 */
import { Lightbulb, FolderOpen, Lock, BookMarked } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatusChip from './ui/StatusChip'
import { UI_COPY } from '../lib/uiCopy'
import { EXPLORE_COPY } from '../lib/explorationCopy'

const ICONS = { new: Lightbulb, project: FolderOpen, lock: Lock, search: BookMarked }

export default function ExplorationContextBar({
  icon = 'new', label = EXPLORE_COPY.common.destinationLabel,
  target, changeHref, status, statusLabel, statusTone, note, actions, children, className = '',
}) {
  const Icon = ICONS[icon] || Lightbulb
  return (
    <section aria-label="탐색 대상과 반영 상태"
      className={`bg-bg-secondary text-text-primary border-b border-border shrink-0 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <span aria-hidden="true" className="inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0 bg-bg-tertiary text-text-body">
          <Icon size={16} strokeWidth={2} />
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-[1_1_220px]">
          {label && <span className="text-xs whitespace-nowrap text-text-secondary">{label}</span>}
          <strong className="text-sm font-semibold min-w-0 break-words">{target}</strong>
          {changeHref && (
            <Link to={changeHref}
              className="inline-flex items-center min-h-[32px] text-[13px] font-medium whitespace-nowrap text-link hover:text-link-hover no-underline">
              {UI_COPY.actions.change}
            </Link>
          )}
        </span>
        {(status || statusLabel) && <StatusChip status={status} label={statusLabel} tone={statusTone} />}
        {actions && <span className="flex flex-wrap items-center gap-2 ml-auto">{actions}</span>}
      </div>
      {(note || children) && (
        <div className="px-4 pb-2 -mt-1 text-xs leading-relaxed text-text-secondary">
          {note}
          {children}
        </div>
      )}
    </section>
  )
}
