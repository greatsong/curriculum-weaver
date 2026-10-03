/**
 * (1) 성취기준 고르기 — 코드 중심 검색, 코드 여러 개 붙여 넣기, 예시 조합, 고른 목록(누르면 원문 전문 펼침).
 */
import { useMemo, useState } from 'react'
import { FUTURE_MAX, codesIn, resolveCodes, searchStandards } from '../../lib/futureMap/search'
import { COPY, EXAMPLE } from '../../lib/futureMap/copy'
import { colorOf } from './KeywordGraph'

const LEVELS = [{ id: '고등학교', label: '고등' }, { id: '중학교', label: '중학' }, { id: '초등학교', label: '초등' }, { id: '', label: '전체' }]

function Highlight({ text, query }) {
  const t = String(text ?? ''), q = String(query ?? '').trim()
  const i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return t
  return <>{t.slice(0, i)}<mark>{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>
}

export default function StandardPicker({ catalog, catalogError, picked, missingFromUrl, onChange }) {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('고등학교')
  const [note, setNote] = useState(null)
  const [open, setOpen] = useState(() => new Set())
  const pickedKeys = picked.map((s) => s.key)
  const full = pickedKeys.length >= FUTURE_MAX
  const results = useMemo(() => (catalog ? searchStandards(catalog, query, { level, exclude: new Set(pickedKeys), limit: 40 }) : []), [catalog, query, level, pickedKeys.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const byKey = useMemo(() => new Map((catalog || []).map((s) => [s.key, s])), [catalog])

  const add = (s) => { if (!s || full || pickedKeys.includes(s.key)) return; onChange([...pickedKeys, s.key]); setNote(null); setQuery('') }
  const addMany = (text) => {
    const chunks = codesIn(text)
    if (chunks.length < 2 || !catalog) return false
    const { found, missing } = resolveCodes(catalog, chunks)
    if (!found.length) return false
    const next = [...pickedKeys]
    let added = 0
    for (const s of found) { if (next.length >= FUTURE_MAX) break; if (!next.includes(s.key)) { next.push(s.key); added++ } }
    onChange(next); setQuery('')
    setNote({ added, overflow: found.length - added > 0 && next.length >= FUTURE_MAX, missing })
    return true
  }
  const toggle = (key) => setOpen((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })

  return (
    <section className="fm-section" aria-label={COPY.pick.title}>
      <div className="fm-section-head">
        <span className="fm-step">1</span>
        <h2>{COPY.pick.title}</h2>
        <span className="fm-section-right"><b>{pickedKeys.length}</b> / 6</span>
      </div>
      <div className="fm-panel fm-pick">
        <div className="fm-pick-search">
          <div className="fm-searchrow">
            <input className="fm-input" value={query} disabled={!catalog || full} aria-label={COPY.pick.searchAria}
              placeholder={full ? COPY.pick.placeholderFull : COPY.pick.placeholder}
              onChange={(e) => { setQuery(e.target.value); setNote(null) }}
              onPaste={(e) => { const t = e.clipboardData?.getData('text') || ''; if (codesIn(t).length >= 2) { e.preventDefault(); addMany(t) } }}
              onKeyDown={(e) => { if (e.key !== 'Enter' || e.nativeEvent.isComposing) return; e.preventDefault(); if (!addMany(query) && results[0]) add(results[0]) }} />
            <select className="fm-input fm-level" value={level} onChange={(e) => setLevel(e.target.value)} aria-label={COPY.pick.levelAria}>
              {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          {catalogError && <div className="fm-note-line danger">{COPY.pick.loadError}</div>}
          {!catalog && !catalogError && <div className="fm-note-line">{COPY.pick.loading}</div>}
          {note && (
            <div className="fm-note-line">{COPY.pick.pasted(note.added)}{note.overflow ? ` ${COPY.pick.overflow}` : ''}
              {note.missing.length > 0 && <span className="danger"> {COPY.pick.missing(note.missing)}</span>}</div>
          )}
          {missingFromUrl.length > 0 && <div className="fm-note-line danger">{COPY.pick.missing(missingFromUrl)}</div>}
          {query.trim() && catalog && (
            <div className="fm-results">
              {results.length === 0 && <div className="fm-note-line">{COPY.pick.noResult}</div>}
              {results.map((s) => (
                <button key={s.key} type="button" className="fm-result" disabled={full} onClick={() => add(s)}>
                  <i style={{ background: colorOf(s) }} />
                  <span><b><Highlight text={s.code} query={query} /></b><em><Highlight text={s.subject} query={query} /></em><span className="fm-result-text"><Highlight text={s.content} query={query} /></span></span>
                  <span className="fm-plus" aria-hidden="true">+</span>
                </button>
              ))}
            </div>
          )}
          {!query.trim() && catalog && (
            <div className="fm-note-line">{COPY.pick.help}
              {pickedKeys.length === 0 && <div><button type="button" className="fm-ghost fm-example" onClick={() => onChange(EXAMPLE.codes.filter((c) => byKey.has(c)))}>{COPY.pick.example(EXAMPLE.subjects)}</button></div>}
            </div>
          )}
        </div>
        <div className="fm-chips">
          {picked.length === 0 && <div className="fm-chips-empty">{COPY.pick.empty}</div>}
          {picked.map((s) => (
            <div key={s.key} className={`fm-chip${open.has(s.key) ? ' open' : ''}`}>
              <i style={{ background: colorOf(s), boxShadow: `0 0 8px ${colorOf(s)}` }} />
              <button type="button" className="fm-chip-body" onClick={() => toggle(s.key)} aria-expanded={open.has(s.key)}>
                <b>{s.code}</b><em>{s.subject}</em><span className="fm-chip-text">{s.content}</span>
              </button>
              <button type="button" className="fm-x" onClick={() => onChange(pickedKeys.filter((k) => k !== s.key))} aria-label={COPY.pick.removeAria(s.code)}>×</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
