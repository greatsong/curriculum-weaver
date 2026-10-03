/**
 * (2) 과목이 만나는 키워드 지도 — 과목 원(안에 과목 이름 + 성취기준 코드), 원 둘레의 키워드, 과목을 가로지르는 키워드 연결.
 * - 성취기준이 여럿인 과목은 코드마다 표식 모양(●◆▲■)이 다르고 키워드도 같은 표식을 단다(소속이 늘 보인다).
 * - 연결선은 두 교과색 그라데이션(가산 혼합), 강도는 밝기. 연결 이름은 선 가운데.
 * - 코드를 가리키면 그 성취기준의 키워드만 남고, 키워드를 가리키면 그 코드가 밝아진다. 근거 목록과 연결은 서로 강조.
 * - 패널 폭이 1,160px보다 좁으면 1,160px 기준으로 배치한 뒤 비율 축소, 720px 미만은 목록 모드.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SUBJECT_COLORS_DARK, FALLBACK_NODE_COLOR } from '../../lib/nebulaTheme'
import { ringLayout, LAYOUT } from '../../lib/futureMap/ringLayout'
import { measureText, fontsReady } from '../../lib/futureMap/measureText'
import { COPY, strengthStyle } from '../../lib/futureMap/copy'
import ConnectionList from './ConnectionList'

const GRAPH_BASE_WIDTH = 1160
const LIST_MAX_WIDTH = 720
export const colorOf = (s) => SUBJECT_COLORS_DARK[s?.subject_group] || FALLBACK_NODE_COLOR
const mix = (h, t, a) => {
  const p = (x) => parseInt(x, 16)
  const c1 = [p(h.slice(1, 3)), p(h.slice(3, 5)), p(h.slice(5, 7))], c2 = [p(t.slice(1, 3)), p(t.slice(3, 5)), p(t.slice(5, 7))]
  return '#' + c1.map((v, k) => Math.round(v + (c2[k] - v) * a).toString(16).padStart(2, '0')).join('')
}

function useElapsed(startedAt, active) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [active])
  return active && startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0
}

/** 성취기준 표식: 같은 과목 안에서 성취기준을 구분하는 작은 모양 */
export function Marker({ shape, x, y, r = 4.6, fill }) {
  if (shape === 'diamond') return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} transform={`rotate(45 ${x} ${y})`} fill={fill} />
  if (shape === 'triangle') return <polygon points={`${x},${y - r - 0.6} ${x + r + 0.4},${y + r - 0.4} ${x - r - 0.4},${y + r - 0.4}`} fill={fill} />
  if (shape === 'square') return <rect x={x - r + 0.3} y={y - r + 0.3} width={r * 2 - 0.6} height={r * 2 - 0.6} rx="1" fill={fill} />
  return <circle cx={x} cy={y} r={r} fill={fill} />
}

