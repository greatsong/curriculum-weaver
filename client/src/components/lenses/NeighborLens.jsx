import { useState, useMemo } from 'react'
import { Search, ChevronRight, Plus, Check } from 'lucide-react'
import { LINK_TYPE_LABELS, LINK_TYPE_COLORS, getLinkId, subjectColor, linkQuality } from './lensCommon'

/**
 * 이웃 렌즈 — 성취기준 하나를 중심으로 직접 연결된 이웃을 탐색 (한 홉씩 걷기)
 *
 * props:
 *  - graph: { nodes, links }
 *  - focusCode: 중심 성취기준 코드 (없으면 검색 안내)
 *  - onFocus(code): 중심 변경 (브레드크럼은 내부 관리)
 *  - basket, onToggleBasket
 */
export default function NeighborLens({ graph, focusCode, onFocus, basket, onToggleBasket }) {
  const [trail, setTrail] = useState([]) // 방문 경로 (code[])
  const [query, setQuery] = useState('')

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
      .sort((x, y) => linkQuality(y.link) - linkQuality(x.link))
  }, [graph, center, nodeById])

  const walk = (code) => {
    setTrail(prev => [...prev.filter(c => c !== code && c !== focusCode), focusCode].filter(Boolean).slice(-6))
    onFocus(code)
  }

  // 검색 (코드/내용/과목 단순 매칭)
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !graph) return []
    return graph.nodes
      .filter(n => n.code.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q) || n.subject?.toLowerCase().includes(q))
      .slice(0, 12)
  }, [query, graph])

  if (!center) {
    return (
      <div className="flex flex-col items-center py-16 gap-4">
        <p className="text-gray-600 font-medium">중심에 둘 성취기준을 찾아보세요</p>
        <div className="relative w-full max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
            placeholder="코드, 내용, 교과로 검색…"
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
      </div>
    )
  }

  const inBasket = basket.has(center.code)

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
        <button onClick={() => { setTrail([]); onFocus('') }}
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

      {/* 이웃 목록 */}
      {neighbors.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">이 성취기준은 아직 검증된 연결이 없습니다 — AI 탐색에서 제안받아 보세요.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {neighbors.map(({ link, node }) => (
            <button key={node.code} onClick={() => walk(node.code)}
              className="text-left border-l-4 border border-gray-200 rounded-xl px-3 py-2.5 bg-white hover:shadow-md hover:-translate-y-px transition group"
              style={{ borderLeftColor: subjectColor(node) }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-bold"
                  style={{ backgroundColor: LINK_TYPE_COLORS[link.link_type] || '#6b7280' }}>
                  {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                </span>
                <span className="font-mono text-[11px] font-bold text-gray-700">{node.code}</span>
                <span className="text-[10px] text-gray-400 ml-auto">{node.subject}</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{node.content}</p>
              {link.rationale && (
                <p className="text-[11px] text-amber-600/80 mt-1 line-clamp-1">💡 {link.rationale}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
