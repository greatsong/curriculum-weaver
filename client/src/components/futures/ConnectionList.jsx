/**
 * 범례 + 연결 근거 목록(그래프의 텍스트 대안). 줄을 가리키거나 포커스하면 그래프의 그 연결이 강조된다.
 * listMode: 그래프 대신 연결마다 "과목 · [키워드] ── [키워드] · 과목" 한 줄 + 성취기준별 키워드 묶음(좁은 화면·배치 실패).
 */
import React from 'react'
import { COPY, strengthStyle } from '../../lib/futures/copy'
import { shortSubject } from '../../lib/futures/nebulaLayout'
import { colorOf } from './KeywordGraph'

function KindMark({ kind }) {
  return <span className={`fu-kind-mark ${kind === 'method' ? 'method' : 'same'}`} aria-hidden="true" />
}

export default function ConnectionList({ standards, layout, bridges, activeLabel, onActive, listMode = false, showClassification = true }) {
  const byKey = new Map(standards.map((s) => [s.key, s]))
  // 목록 순서: 그래프 배치의 처리 순서(긴 연결 먼저). 같은 과목 안 연결처럼 그래프에 없는 것은 뒤에
  const drawn = [...new Set((layout?.chains || []).map((ch) => ch.c.src || ch.c))]
  const rest = (bridges?.concepts || []).filter((c) => !drawn.includes(c))
  const rows = [...drawn, ...rest]
  const endInfo = (e) => { const s = byKey.get(e.key); return { subject: shortSubject(s), word: e.word, color: colorOf(s) } }

  return (
    <div className={`fu-conn${listMode ? ' list-mode' : ''}${activeLabel ? ' has-active' : ''}`}>
      <div className="fu-legend">
        <span><span className="fu-legend-pill">{COPY.graph.legendKeyword}</span>{COPY.graph.legendKeywordNote}</span>
        <span><span className="fu-legend-name">{COPY.graph.legendName}</span>{COPY.graph.legendNameNote}</span>
        {showClassification && <span className="fu-legend-strength"><i className="s3" /><i className="s2" /><i className="s1" />{COPY.graph.legendStrength}</span>}
        {showClassification && <span className="fu-legend-kinds"><KindMark kind="same" />{COPY.graph.legendSame}<KindMark kind="method" />{COPY.graph.legendMethod}</span>}
      </div>
      <div className="fu-conn-title">{COPY.graph.listTitle}</div>
      <div className="fu-conn-rows">
        {rows.map((c) => {
          const [a, b] = c.ends.map(endInfo)
          const on = activeLabel === c.label
          return (
            <div key={c.label} className={`fu-conn-row${on ? ' on' : ''}`} tabIndex={0} aria-label={COPY.graph.rowAria(c, a, b)}
              onMouseEnter={() => onActive?.(c.label)} onMouseLeave={() => onActive?.(null)} onFocus={() => onActive?.(c.label)} onBlur={() => onActive?.(null)}>
              {!showClassification ? (
                <div className="fu-conn-l1">
                  <span className="fu-conn-name">{c.label}</span>
                  {c.ends.map((e, i) => { const info = endInfo(e); return <span className="fu-end" key={`${e.key}:${e.word}`}><i style={{ background: info.color }} />{info.subject} <code>{byKey.get(e.key)?.code}</code> <b>‘{info.word}’</b>{i < c.ends.length - 1 ? ' ↔' : ''}</span> })}
                </div>
              ) : listMode ? (
                <>
                  <div className="fu-conn-l1"><KindMark kind={c.kind} /><span className="fu-conn-name">{c.label}</span>
                    <span className="fu-tag">{COPY.graph.kind[c.kind] || COPY.graph.kind.same}</span><span className={`fu-tag s${c.strength || 2}`}>{COPY.graph.strength[c.strength] || COPY.graph.strength[2]}</span></div>
                  <div className="fu-bridge-line">
                    <span className="fu-end"><i style={{ background: a.color }} />{a.subject} <b className="fu-mini-pill" style={{ '--c': a.color }}>{a.word}</b></span>
                    <span className="fu-bridge-bar" style={{ background: `linear-gradient(90deg, ${a.color}, ${b.color})`, opacity: strengthStyle(c.strength).opacity }} />
                    <span className="fu-end"><b className="fu-mini-pill" style={{ '--c': b.color }}>{b.word}</b> {b.subject}<i style={{ background: b.color }} /></span>
                  </div>
                </>
              ) : (
                <div className="fu-conn-l1">
                  <KindMark kind={c.kind} /><span className="fu-conn-name">{c.label}</span>
                  <span className="fu-end"><i style={{ background: a.color }} />{a.subject} <b>‘{a.word}’</b></span>,
                  <span className="fu-end"><i style={{ background: b.color }} />{b.subject} <b>‘{b.word}’</b></span>
                  <span className="fu-tags"><span className="fu-tag">{COPY.graph.kind[c.kind] || COPY.graph.kind.same}</span><span className={`fu-tag s${c.strength || 2}`}>{COPY.graph.strength[c.strength] || COPY.graph.strength[2]}</span></span>
                </div>
              )}
              <div className="fu-conn-why">{c.why}</div>
            </div>
          )
        })}
      </div>
      {listMode && (
        <div className="fu-conn-groups">
          {standards.map((s) => {
            const words = bridges?.keywords?.[s.key] || []
            const linked = new Set(rows.flatMap((c) => c.ends.filter((e) => e.key === s.key).map((e) => e.word)))
            const iso = rows.length > 0 && linked.size === 0
            return (
              <div key={s.key} className="fu-conn-group">
                <span className="fu-end"><i style={{ background: colorOf(s) }} />{shortSubject(s)} <code>{s.code}</code></span>
                {words.map((w) => (linked.has(w) ? <b key={w} className="fu-mini-pill" style={{ '--c': colorOf(s) }}>{w}</b> : <span key={w} className="fu-mini-word">{w}</span>))}
                {iso && <span className="fu-mini-word">{COPY.graph.isolated}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
