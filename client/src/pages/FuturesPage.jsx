/**
 * 미래 보기 — 성취기준 2~6개를 넣고 "타임스톤으로 수업의 미래 보기"를 누르면
 * ① 키워드 성운: 고른 성취기준이 어떤 키워드에서 만나는지 ② 미래 마방진: 관점 8개의 짧은 수업 카드.
 * 연결 찾기는 성취기준을 넣는 순간 뒤에서 시작하고, 누르면 8개를 한꺼번에 그린다(카드는 준비되는 대로 채워짐).
 * URL이 상태를 기록한다: /futures?codes=k1,k2&model=precise
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import {
  FUTURE_MAX, FUTURE_MODEL_OPTIONS, FUTURE_TIPS, buildFuturesSearch, catalogFromBody, codesIn, colorOfStandard,
  parseFuturesSearch, resolveCodes, searchStandards,
} from '../lib/futures'
import { startDust } from '../lib/futuresDust'
import KeywordNebula from '../components/futures/KeywordNebula'
import FuturesSquare from '../components/futures/FuturesSquare'
import './futures.css'

const LEVELS = [
  { id: '고등학교', label: '고등' }, { id: '중학교', label: '중학' }, { id: '초등학교', label: '초등' }, { id: '', label: '전체' },
]
// 처음 온 교사를 위한 예시 조합 (고등 일반 과목 4개 — 건강한 생활)
const EXAMPLE_CODES = ['[12생과01-05]', '[12운건01-01]', '[12기가01-03]', '[12독작01-11]']
const BASKET_KEY = 'cw_design_basket'
const BASKET_META_KEY = 'cw_design_basket_meta'
const BRIDGE_DELAY_MS = 700 // 성취기준을 연달아 넣는 동안은 연결을 찾지 않는다

function Highlight({ text, query }) {
  const t = String(text ?? '')
  const q = String(query ?? '').trim()
  const i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return t
  return <>{t.slice(0, i)}<mark>{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>
}

export default function FuturesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { keys, model } = useMemo(() => parseFuturesSearch(location.search), [location.search])
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('고등학교')
  const [pasteNote, setPasteNote] = useState(null)
  const [viewing, setViewing] = useState(false)
  const [bridges, setBridges] = useState({ status: 'idle', data: null })
  const [futures, setFutures] = useState({ fast: {}, precise: {} })
  const [, setTick] = useState(0)
  const dustRef = useRef(null)
  const resultRef = useRef(null)
  const sigRef = useRef('')

  const setUrl = useCallback((nextKeys, nextModel = model) => {
    navigate({ pathname: '/futures', search: buildFuturesSearch(nextKeys, nextModel) }, { replace: true })
  }, [navigate, model])

  // 성취기준 목록 (검색용, 한 번)
  useEffect(() => {
    let alive = true
    apiGet('/api/futures/catalog')
      .then((body) => { if (alive) setCatalog(catalogFromBody(body)) })
      .catch(() => { if (alive) setCatalogError('성취기준 목록을 불러오지 못했습니다. 새로고침해 주세요.') })
    return () => { alive = false }
  }, [])
  const byKey = useMemo(() => new Map((catalog || []).map((s) => [s.key, s])), [catalog])
  const picked = useMemo(() => keys.map((k) => byKey.get(k)).filter(Boolean), [keys, byKey])
  const pickedKeys = useMemo(() => picked.map((s) => s.key), [picked])
  const pickedSig = pickedKeys.join(',')

  useEffect(() => (dustRef.current ? startDust(dustRef.current) : undefined), [])

  // 조합이 바뀌면 처음부터: 결과를 지우고, 뒤에서 연결 찾기를 시작한다
  useEffect(() => {
    sigRef.current = pickedSig
    setViewing(false)
    setFutures({ fast: {}, precise: {} })
    if (pickedKeys.length < 2) { setBridges({ status: 'idle', data: null }); return undefined }
    setBridges({ status: 'loading', data: null })
    const sig = pickedSig
    const timer = setTimeout(() => {
      apiPost('/api/futures/bridges', { codes: pickedKeys }, { timeoutMs: 120_000 })
        .then((body) => { if (sigRef.current === sig) setBridges({ status: body?.bridges ? 'ready' : 'error', data: body?.bridges || null }) })
        .catch(() => { if (sigRef.current === sig) setBridges({ status: 'error', data: null }) })
    }, BRIDGE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pickedSig]) // eslint-disable-line react-hooks/exhaustive-deps

  // 미래 하나 요청 — 조합이 바뀐 뒤 도착한 결과는 버린다
  const requestFuture = useCallback((index, m) => {
    const sig = sigRef.current
    setFutures((prev) => ({ ...prev, [m]: { ...prev[m], [index]: { status: 'loading', startedAt: Date.now() } } }))
    apiPost('/api/futures', { codes: pickedKeys, model: m, index }, { timeoutMs: 200_000 })
      .then((body) => {
        if (sigRef.current !== sig) return
        if (!body?.future) throw new Error(body?.error || '미래를 그리지 못했습니다.')
        setFutures((prev) => ({ ...prev, [m]: { ...prev[m], [index]: { status: 'ready', data: body.future } } }))
      })
      .catch((e) => {
        if (sigRef.current !== sig) return
        setFutures((prev) => ({ ...prev, [m]: { ...prev[m], [index]: { status: 'error', error: e?.message || '미래를 그리지 못했습니다.' } } }))
      })
  }, [pickedKeys])
  const requestAll = useCallback((m) => {
    for (let i = 0; i < FUTURE_TIPS; i++) if (!futures[m][i] || futures[m][i].status === 'error') requestFuture(i, m)
  }, [futures, requestFuture])

  const start = () => {
    if (pickedKeys.length < 2) return
    setViewing(true)
    requestAll(model)
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  // 보는 중에 모델을 바꾸면 그 모델로 8개를 그린다(이미 그린 것은 그대로)
  useEffect(() => { if (viewing) requestAll(model) }, [model, viewing]) // eslint-disable-line react-hooks/exhaustive-deps

  // 그리는 중이면 1초마다 경과 시간 갱신
  const states = futures[model]
  const anyLoading = Object.values(states).some((s) => s?.status === 'loading')
  useEffect(() => {
    if (!anyLoading) return undefined
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [anyLoading])

  // 담기 — 설계 모드·워크스페이스와 같은 세션 저장소를 쓴다
  const addToBasket = useCallback(() => {
    try {
      const cur = new Set(JSON.parse(sessionStorage.getItem(BASKET_KEY) || '[]'))
      pickedKeys.forEach((k) => cur.add(k))
      sessionStorage.setItem(BASKET_KEY, JSON.stringify([...cur]))
      const meta = JSON.parse(sessionStorage.getItem(BASKET_META_KEY) || '{}')
      for (const k of pickedKeys) { const g = byKey.get(k)?.subject_group; if (g) meta[k] = g }
      sessionStorage.setItem(BASKET_META_KEY, JSON.stringify(meta))
    } catch { /* noop */ }
  }, [pickedKeys, byKey])
  const startProject = (future) => {
    addToBasket()
    try {
      if (future?.title) sessionStorage.setItem('cw_project_title_suggestion', future.title)
      if (future?.pitch) sessionStorage.setItem('cw_project_desc_suggestion', future.pitch)
    } catch { /* noop */ }
    navigate('/workspaces?createProject=1')
  }

  // ── 넣기 · 빼기 ──
  const results = useMemo(
    () => (catalog ? searchStandards(catalog, query, { level, exclude: new Set(pickedKeys), limit: 40 }) : []),
    [catalog, query, level, pickedKeys],
  )
  const full = pickedKeys.length >= FUTURE_MAX
  const add = (s) => { if (!s || full || pickedKeys.includes(s.key)) return; setUrl([...pickedKeys, s.key]); setPasteNote(null) }
  const remove = (key) => setUrl(pickedKeys.filter((k) => k !== key))
  const addMany = (text) => {
    const chunks = codesIn(text)
    if (chunks.length < 2 || !catalog) return false
    const { found, missing } = resolveCodes(catalog, chunks)
    if (!found.length) return false
    const next = [...pickedKeys]
    let added = 0
    for (const s of found) { if (next.length >= FUTURE_MAX) break; if (!next.includes(s.key)) { next.push(s.key); added++ } }
    setUrl(next)
    setQuery('')
    setPasteNote({ added, overflow: found.length - added > 0 && next.length >= FUTURE_MAX, missing })
    return true
  }
  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text') || ''
    if (codesIn(text).length >= 2) { e.preventDefault(); addMany(text) }
  }
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    if (addMany(query)) return
    if (results[0]) { add(results[0]); setQuery('') }
  }
  const missingFromUrl = catalog ? keys.filter((k) => !byKey.has(k)) : []
  const modelLabel = FUTURE_MODEL_OPTIONS.find((o) => o.id === model)?.model || ''

  return (
    <div className="futures-root">
      <canvas className="fu-dust" ref={dustRef} />
      <main className="fu-main">
        <header className="fu-header">
          <div>
            <button type="button" className="fu-back" onClick={() => navigate('/workspaces')}>‹ 워크스페이스</button>
            <h1>미래 보기 <span>✦</span></h1>
            <div className="fu-sub">성취기준을 2~6개 넣으면, 성취기준들이 만나는 키워드를 찾고 그 위에서 가능한 수업 여덟 가지를 보여 줍니다.</div>
          </div>
          <div className="fu-models" role="radiogroup" aria-label="AI 모델">
            {FUTURE_MODEL_OPTIONS.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={model === o.id} className={model === o.id ? 'on' : ''} onClick={() => setUrl(pickedKeys, o.id)}>
                {o.label}<small>{o.model}</small>
              </button>
            ))}
          </div>
        </header>

        <section className="fu-panel fu-top">
          <h2><span>넣은 성취기준</span><span>{pickedKeys.length} / {FUTURE_MAX}</span></h2>
          <div className="fu-pick">
            <div>
              <div className="fu-searchrow">
                <input
                  className="fu-search"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPasteNote(null) }}
                  onPaste={onPaste}
                  onKeyDown={onKeyDown}
                  placeholder={full ? '6개까지 넣었습니다' : '코드나 낱말로 찾기 (예: 12생과01-05, 기후)'}
                  disabled={!catalog || full}
                  aria-label="성취기준 검색"
                />
                <select className="fu-level" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="학교급">
                  {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              {catalogError && <div className="fu-empty">{catalogError}</div>}
              {!catalog && !catalogError && <div className="fu-empty">성취기준 목록을 불러오는 중…</div>}
              {pasteNote && (
                <div className="fu-pastenote">
                  코드 {pasteNote.added}개를 넣었습니다.{pasteNote.overflow ? ` 최대 ${FUTURE_MAX}개까지만 넣을 수 있습니다.` : ''}
                  {pasteNote.missing.length > 0 && <span className="miss"> 찾지 못한 코드: {pasteNote.missing.join(', ')}</span>}
                </div>
              )}
              {missingFromUrl.length > 0 && <div className="fu-pastenote"><span className="miss">찾지 못한 코드: {missingFromUrl.join(', ')}</span></div>}
              {query.trim() && catalog && (
                <div className="fu-results">
                  {results.length === 0 && <div className="fu-empty">찾는 성취기준이 없습니다. 다른 낱말이나 학교급으로 찾아 주세요.</div>}
                  {results.map((s) => (
                    <button key={s.key} type="button" className="fu-result" style={{ '--c': colorOfStandard(s) }} disabled={full} onClick={() => { add(s); setQuery('') }}>
                      <span className="fu-dot" />
                      <span><b><Highlight text={s.code} query={query} /></b><em><Highlight text={s.subject} query={query} /></em><p><Highlight text={s.content} query={query} /></p></span>
                      <span className="fu-plus" aria-hidden="true">+</span>
                    </button>
                  ))}
                </div>
              )}
              {!query.trim() && catalog && (
                <div className="fu-empty">
                  코드를 알면 코드로 찾는 것이 가장 빠릅니다. 코드 여러 개를 한 번에 붙여 넣어도 됩니다.
                  {pickedKeys.length === 0 && (
                    <div><button type="button" className="fu-example" onClick={() => setUrl(EXAMPLE_CODES.filter((c) => byKey.has(c)))}>예시 조합으로 보기 (생명과학·운동과 건강·기술·가정·독서와 작문)</button></div>
                  )}
                </div>
              )}
            </div>
            <div className="fu-slots">
              {picked.length === 0 && <div className="fu-slots-empty">넣은 성취기준이 여기에 쌓입니다.</div>}
              {picked.map((s) => (
                <div key={s.key} className="fu-chip" style={{ '--c': colorOfStandard(s) }}>
                  <span className="fu-dot" />
                  <div><b>{s.code}</b><em>{s.subject}</em><p>{s.content}</p></div>
                  <button type="button" className="fu-x" onClick={() => remove(s.key)} aria-label={`${s.code} 빼기`}>×</button>
                </div>
              ))}
            </div>
          </div>
          {!viewing && (
            <div className="fu-startrow">
              <button type="button" className="fu-start" onClick={start} disabled={pickedKeys.length < 2}>타임스톤으로 수업의 미래 보기</button>
              {pickedKeys.length < 2 && <span className="fu-start-hint">성취기준을 2개 이상 넣어 주세요.</span>}
            </div>
          )}
        </section>

        {viewing && (
          <div ref={resultRef} className="fu-result-flow">
            <KeywordNebula standards={picked} bridges={bridges.data} status={bridges.status} />
            <FuturesSquare states={states} bridges={bridges.data} modelLabel={modelLabel}
              onBasket={addToBasket} onStart={startProject} onRetry={(k) => requestFuture(k, model)} />
          </div>
        )}
        <p className="fu-note">키워드와 미래는 AI가 성취기준 원문을 바탕으로 그린 수업 아이디어입니다. 키워드는 원문에 있는 말만 쓰고, 이어지지 않는 성취기준은 억지로 엮지 않습니다.</p>
      </main>
    </div>
  )
}
