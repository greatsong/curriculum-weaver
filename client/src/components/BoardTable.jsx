import TableScrollFrame from './TableScrollFrame'

/**
 * 보드 읽기 화면의 표(표 칸, 두 칸 이상인 목록).
 * 열이 많은 표(학습 활동·수업 지도안 단계·자료 목록은 8열)에서 긴 글 칸이 몇 글자 폭으로 좁아져
 * 한 행이 수십 줄로 늘어졌다(2026-10-13). 열이 많은 표는 긴 글 칸에 최소 너비를 두고, 표가 틀보다 넓어지면
 * 틀 안에서 옆으로 스크롤하고, 가려진 칸이 있는 쪽 가장자리에 그림자를 그린다(편집 화면 표와 같은 방식).
 */
export default function BoardTable({ columns, data }) {
  if (!Array.isArray(data) || data.length === 0) return null
  const wide = columns.length >= WIDE_TABLE_COLUMNS
  return (
    <TableScrollFrame style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#64748B', borderBottom: '2px solid #CBD5E1', width: 32 }}>#</th>
            {columns.map((col) => (
              <th key={col.name} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', borderBottom: '2px solid #CBD5E1' }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={{
              background: i % 2 === 0 ? '#fff' : '#F8FAFC',
              borderBottom: i < data.length - 1 ? '1px solid #E2E8F0' : 'none',
              transition: 'background 0.15s',
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#EFF6FF'}
              onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#F8FAFC'}
            >
              {/* 위쪽 정렬 — 긴 행에서 가운데 정렬이면 짧은 칸(날짜 등)이 행 중간에 떠서 비어 보였다 */}
              <td style={{ textAlign: 'center', padding: '10px 8px', fontSize: 11, color: '#94A3B8', fontWeight: 600, verticalAlign: 'top' }}>{i + 1}</td>
              {columns.map((col) => {
                const text = String(row[col.name] ?? row[col.label] ?? '')
                const minWidth = wide ? cellMinWidth(text) : null
                return (
                  <td key={col.name} style={{ padding: '10px 12px', color: 'var(--color-text-primary)', lineHeight: 1.5, verticalAlign: 'top', whiteSpace: text.length <= 8 ? 'nowrap' : 'normal' }}>
                    {/* 표 칸(td)의 min-width는 브라우저마다 다르게 처리해 안쪽 블록에 둔다 */}
                    {minWidth ? <div style={{ minWidth }}>{text}</div> : text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScrollFrame>
  )
}

// 최소 너비는 열이 이만큼 이상인 표에만 둔다. 4열 이하(주제 후보·교과별 수업목표 등)는 틀 안에 맞춰도
// 칸이 충분히 넓어 종전대로 둔다(최소 너비를 두면 오히려 옆으로 넘쳐 스크롤이 생겼다).
const WIDE_TABLE_COLUMNS = 5

/**
 * 열이 많은 표에서 긴 글 칸의 최소 너비(px). 교과명·이름·차시처럼 짧은 칸(8자 이하)은
 * 줄바꿈하지 않으므로(좁은 화면에서 한 글자씩 세로로 쪼개지던 것 방지) 최소 너비가 필요 없다.
 */
export function cellMinWidth(text) {
  if (text.length <= 8) return null
  return text.length <= 30 ? 140 : 200
}