function GraphSvg({ layout, renderWidth, activeLabel, onActive, dim }) {
  const [activeStd, setActiveStd] = useState(null)
  const nodeColor = useMemo(() => new Map(layout.clusters.map((c) => [c.key, colorOf(c.s)])), [layout])
  const col = (k) => nodeColor.get(k) || FALLBACK_NODE_COLOR
  const active = activeLabel ? layout.chains.find((ch) => ch.c.label === activeLabel) : null
  const activeKws = new Set(active ? [active.p.id, active.q.id] : [])
  const scale = renderWidth / layout.W
  const R = layout.R
  return (
    <svg className={`fm-graph-svg${dim ? ' dim-all' : ''}${active ? ' has-active' : ''}`} width={renderWidth} height={Math.round(layout.H * scale)}
      viewBox={`0 0 ${layout.W} ${layout.H}`} aria-hidden="true" onMouseLeave={() => setActiveStd(null)}>
      <defs>
        {layout.clusters.map((c, j) => (
          <radialGradient key={`pl${j}`} id={`fm-pl-${j}`} cx="36%" cy="30%" r="78%">
            <stop offset="0" stopColor={mix(col(c.key), '#0B1230', 0.45)} /><stop offset=".55" stopColor={mix(col(c.key), '#0B1230', 0.78)} /><stop offset="1" stopColor={mix(col(c.key), '#04060F', 0.9)} />
          </radialGradient>
        ))}
        {layout.clusters.map((c, j) => (
          <radialGradient key={`cl${j}`} id={`fm-cl-${j}`}>
            <stop offset="0" stopColor={col(c.key)} stopOpacity={c.iso ? 0.1 : 0.17} /><stop offset=".6" stopColor={col(c.key)} stopOpacity={c.iso ? 0.035 : 0.06} /><stop offset="1" stopColor={col(c.key)} stopOpacity="0" />
          </radialGradient>
        ))}
        {layout.chains.map((ch, n) => (
          <linearGradient key={`ln${n}`} id={`fm-ln-${n}`} gradientUnits="userSpaceOnUse" x1={ch.a0[0]} y1={ch.a0[1]} x2={ch.b0[0]} y2={ch.b0[1]}>
            <stop offset="0" stopColor={col(ch.p.nodeKey)} /><stop offset="1" stopColor={col(ch.q.nodeKey)} />
          </linearGradient>
        ))}
      </defs>
      {layout.dust.map((s, i) => <circle key={`d${i}`} cx={s.x} cy={s.y} r={s.r} fill="#8B95B8" opacity={s.a} />)}
      {/* 과목 덩어리 구름 */}
      {layout.clusters.map((c, j) => {
        const b = c.bbAbs
        return <ellipse key={`cg${j}`} cx={(b[0] + b[2]) / 2} cy={(b[1] + b[3]) / 2} rx={(b[2] - b[0]) / 2 + 36} ry={(b[3] - b[1]) / 2 + 30} fill={`url(#fm-cl-${j})`} />
      })}
      {/* 원 ↔ 키워드: 얇은 교과색 선 */}
      {layout.clusters.map((c) => c.spokes.map((sp, i) => (
        <line key={`sp-${c.key}-${i}`} className={`fm-spoke${activeStd && c.kws.find((k) => k.id === sp[4])?.stdKey !== activeStd ? ' dim-std' : ''}`}
          x1={c.x + sp[0]} y1={c.y + sp[1]} x2={c.x + sp[2]} y2={c.y + sp[3]} stroke={col(c.key)} />
      )))}
      {/* 키워드 ↔ 키워드: 두 교과색 그라데이션, 가산 혼합, 강도 = 밝기 */}
      <g className="fm-chains">
        {layout.chains.map((ch, n) => {
          const st = strengthStyle(ch.c.strength)
          const on = active === ch
          return (
            <path key={`ch${n}`} className={`fm-chain${on ? ' on' : ''}`} d={`M${ch.a0[0]},${ch.a0[1]} Q${ch.ctl[0]},${ch.ctl[1]} ${ch.b0[0]},${ch.b0[1]}`}
              stroke={`url(#fm-ln-${n})`} strokeWidth={on ? st.width + 0.9 : st.width} style={{ opacity: active && !on ? 0.16 : on ? 1 : st.opacity }}
              onMouseEnter={() => onActive?.(ch.c.label)} onMouseLeave={() => onActive?.(null)} />
          )
        })}
      </g>
      {/* 과목 원: 과목 이름 + 성취기준 코드(표식 모양) */}
      {layout.clusters.map((c, j) => {
        const lines = c.nameLines.length, codes = c.codes.length
        const blockH = 18 * lines + 3 + 14 * codes + (c.iso ? 14 : 0)
        const top = c.y - blockH / 2 + 14
        const codeW = Math.max(...c.codes.map((k) => measureText(k.code, "400 11px ui-monospace, Menlo, monospace")))
        return (
          <g key={`pn${j}`} className="fm-node" style={{ opacity: c.iso ? 0.88 : 1 }}>
            <circle cx={c.x} cy={c.y} r={R + 9} fill={col(c.key)} opacity=".07" />
            <circle cx={c.x} cy={c.y} r={R} fill={`url(#fm-pl-${j})`} stroke={col(c.key)} strokeOpacity=".7" strokeWidth="1.5" />
            {c.nameLines.map((l, i) => <text key={l} className="fm-g-name" x={c.x} y={top + i * 18} textAnchor="middle">{l}</text>)}
            {c.codes.map((k, i) => {
              const y = top + 18 * lines + 2 + i * 14
              const x0 = c.x - (codeW + 14) / 2
              const on = activeStd === k.key
              return (
                <g key={k.code} className={`fm-g-coderow${on ? ' on' : ''}${activeStd && !on ? ' dim-std' : ''}`} onMouseEnter={() => setActiveStd(k.key)} onMouseLeave={() => setActiveStd(null)}>
                  <rect x={x0 - 4} y={y - 11} width={codeW + 22} height="14" fill="transparent" />
                  <Marker shape={k.shape} x={x0 + 4} y={y - 4} r={3.6} fill={col(c.key)} />
                  <text className="fm-g-code" x={x0 + 14} y={y}>{k.code}</text>
                </g>
              )
            })}
            {c.iso && <text className="fm-g-iso" x={c.x} y={top + 18 * lines + 2 + codes * 14} textAnchor="middle">{COPY.graph.isolated}</text>}
          </g>
        )
      })}
      {/* 연결 안 된 키워드: 표식 + 글자 */}
      {layout.clusters.map((c) => c.kws.filter((kw) => !kw.linked).map((kw) => {
        const b = kw.box
        const tx = kw.side === 'r' ? b[0] : kw.side === 'l' ? b[2] : (b[0] + b[2]) / 2
        const anchor = kw.side === 'r' ? 'start' : kw.side === 'l' ? 'end' : 'middle'
        const ty = (b[1] + b[3]) / 2 + 4.8
        return (
          <g key={`st-${kw.id}`} className={`fm-sat${active ? ' faded' : ''}${activeStd && activeStd !== kw.stdKey ? ' dim-std' : ''}`}
            onMouseEnter={() => setActiveStd(kw.stdKey)} onMouseLeave={() => setActiveStd(null)}>
            <Marker shape={kw.shape} x={kw.x} y={kw.y} r={4.6} fill={col(c.key)} />
            <circle cx={kw.x - 1.3} cy={kw.y - 1.3} r="1.5" fill="#fff" opacity=".4" />
            <text x={tx} y={ty} textAnchor={anchor}>{kw.word}</text>
          </g>
        )
      }))}
      {/* 연결된 키워드(알약): 표식 + 굵은 글자 */}
      {layout.clusters.map((c) => c.kws.filter((kw) => kw.linked).map((kw) => {
        const b = kw.box, color = col(c.key), w = b[2] - b[0], h = b[3] - b[1]
        const cy = (b[1] + b[3]) / 2
        return (
          <g key={`pl-${kw.id}`} className={`fm-pill${active && !activeKws.has(kw.id) ? ' faded' : ''}${activeStd && activeStd !== kw.stdKey ? ' dim-std' : ''}`}
            onMouseEnter={() => { setActiveStd(kw.stdKey); onActive?.(kw.cs[0]?.label) }} onMouseLeave={() => { setActiveStd(null); onActive?.(null) }}>
            <rect x={b[0]} y={b[1]} width={w} height={h} rx={h / 2} fill={color} fillOpacity=".12" stroke={color} strokeOpacity=".55" />
            <Marker shape={kw.shape} x={b[0] + LAYOUT.pillPadX + 5} y={cy} r={4.6} fill={color} />
            <text x={b[0] + LAYOUT.pillPadX + LAYOUT.pillDot + 1} y={cy + 5.2}>{kw.word}</text>
          </g>
        )
      }))}
      {/* 연결 이름표(테두리 없는 상자 + 종류 표시) */}
      {layout.chains.map((ch, n) => {
        const on = active === ch, x0 = ch.x - ch.cw / 2, y0 = ch.y - ch.ch / 2, mx = x0 + 11
        return (
          <g key={`cap${n}`} className={`fm-cap${active && !on ? ' faded' : ''}`} onMouseEnter={() => onActive?.(ch.c.label)} onMouseLeave={() => onActive?.(null)}>
            <rect x={x0} y={y0} width={ch.cw} height={ch.ch} rx="6" />
            {ch.c.kind === 'method'
              ? <circle cx={mx} cy={ch.y} r="3.6" fill="none" stroke="#7DD3FC" strokeWidth="1.5" />
              : <circle cx={mx} cy={ch.y} r="3.8" fill="#7DD3FC" />}
            {ch.capLines.map((l, i) => <text key={i} x={mx + 8} y={ch.capLines.length > 1 ? y0 + 14 + i * 15 : ch.y + 4.5}>{l}</text>)}
          </g>
        )
      })}
    </svg>
  )
}

