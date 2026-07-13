/**
 * 시연 모드(임용 실연 준비) 전용 얕은 스텝 네비게이션.
 * 협력 모드의 19절차 ProcedureNav를 대체한다(팀 절차가 아니라 1인 준비 흐름).
 * 스텝: ① 성취기준·단원 선택 → ② 교수학습과정안 → ③ 실연 대본. 이후 단계는 확장 예정.
 */
export default function DemoStepNav({ step, onStepChange, standardsCount = 0 }) {
  const steps = [
    { id: 'standards', label: '성취기준·단원 선택' },
    { id: 'plan', label: '교수학습과정안' },
    { id: 'script', label: '실연 대본' },
  ]

  return (
    <div
      data-tour="demo-step-nav"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--color-bg-secondary)',
        borderBottom: '1px solid var(--color-border)',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {steps.map((s, idx) => {
        const active = step === s.id
        return (
          <button
            key={s.id}
            onClick={() => onStepChange(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px',
              borderRadius: 9999,
              border: active ? '1px solid #8B5CF6' : '1px solid var(--color-border)',
              background: active ? '#F5F3FF' : 'transparent',
              color: active ? '#6D28D9' : 'var(--color-text-secondary)',
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-sans)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                background: active ? '#8B5CF6' : 'var(--color-bg-tertiary)',
                color: active ? '#fff' : 'var(--color-text-tertiary)',
                flexShrink: 0,
              }}
            >
              {idx + 1}
            </span>
            {s.label}
            {s.id === 'standards' && standardsCount > 0 && (
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 9999,
                  background: active ? '#DDD6FE' : 'var(--color-bg-tertiary)',
                  color: active ? '#6D28D9' : 'var(--color-text-tertiary)',
                  fontWeight: 600,
                }}
              >
                {standardsCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
