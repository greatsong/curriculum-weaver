/**
 * (2) 성취기준을 잇는 키워드 — 행성(과목)·위성(키워드) 그래프 + 범례 + 연결 근거 목록.
 * 과목↔키워드는 얇은 선, 키워드↔키워드 연결은 두 교과색 그라데이션(가산 혼합), 연결 강도는 선 밝기.
 * 상태: 찾는 중(처음 = 행성만 / 조합 변경 = 이전 그래프 흐리게 + "이전 조합") · 결과 · 연결 0 · 오류.
 * 기본 경로는 좁거나 복잡하면 목록 모드. 실험실(navigable)은 확대·이동 가능한 지도를 유지한다.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SUBJECT_COLORS_DARK, FALLBACK_NODE_COLOR } from '../../lib/nebulaTheme'
import { nebulaLayout, LAYOUT } from '../../lib/futures/nebulaLayout'
import { measureText, fontsReady } from '../../lib/futures/measureText'
import { COPY, strengthStyle } from '../../lib/futures/copy'
import ConnectionList from './ConnectionList'
import GraphViewport from './GraphViewport'

const GRAPH_MIN_WIDTH = 1080
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

function GraphSvg({ layout, standards, activeLabel, onActive, dim }) {
  // 그래프의 노드 key는 과목(같은 과목 성취기준을 묶은 원)이므로 색은 그 원의 성취기준에서 가져온다
  const nodeColor = useMemo(() => new Map(layout.clusters.map((c) => [c.key, colorOf(c.s)])), [layout])
  const col = (k) => nodeColor.get(k) || FALLBACK_NODE_COLOR
  const activeChains = activeLabel ? layout.chains.filter((ch) => ch.c.label === activeLabel) : []
  const active = activeChains.length > 0
  const activePills = new Set(activeChains.flatMap(ch => [ch.p.id, ch.q.id]))
  return (
    <svg className={`fu-graph-svg${dim ? ' dim-all' : ''}${active ? ' has-active' : ''}`} width={layout.W} height={layout.H}
      viewBox={`0 0 ${layout.W} ${layout.H}`} aria-hidden="true">
      <defs>
        {layout.clusters.map((c, j) => (
          <radialGradient key={`pl${j}`} id={`fu-pl-${j}`} cx="38%" cy="30%" r="75%">
            <stop offset="0" stopColor={mix(col(c.key), '#0B1230', 0.55)} /><stop offset=".6" stopColor={mix(col(c.key), '#0B1230', 0.8)} /><stop offset="1" stopColor={mix(col(c.key), '#04060F', 0.88)} />
          </radialGradient>
        ))}
        {layout.clusters.map((c, j) => (
          <radialGradient key={`cl${j}`} id={`fu-cl-${j}`}>
            <stop offset="0" stopColor={col(c.key)} stopOpacity={c.iso ? 0.11 : 0.2} /><stop offset=".6" stopColor={col(c.key)} stopOpacity={c.iso ? 0.04 : 0.07} /><stop offset="1" stopColor={col(c.key)} stopOpacity="0" />
          </radialGradient>
        ))}
        {layout.chains.map((ch, n) => (
          <linearGradient key={`ln${n}`} id={`fu-ln-${n}`} gradientUnits="userSpaceOnUse" x1={ch.a0[0]} y1={ch.a0[1]} x2={ch.b0[0]} y2={ch.b0[1]}>
            <stop offset="0" stopColor={col(ch.p.key)} /><stop offset="1" stopColor={col(ch.q.key)} />
          </linearGradient>
        ))}
      </defs>
      {layout.dust.map((s, i) => <circle key={`d${i}`} cx={s.x} cy={s.y} r={s.r} fill="#8B95B8" opacity={s.a} />)}
      {layout.clusters.map((c, j) => {
        const b = c.bb
        return <ellipse key={`cg${j}`} cx={c.x + (b[0] + b[2]) / 2} cy={c.y + (b[1] + b[3]) / 2} rx={(b[2] - b[0]) / 2 + 40} ry={(b[3] - b[1]) / 2 + 34} fill={`url(#fu-cl-${j})`} />
      })}
      {/* 행성 ↔ 위성: 얇은 교과색 선 */}
      {layout.clusters.map((c) => c.spokes.map((sp, i) => (
        <line key={`sp-${c.key}-${i}`} className="fu-spoke" x1={c.x + sp[0]} y1={c.y + sp[1]} x2={c.x + sp[2]} y2={c.y + sp[3]} stroke={col(c.key)} />
      )))}
      {/* 키워드 ↔ 키워드: 두 교과색 그라데이션, 가산 혼합, 강도 = 밝기 */}
      <g className="fu-chains">
        {layout.chains.map((ch, n) => {
          const st = strengthStyle(ch.c.strength)
          const on = activeChains.includes(ch)
          return (
            <path key={`ch${n}`} className={`fu-chain${on ? ' on' : ''}`} d={`M${ch.a0[0]},${ch.a0[1]} Q${ch.ctl[0]},${ch.ctl[1]} ${ch.b0[0]},${ch.b0[1]}`}
              stroke={`url(#fu-ln-${n})`} strokeWidth={on ? st.width + 0.8 : st.width} style={{ opacity: active && !on ? 0.18 : on ? 1 : st.opacity }}
              onMouseEnter={() => onActive?.(ch.c.label)} onMouseLeave={() => onActive?.(null)} />
          )
        })}
      </g>
      {/* 과목 원: 안에 과목 이름과 그 과목의 성취기준 코드 */}
      {layout.clusters.map((c, j) => {
        const R = c.Rn, blockH = 17 * c.nameLines.length + 2 + 14 * (c.codes.length + c.isoLines.length)
        const top = c.y - blockH / 2 + 13
        return (
          <g key={`pn${j}`} className="fu-node" style={{ opacity: c.iso ? 0.85 : 1 }}
            onMouseEnter={() => { const ch = layout.chains.find((x) => x.p.key === c.key || x.q.key === c.key); if (ch) onActive?.(ch.c.label) }} onMouseLeave={() => onActive?.(null)}>
            <circle cx={c.x} cy={c.y} r={R + 10} fill={col(c.key)} opacity=".08" />
            <circle cx={c.x} cy={c.y} r={R} fill={`url(#fu-pl-${j})`} stroke={col(c.key)} strokeOpacity=".75" strokeWidth="1.5" />
            {c.nameLines.map((l, i) => <text key={l} className="fu-g-name" x={c.x} y={top + i * 17} textAnchor="middle">{l}</text>)}
            {c.codes.map((code, i) => <text key={code} className="fu-g-code" x={c.x} y={top + 17 * c.nameLines.length + 1 + i * 14} textAnchor="middle">{code}</text>)}
            {c.isoLines.map((l, i) => <text key={l} className="fu-g-iso" x={c.x} y={top + 17 * c.nameLines.length + 1 + (c.codes.length + i) * 14} textAnchor="middle">{l}</text>)}
          </g>
        )
      })}
      {/* 위성(연결 안 된 키워드) */}
      {layout.clusters.map((c) => c.stars.map((s) => {
        const sx = c.x + s.cx, sy = c.y + s.cy
        return (
          <g key={`st-${c.key}-${s.w}`} className={`fu-sat${active ? ' faded' : ''}`}>
            <circle cx={sx} cy={sy} r={LAYOUT.satR} fill={col(c.key)} /><circle cx={sx - 1.3} cy={sy - 1.3} r="1.6" fill="#fff" opacity=".45" />
            <text x={s.right ? sx + 11 : sx - 11} y={sy + 4.6} textAnchor={s.right ? 'start' : 'end'}>{s.w}</text>
          </g>
        )
      }))}
      {/* 연결된 키워드(알약) */}
      {layout.clusters.map((c) => c.pills.map((p) => {
        const px = c.x + p.b[0], py = c.y + p.b[1], color = col(c.key)
        return (
          <g key={`pl-${p.id}`} className={`fu-pill${active && !activePills.has(p.id) ? ' faded' : ''}`}
            onMouseEnter={() => onActive?.(p.cs[0].label)} onMouseLeave={() => onActive?.(null)}>
            <rect x={px} y={py} width={p.w} height={p.h} rx={p.lines.length > 1 ? 12 : 17} fill={color} fillOpacity=".1" stroke={color} strokeOpacity=".5" />
            <circle cx={px + 13 + 4.5} cy={py + p.h / 2} r="4.5" fill={color} /><circle cx={px + 13 + 3.2} cy={py + p.h / 2 - 1.3} r="1.6" fill="#fff" opacity=".45" />
            {p.lines.map((l, i) => <text key={i} x={px + 13 + 12 + (p.w - 26 - 12) / 2} y={py + (p.lines.length > 1 ? 22 + i * 20 : 22.5)} textAnchor="middle">{l}</text>)}
          </g>
        )
      }))}
      {/* 연결 이름표(테두리 없는 상자 + 종류 표시) */}
      {layout.chains.map((ch, n) => {
        if (layout.chains.findIndex(other => other.c.label === ch.c.label) !== n) return null
        const mx = ch.x - ch.cw / 2 + 11, on = activeChains.includes(ch)
        return (
          <g key={`cap${n}`} className={`fu-cap${active && !on ? ' faded' : ''}`} onMouseEnter={() => onActive?.(ch.c.label)} onMouseLeave={() => onActive?.(null)}>
            <rect x={ch.x - ch.cw / 2} y={ch.y - 10} width={ch.cw} height="20" rx="6" />
            {ch.c.kind === 'method'
              ? <circle cx={mx} cy={ch.y} r="3.6" fill="none" stroke="#7DD3FC" strokeWidth="1.5" />
              : <circle cx={mx} cy={ch.y} r="3.8" fill="#7DD3FC" />}
            <text x={mx + 8} y={ch.y + 4.5}>{ch.c.label}</text>
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
export default function KeywordGraph({ standards, bridges, activeLabel, onActive, onRetry, multiEndpoint = false, navigable = false }) {
  const panelRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [fontsTick, setFontsTick] = useState(0)
  const sig = standards.map((s) => s.key).join(',')
  const lastReady = useRef(null) // 조합이 바뀌어 다시 찾는 동안 흐리게 보여 줄 이전 결과

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return undefined
    const measure = () => setWidth(Math.max(0, Math.floor(el.clientWidth / 8) * 8))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { let alive = true; fontsReady().then(() => { if (alive) setFontsTick((x) => x + 1) }); return () => { alive = false } }, [])

  const status = bridges.status
  const data = status === 'ready' ? bridges.data : null
  const layout = useMemo(() => {
    if (!width || (!navigable && multiEndpoint && width < GRAPH_MIN_WIDTH)) return null
    if (!navigable) return nebulaLayout(standards, data, width, measureText, { multiEndpoint })
    // 실험실은 배치가 복잡해도 지도를 유지한다. 캔버스를 넓혀 가장 덜 겹치는 배치를 고른다.
    const base = Math.max(1440, width)
    const score = ({ quality: q }) => q.clusterOv * 10000 + q.forced * 1000 + q.capHit * 100 + q.lineHit
    let best = null
    for (const canvasWidth of [base, base + 240, base + 480]) {
      const candidate = nebulaLayout(standards, data, canvasWidth, measureText, { multiEndpoint, minHeight: 800 })
      if (!best || score(candidate) < score(best)) best = candidate
      if (best.ok) break
    }
    return best
  }, [sig, data, width, fontsTick, multiEndpoint, navigable]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (status === 'ready' && layout) lastReady.current = { sig, layout, standards, data } }, [status, layout, sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = useElapsed(bridges.startedAt, status === 'loading')
  const prev = status === 'loading' && lastReady.current && lastReady.current.sig !== sig ? lastReady.current : null
  const concepts = data?.concepts || []
  const isolated = data?.isolated?.length || 0
  const listMode = !navigable && width > 0 && (width < GRAPH_MIN_WIDTH || (layout && !layout.ok && status === 'ready'))
  const shown = prev || (layout ? { layout, standards } : null)

  let right = null
  if (status === 'ready') right = concepts.length ? COPY.graph.result(concepts.length, isolated) : COPY.graph.zeroRight

  return (
    <section className="fu-section fu-graph" aria-label={COPY.graph.title}>
      <div className="fu-section-head">
        <span className="fu-step">2</span>
        <h2>{COPY.graph.title}</h2>
        {right && <span className="fu-section-right">{right}</span>}
      </div>
      {status === 'ready' && concepts.length > 0 && <p className="fu-section-guide">{COPY.graph.guide}</p>}
      <div className="fu-panel fu-graph-panel" ref={panelRef}>
        {status === 'loading' && <div className="fu-panel-line">{prev ? COPY.graph.refinding(elapsed) : COPY.graph.finding(elapsed)}</div>}
        {status === 'ready' && !concepts.length && <div className="fu-panel-line">{COPY.graph.zeroLine}</div>}
        {status === 'error' && (
          <div className="fu-panel-line">{COPY.graph.errorLine} <button type="button" className="fu-ghost" onClick={onRetry}>{COPY.graph.retry}</button></div>
        )}
        {navigable && shown ? (
          <GraphViewport key={`${sig}:${shown.layout.W}:${shown.layout.H}`} layout={shown.layout} width={width}>
            {prev && <span className="fu-prev-tag">{COPY.graph.previousTag}</span>}
            <GraphSvg layout={shown.layout} standards={shown.standards} activeLabel={activeLabel} onActive={onActive} dim={!!prev} />
          </GraphViewport>
        ) : listMode && status === 'ready' ? (
          <ConnectionList standards={standards} layout={layout} bridges={data} activeLabel={activeLabel} onActive={onActive} listMode showClassification={!multiEndpoint} />
        ) : prev ? (
          <div className="fu-graph-prev">
            <span className="fu-prev-tag">{COPY.graph.previousTag}</span>
            <GraphSvg layout={prev.layout} standards={prev.standards} dim />
          </div>
        ) : layout && !listMode ? (
          <GraphSvg layout={layout} standards={standards} activeLabel={activeLabel} onActive={onActive} />
        ) : null}
        {status === 'ready' && concepts.length > 0 && !listMode && layout && (
          navigable ? <details className="fu-map-evidence" onToggle={event => { if (!event.currentTarget.open) onActive?.(null) }}>
            <summary>연결 근거 보기 <span>{concepts.length}개 연결 · 성취기준과 키워드</span></summary>
            <ConnectionList standards={standards} layout={layout} bridges={data} activeLabel={activeLabel} onActive={onActive} listMode showClassification={!multiEndpoint} />
          </details> : <ConnectionList standards={standards} layout={layout} bridges={data} activeLabel={activeLabel} onActive={onActive} showClassification={!multiEndpoint} />
        )}
      </div>
    </section>
  )
}