/**
 * @param {object[]} standards 고른 성취기준(2개 이상)
 * @param {{status: 'loading'|'ready'|'error', data: object|null, startedAt: number}} bridges
 */
export default function KeywordGraph({ standards, bridges, activeLabel, onActive, onRetry }) {
  const panelRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [fontsTick, setFontsTick] = useState(0)
  const sig = standards.map((s) => s.key).join(',')
  const lastReady = useRef(null)

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return undefined
    const measure = () => setWidth(Math.max(320, Math.round(el.clientWidth / 8) * 8))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { let alive = true; fontsReady().then(() => { if (alive) setFontsTick((x) => x + 1) }); return () => { alive = false } }, [])

  const status = bridges.status
  const data = status === 'ready' ? bridges.data : null
  const layoutWidth = Math.max(width, GRAPH_BASE_WIDTH)
  const layout = useMemo(() => (width ? ringLayout(standards, data, layoutWidth, measureText) : null), [sig, data, layoutWidth, fontsTick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (status === 'ready' && layout) lastReady.current = { sig, layout, standards, data } }, [status, layout, sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = useElapsed(bridges.startedAt, status === 'loading')
  const prev = status === 'loading' && lastReady.current && lastReady.current.sig !== sig ? lastReady.current : null
  const concepts = data?.concepts || []
  const isolated = data?.isolated?.length || 0
  const listMode = width > 0 && width < LIST_MAX_WIDTH

  let right = null
  if (status === 'ready') right = concepts.length ? COPY.graph.result(concepts.length, isolated) : COPY.graph.zeroRight

  return (
    <section className="fm-section fm-graph" aria-label={COPY.graph.title}>
      <div className="fm-section-head">
        <span className="fm-step">2</span>
        <h2>{COPY.graph.title}</h2>
        {right && <span className="fm-section-right">{right}</span>}
      </div>
      {status === 'ready' && concepts.length > 0 && <p className="fm-section-guide">{COPY.graph.guide}</p>}
      <div className="fm-panel fm-graph-panel" ref={panelRef}>
        {status === 'loading' && <div className="fm-panel-line">{prev ? COPY.graph.refinding(elapsed) : COPY.graph.finding(elapsed)}</div>}
        {status === 'ready' && !concepts.length && <div className="fm-panel-line">{COPY.graph.zeroLine}</div>}
        {status === 'error' && (
          <div className="fm-panel-line">{COPY.graph.errorLine} <button type="button" className="fm-ghost" onClick={onRetry}>{COPY.graph.retry}</button></div>
        )}
        {listMode && status === 'ready' ? (
          <ConnectionList standards={standards} layout={layout} bridges={data} activeLabel={activeLabel} onActive={onActive} listMode />
        ) : prev ? (
          <div className="fm-graph-prev">
            <span className="fm-prev-tag">{COPY.graph.previousTag}</span>
            <GraphSvg layout={prev.layout} renderWidth={width} dim />
          </div>
        ) : layout && !listMode ? (
          <GraphSvg layout={layout} renderWidth={width} activeLabel={activeLabel} onActive={onActive} />
        ) : null}
        {status === 'ready' && concepts.length > 0 && !listMode && layout && (
          <ConnectionList standards={standards} layout={layout} bridges={data} activeLabel={activeLabel} onActive={onActive} />
        )}
      </div>
    </section>
  )
}
