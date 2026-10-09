/**
 * 미래보기 실험실 — 과목별 빛의 원과 키워드 연결에서 여덟 관점의 수업을 탐색한다.
 * 기존 미래보기 API를 사용하되 화면과 URL 상태는 /futures-lab에서 별도로 관리한다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import {
  FUTURE_MAX, FUTURE_MODEL_OPTIONS, catalogFromBody, codesIn, mergeStandardCodes, parseFuturesSearch, searchStandards,
} from '../lib/futures2'
import { colorOfStandard, colorOfStone } from '../lib/futures2Scene'
import { createFuturesLabScene as createFuturesScene } from '../lib/futuresLabScene'
import './futuresLab.css'
import { resolvePracticeSet } from '../lib/futures2Practice'
import { FUTURES_LAB_SAMPLES } from '../lib/futuresLabSamples'
import { groupFutureStandards } from '../lib/futures2GraphLayout'
import KeywordGraph, { colorOf } from '../components/futures/KeywordGraph'
import TimeStoneEmblem from '../components/futures/TimeStoneEmblem'
import { subjectOfStandard } from '../lib/futures2GraphLayout'
import './futures.css'
import { A3_PROCEDURE, explorationSearch, handoffPolicy, resolveProjectStandards } from '../lib/futuresProjectHandoff'
import ExplorationContextBar from '../components/ExplorationContextBar'
import SendReviewDialog from '../components/SendReviewDialog'
import { destinationBarModel } from '../lib/exploreBar'
import {
  NEW_DESTINATION, projectDestination, readBasket, writeBasket, mergeBasketMeta, futuresUrl,
} from '../lib/exploreDestination'
import { createDraft, readDraft, saveDraft, safeLocalStorage, safeSessionStorage } from '../lib/explorationDraft'
import { EXPLORE_COPY } from '../lib/explorationCopy'
import { projectStandardKey } from '../lib/standardKey'

const LEVELS = [
  { id: '고등학교', label: '고등' }, { id: '중학교', label: '중학' }, { id: '초등학교', label: '초등' }, { id: '', label: '전체' },
]
const LAB_COPY = EXPLORE_COPY.futures
const GRAPH_BASE = { mid: '#0B1F1A', deep: '#04090A' } // 과목 원 안쪽 — 타임 스톤 바탕색(futuresLab.css와 같은 계열)
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
  const projectId = new URLSearchParams(location.search).get('project') || ''
  const [projectContext, setProjectContext] = useState(null)
  const [projectError, setProjectError] = useState('')
  const [projectTry, setProjectTry] = useState(0)
  // 보내기 확인 창: null | { future } — 진행 중인 프로젝트면 A-3로, 아니면 새 프로젝트로 보낸다
  const [send, setSend] = useState(null)
  const [copied, setCopied] = useState(false)
  const [boardCheck, setBoardCheck] = useState('idle')
  const contextRequest = useRef(0)
  const handoffRevision = useRef(0)
  const importedProject = useRef(null)
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
    navigate({ pathname: '/futures-lab', search: explorationSearch(nextKeys, nextModel, projectId) }, { replace: true })
  }, [navigate, model, projectId])

  useEffect(() => {
    let alive = true
    contextRequest.current += 1
    handoffRevision.current += 1
    setProjectContext(null); setProjectError(''); setSend(null); setCopied(false); setBoardCheck('idle'); importedProject.current = null
    if (!projectId) return undefined
    const id = encodeURIComponent(projectId)
    Promise.all([get(`/api/projects/${id}`), get(`/api/standards/project/${id}`), get(`/api/projects/${id}/designs/${A3_PROCEDURE}`)])
      .then(([project, standards, design]) => { if (alive) setProjectContext({ project, standards, design }) })
      .catch(() => { if (alive) setProjectError('프로젝트의 성취기준과 A-3 상태를 불러오지 못했습니다. 접근 권한을 확인하거나 다시 시도해 주세요.') })
    return () => { alive = false }
  }, [projectId, get, projectTry])

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
  // 고른 조합이 바뀌면 이전 확인 창·복사 상태는 새 조합으로 이어지지 않는다
  useEffect(() => { handoffRevision.current += 1; setSend(null); setCopied(false) }, [pickedSig])
  const projectStandards = useMemo(() => catalog && projectContext ? resolveProjectStandards(catalog, projectContext.standards, projectContext.design) : null, [catalog, projectContext])
  const projectPolicy = handoffPolicy(projectContext?.project, projectContext?.design)
  const canExplore = !projectId || (!!projectContext && !projectPolicy.blocked)
  const returnPath = projectContext ? `/workspaces/${encodeURIComponent(projectContext.project.workspace_id)}/projects/${encodeURIComponent(projectContext.project.id)}` : null
  useEffect(() => {
    if (!projectId || !projectStandards || importedProject.current === projectId) return
    importedProject.current = projectId
    // 복귀·공유 URL의 선택은 보존한다. 7개를 넘으면 교사가 직접 고른다.
    if (!new URLSearchParams(location.search).has('codes') && keys.length === 0 && !projectStandards.needsChoice && canExplore) {
      setUrl(projectStandards.standards.map(s => s.key))
    }
  }, [projectId, projectStandards, canExplore, location.search, keys.length, setUrl])
  const openSend = (future = null) => {
    if (projectId && (!projectContext || !canExplore)) throw new Error('프로젝트 정보를 확인한 뒤 다시 시도해 주세요.')
    handoffRevision.current += 1
    setCopied(false)
    setSend({ future })
  }
  const checkBoard = async () => {
    const request = ++contextRequest.current
    setBoardCheck('loading')
    try {
      const design = await get(`/api/projects/${encodeURIComponent(projectId)}/designs/${A3_PROCEDURE}`)
      if (request !== contextRequest.current) return
      setProjectContext(current => current ? { ...current, design } : current)
      setBoardCheck('checked')
    } catch {
      if (request === contextRequest.current) setBoardCheck('error')
    }
  }
  const handoffActionRef = useRef(openSend)
  handoffActionRef.current = openSend
  const activeSample = useMemo(() => FUTURES_LAB_SAMPLES.find(preset => {
    const resolved = resolvePracticeSet(catalog, preset)
    return !resolved.missing.length && pickedKeys.length === resolved.standards.length && resolved.standards.every(s => pickedKeys.includes(s.key))
  }), [catalog, pickedSig]) // eslint-disable-line react-hooks/exhaustive-deps
  const graphStandards = useMemo(() => picked.map(s => ({ ...s, subject: subjectOfStandard(s) })), [picked])
  const subjectGroups = useMemo(() => groupFutureStandards(picked), [picked])
  const colorIndexOfKey = useMemo(() => new Map(subjectGroups.flatMap(g => g.indices.map(i => [picked[i].key, g.colorIndex]))), [subjectGroups, picked])

  // 담기 — 새 프로젝트 담기(성취기준 연결 찾기·프로젝트 만들기와 같은 저장소)에 더한다
  const addToBasket = useCallback((addKeys) => {
    const storage = safeSessionStorage()
    const before = readBasket(storage, NEW_DESTINATION)
    const next = [...new Set([...before, ...addKeys])]
    if (!storage || !writeBasket(storage, NEW_DESTINATION, next)) throw new Error('성취기준을 저장하지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.')
    mergeBasketMeta(storage, addKeys.map((k) => [k, byKey.get(k)?.subject_group]))
    return next.length > before.length
  }, [byKey])

  // 의식 구간(장면) — 고른 조합이 바뀌면 새로 만들고, 연결 찾기를 뒤에서 시작한다. 모델 전환은 장면을 유지한다.
  const modelRef = useRef(model)
  modelRef.current = model
  useEffect(() => {
    const root = sceneRootRef.current
    if (!root || !catalog || !canExplore) return undefined
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
      projectActionLabel: projectId ? EXPLORE_COPY.send.openProjectAction : EXPLORE_COPY.send.openNewAction,
      hideBasket: !!projectId,
      requestFuture: async (index, m) => {
        const body = await post('/api/futures2', { codes: pickedKeys, model: m, index }, { timeoutMs: 200_000 })
        if (!body?.future) throw new Error(body?.error || '미래를 그리지 못했습니다.')
        return body.future
      },
      onStartProject: (future) => { handoffActionRef.current(future) },
      onBasket: addToBasket,
      onRetryBridges: loadBridges,
    })
    sceneRef.current = scene
    let timer = null
    if (pickedKeys.length >= 2) {
      timer = setTimeout(loadBridges, BRIDGE_DELAY_MS)
    }
    return () => { alive = false; clearTimeout(timer); scene.destroy(); sceneRef.current = null }
  }, [pickedSig, catalog, post, projectId, canExplore]) // eslint-disable-line react-hooks/exhaustive-deps
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

  // 보낼 곳 머리 줄 — 밝은 앱 색 줄을 어두운 미래보기 화면 맨 위에 둔다
  const destination = projectId ? projectDestination(projectId) : NEW_DESTINATION
  const projectState = !projectId ? { status: 'none' }
    : projectError ? { status: 'error' }
      : projectContext ? { status: 'ready', project: projectContext.project } : { status: 'loading' }
  const bar = destinationBarModel(destination, projectState)
  const registeredKeys = new Set((projectContext?.standards ?? []).map(projectStandardKey).filter(Boolean))

  // 진행 중인 프로젝트로 보내기 — 초안을 이 브라우저에 저장하고 같은 탭에서 프로젝트로 돌아간다.
  // 프로젝트 데이터·진행 절차·생략 상태는 바꾸지 않는다(초안을 대화에 넣는 것은 프로젝트 화면에서).
  const submitToProject = ({ text, include }) => {
    if (!projectContext || !returnPath) return false
    const draft = createDraft({
      projectId, text, standards: picked,
      keywords: include.bridges ? (bridges.data?.concepts || []).map((c) => c.label) : [],
      ideaTitle: include.idea ? send?.future?.title || '' : '',
    })
    if (!saveDraft(safeLocalStorage(), draft)) return false
    navigate(returnPath)
    return true
  }
  // 새 프로젝트로 — 담기와 제목·설명 추천을 남기고 그 워크스페이스의 프로젝트 만들기 화면을 연다
  // 저장에 실패하면 이동하지 않고 false를 돌려준다(대화상자가 안내). 예전에는 실패를 삼키고 이동해,
  // 고른 성취기준과 제목이 조용히 빠진 만들기 화면이 열렸다(2026-10-03 검토).
  const submitToNew = ({ workspaceId, title, desc }) => {
    try {
      addToBasket(pickedKeys)
      if (title) sessionStorage.setItem('cw_project_title_suggestion', title)
      if (desc) sessionStorage.setItem('cw_project_desc_suggestion', desc)
    } catch {
      return false
    }
    navigate(`/workspaces/${encodeURIComponent(workspaceId)}?createProject=1`)
    return true
  }
  const onCopied = (ok, token) => { if (token === handoffRevision.current) setCopied(ok) }

  return (
    <>
    <ExplorationContextBar icon={bar.icon} target={bar.target} changeHref={bar.changeHref}
      status={copied ? 'copied' : bar.status} note={bar.note}>
      {projectId && projectContext && (
        <details className="mt-1">
          <summary className="cursor-pointer min-h-[32px] inline-flex items-center font-medium text-link">{LAB_COPY.howTo}</summary>
          <ul className="m-0 mt-1 pl-4 list-disc flex flex-col gap-1 text-text-body">
            {LAB_COPY.howToBody.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </details>
      )}
    </ExplorationContextBar>
    <div className="futures-lab-root">
      <main className="fu-main">
        <header className="fu-header lab-hero">
          <div className="lab-hero-text">
            <button type="button" className="fu-back" onClick={() => navigate(returnPath || '/workspaces')}>{returnPath ? '‹ 프로젝트로 돌아가기' : '‹ 워크스페이스'}</button>
            <span className="lab-kicker">타임 스톤</span>
            <h1>미래보기</h1>
            <div className="fu-sub">성취기준 2~7개를 고르면 교과 사이의 연결을 찾고, 그 연결에서 여덟 갈래의 수업 가능성을 엽니다. 같은 과목의 성취기준은 하나의 원에 모입니다.</div>
            <div className="fu-models" role="radiogroup" aria-label="AI 모델">
              {FUTURE_MODEL_OPTIONS.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={model === o.id} className={model === o.id ? 'on' : ''} onClick={() => setModel(o.id)}>
                  {o.label}<small>{o.model}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="lab-hero-art"><TimeStoneEmblem /></div>
        </header>


        {projectId && <section className="lab-project-context" aria-label="A-3 프로젝트 연결">
          <h2>{projectContext ? LAB_COPY.projectStandardsTitle : LAB_COPY.projectStandardsLoading}</h2>
          {projectError ? <p role="alert">{projectError} <button type="button" onClick={() => setProjectTry(n => n + 1)}>다시 시도</button></p> : !projectContext ? <p role="status">프로젝트와 A-3 분석표를 확인하고 있습니다.</p> : <>
            <p>{projectPolicy.note}</p>
            {!!projectContext.project.skipped_procedures?.length && <p>생략한 단계가 있는 프로젝트는 현재 ‘이어서 시뮬레이션’을 지원하지 않습니다. 연결 아이디어 탐색과 복사는 가능합니다.</p>}
            {projectStandards && <details open={projectStandards.needsChoice}>
              <summary>프로젝트의 성취기준 {projectStandards.standards.length}개 확인</summary>
              {projectStandards.needsChoice && <p>한 번에 최대 7개를 탐색합니다. 아래에서 이번에 비교할 성취기준을 골라 주세요.</p>}
              {!projectStandards.standards.length && <p>등록된 성취기준이 없습니다. 아래 검색이나 코드 입력으로 선택해 주세요.</p>}
              <div className="lab-project-standards">{projectStandards.standards.map(s => <button type="button" key={s.key} disabled={!canExplore || (!pickedKeys.includes(s.key) && full)} aria-pressed={pickedKeys.includes(s.key)} onClick={() => pickedKeys.includes(s.key) ? remove(s.key) : add(s)}>{s.subject} {s.code}</button>)}</div>
            </details>}
            {!!projectStandards?.missing.length && <p role="status">자동으로 확인하지 못한 기준: {projectStandards.missing.join(', ')}. 아래에서 과목과 코드를 확인해 직접 선택해 주세요.</p>}
          </>}
        </section>}

        <section className="fu-top">
          <div className="fu-panel">
            <h2><span>넣은 성취기준</span><span>{subjectGroups.length}과목 · {pickedKeys.length} / {FUTURE_MAX}개</span></h2>
            {!projectId && <section className="lab-samples" aria-label="학년별 샘플 주제">
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
            </section>}
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
          {canExplore && picked.length >= 2 && <KeywordGraph standards={graphStandards} bridges={bridges} activeLabel={activeLink} onActive={setActiveLink} onRetry={() => sceneRef.current?.retryBridges()} multiEndpoint navigable base={GRAPH_BASE} />}
          {projectId && canExplore && bridges.status === 'ready' && <button type="button" className="lab-quiet" onClick={() => openSend()}>{EXPLORE_COPY.send.openFromBridges}</button>}
          <div className="lab-map-actions">
            <p>{picked.length < 2 ? '성취기준 2~7개를 선택해 주세요.' : ['error', 'slow'].includes(graphState.status) ? '연결 분석을 기다리거나 선택한 성취기준으로 미래를 볼 수 있습니다.' : '연결을 확인했다면, 여덟 갈래의 수업을 열어 보세요.'}</p>
            <button type="button" className="lab-map-open" disabled={!canExplore || !graphState.canOpen} onClick={() => sceneRef.current?.open()}>여덟 갈래의 미래 보기</button>
          </div>
        </div>
        <div ref={sceneRootRef} />
        {send && (projectId ? projectContext && canExplore : true) && (
          <SendReviewDialog mode={projectId ? 'project' : 'new'} onClose={() => setSend(null)} get={get}
            standards={picked} bridges={bridges.data} future={send.future}
            project={projectContext?.project} design={projectContext?.design} boardCheck={boardCheck} onRecheckBoard={checkBoard}
            registeredKeys={registeredKeys} existingDraft={projectId ? readDraft(safeLocalStorage(), projectId) : null}
            revision={handoffRevision.current} onCopied={onCopied} onSubmit={submitToProject}
            onSubmitNew={submitToNew}
            onSwitchToProject={(id) => navigate(futuresUrl({ keys: pickedKeys, model, destination: projectDestination(id) }))} />
        )}
        <p className="fu-note">연결과 미래는 AI가 성취기준 원문을 바탕으로 그린 수업 아이디어입니다. 키워드는 원문에 있는 말만 쓰고, 이어지지 않는 성취기준은 억지로 엮지 않습니다. 한 번 본 미래는 다시 볼 수 있도록 캐시됩니다. 프로젝트 보드에 저장되는 것은 아닙니다.</p>
      </main>
    </div>
    </>
  )
}
