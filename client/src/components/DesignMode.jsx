import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X, HelpCircle } from 'lucide-react'
import { fetchGraphData, invalidateGraphCache } from '../lib/graphDataCache'
import Logo from './Logo'
import DesignModeCoach from './DesignModeCoach'
import PairLens from './lenses/PairLens'
import { nodeSchoolLevel } from './lenses/lensCommon'
import ThemeLens from './lenses/ThemeLens'
import NeighborLens from './lenses/NeighborLens'
import SeriesLens from './lenses/SeriesLens'

const LENSES = [
  { id: 'neighbor', label: '이웃', hint: '이 성취기준과 연결된 것' },
  { id: 'theme', label: '주제', hint: '이 주제로 어떤 교과가 연결되는지' },
  { id: 'series', label: '계열', hint: '앞뒤 학습 계열은 무엇인지' },
  { id: 'pair', label: '과목쌍', hint: '두 교과의 성취기준이 어떻게 붙는지' },
]

const BASKET_KEY = 'cw_design_basket'
const SCHOOL_LEVELS = ['초등학교', '중학교', '고등학교']

/**
 * 설계 모드 — 교사의 4가지 질문에 답하는 렌즈 셸
 * URL이 상태를 기록: ?mode=design&lens=pair&a=교과A&b=교과B&q=검색어&focus=코드
 */
export default function DesignMode() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAllLinks, setShowAllLinks] = useState(false)

  // ── URL 상태 ──
  const lens = searchParams.get('lens') || 'neighbor'
  const pair = [searchParams.get('a') || '', searchParams.get('b') || '']
  const query = searchParams.get('q') || ''
  const focusCode = searchParams.get('focus') || ''
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

  // ── 담기 트레이 (세션 유지) ──
  const [basket, setBasket] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem(BASKET_KEY) || '[]')) } catch { return new Set() }
  })
  const toggleBasket = useCallback((codes) => {
    setBasket(prev => {
      const next = new Set(prev)
      const allIn = codes.every(c => next.has(c))
      codes.forEach(c => allIn ? next.delete(c) : next.add(c))
      sessionStorage.setItem(BASKET_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

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

  // 렌즈 간 이동 헬퍼
  const openNeighbor = useCallback((code) => patchParams({ lens: 'neighbor', focus: code }), [patchParams])

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
        <h1 className="text-sm font-medium text-gray-600">교과 연결</h1>
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
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            <span className="px-4 py-1.5 rounded-[10px] text-xs font-bold bg-blue-600 text-white shadow-sm">🧭 설계</span>
            <button onClick={toExplore}
              className="px-4 py-1.5 rounded-[10px] text-xs font-bold text-gray-500 hover:text-gray-700 transition">
              ✨ 탐험 3D
            </button>
          </div>
        </div>
      </div>

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
              <SeriesLens graph={showAllLinks ? graphData : publishedGraph} focusCode={focusCode} level={level}
                onFocus={(code) => patchParams({ focus: code })}
                basket={basket} onToggleBasket={toggleBasket} />
            )}
            {lens === 'neighbor' && (
              <NeighborLens graph={showAllLinks ? graphData : publishedGraph} focusCode={focusCode} level={level}
                onFocus={(code) => patchParams({ focus: code })}
                basket={basket} onToggleBasket={toggleBasket} />
            )}
          </div>
        )}
      </div>

      {/* 담기 트레이 */}
      {basket.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-t border-gray-200 shrink-0">
          <span className="text-xs text-gray-600">
            🧺 담은 성취기준 <b className="text-blue-700">{basket.size}</b>
          </span>
          <div className="flex gap-1.5 overflow-x-auto min-w-0">
            {basketList.slice(0, 6).map(code => (
              <span key={code} className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-lg text-[11px] font-mono text-gray-600 whitespace-nowrap">
                {code}
                <button onClick={() => toggleBasket([code])} className="text-gray-400 hover:text-gray-600"><X size={10} /></button>
              </span>
            ))}
            {basketList.length > 6 && <span className="text-[11px] text-gray-400 self-center whitespace-nowrap">외 {basketList.length - 6}</span>}
          </div>
          <button onClick={startProject}
            className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition whitespace-nowrap">
            이 조합으로 프로젝트 시작 →
          </button>
        </div>
      )}
    </div>
  )
}
