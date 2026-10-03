/**
 * 약식 기록(연수 모드) 켜기 — 팀 만들기 모달과 워크스페이스 설정에서 함께 쓴다.
 * 값은 workspaces.workflow_config.briefMode(boolean)에 저장한다. 분류 기준은 shared/briefMode.js.
 */
export default function BriefModeToggle({ checked, onChange, disabled = false }) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        marginTop: 8,
        padding: '10px 12px',
        border: `2px solid ${checked ? '#3B82F6' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-lg)',
        background: checked ? '#EFF6FF' : 'var(--color-bg-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans)',
      }}
    >
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
  )
}
