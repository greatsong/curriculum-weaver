/**
 * InlineGraph2D — 교과 간 연결 탐색용 인라인 2D 그래프
 * 밝은 배경 + 굵은 링크 + 교과별 색상으로 가독성 최우선
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { X, ChevronRight, RotateCcw } from 'lucide-react'
import { apiGet } from '../lib/api'

const SUBJECT_COLORS = {
  '과학': '#16a34a', '수학': '#2563eb', '국어': '#dc2626',
  '사회': '#ca8a04', '도덕': '#ea580c',
  '기술·가정': '#9333ea', '정보': '#0891b2',
  '실과(기술·가정)/정보': '#9333ea', '실과': '#0d9488',
  '미술': '#db2777', '체육': '#65a30d', '음악': '#7c3aed',
  '영어': '#4f46e5', '제2외국어': '#0e7490', '한문': '#0d9488',
}

const LINK_TYPE_LABELS = {
  cross_subject: '교과연계', same_concept: '동일개념', prerequisite: '선수학습',
  application: '적용', extension: '확장',
}

const LINK_TYPE_COLORS = {
  cross_subject: '#f59e0b', same_concept: '#3b82f6', prerequisite: '#ef4444',
  application: '#22c55e', extension: '#a855f7',
}

const getColor = (node) => SUBJECT_COLORS[node.subject_group] || SUBJECT_COLORS[node.subject] || '#6b7280'
const getLinkId = (l, field) => typeof l[field] === 'object' ? l[field]?.id : l[field]

export default function InlineGraph2D({ subjects = [] }) {
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [hoverNode, setHoverNode] = useState(null)
  const containerRef = useRef(null)
  const fgRef = useRef()
  const [dims, setDims] = useState({ width: 600, height: 400 })

  // 컨테이너 크기 감지
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => {
      setDims({ width: e.contentRect.width, height: Math.max(e.contentRect.height, 300) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // 데이터 로드
  useEffect(() => {
    let cancelled = false
    apiGet('/api/standards/graph').then(data => {
      if (!cancelled) { setGraphData(data); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // 교과 필터링
  const subjectsSet = useMemo(() => new Set(subjects), [subjects.join(',')])

  const filteredData = useMemo(() => {
    if (!graphData || subjectsSet.size < 2) return null

    const nodeSubjectMap = new Map()
    graphData.nodes.forEach(n => nodeSubjectMap.set(n.id, n.subject_group || n.subject))

    // 선택 교과에 속하는 노드
    const selNodes = graphData.nodes.filter(n =>
      subjectsSet.has(n.subject_group || n.subject) || subjectsSet.has(n.subject)
    )
    const selNodeIds = new Set(selNodes.map(n => n.id))

    // 선택 교과 간 교차 연결만
    const links = graphData.links.filter(l => {
      const srcId = getLinkId(l, 'source'), tgtId = getLinkId(l, 'target')
      if (!selNodeIds.has(srcId) || !selNodeIds.has(tgtId)) return false
      return nodeSubjectMap.get(srcId) !== nodeSubjectMap.get(tgtId)
    })

    // 연결된 노드만 표시
    const connectedIds = new Set()
    links.forEach(l => {
      connectedIds.add(getLinkId(l, 'source'))
      connectedIds.add(getLinkId(l, 'target'))
    })
    const nodes = selNodes.filter(n => connectedIds.has(n.id))

    return { nodes, links }
  }, [graphData, subjectsSet])

  // 선택 노드의 연결 링크
  const selectedLinks = useMemo(() => {
    if (!selectedNode || !filteredData) return []
    return filteredData.links.filter(l =>
      getLinkId(l, 'source') === selectedNode.id || getLinkId(l, 'target') === selectedNode.id
    )
  }, [selectedNode, filteredData])

  // 노드 클릭 — 줌은 적당히, 전체 맥락 유지
  const handleNodeClick = useCallback((node) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [])

  // 초기화
  const handleReset = useCallback(() => {
    setSelectedNode(null)
    setHoverNode(null)
    if (fgRef.current) fgRef.current.zoomToFit(300, 20)
  }, [])

  // 연결 목록에서 노드 이동
  const navigateToNode = useCallback((node) => {
    setSelectedNode(node)
  }, [])

  // 포스 설정 + 초기 줌 맞춤 — 노드 수에 따라 밀도 조절
  useEffect(() => {
    if (filteredData && fgRef.current) {
      const fg = fgRef.current
      const n = filteredData.nodes.length
      try {
        // 소수 노드일수록 약한 반발 → 밀집 레이아웃
        const charge = fg.d3Force('charge')
        if (charge) charge.strength(n < 20 ? -60 : n < 50 ? -100 : -150)
        const link = fg.d3Force('link')
        if (link) link.distance(n < 20 ? 40 : 60)
      } catch (e) { /* ignore */ }
      setTimeout(() => fg.zoomToFit?.(300, 20), 500)
    }
  }, [filteredData])

  // 하이라이트 노드 집합 (선택/호버 시)
  const highlightIds = useMemo(() => {
    const target = selectedNode || hoverNode
    if (!target || !filteredData) return new Set()
    const ids = new Set([target.id])
    filteredData.links.forEach(l => {
      const srcId = getLinkId(l, 'source'), tgtId = getLinkId(l, 'target')
      if (srcId === target.id) ids.add(tgtId)
      if (tgtId === target.id) ids.add(srcId)
    })
    return ids
  }, [selectedNode, hoverNode, filteredData])

  // 전체 연결 쌍 목록 (노드 미선택 시 표시)
  const allLinkPairs = useMemo(() => {
    if (!filteredData) return []
    return filteredData.links.map(link => {
      const src = typeof link.source === 'object' ? link.source : filteredData.nodes.find(n => n.id === link.source)
      const tgt = typeof link.target === 'object' ? link.target : filteredData.nodes.find(n => n.id === link.target)
      return { link, src, tgt }
    }).filter(p => p.src && p.tgt)
  }, [filteredData])

  // 패널/그래프 비율 — flex로 채우되, 비율만 계산
  const nodeCount = filteredData?.nodes.length || 0
  const panelPercent = nodeCount <= 10 ? 50 : nodeCount <= 30 ? 45 : 38
  const graphPercent = 100 - panelPercent

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-400">그래프 로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!filteredData || filteredData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-white text-gray-400">
        <div className="text-center">
          <p className="text-sm">선택한 교과 간 연결이 없습니다</p>
          <p className="text-xs mt-1">다른 교과 조합을 시도해보세요</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex h-full w-full bg-white">
      {/* 그래프 영역 */}
      <div style={{ width: `${graphPercent}%`, height: dims.height }} className="relative shrink-0">
        <ForceGraph2D
          ref={fgRef}
          graphData={filteredData}
          width={Math.round(dims.width * graphPercent / 100)}
          height={dims.height}
          backgroundColor="#fafbfc"
          nodeCanvasObject={(node, ctx, globalScale) => {
            const isActive = highlightIds.size === 0 || highlightIds.has(node.id)
            const isSelected = selectedNode?.id === node.id
            // 노드 크기: 줌 레벨에 관계없이 시각적으로 일정한 크기 유지
            const baseR = isSelected ? 7 : 5
            const r = baseR / Math.max(globalScale * 0.5, 0.5) // 줌 아웃해도 너무 작아지지 않게
            const color = getColor(node)

            // 선택 노드 배경 강조
            if (isSelected) {
              ctx.beginPath()
              ctx.arc(node.x, node.y, r + 3 / globalScale, 0, 2 * Math.PI)
              ctx.fillStyle = color + '20'
              ctx.fill()
              ctx.strokeStyle = color
              ctx.lineWidth = 2 / globalScale
              ctx.stroke()
            }

            // 노드 원
            ctx.beginPath()
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
            ctx.fillStyle = isActive ? color : color + '25'
            ctx.fill()

            // 라벨 — 항상 표시 (줌 수준에 맞게 스케일)
            const fontSize = Math.max(10 / globalScale, 3)
            const label = node.code
            ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = isActive ? '#374151' : '#d1d5db'
            ctx.fillText(label, node.x, node.y + r + 2 / globalScale)

            // 교과명 (활성 노드만)
            if (isActive && globalScale > 0.8) {
              ctx.font = `${Math.max(8 / globalScale, 2.5)}px -apple-system, sans-serif`
              ctx.fillStyle = '#9ca3af'
              ctx.fillText(node.subject, node.x, node.y + r + 2 / globalScale + fontSize + 1 / globalScale)
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.beginPath()
            ctx.arc(node.x, node.y, 12, 0, 2 * Math.PI)
            ctx.fillStyle = color
            ctx.fill()
          }}
          linkCanvasObject={(link, ctx, globalScale) => {
            const srcId = getLinkId(link, 'source'), tgtId = getLinkId(link, 'target')
            const src = typeof link.source === 'object' ? link.source : null
            const tgt = typeof link.target === 'object' ? link.target : null
            if (!src || !tgt) return

            const isHighlighted = highlightIds.size > 0 && highlightIds.has(srcId) && highlightIds.has(tgtId)
            const isDimmed = highlightIds.size > 0 && !isHighlighted
            const color = LINK_TYPE_COLORS[link.link_type] || '#9ca3af'

            ctx.beginPath()
            ctx.moveTo(src.x, src.y)
            ctx.lineTo(tgt.x, tgt.y)
            ctx.strokeStyle = isDimmed ? '#e5e7eb' : color
            ctx.lineWidth = (isHighlighted ? 3 : 1.5) / Math.max(globalScale * 0.7, 0.5)
            if (link.link_type === 'prerequisite') ctx.setLineDash([4 / globalScale, 4 / globalScale])
            else ctx.setLineDash([])
            ctx.stroke()
            ctx.setLineDash([])

            // 연결 유형 라벨 (하이라이트 시 + 줌 충분할 때)
            if (isHighlighted && globalScale > 1) {
              const midX = (src.x + tgt.x) / 2
              const midY = (src.y + tgt.y) / 2
              const label = LINK_TYPE_LABELS[link.link_type] || ''
              const fontSize = Math.max(8 / globalScale, 3)
              ctx.font = `bold ${fontSize}px -apple-system, sans-serif`
              const pad = 2 / globalScale
              const tw = ctx.measureText(label).width
              ctx.fillStyle = color
              ctx.globalAlpha = 0.9
              ctx.beginPath()
              ctx.roundRect(midX - tw / 2 - pad, midY - fontSize / 2 - pad, tw + pad * 2, fontSize + pad * 2, 2 / globalScale)
              ctx.fill()
              ctx.globalAlpha = 1
              ctx.fillStyle = '#ffffff'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(label, midX, midY)
            }
          }}
          linkPointerAreaPaint={(link, color, ctx) => {
            const src = typeof link.source === 'object' ? link.source : null
            const tgt = typeof link.target === 'object' ? link.target : null
            if (!src || !tgt) return
            ctx.beginPath()
            ctx.moveTo(src.x, src.y)
            ctx.lineTo(tgt.x, tgt.y)
            ctx.strokeStyle = color
            ctx.lineWidth = 8
            ctx.stroke()
          }}
          onNodeClick={handleNodeClick}
          onNodeHover={setHoverNode}
          onBackgroundClick={() => setSelectedNode(null)}
          cooldownTicks={60}
          d3AlphaDecay={0.05}
          d3VelocityDecay={0.4}
          warmupTicks={30}
          minZoom={0.5}
          maxZoom={8}
        />

        {/* 범례 + 통계 */}
        <div className="absolute top-2 left-2 flex flex-wrap items-center gap-x-3 gap-y-1 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-gray-200 text-[11px]">
          {[...new Set(filteredData.nodes.map(n => n.subject))].sort().map(subj => (
            <span key={subj} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SUBJECT_COLORS[subj] || SUBJECT_COLORS[graphData?.nodes.find(n => n.subject === subj)?.subject_group] || '#6b7280' }} />
              <span className="text-gray-700 font-medium">{subj}</span>
            </span>
          ))}
          <span className="text-gray-400 border-l border-gray-200 pl-3 ml-1">
            {filteredData.nodes.length}개 노드 · {filteredData.links.length}개 연결
          </span>
        </div>

        {/* 초기화 버튼 */}
        <button onClick={handleReset}
          className="absolute top-2 right-2 p-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 text-gray-400 hover:text-gray-700 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
          title="전체 보기">
          <RotateCcw size={15} />
        </button>
      </div>

      {/* 오른쪽 연결 정보 패널 — 항상 표시, 나머지 공간 전부 사용 */}
      <div className="border-l border-gray-200 bg-gray-50 overflow-hidden flex-1 min-w-0">
        <div className="h-full flex flex-col overflow-hidden">
          {selectedNode ? (
            <>
              {/* 선택 노드 상세 */}
              <div className="p-3 border-b border-gray-200 bg-white shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getColor(selectedNode) }} />
                    <span className="font-mono text-xs font-bold text-blue-600">{selectedNode.code}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white shrink-0"
                      style={{ backgroundColor: getColor(selectedNode) }}>
                      {selectedNode.subject}
                    </span>
                    <span className="text-[10px] text-gray-400">{selectedNode.grade_group}</span>
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded min-w-[32px] min-h-[32px] flex items-center justify-center" title="전체 목록으로">
                    <X size={14} />
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mb-1">{selectedNode.area}</p>
                <p className="text-[11px] text-gray-700 leading-relaxed">{selectedNode.content}</p>
              </div>
              {/* 연결 성취기준 — 전문 표시 */}
              <div className="flex-1 overflow-auto p-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-gray-600 px-0.5">
                  연결된 성취기준 <span className="text-blue-600">{selectedLinks.length}개</span>
                </p>
                {selectedLinks.map((link, i) => {
                  const src = typeof link.source === 'object' ? link.source : filteredData.nodes.find(n => n.id === link.source)
                  const tgt = typeof link.target === 'object' ? link.target : filteredData.nodes.find(n => n.id === link.target)
                  const other = (src?.id || link.source) === selectedNode.id ? tgt : src
                  if (!other) return null
                  return (
                    <button key={i} onClick={() => navigateToNode(other)}
                      className="w-full text-left bg-white hover:bg-blue-50 rounded-lg p-3 transition border border-gray-200 hover:border-blue-300 group">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="px-2 py-0.5 rounded text-white text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: LINK_TYPE_COLORS[link.link_type] || '#6b7280' }}>
                          {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                        </span>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColor(other) }} />
                        <span className="font-mono text-[11px] font-bold text-blue-600">{other.code}</span>
                        <span className="text-[10px] text-gray-500">{other.subject}</span>
                        <ChevronRight size={12} className="ml-auto text-gray-300 group-hover:text-blue-400" />
                      </div>
                      <p className="text-[10px] text-gray-400 mb-0.5">{other.grade_group} · {other.area}</p>
                      <p className="text-[11px] text-gray-700 leading-relaxed">{other.content}</p>
                      {link.rationale && (
                        <p className="text-[10px] text-amber-700 mt-1.5 bg-amber-50 rounded px-2 py-1 leading-relaxed">
                          💡 {link.rationale}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              {/* 전체 연결 목록 — 양쪽 성취기준 전문 표시 */}
              <div className="p-3 border-b border-gray-200 bg-white shrink-0">
                <p className="text-xs font-semibold text-gray-700">교과 간 연결 {allLinkPairs.length}개</p>
                <p className="text-[10px] text-gray-400 mt-0.5">그래프에서 노드를 클릭하면 해당 성취기준에 집중합니다</p>
              </div>
              <div className="flex-1 overflow-auto p-2.5 space-y-2.5">
                {allLinkPairs.map(({ link, src, tgt }, i) => (
                  <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-blue-200 transition">
                    {/* 연결 유형 헤더 */}
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-white text-[9px] font-bold shrink-0"
                        style={{ backgroundColor: LINK_TYPE_COLORS[link.link_type] || '#6b7280' }}>
                        {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                      </span>
                      <span className="text-[10px] text-gray-400">{i + 1} / {allLinkPairs.length}</span>
                    </div>
                    {/* 성취기준 A */}
                    <button onClick={() => handleNodeClick(src)} className="w-full text-left px-3 py-2 hover:bg-blue-50 transition">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColor(src) }} />
                        <span className="font-mono text-[11px] font-bold text-blue-600">{src.code}</span>
                        <span className="text-[10px] text-gray-500">{src.subject}</span>
                        <span className="text-[9px] text-gray-400 ml-auto">{src.grade_group}</span>
                      </div>
                      <p className="text-[11px] text-gray-700 leading-relaxed">{src.content}</p>
                    </button>
                    {/* 연결 화살표 */}
                    <div className="px-3 flex items-center gap-2">
                      <div className="flex-1 border-t border-dashed border-gray-200" />
                      <span className="text-[10px] text-gray-300">↕</span>
                      <div className="flex-1 border-t border-dashed border-gray-200" />
                    </div>
                    {/* 성취기준 B */}
                    <button onClick={() => handleNodeClick(tgt)} className="w-full text-left px-3 py-2 hover:bg-blue-50 transition">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColor(tgt) }} />
                        <span className="font-mono text-[11px] font-bold text-blue-600">{tgt.code}</span>
                        <span className="text-[10px] text-gray-500">{tgt.subject}</span>
                        <span className="text-[9px] text-gray-400 ml-auto">{tgt.grade_group}</span>
                      </div>
                      <p className="text-[11px] text-gray-700 leading-relaxed">{tgt.content}</p>
                    </button>
                    {/* 연결 근거 */}
                    {link.rationale && (
                      <div className="px-3 pb-2.5">
                        <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 leading-relaxed">
                          💡 {link.rationale}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
