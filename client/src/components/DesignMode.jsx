import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X, HelpCircle } from 'lucide-react'
import { fetchGraphData, invalidateGraphCache } from '../lib/graphDataCache'
import { standardKey, codeFromKey, subjectFromKey } from '../lib/standardKey'
import Logo from './Logo'
import { useAuthStore } from '../stores/authStore'
import DesignModeCoach from './DesignModeCoach'
import PairLens from './lenses/PairLens'
import { nodeSchoolLevel } from './lenses/lensCommon'
import ThemeLens from './lenses/ThemeLens'
import NeighborLens from './lenses/NeighborLens'
import SeriesLens from './lenses/SeriesLens'
import ExplorationContextBar from './ExplorationContextBar'
import { useDestinationProject } from './useDestinationProject'
import { destinationBarModel } from '../lib/exploreBar'
import {
  projectDestination, readBasket, writeBasket, clearBasket as clearStoredBasket, mergeBasketMeta,
  compareAvailability, futuresUrl,
} from '../lib/exploreDestination'
import { safeSessionStorage } from '../lib/explorationDraft'
import { EXPLORE_COPY } from '../lib/explorationCopy'

const LENSES = [
  { id: 'neighbor', label: '성취기준에서 찾기', hint: '이 성취기준과 연결된 것' },
  { id: 'theme', label: '주제로 찾기', hint: '이 주제로 어떤 교과가 연결되는지' },
  { id: 'series', label: '학년 간 연결 보기', hint: '앞뒤 학습 계열은 무엇인지' },
  { id: 'pair', label: '두 과목으로 찾기', hint: '두 교과의 성취기준이 어떻게 붙는지' },
]

// 담기 저장값은 성취기준 key(standardKey — 충돌 코드는 "code|과목"). 예전 저장값(code)은
// 충돌이 없으면 key와 같아 그대로 읽힌다 (마이그레이션 불필요).
// 담기는 보낼 곳(?project=)별로 나뉜다 — lib/exploreDestination.js 참고.
const SCHOOL_LEVELS = ['초등학교', '중학교', '고등학교']

/**
 * 설계 모드 — 교사의 4가지 질문에 답하는 렌즈 셸
 * URL이 상태를 기록: ?mode=design&lens=pair&a=교과A&b=교과B&q=검색어&focus=성취기준key
 */
