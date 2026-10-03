/**
 * ProcedureBadge — 절차 배지. 표시 코드는 반드시 getProcedureDisplayCode를 거친다
 * (내부 코드 A-2-1 같은 값은 화면에 내지 않는다). 표시 코드가 없는 절차(준비)는 이름만 보인다.
 * 색은 진행 상태로만 정한다: state 'done'(완료, 초록) | 'current'(현재, 파랑) | 'todo'(나머지, 회색).
 */
import { Check } from 'lucide-react'
import { PROCEDURES, getProcedureDisplayCode } from 'curriculum-weaver-shared/constants.js'
import './ui.css'

const STATES = new Set(['done', 'current', 'todo'])

export default function ProcedureBadge({ code, state = 'todo', showName = true, bare = false, className = '' }) {
  const proc = PROCEDURES[code]
  if (!proc) return null
  const display = getProcedureDisplayCode(code)
  if (!display && !showName) return null
  const tone = STATES.has(state) ? state : 'todo'
  const cls = ['ui-proc', `ui-proc--${tone}`, display ? '' : 'ui-proc--name-only', bare ? 'ui-proc--bare' : '', className]
    .filter(Boolean).join(' ')
  return (
    <span className={cls}>
      {display && (
        <span className="ui-proc__code">
          {tone === 'done' && <Check aria-hidden="true" size={10} strokeWidth={3} />}
          {display}
        </span>
      )}
      {showName && <span>{proc.name}</span>}
    </span>
  )
}
