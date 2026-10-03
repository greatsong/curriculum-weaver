/**
 * 미래 보기 — 성취기준 2~6개 → (자동) 성취기준을 잇는 키워드 그래프 → "미래 보기" → 관점별 수업 아이디어 8장.
 * 명세: docs/미래보기-명세서.md. URL이 상태를 기록한다: /futures?codes=k1,k2&model=precise
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import { FUTURE_TIPS, buildFuturesSearch, catalogFromBody, parseFuturesSearch } from '../lib/futures'
import { COPY } from '../lib/futures/copy'
import StandardPicker from '../components/futures/StandardPicker'
import KeywordGraph from '../components/futures/KeywordGraph'
import IdeaGrid from '../components/futures/IdeaGrid'
import './futures.css'

const BASKET_KEY = 'cw_design_basket'
const BASKET_META_KEY = 'cw_design_basket_meta'
const BRIDGE_DELAY_MS = 700 // 성취기준을 연달아 넣는 동안은 연결을 찾지 않는다

export default function FuturesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { keys, model } = useMemo(() => parseFuturesSearch(location.search), [location.search])
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState(false)
  const [bridges, setBridges] = useState({ status: 'idle', data: null, startedAt: 0 })
  const [bridgeTry, setBridgeTry] = useState(0)
  const [viewing, setViewing] = useState(false)
  const [futures, setFutures] = useState({ fast: {}, precise: {} })
  const [active, setActive] = useState(null)
  const [basketCount, setBasketCount] = useState(0)
  const [, tick] = useState(0)
  const sigRef = useRef('')
  const ideasRef = useRef(null)

  const setUrl = useCallback((nextKeys, nextModel = model) => {
    navigate({ pathname: '/futures', search: buildFuturesSearch(nextKeys, nextModel) }, { replace: true })
  }, [navigate, model])

  useEffect(() => {
    let alive = true
    apiGet('/api/futures/catalog').then((b) => { if (alive) setCatalog(catalogFromBody(b)) }).catch(() => { if (alive) setCatalogError(true) })
    return () => { alive = false }
  }, [])
  const byKey = useMemo(() => new Map((catalog || []).map((s) => [s.key, s])), [catalog])
  const picked = useMemo(() => keys.map((k) => byKey.get(k)).filter(Boolean), [keys, byKey])
  const pickedKeys = useMemo(() => picked.map((s) => s.key), [picked])
  const pickedSig = pickedKeys.join(',')
  const missingFromUrl = catalog ? keys.filter((k) => !byKey.has(k)) : []

  // 조합이 바뀌면: 카드를 지우고, 0.7초 뒤 연결 찾기(그래프는 "미래 보기" 전에 먼저 보인다)
  useEffect(() => {
    sigRef.current = pickedSig
    setViewing(false)
    setFutures({ fast: {}, precise: {} })
    setActive(null)
    setBasketCount(0)
    if (pickedKeys.length < 2) { setBridges({ status: 'idle', data: null, startedAt: 0 }); return undefined }
    setBridges((b) => ({ status: 'loading', data: b.data, startedAt: Date.now() }))
    const sig = pickedSig
    const t = setTimeout(() => {
      apiPost('/api/futures/bridges', { codes: pickedKeys }, { timeoutMs: 120_000 })
        .then((body) => { if (sigRef.current === sig) setBridges({ status: body?.bridges ? 'ready' : 'error', data: body?.bridges || null, startedAt: 0 }) })
        .catch(() => { if (sigRef.current === sig) setBridges({ status: 'error', data: null, startedAt: 0 }) })
    }, BRIDGE_DELAY_MS)
    return () => clearTimeout(t)
  }, [pickedSig, bridgeTry]) // eslint-disable-line react-hooks/exhaustive-deps

  const requestIdea = useCallback((index, m) => {
    const sig = sigRef.current
    setFutures((prev) => ({ ...prev, [m]: { ...prev[m], [index]: { status: 'loading', startedAt: Date.now() } } }))
    apiPost('/api/futures', { codes: pickedKeys, model: m, index }, { timeoutMs: 200_000 })
      .then((body) => {
        if (sigRef.current !== sig) return
        if (!body?.future) throw new Error(body?.error || COPY.ideas.fallbackError)
        setFutures((prev) => ({ ...prev, [m]: { ...prev[m], [index]: { status: 'ready', data: body.future } } }))
      })
      .catch((e) => { if (sigRef.current === sig) setFutures((prev) => ({ ...prev, [m]: { ...prev[m], [index]: { status: 'error', error: e?.message || COPY.ideas.fallbackError } } })) })
  }, [pickedKeys])
  const requestAll = useCallback((m) => {
    for (let i = 0; i < FUTURE_TIPS; i++) { const st = futures[m][i]; if (!st || st.status === 'error') requestIdea(i, m) }
  }, [futures, requestIdea])

  const run = () => {
    if (pickedKeys.length < 2) return
    setViewing(true)
    requestAll(model)
    const smooth = !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    requestAnimationFrame(() => ideasRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }))
  }
  useEffect(() => { if (viewing) requestAll(model) }, [model]) // eslint-disable-line react-hooks/exhaustive-deps

  const states = futures[model]
  const anyLoading = Object.values(states).some((s) => s?.status === 'loading')
  useEffect(() => { if (!anyLoading) return undefined; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [anyLoading])

  const addToBasket = useCallback(() => {
    try {
      const cur = new Set(JSON.parse(sessionStorage.getItem(BASKET_KEY) || '[]'))
      pickedKeys.forEach((k) => cur.add(k))
      sessionStorage.setItem(BASKET_KEY, JSON.stringify([...cur]))
      const meta = JSON.parse(sessionStorage.getItem(BASKET_META_KEY) || '{}')
      for (const k of pickedKeys) { const g = byKey.get(k)?.subject_group; if (g) meta[k] = g }
      sessionStorage.setItem(BASKET_META_KEY, JSON.stringify(meta))
    } catch { /* noop */ }
    setBasketCount(pickedKeys.length)
  }, [pickedKeys, byKey])
  const startProject = (f) => {
    addToBasket()
    try {
      if (f?.title) sessionStorage.setItem('cw_project_title_suggestion', f.title)
      const desc = f?.pitch || [f?.activity, f?.product].filter(Boolean).join(' ')
      if (desc) sessionStorage.setItem('cw_project_desc_suggestion', desc)
    } catch { /* noop */ }
    navigate('/workspaces?createProject=1')
  }

  const canRun = pickedKeys.length >= 2
  return (
    <div className="futures-root">
      <div className="fu-bg" aria-hidden="true" />
      <main className="fu-main">
        <header className="fu-header">
          <button type="button" className="fu-back" onClick={() => navigate('/workspaces')}>{COPY.back}</button>
          <h1>{COPY.title}</h1>
          <p className="fu-intro">{COPY.intro}</p>
        </header>

        <StandardPicker catalog={catalog} catalogError={catalogError} picked={picked} missingFromUrl={missingFromUrl} onChange={(next) => setUrl(next)} />

        {pickedKeys.length >= 2 && (
          <KeywordGraph standards={picked} bridges={bridges} activeLabel={active} onActive={setActive} onRetry={() => setBridgeTry((x) => x + 1)} />
        )}

        <div className="fu-decide">
          <button type="button" className="fu-ghost" title={COPY.decide.basketTip} disabled={!canRun} onClick={addToBasket}>
            {basketCount ? COPY.decide.basketDone(basketCount) : COPY.decide.basket}
          </button>
          <div className="fu-decide-right">
            <span className="fu-decide-note" id="fu-run-note">{canRun ? COPY.decide.runNote : COPY.decide.disabledNote}</span>
            <div className="fu-models" role="radiogroup" aria-label={COPY.decide.modelAria}>
              {COPY.decide.models.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={model === o.id} title={o.tip} className={model === o.id ? 'on' : ''} onClick={() => setUrl(pickedKeys, o.id)}>
                  {o.label}<small>{o.model}</small>
                </button>
              ))}
            </div>
            <button type="button" className="fu-run" disabled={!canRun} aria-describedby="fu-run-note" onClick={run}>{COPY.decide.run}</button>
          </div>
        </div>

        {viewing && (
          <div ref={ideasRef} className="fu-ideas-anchor">
            <IdeaGrid states={states} standards={picked} bridges={bridges.status === 'ready' ? bridges.data : null} active={active} onActive={setActive}
              onStart={startProject} onRetry={(k) => requestIdea(k, model)} />
          </div>
        )}
        <p className="fu-footer">{COPY.footer}</p>
      </main>
    </div>
  )
}