export default function DesignMode() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [searchParams, setSearchParams] = useSearchParams()
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAllLinks, setShowAllLinks] = useState(false)

  // ── URL 상태 ──
  const lens = searchParams.get('lens') || 'neighbor'
  const pair = [searchParams.get('a') || '', searchParams.get('b') || '']
  const query = searchParams.get('q') || ''
  const focusKey = searchParams.get('focus') || '' // 이웃·계열 렌즈 중심 성취기준 key
  const level = searchParams.get('level') || '' // 학교급 필터 ('' = 전체)

  const patchParams = useCallback((patch) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  // ── 보낼 곳 (?project=) ──
  const projectParam = searchParams.get('project') || ''
  const destination = useMemo(() => projectDestination(projectParam), [projectParam])
  const projectState = useDestinationProject(destination.projectId)
  const bar = destinationBarModel(destination, projectState)

  // ── 담기 트레이 (세션 유지, 보낼 곳별로 따로) ──
  const [basket, setBasket] = useState(() => new Set(readBasket(safeSessionStorage(), destination)))
  useEffect(() => { setBasket(new Set(readBasket(safeSessionStorage(), destination))) }, [destination])
  // key→교과(subject_group) 해석용 — 담기 시 교과 메타를 함께 적재(모달 자동선택)
  const keyToGroupRef = useRef(new Map())
  useEffect(() => {
    keyToGroupRef.current = new Map((graphData?.nodes || []).map(n => [standardKey(n), n.subject_group || n.subject]))
  }, [graphData])
  const toggleBasket = useCallback((keys) => {
    setBasket(prev => {
      const next = new Set(prev)
      const allIn = keys.every(k => next.has(k))
      keys.forEach(k => allIn ? next.delete(k) : next.add(k))
      const storage = safeSessionStorage()
      writeBasket(storage, destination, [...next])
      // 교과 메타 누적 — 담긴 key의 subject_group (프로젝트 만들기 모달의 교과 자동 선택용)
      mergeBasketMeta(storage, [...next].map(k => [k, keyToGroupRef.current.get(k)]))
      return next
    })
  }, [destination])

  // 담기 전체 비우기 (인라인 2단계 확인)
  const [clearConfirm, setClearConfirm] = useState(false)
  const clearBasket = useCallback(() => {
    setBasket(new Set())
    clearStoredBasket(safeSessionStorage(), destination)
    setClearConfirm(false)
  }, [destination])

  // ── 그래프 데이터 ──
  // 항상 status=all로 한 번만 받고 렌즈별로 클라이언트 필터링:
  // - 과목쌍 렌즈는 candidate(AI 제안)를 점선으로 항상 노출 (빈 쌍 문제 완화)
  // - 나머지 렌즈는 "AI 제안 포함" 토글을 따름 (기존 동작 유지)
  // refreshTick은 온디맨드 AI 탐색 완료 후 재조회 트리거
  const [refreshTick, setRefreshTick] = useState(0)
  const refreshGraph = useCallback(() => {
    invalidateGraphCache() // 탐색으로 링크가 추가됐으므로 공유 캐시 무효화
    setRefreshTick(t => t + 1)
  }, [])
  useEffect(() => {
    let cancelled = false
    if (refreshTick === 0) setLoading(true) // 백그라운드 갱신은 로딩 화면 없이
    fetchGraphData('all')
      .then(data => { if (!cancelled) setGraphData(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshTick])

  // published만 남긴 그래프 (계열·이웃 렌즈의 기본 뷰)
  const publishedGraph = useMemo(() => {
    if (!graphData) return null
    return { ...graphData, links: graphData.links.filter(l => (l.status || 'published') === 'published') }
  }, [graphData])

  // 과목별 published 교과 간 연결 수 (과목 선택 드롭다운 표기용 —
  // 어떤 과목이 연결이 풍부한지 고르기 전에 보이게 한다)
  const subjectLinkCounts = useMemo(() => {
    if (!graphData) return new Map()
    const subjById = new Map(graphData.nodes.map(n => [n.id, n.subject]))
    const counts = new Map()
    for (const l of graphData.links) {
      if ((l.status || 'published') !== 'published') continue
      const sa = subjById.get(typeof l.source === 'object' ? l.source?.id : l.source)
      const sb = subjById.get(typeof l.target === 'object' ? l.target?.id : l.target)
      if (!sa || !sb || sa === sb) continue
      counts.set(sa, (counts.get(sa) || 0) + 1)
      counts.set(sb, (counts.get(sb) || 0) + 1)
    }
    return counts
  }, [graphData])

  // 학교급 필터가 적용된 과목 목록 (고교 교사가 106개 평면 목록에서 헤매지 않도록)
  // 학교급 미상(null) 노드는 배제하지 않음 — 고교 선택과목 누락 방지
  const subjects = useMemo(() => {
    if (!graphData) return []
    const nodes = level
      ? graphData.nodes.filter(n => { const lv = nodeSchoolLevel(n); return lv === level || lv === null })
      : graphData.nodes
    return [...new Set(nodes.map(n => n.subject))].sort()
  }, [graphData, level])

  // 학교급별 과목 그룹 (PairLens의 <optgroup> 용 — 초/중 공통 과목은 각 학교급에 모두 표시)
  const subjectGroups = useMemo(() => {
    if (!graphData) return []
    const nodes = level
      ? graphData.nodes.filter(n => { const lv = nodeSchoolLevel(n); return lv === level || lv === null })
      : graphData.nodes
    const byLevel = new Map(SCHOOL_LEVELS.map(lv => [lv, new Set()]))
    const etc = new Set()
    for (const n of nodes) {
      const lv = nodeSchoolLevel(n)
      if (byLevel.has(lv)) byLevel.get(lv).add(n.subject)
      else etc.add(n.subject)
    }
    const groups = [...byLevel.entries()]
      .map(([label, set]) => ({ label, subjects: [...set].sort() }))
      .filter(g => g.subjects.length > 0)
    if (etc.size > 0) groups.push({ label: '기타', subjects: [...etc].sort() })
    return groups
  }, [graphData, level])

  // 렌즈 간 이동 헬퍼 (인자는 성취기준 key)
  const openNeighbor = useCallback((key) => patchParams({ lens: 'neighbor', focus: key }), [patchParams])

  // 탐험 모드로 전환 (선택 교과군을 3D 필터로 이월)
  const toExplore = () => {
    const groups = new Set()
    if (graphData) {
      for (const s of pair.filter(Boolean)) {
        const node = graphData.nodes.find(n => n.subject === s)
        if (node) groups.add(node.subject_group || node.subject)
      }
    }
    const next = new URLSearchParams(searchParams)
    next.set('mode', 'explore')
    if (groups.size > 0) next.set('subjects', [...groups].join(','))
    setSearchParams(next)
  }

  // 프로젝트 시작 CTA — 워크스페이스 선택 후 생성 모달이 자동으로 열리고
  // 담은 성취기준(sessionStorage)이 모달에 자동 포함된다
  const startProject = () => {
    navigate('/workspaces?createProject=1')
  }

  const basketList = [...basket]
  // 미래보기 비교 — 2~7개만. 넘치면 임의로 자르지 않고 버튼을 막고 이유를 보인다.
  const compare = compareAvailability(basketList.length)
  const openCompare = () => {
    if (!compare.ok) return
    navigate(futuresUrl({ keys: basketList, destination }))
  }
  const [showCoach, setShowCoach] = useState(false)

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 첫 방문 코치마크 (3스텝, 1회 — 가이드 버튼으로 재호출 가능) */}
      <DesignModeCoach forceShow={showCoach} onComplete={() => setShowCoach(false)} />
      {/* 앱 바 */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} className="flex items-center gap-1.5 hover:opacity-80 transition">
          <Logo size={22} />
          <span className="hidden sm:inline text-sm font-bold text-gray-800">커리큘럼 위버</span>
        </a>
        <span className="text-gray-300">|</span>
        <h1 className="text-sm font-medium text-gray-600 whitespace-nowrap"><span className="hidden sm:inline">성취기준 </span>연결 찾기</h1>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => setShowCoach(true)} title="사용법 보기"
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-600 transition">
            <HelpCircle size={13} />
            <span className="hidden sm:inline">가이드</span>
          </button>
          <label className="hidden sm:flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-gray-500">
            <input type="checkbox" checked={showAllLinks} onChange={e => setShowAllLinks(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            AI 제안 포함
          </label>
          {!user && (
            <button
              onClick={() => navigate('/login', { state: { from: { pathname: window.location.pathname, search: window.location.search } } })}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition"
              title="로그인하면 AI 시나리오와 프로젝트 시작을 쓸 수 있어요">
              로그인
            </button>
          )}
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            <span className="px-2 sm:px-4 py-1.5 rounded-[10px] text-xs font-bold bg-blue-600 text-white shadow-sm whitespace-nowrap">🧭 연결 찾기</span>
            <button onClick={toExplore}
              className="px-2 sm:px-4 py-1.5 rounded-[10px] text-xs font-bold text-gray-500 hover:text-gray-700 transition whitespace-nowrap">
              전체 지도 · 3D
            </button>
          </div>
        </div>
      </div>

      {/* 보낼 곳·반영 상태 머리 줄 */}
      <ExplorationContextBar theme="light" variant="row" icon={bar.icon} target={bar.target}
        changeHref={bar.changeHref} status={bar.status}
        actions={basket.size > 0 ? <span className="text-xs text-gray-600 whitespace-nowrap">{EXPLORE_COPY.graph.basketCount(basket.size)}</span> : null} />

      {/* 렌즈 바 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0 overflow-x-auto">
        {LENSES.map(l => (
          <button key={l.id} onClick={() => patchParams({ lens: l.id })} title={l.hint}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition whitespace-nowrap ${
              lens === l.id
                ? 'bg-blue-50 border-blue-500 text-blue-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>
            {l.label}
          </button>
        ))}
        <span className="hidden md:inline text-[11px] text-gray-400 ml-1">
          {LENSES.find(l => l.id === lens)?.hint}
        </span>
        {/* 학교급 필터 — 과목 목록·검색 결과를 내 학교급으로 좁힌다 */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {['', ...SCHOOL_LEVELS].map(lv => (
            <button key={lv} onClick={() => patchParams({ level: lv })}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition whitespace-nowrap ${
                level === lv
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {lv ? lv.replace('학교', '') : '전체 학교급'}
            </button>
          ))}
        </div>
      </div>

      {/* 렌즈 콘텐츠 */}
      <div className="flex-1 overflow-auto min-h-0 px-4 py-4">
        {loading && !graphData ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm">교과 연결 데이터 로딩 중…</p>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto">
            {lens === 'pair' && (
              <PairLens graph={graphData} subjects={subjects} subjectGroups={subjectGroups} pair={pair}
                onPickPair={(p) => patchParams({ a: p[0], b: p[1] })}
                basket={basket} onToggleBasket={toggleBasket} onOpenNeighbor={openNeighbor}
                subjectLinkCounts={subjectLinkCounts} onGraphRefresh={refreshGraph} />
            )}
            {lens === 'theme' && (
              <ThemeLens graph={graphData} query={query} onQuery={(q) => patchParams({ q })} level={level}
                basket={basket} onToggleBasket={toggleBasket} onOpenNeighbor={openNeighbor} />
            )}
            {lens === 'series' && (
              <SeriesLens graph={showAllLinks ? graphData : publishedGraph} focusKey={focusKey} level={level}
                onFocus={(key) => patchParams({ focus: key })}
                basket={basket} onToggleBasket={toggleBasket} />
            )}
            {lens === 'neighbor' && (
              <NeighborLens graph={showAllLinks ? graphData : publishedGraph} focusKey={focusKey} level={level}
                onFocus={(key) => patchParams({ focus: key })}
                basket={basket} onToggleBasket={toggleBasket} />
            )}
          </div>
        )}
      </div>

      {/* 담기 트레이 */}
      {basket.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-t border-gray-200 shrink-0">
          <span className="text-xs text-gray-600 whitespace-nowrap">
            🧺 담은 성취기준 <b className="text-blue-700">{basket.size}</b>
          </span>
          {clearConfirm ? (
            <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
              <span className="text-gray-500">모두 비울까요?</span>
              <button onClick={clearBasket} className="font-semibold text-red-600 hover:underline">비우기</button>
              <button onClick={() => setClearConfirm(false)} className="text-gray-400 hover:text-gray-600">취소</button>
            </span>
          ) : (
            <button onClick={() => setClearConfirm(true)}
              className="text-[11px] text-gray-400 hover:text-gray-600 whitespace-nowrap">비우기</button>
          )}
          <div className="flex gap-1.5 overflow-x-auto min-w-0">
            {basketList.slice(0, 6).map(key => (
              <span key={key} title={subjectFromKey(key) || undefined}
                className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-lg text-[11px] font-mono text-gray-600 whitespace-nowrap">
                {codeFromKey(key)}
                {subjectFromKey(key) && <span className="font-sans text-[10px] text-gray-400">{subjectFromKey(key)}</span>}
                <button onClick={() => toggleBasket([key])} className="text-gray-400 hover:text-gray-600"><X size={10} /></button>
              </span>
            ))}
            {basketList.length > 6 && <span className="text-[11px] text-gray-400 self-center whitespace-nowrap">외 {basketList.length - 6}</span>}
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {!compare.ok && (
              <span className="hidden md:inline text-[11px] text-gray-600 whitespace-nowrap">
                {compare.reason === 'tooMany' ? EXPLORE_COPY.graph.tooMany : EXPLORE_COPY.graph.tooFew}
              </span>
            )}
            {destination.type === 'new' && (
              <button onClick={startProject}
                className="min-h-[36px] px-3.5 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold transition whitespace-nowrap">
                {EXPLORE_COPY.graph.startProject}
              </button>
            )}
            <button onClick={openCompare} disabled={!compare.ok}
              title={compare.ok ? undefined : (compare.reason === 'tooMany' ? EXPLORE_COPY.graph.tooMany : EXPLORE_COPY.graph.tooFew)}
              className="min-h-[36px] px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition whitespace-nowrap">
              {EXPLORE_COPY.graph.compare}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
