/**
 * 키워드 성운 — 고른 성취기준이 서로 어떤 키워드에서 만나는지 보여 준다.
 * 성취기준 = 교과 색의 옅은 성운, 둘레의 별 = 원문 키워드, 만나는 키워드끼리 초록 선과 연결 이름.
 * 키워드가 잘 읽히는 것이 먼저다(큰 글씨, 어두운 테두리). 움직임은 처음 한 번 나타나는 정도만.
 */
import { useMemo } from 'react'
import { NEBULA_VIEW, colorOfStandard, nebulaLayout, shortSubject } from '../../lib/futures'

export default function KeywordNebula({ standards, bridges, status }) {
  const layout = useMemo(() => nebulaLayout(standards, status === 'ready' ? bridges : null), [standards, bridges, status])
  const isolated = status === 'ready' ? (bridges?.isolated || []).length : 0
  const ready = status === 'ready'

  return (
    <section className="fu-nebula" aria-label="성취기준이 만나는 키워드">
      <div className="fu-section-head">
        <h2>성취기준이 만나는 키워드</h2>
        <span className="fu-section-sub">
          {status === 'loading' && <span className="fu-pulse">만나는 키워드를 찾는 중…</span>}
          {ready && (layout.links.length
            ? <>만나는 지점 <b>{layout.links.length}</b>곳{isolated ? ` · 이어지지 않은 성취기준 ${isolated}개` : ''}</>
            : '뚜렷하게 만나는 키워드는 찾지 못했습니다. 성취기준마다의 관점으로 미래를 그립니다.')}
          {status === 'error' && '키워드를 찾지 못했습니다. 미래는 성취기준만으로 그립니다.'}
        </span>
      </div>
      <div className="fu-nebula-scroll">
      <svg className={`fu-nebula-svg${ready ? ' ready' : ''}`} viewBox={`0 0 ${NEBULA_VIEW.w} ${NEBULA_VIEW.h}`} role="img"
        aria-label={layout.links.map((l) => `${l.label}: ${l.words.join(', ')}`).join(' / ') || '성취기준 성운'}>
        <defs>
          <filter id="fu-neb-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26" /></filter>
          <filter id="fu-neb-glow" filterUnits="userSpaceOnUse" x="0" y="0" width={NEBULA_VIEW.w} height={NEBULA_VIEW.h}>
            <feGaussianBlur stdDeviation="2.6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {standards.map((s, i) => (
            <radialGradient key={s.key} id={`fu-neb-${i}`}>
              <stop offset="0%" stopColor={colorOfStandard(s)} stopOpacity=".42" />
              <stop offset="60%" stopColor={colorOfStandard(s)} stopOpacity=".12" />
              <stop offset="100%" stopColor={colorOfStandard(s)} stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id="fu-neb-meet"><stop offset="0%" stopColor="#2BF59B" stopOpacity=".35" /><stop offset="100%" stopColor="#2BF59B" stopOpacity="0" /></radialGradient>
        </defs>

        {/* 성운(교과 색 구름) */}
        <g className="fu-neb-clouds">
          {layout.centers.map((c, i) => (
            <g key={standards[i].key} style={{ '--d': `${i * 120}ms` }} className="fu-neb-cloud">
              <ellipse cx={c.x} cy={c.y} rx="150" ry="120" fill={`url(#fu-neb-${i})`} filter="url(#fu-neb-blur)" />
              <ellipse cx={c.x + 34} cy={c.y - 18} rx="90" ry="70" fill={`url(#fu-neb-${i})`} filter="url(#fu-neb-blur)" opacity=".8" />
            </g>
          ))}
          {layout.links.map((l) => <circle key={l.label} cx={l.hx} cy={l.hy} r="70" fill="url(#fu-neb-meet)" className="fu-neb-meetglow" style={{ '--d': `${400 + l.n * 220}ms` }} />)}
        </g>

        {/* 성취기준 중심 → 자기 키워드 (옅은 선) */}
        <g className="fu-neb-spokes">
          {layout.keywords.map((k) => <line key={`${k.key}|${k.word}`} x1={layout.centers[k.i].x} y1={layout.centers[k.i].y} x2={k.x} y2={k.y} />)}
        </g>

        {/* 만나는 키워드를 잇는 초록 선 */}
        <g className="fu-neb-links">
          {layout.links.map((l) => (
            <g key={l.label} style={{ '--d': `${350 + l.n * 220}ms` }}>
              {l.paths.map((d) => <path key={d} d={d} pathLength="1" filter="url(#fu-neb-glow)" />)}
            </g>
          ))}
        </g>

        {/* 성취기준 이름 */}
        {layout.centers.map((c, i) => (
          <g key={standards[i].key} className="fu-neb-std" style={{ '--c': colorOfStandard(standards[i]) }}>
            <circle cx={c.x} cy={c.y} r="5" />
            <text x={c.x} y={c.y + 24} className="fu-neb-subject">{shortSubject(standards[i])}</text>
            <text x={c.x} y={c.y + 41} className="fu-neb-code">{standards[i].code}</text>
          </g>
        ))}

        {/* 키워드 별 */}
        {layout.keywords.map((k, n) => {
          const dx = k.anchor === 'start' ? 10 : k.anchor === 'end' ? -10 : 0
          const dy = k.anchor === 'middle' ? (k.below ? 22 : -12) : 5
          return (
            <g key={`${k.key}|${k.word}`} className={`fu-neb-kw${k.hit ? ' hit' : ''}`} style={{ '--d': `${n * 45}ms` }}>
              <circle cx={k.x} cy={k.y} r={k.hit ? 4.6 : 3} />
              <text x={k.x + dx} y={k.y + dy} textAnchor={k.anchor}>{k.word}</text>
            </g>
          )
        })}

        {/* 연결 이름 */}
        {layout.links.map((l) => (
          <g key={l.label} className="fu-neb-label" transform={`translate(${l.hx} ${l.hy})`} style={{ '--d': `${700 + l.n * 220}ms` }}>
            <title>{l.why}</title>
            <rect x={-l.w / 2} y="-14" width={l.w} height="28" rx="14" />
            <text y="5" textAnchor="middle">{l.label}</text>
          </g>
        ))}
      </svg>
      </div>
    </section>
  )
}
