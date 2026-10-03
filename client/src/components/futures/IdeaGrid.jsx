/**
 * (3) 관점별 수업 아이디어 — 3×3 격자, 가운데 칸은 "이번 조합의 연결". 카드 = 관점 + 제목 + 설명(2문장) + 연결 + 비중이 작은 성취기준.
 */
import { School, MapPin, Earth, Palette, Briefcase, ChartColumn, FlaskConical, ScrollText } from 'lucide-react'
import { COPY, LENSES, IDEA_AREAS } from '../../lib/futures/copy'
import { shortSubject } from '../../lib/futures/nebulaLayout'
import { colorOf } from './KeywordGraph'

const ICONS = { School, MapPin, Earth, Palette, Briefcase, ChartColumn, FlaskConical, ScrollText }

// 설명 속 축 키워드를 원문 그대로 있을 때만 강조(비슷한 말은 추측하지 않는다)
function Highlighted({ text, words }) {
  const list = [...new Set(words)].filter(Boolean).sort((a, b) => b.length - a.length)
  if (!list.length) return text
  const parts = []
  let rest = String(text)
  while (rest) {
    let hit = null
    for (const w of list) { const i = rest.indexOf(w); if (i >= 0 && (!hit || i < hit.i)) hit = { i, w } }
    if (!hit) { parts.push(rest); break }
    if (hit.i > 0) parts.push(rest.slice(0, hit.i))
    parts.push(<mark key={parts.length}>{hit.w}</mark>)
    rest = rest.slice(hit.i + hit.w.length)
  }
  return parts
}

function useSeconds(startedAt) { return startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0 }

function IdeaCard({ k, state, conceptByLabel, subjectOfKey, sameAxis, active, onActive, onStart, onRetry }) {
  const lens = LENSES[k], Icon = ICONS[lens.icon]
  const f = state?.status === 'ready' ? state.data : null
  const seconds = useSeconds(state?.status === 'loading' ? state.startedAt : 0)
  const axis = (f?.axis || []).filter((l) => conceptByLabel.has(l))
  const axisWords = axis.flatMap((l) => conceptByLabel.get(l).ends.map((e) => e.word))
  const pitch = f ? (f.pitch || [f.activity, f.product].filter(Boolean).join(' ')) : ''
  const light = (f?.light_keys || []).map(subjectOfKey).filter(Boolean)
  const usesActive = active && axis.includes(active)
  return (
    <article className={`fu-idea ${state?.status || 'idle'}${usesActive ? ' uses-active' : ''}${active && !usesActive && f ? ' muted' : ''}`} style={{ gridArea: IDEA_AREAS[k] }}
      onMouseEnter={() => axis[0] && onActive?.(axis[0])} onMouseLeave={() => onActive?.(null)}>
      <div className="fu-idea-lens" title={lens.tip}><Icon size={14} strokeWidth={2} aria-hidden="true" />{lens.label}</div>
      {f ? (
        <>
          <h3>{f.title}</h3>
          <p className="fu-idea-pitch"><Highlighted text={pitch} words={axisWords} /></p>
          <div className="fu-idea-foot">
            <div className="fu-idea-info">
              {axis.length > 0 && !sameAxis && (
                <div className="fu-idea-axis"><span>{COPY.ideas.axisLine}</span>{axis.map((l, i) => (
                  <span key={l} className="fu-idea-axis-item"><span className={`fu-kind-mark ${conceptByLabel.get(l).kind === 'method' ? 'method' : 'same'}`} aria-hidden="true" />{l}{i < axis.length - 1 ? ',' : ''}</span>
                ))}</div>
              )}
              {light.length > 0 && <div className="fu-idea-light">{COPY.ideas.light(light)}</div>}
            </div>
            <button type="button" className="fu-ghost" title={COPY.ideas.startTip} aria-label={COPY.ideas.startAria(lens.label, f.title)} onClick={() => onStart(f)}>{COPY.ideas.start}</button>
          </div>
        </>
      ) : state?.status === 'error' ? (
        <div className="fu-idea-error"><p>{state.error || COPY.ideas.fallbackError}</p><button type="button" className="fu-ghost" onClick={onRetry}>{COPY.ideas.retry}</button></div>
      ) : (
        <div className="fu-skeleton" aria-label={COPY.ideas.makingAria(lens.label)}>
          <i style={{ width: '70%', height: 16 }} /><i /><i /><i style={{ width: '60%' }} />
          {state?.status === 'loading' && <small>{COPY.ideas.making(seconds)}</small>}
        </div>
      )}
    </article>
  )
}

export default function IdeaGrid({ states, standards, bridges, active, onActive, onStart, onRetry }) {
  const byKey = new Map(standards.map((s) => [s.key, s]))
  const concepts = bridges?.concepts || []
  const conceptByLabel = new Map(concepts.map((c) => [c.label, c]))
  const subjectOfKey = (key) => { const s = byKey.get(key); if (!s) return null; const dup = standards.filter((x) => x.subject === s.subject).length > 1; return dup ? `${shortSubject(s)} ${s.code}` : shortSubject(s) }
  const ready = Object.values(states).filter((s) => s?.status === 'ready')
  const axisSets = ready.map((s) => (s.data.axis || []).filter((l) => conceptByLabel.has(l)).sort().join('|')).filter(Boolean)
  const sameAxis = ready.length === 8 && axisSets.length === 8 && new Set(axisSets).size === 1 && !axisSets[0].includes('|') ? axisSets[0] : null
  const isolated = (bridges?.isolated || []).map(subjectOfKey).filter(Boolean)
  return (
    <section className="fu-section fu-ideas" aria-label={COPY.ideas.title}>
      <div className="fu-section-head">
        <span className="fu-step">3</span>
        <h2>{COPY.ideas.title}</h2>
        <span className="fu-section-right">{ready.length < 8 ? COPY.ideas.progress(ready.length) : COPY.ideas.done}</span>
      </div>
      <div className="fu-idea-grid">
        <div className="fu-idea-center" style={{ gridArea: 'mid' }}>
          <div className="fu-idea-center-title">{COPY.ideas.centerTitle}</div>
          {sameAxis && <p className="fu-idea-center-note">{COPY.ideas.sameAxis(sameAxis)}</p>}
          {concepts.length === 0 && <p className="fu-idea-center-note">{COPY.ideas.centerZero}</p>}
          {concepts.map((c) => (
            <div key={c.label} className={`fu-idea-center-row${active === c.label ? ' on' : ''}`} onMouseEnter={() => onActive?.(c.label)} onMouseLeave={() => onActive?.(null)}>
              <span className={`fu-kind-mark ${c.kind === 'method' ? 'method' : 'same'}`} aria-hidden="true" />
              <b>{c.label}</b>
              {c.ends.map((e) => { const s = byKey.get(e.key); return <span key={e.key} className="fu-end"><i style={{ background: colorOf(s) }} />{shortSubject(s)}</span> })}
            </div>
          ))}
          {isolated.length > 0 && <p className="fu-idea-center-note dim">{COPY.ideas.centerIsolated(isolated)}</p>}
        </div>
        {LENSES.map((_, k) => (
          <IdeaCard key={k} k={k} state={states[k]} conceptByLabel={conceptByLabel} subjectOfKey={subjectOfKey} sameAxis={sameAxis}
            active={active} onActive={onActive} onStart={onStart} onRetry={() => onRetry(k)} />
        ))}
      </div>
    </section>
  )
}
