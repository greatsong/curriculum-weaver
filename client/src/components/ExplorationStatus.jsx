/** 탐색 대상과 저장 상태를 분리해, 후보 선택을 프로젝트 저장으로 오인하지 않게 한다. */
export default function ExplorationStatus({ target = '새 프로젝트를 위한 탐색', status = '검토 중 · 프로젝트에 저장되지 않음', children, dark = false }) {
  return <aside aria-label="탐색 대상과 반영 상태" style={{ padding: '12px 16px', flexShrink: 0, borderBottom: `1px solid ${dark ? '#345148' : '#d7e5ef'}`, background: dark ? '#0c1c20' : '#f0f7fc', color: dark ? '#d8eee5' : '#264760', fontSize: 13, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', justifyContent: 'space-between' }}><strong>{target}</strong><span aria-live="polite">{status}</span></div>
    {children && <div style={{ marginTop: 4, fontSize: 12 }}>{children}</div>}
  </aside>
}
