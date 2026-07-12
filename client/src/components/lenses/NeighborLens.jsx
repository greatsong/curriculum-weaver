import { useState, useMemo } from 'react'
import { Search, ChevronRight, Plus, Check } from 'lucide-react'
import { LINK_TYPE_LABELS, LINK_TYPE_COLORS, getLinkId, subjectColor, linkQuality, isSameGrade, nodeSchoolLevel } from './lensCommon'
import { useScenario, ScenarioButton, ScenarioPanel } from './scenarioShared'

// 실생활·융합 맥락으로 묶는 연결 유형 (계열 연결과 구분)
const CONTEXT_TYPES = new Set(['cross_subject', 'application', 'same_concept'])

/**
 * 이웃 렌즈 — 성취기준 하나를 중심으로 직접 연결된 이웃을 탐색 (한 홉씩 걷기)
 *
 * "실생활 맥락" 관점: 수학·정보 같은 도구 교과의 고질적 문제(작위적 실생활 문제)를
 * 뒤집는다 — 상대 교과의 성취기준이 곧 교육과정이 보증하는 '진짜 맥락'이므로,
 * 연결을 "이 개념이 진짜 필요해지는 상황" 카드로 보여주고, 필요하면 그 자리에서
 * "그 개념 없이는 답할 수 없는" 문제 시나리오를 AI로 생성한다 (쌍당 1회 캐시).
 *
 * props:
 *  - graph: { nodes, links }
 *  - focusCode: 중심 성취기준 코드 (없으면 검색 안내)
 *  - onFocus(code): 중심 변경 (브레드크럼은 내부 관리)
 *  - level: 학교급 필터 — 검색 결과에 적용 (이웃 목록은 학교급을 넘나드는 것이 가치라 필터하지 않음)
 *  - basket, onToggleBasket
 */
