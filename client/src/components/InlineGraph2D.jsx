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

  // 노드 클릭
  const handleNodeClick = useCallback((node) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 500)
      fgRef.current.zoom(3, 500)
    }
  }, [])

  // 초기화
  const handleReset = useCallback(() => {
    setSelectedNode(null)
    setHoverNode(null)
    if (fgRef.current) fgRef.current.zoomToFit(400, 40)
  }, [])

  // 연결 목록에서 노드 이동
  const navigateToNode = useCallback((node) => {
    setSelectedNode(node)
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 500)
      fgRef.current.zoom(3, 500)
    }
  }, [])

  // 포스 설정 + 초기 줌 맞춤
  useEffect(() => {
    if (filteredData && fgRef.current) {
      const fg = fgRef.current
      try {
        const charge = fg.d3Force('charge')
        if (charge) charge.strength(-200)
        const link = fg.d3Force('link')
        if (link) link.distance(80)
      } catch (e) { /* ignore */ }
      setTimeout(() => fg.zoomToFit?.(400, 40), 500)
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

  // 사이드바 폭 계산
  const sidebarWidth = selectedNode ? Math.min(320, dims.width * 0.35) : 0
  const graphWidth = dims.width - sidebarWidth

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
    <div ref={containerRef} className="flex h-full bg-white relative">
      {/* 그래프 영역 */}
      <div style={{ width: graphWidth, height: dims.height }} className="relative">
        <ForceGraph2D
          ref={fgRef}
          graphData={filteredData}
          width={graphWidth}
          height={dims.height}
          backgroundColor="#ffffff"
          nodeCanvasObject={(node, ctx) => {
            const isActive = highlightIds.size === 0 || highlightIds.has(node.id)
            const isSelected = selectedNode?.id === node.id
            const r = isSelected ? 8 : 6
            const color = getColor(node)

            // 노드 원
            ctx.beginPath()
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
            ctx.fillStyle = isActive ? color : color + '30'
            ctx.fill()
            if (isSelected) {
              ctx.strokeStyle = '#1d4ed8'
              ctx.lineWidth = 2.5
              ctx.stroke()
            }

            // 라벨
            if (isActive) {
              const label = node.code
              ctx.font = `bold ${isSelected ? 11 : 9}px -apple-system, sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = isActive ? '#1f2937' : '#9ca3af'
              ctx.fillText(label, node.x, node.y + r + 2)
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.beginPath()
            ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI)
            ctx.fillStyle = color
            ctx.fill()
          }}
          linkColor={(link) => {
            const srcId = getLinkId(link, 'source'), tgtId = getLinkId(link, 'target')
            if (highlightIds.size > 0) {
              if (highlightIds.has(srcId) && highlightIds.has(tgtId)) {
                return LINK_TYPE_COLORS[link.link_type] || '#6b7280'
              }
              return '#e5e7eb'
            }
            return LINK_TYPE_COLORS[link.link_type] || '#9ca3af'
          }}
          linkWidth={(link) => {
            const srcId = getLinkId(link, 'source'), tgtId = getLinkId(link, 'target')
            if (highlightIds.size > 0 && highlightIds.has(srcId) && highlightIds.has(tgtId)) return 3
            return 1.5
          }}
          linkDirectionalParticles={(link) => {
            const srcId = getLinkId(link, 'source'), tgtId = getLinkId(link, 'target')
            if (highlightIds.size > 0 && highlightIds.has(srcId) && highlightIds.has(tgtId)) return 3
            return 0
          }}
          linkDirectionalParticleWidth={3}
          linkDirectionalParticleSpeed={0.006}
          linkLineDash={(link) => link.link_type === 'prerequisite' ? [4, 4] : null}
          onNodeClick={handleNodeClick}
          onNodeHover={setHoverNode}
          onBackgroundClick={() => setSelectedNode(null)}
          cooldownTicks={80}
          d3AlphaDecay={0.04}
          d3VelocityDecay={0.3}
        />

        {/* 범례 + 통계 */}
        <div className="absolute top-2 left-2 flex flex-wrap items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-sm border border-gray-200 text-[10px]">
          {[...new Set(filteredData.nodes.map(n => n.subject))].sort().map(subj => (
            <span key={subj} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SUBJECT_COLORS[subj] || SUBJECT_COLORS[graphData?.nodes.find(n => n.subject === subj)?.subject_group] || '#6b7280' }} />
              <span className="text-gray-600">{subj}</span>
            </span>
          ))}
          <span className="text-gray-400 ml-1">{filteredData.nodes.length}개 노드 · {filteredData.links.length}개 연결</span>
        </div>

        {/* 초기화 버튼 */}
        <button onClick={handleReset}
          className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 text-gray-500 hover:text-gray-800 transition"
          title="초기화">
          <RotateCcw size={14} />
        </button>

        {/* 안내 */}
        <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-white/80 px-2 py-1 rounded">
          노드 클릭: 연결 상세 · 배경 클릭: 해제 · 스크롤: 확대/축소
        </div>
      </div>

      {/* 오른쪽 연결 목록 패널 */}
      <div className={`border-l border-gray-200 bg-gray-50 overflow-hidden transition-all duration-300 ${selectedNode ? 'opacity-100' : 'w-0 opacity-0'}`}
        style={{ width: selectedNode ? sidebarWidth : 0 }}>
        {selectedNode && (
          <div className="h-full flex flex-col overflow-hidden" style={{ width: sidebarWidth }}>
            {/* 선택 노드 헤더 */}
            <div className="p-3 border-b border-gray-200 bg-white shrink-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getColor(selectedNode) }} />
                  <span className="font-mono text-xs font-bold text-blue-600">{selectedNode.code}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white shrink-0"
                    style={{ backgroundColor: getColor(selectedNode) }}>
                    {selectedNode.subject}
                  </span>
                </div>
                <button onClick={() => setSelectedNode(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="닫기">
                  <X size={14} />
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mb-1">{selectedNode.grade_group} · {selectedNode.area}</p>
              <p className="text-[11px] text-gray-700 leading-relaxed">{selectedNode.content}</p>
            </div>

            {/* 연결 목록 */}
            <div className="flex-1 overflow-auto p-2 space-y-1.5">
              <p className="text-[10px] font-medium text-gray-500 px-1 mb-1">
                연결된 성취기준 <span className="text-blue-600 font-bold">{selectedLinks.length}개</span>
              </p>
              {selectedLinks.map((link, i) => {
                const src = typeof link.source === 'object' ? link.source : filteredData.nodes.find(n => n.id === link.source)
                const tgt = typeof link.target === 'object' ? link.target : filteredData.nodes.find(n => n.id === link.target)
                const other = (src?.id || link.source) === selectedNode.id ? tgt : src
                if (!other) return null
                return (
                  <button key={i} onClick={() => navigateToNode(other)}
                    className="w-full text-left bg-white hover:bg-blue-50 rounded-lg p-2 transition border border-gray-200 hover:border-blue-300 group">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="px-1.5 py-0.5 rounded text-white text-[9px] font-medium shrink-0"
                        style={{ backgroundColor: LINK_TYPE_COLORS[link.link_type] || '#6b7280' }}>
                        {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                      </span>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getColor(other) }} />
                      <span className="font-mono text-[10px] font-bold text-blue-600">{other.code}</span>
                      <span className="text-[9px] text-gray-400">{other.subject}</span>
                      <ChevronRight size={10} className="ml-auto text-gray-300 group-hover:text-blue-400" />
                    </div>
                    <p className="text-[10px] text-gray-600 leading-relaxed line-clamp-2">{other.content}</p>
                    {link.rationale && (
                      <p className="text-[9px] text-amber-600 mt-0.5 line-clamp-1">근거: {link.rationale}</p>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
