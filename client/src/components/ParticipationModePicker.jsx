/**
 * 팀 진행 방식 선택 (1인 기록 / 팀 채팅) — 팀 만들기 모달과 워크스페이스 설정에서 함께 쓴다.
 */
import { PARTICIPATION_MODE_OPTIONS } from 'curriculum-weaver-shared/constants.js'

export default function ParticipationModePicker({ value, onChange, disabled = false }) {
  return (
    <div role="radiogroup" aria-label="진행 방식" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {PARTICIPATION_MODE_OPTIONS.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            style={{
              padding: '10px 12px',
              border: `2px solid ${selected ? '#3B82F6' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-lg)',
              background: selected ? '#EFF6FF' : 'var(--color-bg-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: selected ? '#2563EB' : 'var(--color-text-primary)', marginBottom: 4 }}>
              {option.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{option.description}</div>
          </button>
        )
      })}
    </div>
  )
}