export default function NeighborLens({ graph, focusCode, onFocus, level, basket, onToggleBasket }) {
  const [trail, setTrail] = useState([]) // 방문 경로 (code[])
  const [query, setQuery] = useState('')
  const [pickSubject, setPickSubject] = useState('') // 빈 상태의 "내 교과 선택" 진입로
  const { scenario, openScenario, closeScenario } = useScenario()
  // 1:N 시나리오 — 맥락 카드 다중 선택 (최대 4)
  const [picked, setPicked] = useState(() => new Set())
  const togglePick = (code) => setPicked(prev => {
    const next = new Set(prev)
    if (next.has(code)) next.delete(code)
    else if (next.size < 4) next.add(code)
    return next
  })

  const nodeByCode = useMemo(() => new Map((graph?.nodes || []).map(n => [n.code, n])), [graph])
  const nodeById = useMemo(() => new Map((graph?.nodes || []).map(n => [n.id, n])), [graph])

  const center = focusCode ? nodeByCode.get(focusCode) : null

  const neighbors = useMemo(() => {
    if (!graph || !center) return []
    return graph.links
      .filter(l => getLinkId(l, 'source') === center.id || getLinkId(l, 'target') === center.id)
      .map(l => {
        const otherId = getLinkId(l, 'source') === center.id ? getLinkId(l, 'target') : getLinkId(l, 'source')
        return { link: l, node: nodeById.get(otherId) }
      })
      .filter(x => x.node)
      // 같은 학년군 우선(융합 수업 기본), 그 안에서 품질순
      .sort((x, y) =>
        ((isSameGrade(center, y.node) ? 10 : 0) + linkQuality(y.link)) -
        ((isSameGrade(center, x.node) ? 10 : 0) + linkQuality(x.link))
      )
  }, [graph, center, nodeById])

  // 실생활·융합 맥락(타 교과) vs 학습 계열·같은 교과 — 관점이 다르므로 섹션 분리
  const { contextNeighbors, seriesNeighbors } = useMemo(() => {
    const ctx = [], series = []
    for (const item of neighbors) {
      if (CONTEXT_TYPES.has(item.link.link_type) && item.node.subject !== center?.subject) ctx.push(item)
      else series.push(item)
    }
    return { contextNeighbors: ctx, seriesNeighbors: series }
  }, [neighbors, center])

  const walk = (code) => {
    setTrail(prev => [...prev.filter(c => c !== code && c !== focusCode), focusCode].filter(Boolean).slice(-6))
    closeScenario()
    setPicked(new Set())
    onFocus(code)
  }


  // 검색 (코드/내용/과목 단순 매칭 — 셸 학교급 필터 적용)
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !graph) return []
    return graph.nodes
      .filter(n => { if (!level) return true; const lv = nodeSchoolLevel(n); return lv === level || lv === null })
      .filter(n => n.code.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q) || n.subject?.toLowerCase().includes(q))
      .slice(0, 12)
  }, [query, graph, level])

  // "내 교과 선택" 진입로 — 과목 목록과 선택 과목의 성취기준
  const subjects = useMemo(() => {
    if (!graph) return []
    const nodes = level
      ? graph.nodes.filter(n => { const lv = nodeSchoolLevel(n); return lv === level || lv === null })
      : graph.nodes
    return [...new Set(nodes.map(n => n.subject))].sort()
  }, [graph, level])
  const subjectStandards = useMemo(() => {
    if (!graph || !pickSubject) return []
    return graph.nodes.filter(n => n.subject === pickSubject).sort((a, b) => a.code.localeCompare(b.code))
  }, [graph, pickSubject])

  if (!center) {
    return (
      <div className="flex flex-col items-center py-10 gap-4">
        <div className="text-center">
          <p className="text-gray-700 font-semibold">내 교과의 성취기준에서 출발해 보세요</p>
          <p className="text-xs text-gray-400 mt-1">연결된 다른 교과의 성취기준에서 수업의 실마리를 찾아보세요</p>
        </div>
        {/* 진입로 1: 내 교과 선택 → 성취기준 선택 */}
        <div className="w-full max-w-md flex flex-col gap-2">
          <select value={pickSubject} onChange={e => setPickSubject(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">내 교과 선택…</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {pickSubject && (
            <div className="max-h-64 overflow-y-auto flex flex-col gap-1.5 border border-gray-100 rounded-xl p-2 bg-gray-50/50">
              {subjectStandards.map(n => (
                <button key={n.code} onClick={() => onFocus(n.code)}
                  className="text-left bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-lg px-3 py-2 transition">
                  <span className="font-mono text-[11px] font-bold text-blue-600">{n.code}</span>
                  <span className="text-[10px] text-gray-400 ml-1.5">{n.grade_group}</span>
                  <p className="text-xs text-gray-600 line-clamp-1">{n.content}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 진입로 2: 검색 */}
        <div className="relative w-full max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="또는 코드, 내용, 교과로 검색…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="w-full max-w-md flex flex-col gap-1.5">
          {searchResults.map(n => (
            <button key={n.code} onClick={() => { setQuery(''); onFocus(n.code) }}
              className="text-left border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-lg px-3 py-2 transition">
              <span className="font-mono text-[11px] font-bold text-blue-600">{n.code}</span>
              <span className="text-[10px] text-gray-400 ml-1.5">{n.subject}</span>
              <p className="text-xs text-gray-600 line-clamp-1">{n.content}</p>
            </button>
          ))}
        </div>
        {!query.trim() && !pickSubject && nodeByCode.has('[12인기03-01]') && (
          <button onClick={() => onFocus('[12인기03-01]')}
            className="px-3.5 py-2 rounded-full border border-blue-300 bg-blue-50/60 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition">
            예시: [12인기03-01] 인공지능 기초의 이웃 보기
          </button>
        )}
      </div>
    )
  }

  const inBasket = basket.has(center.code)

  // 이웃 카드 (맥락·계열 공용) — withScenario면 시나리오 버튼 노출
  const NeighborCard = ({ link, node, withScenario }) => {
    const pairKey = [center.code, node.code].sort().join('|')
    const isOpen = scenario?.pairKey === pairKey
    return (
      <div role="button" tabIndex={0}
        onClick={() => walk(node.code)}
        onKeyDown={(e) => { if (e.key === 'Enter') walk(node.code) }}
        className="text-left border-l-4 border border-gray-200 rounded-xl px-3 py-2.5 bg-white hover:shadow-md hover:-translate-y-px transition cursor-pointer"
        style={{ borderLeftColor: subjectColor(node) }}>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-bold"
            style={{ backgroundColor: LINK_TYPE_COLORS[link.link_type] || '#6b7280' }}>
            {LINK_TYPE_LABELS[link.link_type] || link.link_type}
          </span>
          <span className="font-mono text-[11px] font-bold text-gray-700">{node.code}</span>
          <span className="text-[10px] text-gray-400 ml-auto">{node.subject} · {node.grade_group}</span>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{node.content}</p>
        {link.integration_theme && (
          <p className="text-[11px] text-blue-600/80 mt-1 line-clamp-1">🔗 {link.integration_theme}</p>
        )}
        {link.rationale && (
          <p className="text-[11px] text-amber-600/80 mt-0.5 line-clamp-2">💡 {link.rationale}</p>
        )}
        {link.lesson_hook && (
          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">📝 {link.lesson_hook}</p>
        )}
        {withScenario && (
          <div className="mt-1.5 flex items-center gap-3">
            <ScenarioButton isOpen={isOpen}
              onClick={(e) => { e.stopPropagation(); openScenario(center.code, node.code) }} />
            <button
              onClick={(e) => { e.stopPropagation(); togglePick(node.code) }}
              title="여러 맥락을 골라 하나의 시나리오로 묶기 (최대 4개)"
              className={`flex items-center gap-1 text-[11px] font-semibold transition ${
                picked.has(node.code) ? 'text-emerald-600' : 'text-gray-400 hover:text-emerald-600'}`}>
              {picked.has(node.code) ? <><Check size={11} /> 묶임</> : <><Plus size={11} /> 함께 묶기</>}
            </button>
          </div>
        )}
      </div>
    )
  }


  return (
    <div className="flex flex-col gap-4">
      {/* 브레드크럼 + 재검색 */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        {trail.map(code => (
          <span key={code} className="flex items-center gap-1.5">
            <button onClick={() => { setTrail(t => t.slice(0, t.indexOf(code))); onFocus(code) }}
              className="font-mono text-gray-400 hover:text-blue-600 transition">{code}</button>
            <ChevronRight size={11} className="text-gray-300" />
          </span>
        ))}
        <span className="font-mono font-bold text-blue-700">{center.code}</span>
        <button onClick={() => { setTrail([]); closeScenario(); onFocus('') }}
          className="ml-2 text-gray-400 hover:text-gray-600 underline underline-offset-2">다른 성취기준 찾기</button>
      </div>

      {/* 중심 카드 */}
      <div className="border-2 border-blue-400 bg-blue-50/40 rounded-xl px-4 py-3 max-w-xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subjectColor(center) }} />
          <span className="font-mono text-sm font-bold text-blue-700">{center.code}</span>
          <span className="text-xs text-gray-500">{center.subject} · {center.grade_group}</span>
          <button onClick={() => onToggleBasket([center.code])}
            className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition ${
              inBasket ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-gray-300 text-gray-600 hover:border-blue-400'}`}>
            {inBasket ? <><Check size={11} /> 담김</> : <><Plus size={11} /> 담기</>}
          </button>
        </div>
        <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{center.content}</p>
      </div>

      {/* 실생활 문제 시나리오 패널 */}
      {scenario && (
        <ScenarioPanel scenario={scenario} onClose={closeScenario}
          subjectOf={(code) => nodeByCode.get(code)?.subject}
          basket={basket} onToggleBasket={onToggleBasket} />
      )}

      {/* 실생활·융합 맥락 — 타 교과의 진짜 탐구 상황 */}
      {contextNeighbors.length > 0 && (
        <div>
          <div className="mb-2">
            <h3 className="text-[13px] font-bold text-gray-700">🌍 실생활·융합 맥락 <span className="font-normal text-gray-400">({contextNeighbors.length})</span></h3>
            <p className="text-[11px] text-gray-400 mt-0.5">이 성취기준이 다른 교과 수업에서 실제로 쓰이는 장면들이에요 — 여러 개를 묶어 하나의 시나리오로 만들 수도 있어요</p>
            {picked.size > 0 && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => openScenario(center.code, [...picked])}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 transition">
                  ✨ 묶은 맥락 {picked.size}개로 시나리오 만들기
                </button>
                {[...picked].map(code => (
                  <span key={code} className="font-mono text-[10.5px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{code}</span>
                ))}
                <button onClick={() => setPicked(new Set())} className="text-[11px] text-gray-400 hover:text-gray-600 underline underline-offset-2">비우기</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {contextNeighbors.map(({ link, node }) => (
              <NeighborCard key={node.code} link={link} node={node} withScenario />
            ))}
          </div>
        </div>
      )}

      {/* 학습 계열 — 선수·심화 흐름 */}
      {seriesNeighbors.length > 0 && (
        <div>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">📚 학습 계열·같은 교과 <span className="font-normal text-gray-400">({seriesNeighbors.length})</span></h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {seriesNeighbors.map(({ link, node }) => (
              <NeighborCard key={node.code} link={link} node={node} />
            ))}
          </div>
        </div>
      )}

      {neighbors.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">이 성취기준은 아직 검증된 연결이 없습니다 — AI 탐색에서 제안받아 보세요.</p>
      )}
    </div>
  )
}
