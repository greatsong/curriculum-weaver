/**
 * 미래 보기 2 — 성취기준 2~6개를 넣으면 그 조합으로 가능한 수업의 미래를 별의 꼭지마다 하나씩 보여 준다.
 *
 * 흐름: 성취기준 넣기 → (뒤에서) 연결 찾기: 성취기준별 원문 키워드 + 키워드 사이 연결 → 연결 별자리가 이어지며 초록으로 켜짐
 *       → 시간의 고리 → 여덟 꼭지 별, 꼭지마다 그 연결 위에서 그린 미래
 * - 이 컴포넌트: 성취기준 넣기(코드 중심 검색·여러 코드 붙여 넣기), URL·모델 상태, 서버 요청
 * - lib/futures2Scene.js: 연결 별자리·시간의 고리·여덟 꼭지 별·마법 입자·미래 카드(직접 DOM, 정리 보장)
 * URL이 상태를 기록한다: /futures2?codes=k1,k2&model=precise
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import {
  FUTURE_MAX, FUTURE_MODEL_OPTIONS, buildFuturesSearch, catalogFromBody, codesIn, mergeStandardCodes, parseFuturesSearch, resolveCodes, searchStandards,
} from '../lib/futures2'
import { colorOfStandard, colorOfStone, createFuturesScene, startDust } from '../lib/futures2Scene'
import './futures2.css'

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

export default function Futures2Page({ get = apiGet, post = apiPost } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { keys, model } = useMemo(() => parseFuturesSearch(location.search), [location.search])
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('고등학교')
  const [subject, setSubject] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [pasteNote, setPasteNote] = useState(null)
  const sceneRootRef = useRef(null)
  const sceneRef = useRef(null)
  const dustRef = useRef(null)

  const setUrl = useCallback((nextKeys, nextModel = model) => {
    navigate({ pathname: '/futures2', search: buildFuturesSearch(nextKeys, nextModel) }, { replace: true })
  }, [navigate, model])

  // 성취기준 목록 (검색용, 한 번)
  useEffect(() => {
    let alive = true
    get('/api/futures2/catalog')
      .then((body) => { if (alive) setCatalog(catalogFromBody(body)) })
      .catch(() => { if (alive) setCatalogError('성취기준 목록을 불러오지 못했습니다. 새로고침해 주세요.') })
    return () => { alive = false }
  }, [get])
  const byKey = useMemo(() => new Map((catalog || []).map((s) => [s.key, s])), [catalog])
  const picked = useMemo(() => keys.map((k) => byKey.get(k)).filter(Boolean), [keys, byKey])
  const pickedKeys = useMemo(() => picked.map((s) => s.key), [picked])
  const pickedSig = pickedKeys.join(',')

  // 떠다니는 빛 먼지
  useEffect(() => (dustRef.current ? startDust(dustRef.current) : undefined), [])

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
    } catch { return false }
  }, [byKey])

  // 의식 구간(장면) — 고른 조합이 바뀌면 새로 만들고, 연결 찾기를 뒤에서 시작한다. 모델 전환은 장면을 유지한다.
  const modelRef = useRef(model)
  modelRef.current = model
  useEffect(() => {
    const root = sceneRootRef.current
    if (!root || !catalog) return undefined
    const scene = createFuturesScene(root, {
      standards: picked,
      model: modelRef.current,
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
        } catch { /* noop */ }
        navigate('/workspaces?createProject=1')
      },
      onBasket: addToBasket,
    })
    sceneRef.current = scene
    let timer = null
    if (pickedKeys.length >= 2) {
      timer = setTimeout(() => {
        post('/api/futures2/bridges', { codes: pickedKeys }, { timeoutMs: 120_000 })
          .then((body) => scene.setBridges(body?.bridges || null))
          .catch(() => scene.setBridges(null))
      }, BRIDGE_DELAY_MS)
    }
    return () => { clearTimeout(timer); scene.destroy(); sceneRef.current = null }
  }, [pickedSig, catalog, post]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sceneRef.current?.setModel(model) }, [model])

  // ── 넣기 · 빼기 ──
  const results = useMemo(
    () => (catalog ? searchStandards(catalog, query, { level, subject, exclude: new Set(pickedKeys), limit: 40 }) : []),
    [catalog, query, level, subject, pickedKeys],
  )
  const subjects = useMemo(() => [...new Set((catalog || []).filter(s => !level || s.school_level === level).map(s => s.subject_group || s.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')), [catalog, level])
  const full = pickedKeys.length >= FUTURE_MAX
  const add = (s) => { if (!s || full || pickedKeys.includes(s.key)) return; setUrl([...pickedKeys, s.key]); setPasteNote(null) }
  const remove = (key) => setUrl(pickedKeys.filter((k) => k !== key))
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
    <div className="futures2-root">
      <canvas className="fu-dust" ref={dustRef} />
      <main className="fu-main">
        <header className="fu-header">
          <div>
            <button type="button" className="fu-back" onClick={() => navigate('/workspaces')}>‹ 워크스페이스</button>
            <h1>미래보기(타임스톤) <span>✦</span></h1>
            <div className="fu-sub">성취기준 2~6개를 고르고 연결을 확인한 뒤, ‘미래 보기’를 눌러 수업의 가능성을 엽니다.</div>
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
                {catalogError && <div className="fu-empty">{catalogError}</div>}
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
                    {pickedKeys.length === 0 && (
                      <div><button type="button" className="fu-example" onClick={() => setUrl(resolveCodes(catalog, EXAMPLE_CODES).found.map(s => s.key))}>예시 조합으로 보기 (생명과학·운동과 건강·기술·가정·독서와 작문)</button></div>
                    )}
                  </div>
                )}
              </div>
              <div className="fu-slots">
                {picked.length === 0 && <div className="fu-slots-empty">넣은 성취기준이 여기에 쌓입니다.</div>}
                {picked.map((s, index) => (
                  <div key={s.key} className="fu-chip" style={{ '--c': colorOfStone(index) }}>
                    <span className="fu-dot" />
                    <div><b>{s.code}</b><em>{s.subject}</em><p>{s.content}</p></div>
                    <button type="button" className="fu-x" onClick={() => remove(s.key)} aria-label={`${s.code} 빼기`}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {picked.length >= 2 && <p className="fu-graph-key">큰 스톤: 성취기준 · 작은 별: 키워드 · 연결선: 소속과 교과 간 관계</p>}
        <div ref={sceneRootRef} />
        <p className="fu-note">연결과 미래는 AI가 성취기준 원문을 바탕으로 그린 수업 아이디어입니다. 키워드는 원문에 있는 말만 쓰고, 이어지지 않는 성취기준은 억지로 엮지 않습니다. 한 번 본 미래는 저장되어 다시 열면 바로 보입니다.</p>
      </main>
    </div>
  )
}
