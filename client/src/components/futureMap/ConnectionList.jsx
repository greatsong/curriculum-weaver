/**
 * 범례 + 연결 근거 목록(그래프의 텍스트 대안). 줄을 가리키거나 포커스하면 그래프의 그 연결이 강조된다.
 * listMode: 그래프 대신 연결마다 "과목 · [키워드] ── [키워드] · 과목" 한 줄 + 성취기준별 키워드 묶음(좁은 화면·배치 실패).
 */
import { COPY, strengthStyle } from '../../lib/futureMap/copy'
import { shortSubject } from '../../lib/futureMap/ringLayout'
import { colorOf } from './KeywordGraph'

function KindMark({ kind }) {
  return <span className={`fm-kind-mark ${kind === 'method' ? 'method' : 'same'}`} aria-hidden="true" />
}

export default function ConnectionList({ standards, layout, bridges, activeLabel, onActive, listMode = false }) {
  const byKey = new Map(standards.map((s) => [s.key, s]))
  // 목록 순서: 지도 배치의 처리 순서(긴 연결 먼저). 같은 과목 안의 연결(지도에 선이 없음)은 따로 묶는다
  const drawn = (layout?.chains || []).map((ch) => ch.c.src || ch.c)
  const inner = new Set(layout?.innerConcepts || [])
  const rest = (bridges?.concepts || []).filter((c) => !drawn.includes(c) && !inner.has(c))
  const rows = [...drawn, ...rest]
  const innerRows = (bridges?.concepts || []).filter((c) => inner.has(c))
  const multiStd = standards.some((s) => standards.filter((x) => x.subject === s.subject).length > 1)
  const endInfo = (e) => { const s = byKey.get(e.key); return { subject: shortSubject(s), word: e.word, color: colorOf(s) } }

  const renderRow = (c) => {
          const [a, b] = c.ends.map(endInfo)
          const on = activeLabel === c.label
          return (
            <div key={c.label} className={`fm-conn-row${on ? ' on' : ''}`} tabIndex={0} aria-label={COPY.graph.rowAria(c, a, b)}
              onMouseEnter={() => onActive?.(c.label)} onMouseLeave={() => onActive?.(null)} onFocus={() => onActive?.(c.label)} onBlur={() => onActive?.(null)}>
              {listMode ? (
                <>
                  <div className="fm-conn-l1"><KindMark kind={c.kind} /><span className="fm-conn-name">{c.label}</span>
                    <span className="fm-tag">{COPY.graph.kind[c.kind] || COPY.graph.kind.same}</span><span className={`fm-tag s${c.strength || 2}`}>{COPY.graph.strength[c.strength] || COPY.graph.strength[2]}</span></div>
                  <div className="fm-bridge-line">
                    <span className="fm-end"><i style={{ background: a.color }} />{a.subject} <b className="fm-mini-pill" style={{ '--c': a.color }}>{a.word}</b></span>
                    <span className="fm-bridge-bar" style={{ background: `linear-gradient(90deg, ${a.color}, ${b.color})`, opacity: strengthStyle(c.strength).opacity }} />
                    <span className="fm-end"><b className="fm-mini-pill" style={{ '--c': b.color }}>{b.word}</b> {b.subject}<i style={{ background: b.color }} /></span>
                  </div>
                </>
              ) : (
                <div className="fm-conn-l1">
                  <KindMark kind={c.kind} /><span className="fm-conn-name">{c.label}</span>
                  <span className="fm-end"><i style={{ background: a.color }} />{a.subject} <b>‘{a.word}’</b></span>,
                  <span className="fm-end"><i style={{ background: b.color }} />{b.subject} <b>‘{b.word}’</b></span>
                  <span className="fm-tags"><span className="fm-tag">{COPY.graph.kind[c.kind] || COPY.graph.kind.same}</span><span className={`fm-tag s${c.strength || 2}`}>{COPY.graph.strength[c.strength] || COPY.graph.strength[2]}</span></span>
                </div>
              )}
              <div className="fm-conn-why">{c.why}</div>
            </div>
          )
  }

  return (
    <div className={`fm-conn${listMode ? ' list-mode' : ''}${activeLabel ? ' has-active' : ''}`}>
      <div className="fm-legend">
        <span><span className="fm-legend-pill">{COPY.graph.legendKeyword}</span>{COPY.graph.legendKeywordNote}</span>
        <span><span className="fm-legend-name">{COPY.graph.legendName}</span>{COPY.graph.legendNameNote}</span>
        <span className="fm-legend-strength"><i className="s3" /><i className="s2" /><i className="s1" />{COPY.graph.legendStrength}</span>
        {multiStd && <span className="fm-legend-shapes"><i className="sh-circle" /><i className="sh-diamond" /><i className="sh-triangle" />{COPY.graph.legendShape}</span>}
        <span className="fm-legend-kinds"><KindMark kind="same" />{COPY.graph.legendSame}<KindMark kind="method" />{COPY.graph.legendMethod}</span>
      </div>
      <div className="fm-conn-title">{COPY.graph.listTitle}</div>
      <div className="fm-conn-rows">
        {rows.map((c) => renderRow(c))}
      </div>
      {innerRows.length > 0 && (
        <>
          <div className="fm-conn-title">{COPY.graph.innerTitle}</div>
          <div className="fm-conn-rows">{innerRows.map((c) => renderRow(c))}</div>
        </>
      )}
      {listMode && (
        <div className="fm-conn-groups">
          {standards.map((s) => {
            const words = bridges?.keywords?.[s.key] || []
            const linked = new Set(rows.flatMap((c) => c.ends.filter((e) => e.key === s.key).map((e) => e.word)))
            const iso = rows.length > 0 && linked.size === 0
            return (
              <div key={s.key} className="fm-conn-group">
                <span className="fm-end"><i style={{ background: colorOf(s) }} />{shortSubject(s)} <code>{s.code}</code></span>
                {words.map((w) => (linked.has(w) ? <b key={w} className="fm-mini-pill" style={{ '--c': colorOf(s) }}>{w}</b> : <span key={w} className="fm-mini-word">{w}</span>))}
                {iso && <span className="fm-mini-word">{COPY.graph.isolated}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
