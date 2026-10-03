/**
 * 미래보기 실험실 — 과목별 빛의 원과 키워드 연결에서 여덟 관점의 수업을 탐색한다.
 * 기존 미래보기 API를 사용하되 화면과 URL 상태는 /futures-lab에서 별도로 관리한다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import {
  FUTURE_MAX, FUTURE_MODEL_OPTIONS, buildFuturesSearch, catalogFromBody, codesIn, mergeStandardCodes, parseFuturesSearch, searchStandards,
} from '../lib/futures2'
import { colorOfStandard, colorOfStone } from '../lib/futures2Scene'
import { createFuturesLabScene as createFuturesScene } from '../lib/futuresLabScene'
import './futures2.css'
import './futuresLab.css'
import { resolvePracticeSet } from '../lib/futures2Practice'
import { FUTURES_LAB_SAMPLES } from '../lib/futuresLabSamples'
import { groupFutureStandards } from '../lib/futures2GraphLayout'
import KeywordGraph, { colorOf } from '../components/futures/KeywordGraph'
import { subjectOfStandard } from '../lib/futures2GraphLayout'
import './futures.css'

const LEVELS = [
  { id: '고등학교', label: '고등' }, { id: '중학교', label: '중학' }, { id: '초등학교', label: '초등' }, { id: '', label: '전체' },
]
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

export default function FuturesLabPage({ get = apiGet, post = apiPost } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { keys, model } = useMemo(() => parseFuturesSearch(location.search), [location.search])
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [catalogTry, setCatalogTry] = useState(0)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('고등학교')
  const [subject, setSubject] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [pasteNote, setPasteNote] = useState(null)
  const [scenePhase, setScenePhase] = useState('graph')
  const [graphState, setGraphState] = useState({ canOpen: false, status: 'idle' })
  const [bridges, setBridges] = useState({ status: 'idle', data: null, startedAt: 0 })
  const [activeLink, setActiveLink] = useState(null)
  const graphRef = useRef(null)
  const sceneRootRef = useRef(null)
  const sceneRef = useRef(null)

  const setUrl = useCallback((nextKeys, nextModel = model) => {
    navigate({ pathname: '/futures-lab', search: buildFuturesSearch(nextKeys, nextModel) }, { replace: true })
  }, [navigate, model])

  // 성취기준 목록 (검색용, 한 번)
  useEffect(() => {
    let alive = true
    setCatalogError('')
    get('/api/futures2/catalog')
      .then((body) => { if (alive) setCatalog(catalogFromBody(body)) })
      .catch(() => { if (alive) setCatalogError('성취기준 목록을 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [get, catalogTry])
  const byKey = useMemo(() => new Map((catalog || []).map((s) => [s.key, s])), [catalog])
  const picked = useMemo(() => keys.map((k) => byKey.get(k)).filter(Boolean), [keys, byKey])
  const pickedKeys = useMemo(() => picked.map((s) => s.key), [picked])
  const pickedSig = JSON.stringify(pickedKeys)
  const activeSample = useMemo(() => FUTURES_LAB_SAMPLES.find(preset => {
    const resolved = resolvePracticeSet(catalog, preset)
    return !resolved.missing.length && pickedKeys.length === resolved.standards.length && resolved.standards.every(s => pickedKeys.includes(s.key))
  }), [catalog, pickedSig]) // eslint-disable-line react-hooks/exhaustive-deps
  const graphStandards = useMemo(() => picked.map(s => ({ ...s, subject: subjectOfStandard(s) })), [picked])
  const subjectGroups = useMemo(() => groupFutureStandards(picked), [picked])
  const colorIndexOfKey = useMemo(() => new Map(subjectGroups.flatMap(g => g.indices.map(i => [picked[i].key, g.colorIndex]))), [subjectGroups, picked])

  // 담기 — 설계 모드·워크스페이스와 같은 세션 저장소를 쓴다
  const addToBasket = useCallback((addKeys) => {
    try {
      const cur = new Set(JSON.parse(sessionStorage.getItem(BASKET_KEY) || '[]'))
      const before = cur.size
      addKeys.forEach((k) => cur.add(k))
      sessionStorage.setItem(BASKET_KEY, JSON.stringify([...cur]))
      const meta = JSON.parse(sessionStorage.getItem(BASKET_META_KEY) || '{}')
      for (const k of addKeys) { const g = byKey.get(k)?.subject_group; if (g) meta[k] = g }
      sessionStorage.setItem(BASKET_META_KEY, JSON.stringify(meta))
      return cur.size > before
    } catch { throw new Error('성취기준을 저장하지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.') }
  }, [byKey])

  // 의식 구간(장면) — 고른 조합이 바뀌면 새로 만들고, 연결 찾기를 뒤에서 시작한다. 모델 전환은 장면을 유지한다.
  const modelRef = useRef(model)
  modelRef.current = model
  useEffect(() => {
    const root = sceneRootRef.current
    if (!root || !catalog) return undefined
    let alive = true
    setScenePhase('graph'); setActiveLink(null)
    setBridges({ status: picked.length >= 2 ? 'loading' : 'idle', data: null, startedAt: Date.now() })
    const loadBridges = () => {
      setBridges({ status: 'loading', data: null, startedAt: Date.now() })
      post('/api/futures2/bridges', { codes: pickedKeys }, { timeoutMs: 120_000 })
        .then(body => {
          if (!alive) return
          const data = body?.bridges || null
          setBridges({ status: data ? 'ready' : 'error', data, startedAt: 0 })
          scene.setBridges(data)
        })
        .catch(() => { if (alive) { setBridges({ status: 'error', data: null, startedAt: 0 }); scene.setBridges(null) } })
    }
    const scene = createFuturesScene(root, {
      standards: picked,
      model: modelRef.current,
      externalGraph: true,
      onPhaseChange: setScenePhase,
      onGraphState: setGraphState,
      colorForStandard: colorOf,
      requestFuture: async (index, m) => {
        const body = await post('/api/futures2', { codes: pickedKeys, model: m, index }, { timeoutMs: 200_000 })
        if (!body?.future) throw new Error(body?.error || '미래를 그리지 못했습니다.')
        return body.future
      },
      onStartProject: (future) => {
        addToBasket(pickedKeys)
        try {
          if (future?.title) sessionStorage.setItem('cw_project_title_suggestion', future.title)
          const desc = [future?.driving_question, future?.situation].find(Boolean)
          if (desc) sessionStorage.setItem('cw_project_desc_suggestion', desc)
        } catch { throw new Error('프로젝트 시작 정보를 저장하지 못했습니다. 다시 시도해 주세요.') }
        navigate('/workspaces?createProject=1')
      },
      onBasket: addToBasket,
      onRetryBridges: loadBridges,
    })
    sceneRef.current = scene
    let timer = null
    if (pickedKeys.length >= 2) {
      timer = setTimeout(loadBridges, BRIDGE_DELAY_MS)
    }
    return () => { alive = false; clearTimeout(timer); scene.destroy(); sceneRef.current = null }
  }, [pickedSig, catalog, post]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sceneRef.current?.setModel(model) }, [model])
  const previousPhase = useRef('graph')
  useEffect(() => {
    if (scenePhase === 'graph' && previousPhase.current !== 'graph') graphRef.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' })
    if (scenePhase !== 'graph') sceneRootRef.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' })
    previousPhase.current = scenePhase
  }, [scenePhase])

  // ── 넣기 · 빼기 ──
  const results = useMemo(
    () => (catalog ? searchStandards(catalog, query, { level, subject, exclude: new Set(pickedKeys), limit: 40 }) : []),
    [catalog, query, level, subject, pickedKeys],
  )
  const subjects = useMemo(() => [...new Set((catalog || []).filter(s => !level || s.school_level === level).map(s => s.subject_group || s.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')), [catalog, level])
  const full = pickedKeys.length >= FUTURE_MAX
  const add = (s) => { if (!s || full || pickedKeys.includes(s.key)) return; setUrl([...pickedKeys, s.key]); setPasteNote(null) }
  const remove = (key) => setUrl(pickedKeys.filter((k) => k !== key))
  const applyPractice = (preset) => {
    const result = resolvePracticeSet(catalog, preset)
    if (result.missing.length) { setPasteNote({ added: 0, duplicates: 0, overflow: 0, missing: result.missing }); return }
    setLevel(preset.level); setSubject(''); setQuery(''); setBulkText(''); setPasteNote(null)
    setUrl(result.standards.map(s => s.key))
  }
  const addMany = (text, requireMultiple = true) => {
    const chunks = codesIn(text)
    if (!chunks.length || (requireMultiple && chunks.length < 2) || !catalog) return false
    const result = mergeStandardCodes(catalog, text, pickedKeys)
    if (result.added) { setUrl(result.keys); setQuery('') }
    setPasteNote(result)
    if (!result.missing.length && !result.overflow) setBulkText('')
    return true
  }
  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text') || ''
    if (codesIn(text).length >= 2 && addMany(text)) e.preventDefault()
  }
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    if (addMany(query)) return
    if (results[0]) { add(results[0]); setQuery('') }
  }

  // 목록이 로드되기 전에도 공유 URL에 담긴 성취기준을 보존한다.
  const setModel = (m) => setUrl(keys, m)
  const missingFromUrl = catalog ? keys.filter((k) => !byKey.has(k)) : []

  return (
    <div className="futures2-root futures-lab-root">
      <main className="fu-main">
        <header className="fu-header">
          <div>
            <button type="button" className="fu-back" onClick={() => navigate('/workspaces')}>‹ 워크스페이스</button>
            <h1>미래보기 실험실</h1>
            <div className="fu-sub">교과의 연결에서 새로운 수업을 발견하세요. 성취기준 2~7개를 고르면, 같은 과목의 기준이 하나의 빛의 원에 모입니다.</div>
          </div>
          <div className="fu-models" role="radiogroup" aria-label="AI 모델">
            {FUTURE_MODEL_OPTIONS.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={model === o.id} className={model === o.id ? 'on' : ''} onClick={() => setModel(o.id)}>
                {o.label}<small>{o.model}</small>
              </button>
            ))}
          </div>
        </header>

        <section className="fu-top">
          <div className="fu-panel">
            <h2><span>넣은 성취기준</span><span>{subjectGroups.length}과목 · {pickedKeys.length} / {FUTURE_MAX}개</span></h2>
            <section className="lab-samples" aria-label="학년별 샘플 주제">
              <div className="lab-samples-heading"><strong>주제로 시작하기</strong><span>3과목 · 과목별 2개 · 성취기준 6개</span></div>
              {['고1', '고2–3'].map(grade => <div className="lab-sample-group" key={grade}>
                <h3>{grade}</h3>
                <div className="lab-sample-grid">{FUTURES_LAB_SAMPLES.filter(p => p.grade === grade).map(preset => <button key={preset.id} type="button" className="lab-sample-card" data-sample={preset.id} disabled={!catalog} aria-label={`${preset.grade} ${preset.label}`} aria-pressed={activeSample?.id === preset.id} onClick={() => applyPractice(preset)}>
                  <span>{preset.subjects}</span><strong>{preset.label}</strong><p>{preset.description}</p><small>{preset.courses}</small>
                </button>)}</div>
              </div>)}
              {activeSample && <div className="lab-sample-context">
                <strong>탐구 질문 · {activeSample.question}</strong>
                <p>결과물 예시 · {activeSample.product}</p>
                <details key={activeSample.id}><summary>이 기본셋의 과목별 역할</summary><ul>{activeSample.roles.map(role => <li key={role}>{role}</li>)}</ul></details>
              </div>}
              <p className="lab-sample-note">학년은 활용 예시입니다. 실제 개설 과목과 이수 시기에 맞춰 성취기준을 바꿀 수 있습니다. 주제를 선택하면 현재 조합이 교체되며, 미래 보기에서는 같은 기준의 여러 수업 가능성을 탐색합니다.</p>
            </section>
            <div className="fu-pick">
              <div>
                <div className="fu-searchrow">
                  <input
                    className="fu-search"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPasteNote(null) }}
                    onPaste={onPaste}
                    onKeyDown={onKeyDown}
                    placeholder={full ? '7개까지 넣었습니다' : '코드나 낱말로 찾기 (예: 12생과01-05, 기후)'}
                    disabled={!catalog || full}
                    aria-label="성취기준 검색"
                  />
                  <select className="fu-level" value={level} onChange={(e) => { setLevel(e.target.value); setSubject('') }} aria-label="학교급">
                    {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <div className="fu-filterrow">
                  <label htmlFor="fu2-subject">교과</label>
                  <select id="fu2-subject" className="fu-level" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!catalog}>
                    <option value="">전체 교과</option>
                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span>교과를 고르면 성취기준 목록을 볼 수 있습니다.</span>
                </div>
                <details className="fu-bulk">
                  <summary>성취기준 코드 여러 개 넣기</summary>
                  <label htmlFor="fu2-bulk">쉼표나 줄바꿈으로 코드를 나눠 입력해 주세요. 학교급·교과 필터와 관계없이 찾습니다.</label>
                  <textarea id="fu2-bulk" value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={'[12생과01-05]\n[12운건01-01]'} disabled={!catalog || full} rows={3} />
                  <button type="button" className="fu-example" disabled={!catalog || full || !bulkText.trim()} onClick={() => addMany(bulkText, false)}>코드 넣기</button>
                </details>
                {catalogError && <div className="fu-empty" role="alert">{catalogError} <button type="button" className="fu-example" onClick={() => setCatalogTry(n => n + 1)}>다시 불러오기</button></div>}
                {!catalog && !catalogError && <div className="fu-empty">성취기준 목록을 불러오는 중…</div>}
                {pasteNote && (
                  <div className="fu-pastenote" role="status">
                    코드 {pasteNote.added}개를 넣었습니다.{pasteNote.duplicates > 0 ? ` 이미 고른 ${pasteNote.duplicates}개는 유지했습니다.` : ''}{pasteNote.overflow > 0 ? ` 최대 ${FUTURE_MAX}개라서 ${pasteNote.overflow}개는 넣지 못했습니다.` : ''}
                    {pasteNote.missing.length > 0 && <span className="miss"> 찾지 못한 코드: {pasteNote.missing.join(', ')}</span>}
                  </div>
                )}
                {missingFromUrl.length > 0 && <div className="fu-pastenote"><span className="miss">찾지 못한 코드: {missingFromUrl.join(', ')}</span></div>}
                {(query.trim() || subject) && catalog && (
                  <div className="fu-results">
                    {results.length > 0 && <div className="fu-empty">{results.length === 40 ? '최대 40개 표시 중 · 낱말을 입력하면 더 좁힐 수 있습니다.' : `${results.length}개를 찾았습니다.`}</div>}
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
                {!query.trim() && !subject && catalog && (
                  <div className="fu-empty">
                    코드를 알면 코드로 찾는 것이 가장 빠릅니다. 코드 여러 개를 한 번에 붙여 넣어도 됩니다.
                  </div>
                )}
              </div>
              <div className="fu-slots">
                {picked.length === 0 && <div className="fu-slots-empty">넣은 성취기준이 여기에 쌓입니다.</div>}
                {picked.map((s) => (
                  <div key={s.key} className="fu-chip" style={{ '--c': colorOfStone(colorIndexOfKey.get(s.key)) }}>
                    <span className="fu-dot" />
                    <div><b>{s.code}</b><em>{s.subject}</em><p>{s.content}</p></div>
                    <button type="button" className="fu-x" onClick={() => remove(s.key)} aria-label={`${s.code} 빼기`}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div ref={graphRef} hidden={scenePhase !== 'graph'} className="futures-root lab-keyword-map">
          {picked.length >= 2 && <KeywordGraph standards={graphStandards} bridges={bridges} activeLabel={activeLink} onActive={setActiveLink} onRetry={() => sceneRef.current?.retryBridges()} multiEndpoint navigable />}
          <div className="lab-map-actions">
            <p>{picked.length < 2 ? '성취기준 2~7개를 선택해 주세요.' : ['error', 'slow'].includes(graphState.status) ? '연결 분석을 기다리거나 선택한 성취기준으로 미래를 볼 수 있습니다.' : '연결을 확인했다면, 여덟 갈래의 수업을 열어 보세요.'}</p>
            <button type="button" className="lab-map-open" disabled={!graphState.canOpen} onClick={() => sceneRef.current?.open()}>미래 보기 ↗</button>
          </div>
        </div>
        <div ref={sceneRootRef} />
        <p className="fu-note">연결과 미래는 AI가 성취기준 원문을 바탕으로 그린 수업 아이디어입니다. 키워드는 원문에 있는 말만 쓰고, 이어지지 않는 성취기준은 억지로 엮지 않습니다. 한 번 본 미래는 저장되어 다시 열면 바로 보입니다.</p>
      </main>
    </div>
  )
}
