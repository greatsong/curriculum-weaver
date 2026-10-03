/**
 * 약식 기록(연수 모드) 켜기 — 팀 만들기 모달과 워크스페이스 설정에서 함께 쓴다.
 * 값은 workspaces.workflow_config.briefMode(boolean)와 briefCoreFormal(boolean, 기본 켜짐)에 저장한다.
 * 분류 기준은 shared/briefMode.js.
 */
import { getProcedureDisplayCode } from 'curriculum-weaver-shared/constants.js'
import { BRIEF_FORMAL_CORE } from 'curriculum-weaver-shared/briefMode.js'

const CORE_LABEL = BRIEF_FORMAL_CORE.map((code) => getProcedureDisplayCode(code)).filter(Boolean).join(', ')

export default function BriefModeToggle({ checked, onChange, coreFormal = true, onCoreFormalChange, disabled = false }) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: '10px 12px',
        border: `2px solid ${checked ? '#3B82F6' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-lg)',
        background: checked ? '#EFF6FF' : 'var(--color-bg-secondary)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <input
          id="brief-mode-toggle"
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0 }}
        />
        <span>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: checked ? '#2563EB' : 'var(--color-text-primary)', marginBottom: 4 }}>
            약식 기록 (연수용)
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
            오프라인 활동 결과를 간단히 옮겨 적습니다. AI는 필수 내용만 확인하고 더 묻지 않으며, 도움은 요청할 때만 줍니다.
          </span>
        </span>
      </label>
      {checked && onCoreFormalChange && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, paddingTop: 8, marginLeft: 25, borderTop: '1px solid #BFDBFE', cursor: disabled ? 'not-allowed' : 'pointer' }}>
          <input
            id="brief-core-formal-toggle"
            type="checkbox"
            checked={!!coreFormal}
            disabled={disabled}
            onChange={(e) => onCoreFormalChange(e.target.checked)}
            style={{ marginTop: 2, width: 14, height: 14, flexShrink: 0 }}
          />
          <span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>
              핵심 절차는 정식으로 진행
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              핵심 절차({CORE_LABEL})는 AI가 단계마다 묻고 안내하는 원래 방식으로, 나머지 절차는 약식으로 진행합니다.
            </span>
          </span>
        </label>
      )}
    </div>
  )
}
