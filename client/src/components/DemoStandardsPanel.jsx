/**
 * 시연 모드 ① 성취기준·단원 선택 화면.
 * 협력 모드의 융합 그래프·"다른 교과 추가" 유도를 걷어내고, 단일 교과 한 차시 준비에 맞춘 안내.
 * 성취기준 탐색기(StandardSearch)는 ProjectPage 헤더 모달을 재사용한다(onOpenSearch).
 */
export default function DemoStandardsPanel({ standards = [], onOpenSearch, onNext }) {
  const items = (standards || [])
    .map((s) => s.curriculum_standards || s)
    .filter((s) => s && s.code)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 안내 카드 */}
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 6px' }}>
          성취기준·단원 선택
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>
          실연할 <strong>단일 교과 한 차시</strong>의 성취기준을 고르세요. 임용 실연은 하나의 교과를
          깊이 있게 다루는 것이 정상이라, 여러 교과를 융합할 필요가 없습니다. 성취기준을 고른 뒤
          <strong> 교수학습과정안</strong> 단계에서 AI 코치와 도입-전개-정리 흐름을 함께 다듬습니다.
        </p>
      </div>

      {/* 선택된 성취기준 */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, flex: 1 }}>
            선택한 성취기준 {items.length > 0 && <span style={{ color: '#8B5CF6' }}>({items.length})</span>}
          </h3>
          <button
            onClick={onOpenSearch}
            className="btn btn-secondary"
            style={{ fontSize: 13, padding: '6px 14px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            성취기준 탐색
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-text-tertiary)' }}>
            <p style={{ fontSize: 13, margin: '0 0 4px' }}>아직 선택한 성취기준이 없습니다</p>
            <p style={{ fontSize: 12, margin: 0 }}>“성취기준 탐색”에서 실연할 차시의 성취기준을 골라 담아 주세요</p>
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((s) => (
              <li
                key={s.code}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#6D28D9',
                    background: '#F5F3FF',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    height: 'fit-content',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.code}
                </span>
                <span style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                  {s.content}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 다음 단계 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onNext}
          className="btn btn-primary"
          style={{ fontSize: 13, padding: '9px 18px', background: '#8B5CF6' }}
        >
          교수학습과정안으로
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  )
}
