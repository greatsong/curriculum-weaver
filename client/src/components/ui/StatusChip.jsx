/**
 * StatusChip — 반영 상태 칩. 상태 이름·뜻·색은 공용 사전(lib/uiCopy.js의 UI_COPY.status)에서 가져온다.
 * 밝은·어두운 화면은 바깥의 .ui-theme-* 범위가 정한다(부품은 변수만 읽는다).
 * 사전에 없는 상태를 보일 때만 tone·label을 직접 준다.
 */
import { Check, Send, Inbox, X, AlertTriangle, Lock } from 'lucide-react'
import { UI_COPY } from '../../lib/uiCopy'
import './ui.css'

const ICONS = { check: Check, send: Send, inbox: Inbox, x: X, alert: AlertTriangle, lock: Lock }

export default function StatusChip({ status, tone, label, className = '', live = true }) {
  const entry = status ? UI_COPY.status[status] : null
  const toneKey = tone || entry?.tone || 'neutral'
  const text = label ?? entry?.label ?? ''
  const Icon = entry && ICONS[entry.icon]
  return (
    <span className={`ui-chip ui-tone-${toneKey} ${className}`.trim()} aria-live={live ? 'polite' : undefined}
      title={entry?.meaning} data-status={status || undefined}>
      {Icon
        ? <Icon className="ui-chip__icon" aria-hidden="true" size={12} strokeWidth={2.4} />
        : <span className="ui-chip__dot" aria-hidden="true" />}
      {text}
    </span>
  )
}
