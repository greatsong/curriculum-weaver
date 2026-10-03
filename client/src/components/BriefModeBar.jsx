/**
 * 약식 기록(연수 모드) 막대 — 채팅 입력창 바로 위.
 *
 * 연수에서는 활동을 오프라인으로 마치고 결과만 보드 양식(BriefBoardForm)에 적는다. 이 막대는 AI를 부르지 않고
 * 보드 내용만으로 필수(A)·선택(B) 칸의 상태를 보여 주고, AI 도움 요청·다음 절차 이동을 한곳에 모은다.
 * 약식 기록을 켠 팀에만 보이며, 분류는 shared/briefMode.js 단일 소스를 따른다.
 */
import { useMemo } from 'react'
import { BOARD_TYPES, getNextActiveProcedure, getProcedureDisplayCode, PROCEDURES } from 'curriculum-weaver-shared/constants.js'
import {
  resolveBriefMode,
  getBriefStatus,
  getBriefHelpActions,
  BRIEF_GUIDED_LABEL,
} from 'curriculum-weaver-shared/briefMode.js'
import { useProcedureStore } from '../stores/procedureStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useProjectStore } from '../stores/projectStore'
import { workflowConfigForProject } from '../lib/projectWorkspace'

function StatusChip({ item, optional = false }) {
  const filled = item.filled
  return (
    <span
      title={filled ? `${item.label}: 입력됨` : `${item.label}: 비어 있음${optional ? ' (선택)' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        border: `1px solid ${filled ? '#86EFAC' : 'var(--color-border)'}`,
        background: filled ? '#F0FDF4' : 'var(--color-bg-secondary)',
        color: filled ? '#15803D' : optional ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
      }}
    >
      <span aria-hidden="true">{filled ? '✓' : '○'}</span>
      {item.label}
    </span>
  )
}

const chipButton = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 9px',
  borderRadius: 6,
  border: '1px solid var(--color-border-strong, #D1D5DB)',
  background: 'var(--color-bg-secondary)',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--font-sans)',
}

/**
 * @param {object} props
 * @param {string} props.procedureCode - 현재 절차(내부 코드)
 * @param {boolean} props.busy - AI 응답 중이면 true
 * @param {(label: string) => void} props.onHelp - [AI 도움] 버튼 클릭
 * @param {(code: string) => void} props.onAdvance - 다음 절차로 이동
 * @param {boolean} props.hasPendingSuggestions - 아직 처리하지 않은 제안 카드가 있는지
 * @param {() => void} [props.onOpenReport] - 마지막 절차에서 [보고서 작성하기] 클릭(결과 보고서 창 열기)
 */
export default function BriefModeBar({ procedureCode, busy, onHelp, onAdvance, hasPendingSuggestions, onOpenReport }) {
  const project = useProjectStore((s) => s.currentProject)
  const workspace = useWorkspaceStore((s) => s.currentWorkspace)
  const workflowConfig = workflowConfigForProject(project, workspace)
  const isDemo = project?.learner_context?.demo === true
  const boards = useProcedureStore((s) => s.boards)
  const skippedProcedures = useProcedureStore((s) => s.skippedProcedures)

  const skippedCodes = useMemo(
    () => (skippedProcedures || []).map((s) => s.procedure_code),
    [skippedProcedures]
  )
  const content = boards?.[BOARD_TYPES[procedureCode]]?.content
  const status = useMemo(() => getBriefStatus(procedureCode, content || {}), [procedureCode, content])

  if (!resolveBriefMode(workflowConfig) || isDemo || !status) return null
  if (skippedCodes.includes(procedureCode)) return null

  const help = getBriefHelpActions(procedureCode)
  const next = getNextActiveProcedure(procedureCode, skippedCodes)
  const nextDisplay = next ? (getProcedureDisplayCode(next.code) || PROCEDURES[next.code]?.name || '') : ''

  const handleAdvance = () => {
    if (!next || busy) return
    if (hasPendingSuggestions && !window.confirm('아직 수락하지 않은 AI 제안이 있습니다. 그대로 다음 절차로 이동할까요?')) return
    onAdvance(next.code)
  }

  return (
    <div
      data-testid="brief-mode-bar"
      style={{
        borderTop: '1px solid var(--color-border)',
        padding: '8px 12px',
        display: 'grid',
        gap: 6,
        background: 'var(--color-bg-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', marginRight: 2 }}>약식 기록</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>필수</span>
        {status.a.map((item) => <StatusChip key={item.name} item={item} />)}
        {status.b.length > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>선택</span>}
        {status.b.map((item) => <StatusChip key={item.name} item={item} optional />)}
        <span style={{ flex: 1 }} />
        {next && (
          <button
            type="button"
            onClick={handleAdvance}
            disabled={busy}
            title={status.allAFilled ? `${nextDisplay} 절차로 이동합니다` : '필수 칸이 비어 있어도 이동할 수 있습니다'}
            style={{
              ...chipButton,
              border: `1px solid ${status.allAFilled ? '#111827' : 'var(--color-border-strong, #D1D5DB)'}`,
              background: status.allAFilled ? '#111827' : 'var(--color-bg-secondary)',
              color: status.allAFilled ? '#FFFFFF' : 'var(--color-text-primary)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            다음 절차 · {nextDisplay} →
          </button>
        )}
        {/* 마지막 절차(E-2, 또는 뒤가 모두 생략)에는 다음 절차 대신 보고서로 이어 간다 */}
        {!next && onOpenReport && (
          <button
            type="button"
            onClick={onOpenReport}
            disabled={busy}
            title="지금까지 적은 보드로 결과 보고서를 만듭니다"
            style={{
              ...chipButton,
              border: '1px solid #7C3AED',
              background: status.allAFilled ? '#7C3AED' : 'var(--color-bg-secondary)',
              color: status.allAFilled ? '#FFFFFF' : '#6D28D9',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            보고서 작성하기 →
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>AI 도움</span>
        {help.map((h) => (
          <button
            key={h.step}
            type="button"
            disabled={busy}
            onClick={() => onHelp(h.label)}
            title={h.description}
            style={{ ...chipButton, color: '#1D4ED8', cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            {h.label}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => onHelp(BRIEF_GUIDED_LABEL)}
          title="이 절차만 AI가 단계별로 묻고 안내합니다"
          style={{ ...chipButton, color: 'var(--color-text-secondary)', cursor: busy ? 'not-allowed' : 'pointer' }}
        >
          {BRIEF_GUIDED_LABEL}
        </button>
      </div>
    </div>
  )
}
