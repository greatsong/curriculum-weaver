import { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react'
import { Sparkles, Plus, Check } from 'lucide-react'
import { LINK_TYPE_LABELS, LINK_TYPE_COLORS, getLinkId, subjectColor, linkQuality } from './lensCommon'

/**
 * 과목쌍 렌즈 — 두 교과 성취기준을 좌우 2열로 놓고 연결을 이분 다이어그램으로 표시
 *
 * props:
 *  - graph: { nodes, links } (published 또는 all)
 *  - subjects: 전체 과목명 목록
 *  - pair: [subjectA, subjectB] (없으면 선택 안내)
 *  - onPickPair(nextPair)
 *  - basket: Set<code>, onToggleBasket(codes: string[])
 *  - onOpenNeighbor(code)
 */
export default function PairLens({ graph, subjects, pair, onPickPair, basket, onToggleBasket, onOpenNeighbor }) {
  const [selectedLink, setSelectedLink] = useState(null)
  const laneRef = useRef(null)
  const cardRefs = useRef(new Map()) // code -> element
  const [lines, setLines] = useState([])

  const [subjA, subjB] = pair || []

  // 두 과목의 성취기준 + 둘 사이의 링크
  const data = useMemo(() => {
    if (!graph || !subjA || !subjB) return null
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
    const stdsA = graph.nodes.filter(n => n.subject === subjA)
    const stdsB = graph.nodes.filter(n => n.subject === subjB)
    const idsA = new Set(stdsA.map(n => n.id))
    const idsB = new Set(stdsB.map(n => n.id))
    const links = graph.links
      .filter(l => {
        const s = getLinkId(l, 'source'), t = getLinkId(l, 'target')
        return (idsA.has(s) && idsB.has(t)) || (idsA.has(t) && idsB.has(s))
      })
      .map(l => {
        const s = getLinkId(l, 'source'), t = getLinkId(l, 'target')
        const a = idsA.has(s) ? nodeById.get(s) : nodeById.get(t)
        const b = idsA.has(s) ? nodeById.get(t) : nodeById.get(s)
        return { ...l, a, b }
      })
      .sort((x, y) => linkQuality(y) - linkQuality(x))

    // 연결된 코드 → 정렬: 연결 카드(품질순) 먼저, 미연결은 뒤에 흐리게
    const connectedA = new Map(), connectedB = new Map() // code -> bestQuality
    links.forEach(l => {
      connectedA.set(l.a.code, Math.max(connectedA.get(l.a.code) || 0, linkQuality(l)))
      connectedB.set(l.b.code, Math.max(connectedB.get(l.b.code) || 0, linkQuality(l)))
    })
    const sortCol = (stds, connected) => [...stds].sort((x, y) => {
      const qx = connected.get(x.code) ?? -1, qy = connected.get(y.code) ?? -1
      return qy - qx || x.code.localeCompare(y.code)
    })
    return {
      links,
      colA: sortCol(stdsA, connectedA), colB: sortCol(stdsB, connectedB),
      connectedA, connectedB,
      avgQuality: links.length ? links.reduce((s, l) => s + linkQuality(l), 0) / links.length : 0,
    }
  }, [graph, subjA, subjB])

  // 카드 위치 측정 → 연결선 좌표 계산
  const registerCard = useCallback((code) => (el) => {
    if (el) cardRefs.current.set(code, el)
    else cardRefs.current.delete(code)
  }, [])

  useLayoutEffect(() => {
    if (!data || !laneRef.current) { setLines([]); return }
    const measure = () => {
      const laneBox = laneRef.current?.getBoundingClientRect()
      if (!laneBox) return
      const next = []
      for (const l of data.links) {
        const elA = cardRefs.current.get(`A:${l.a.code}`)
        const elB = cardRefs.current.get(`B:${l.b.code}`)
        if (!elA || !elB) continue
        const yA = elA.getBoundingClientRect().top + elA.getBoundingClientRect().height / 2 - laneBox.top
        const yB = elB.getBoundingClientRect().top + elB.getBoundingClientRect().height / 2 - laneBox.top
        next.push({ link: l, yA, yB })
      }
      setLines(next)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(laneRef.current)
    return () => ro.disconnect()
  }, [data])

  if (!subjA || !subjB) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-gray-600 font-medium mb-1">두 교과를 선택하면 성취기준 연결이 표시됩니다</p>
        <p className="text-sm text-gray-400 mb-6">예: 데이터 과학 × 인공지능 기초, 과학 × 사회</p>
        <PairPicker subjects={subjects} pair={pair} onPickPair={onPickPair} />
      </div>
    )
  }

  const laneW = 110
  const laneH = laneRef.current?.getBoundingClientRect().height || 0

  return (
    <div className="flex flex-col gap-4">
      {/* 선택 요약 */}
      <div className="flex items-center gap-2 flex-wrap">
        <PairPicker subjects={subjects} pair={pair} onPickPair={onPickPair} compact />
        {data && (
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${data.links.length > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {data.links.length > 0
              ? `${data.links.length}개 연결 · 평균 품질 ${data.avgQuality.toFixed(2)}`
              : '아직 검증된 연결이 없습니다'}
          </span>
        )}
      </div>

      {data && (
        <div className="grid gap-0 overflow-x-auto" style={{ gridTemplateColumns: `minmax(250px,1fr) ${laneW}px minmax(250px,1fr)` }}>
          {/* A 컬럼 */}
          <Column
            title={subjA}
            stds={data.colA}
            connected={data.connectedA}
            side="A"
            registerCard={registerCard}
            selectedLink={selectedLink}
            basket={basket}
            onToggleBasket={onToggleBasket}
          />

          {/* 연결 레인 */}
          <div ref={laneRef} className="relative" style={{ minHeight: 120 }}>
            <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${laneW} ${Math.max(laneH, 1)}`} preserveAspectRatio="none">
              {lines.map(({ link, yA, yB }, i) => {
                const isSel = selectedLink === link
                const dimmed = selectedLink && !isSel
                const color = LINK_TYPE_COLORS[link.link_type] || '#6b7280'
                const w = 1.5 + linkQuality(link) * 3.5
                const d = `M0,${yA} C${laneW * 0.45},${yA} ${laneW * 0.55},${yB} ${laneW},${yB}`
                return (
                  <g key={i} className="cursor-pointer" onClick={() => setSelectedLink(isSel ? null : link)}>
                    <path d={d} stroke="transparent" strokeWidth="14" fill="none" />
                    <path d={d} stroke={color} fill="none"
                      strokeWidth={isSel ? w + 1.5 : w}
                      opacity={link.status && link.status !== 'published' ? (dimmed ? 0.15 : 0.45) : (dimmed ? 0.18 : isSel ? 1 : 0.6)}
                      strokeDasharray={link.status && link.status !== 'published' ? '5 4' : undefined} />
                  </g>
                )
              })}
            </svg>
          </div>

          {/* B 컬럼 */}
          <Column
            title={subjB}
            stds={data.colB}
            connected={data.connectedB}
            side="B"
            registerCard={registerCard}
            selectedLink={selectedLink}
            basket={basket}
            onToggleBasket={onToggleBasket}
          />
        </div>
      )}

      {/* 연결 상세 */}
      {selectedLink && (
        <div className="border border-blue-200 bg-blue-50/60 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="px-2 py-0.5 rounded-md text-white font-bold" style={{ backgroundColor: LINK_TYPE_COLORS[selectedLink.link_type] }}>
              {LINK_TYPE_LABELS[selectedLink.link_type] || selectedLink.link_type}
            </span>
            <span className="font-mono font-bold text-blue-700">{selectedLink.a.code} ↔ {selectedLink.b.code}</span>
            {selectedLink.quality_score != null && <span className="font-bold text-emerald-700">품질 {selectedLink.quality_score.toFixed(2)}</span>}
            {selectedLink.semantic_score != null && <span className="text-gray-400" title="임베딩 코사인 유사도">의미 유사도 {selectedLink.semantic_score.toFixed(2)}</span>}
            {selectedLink.status && selectedLink.status !== 'published' && (
              <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-medium">AI 제안 (검토 전)</span>
            )}
          </div>
          {selectedLink.rationale && <p className="text-sm text-gray-700 leading-relaxed">{selectedLink.rationale}</p>}
          <div className="flex gap-4 flex-wrap text-xs text-gray-600">
            {selectedLink.integration_theme && <span>🔗 융합 주제 — {selectedLink.integration_theme}</span>}
            {selectedLink.lesson_hook && <span>📝 수업 아이디어 — {selectedLink.lesson_hook}</span>}
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => onToggleBasket([selectedLink.a.code, selectedLink.b.code])}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition">
              ＋ 이 연결 담기
            </button>
            <button
              onClick={() => onOpenNeighbor(selectedLink.a.code)}
              className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium transition">
              이웃 렌즈로 보기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 과목 선택 ── */
function PairPicker({ subjects, pair, onPickPair, compact }) {
  const [a, b] = pair || ['', '']
  const sel = (idx) => (e) => {
    const next = [...(pair || ['', ''])]
    next[idx] = e.target.value
    onPickPair(next)
  }
  const cls = 'border border-gray-300 rounded-lg text-sm text-gray-700 bg-white px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px]'
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'flex-col sm:flex-row'}`}>
      <select value={a || ''} onChange={sel(0)} className={cls}>
        <option value="">교과 A 선택…</option>
        {subjects.map(s => <option key={s} value={s} disabled={s === b}>{s}</option>)}
      </select>
      <span className="text-gray-400 text-sm font-bold">×</span>
      <select value={b || ''} onChange={sel(1)} className={cls}>
        <option value="">교과 B 선택…</option>
        {subjects.map(s => <option key={s} value={s} disabled={s === a}>{s}</option>)}
      </select>
    </div>
  )
}

/* ── 성취기준 컬럼 ── */
function Column({ title, stds, connected, side, registerCard, selectedLink, basket, onToggleBasket }) {
  const connectedCount = stds.filter(s => connected.has(s.code)).length
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 pb-2.5 text-xs font-bold text-gray-700">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: subjectColor(stds[0]) }} />
        <span className="truncate">{title}</span>
        <span className="text-gray-400 font-medium shrink-0">성취기준 {stds.length}개 중 연결 {connectedCount}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {stds.map(std => {
          const isConnected = connected.has(std.code)
          const isSel = selectedLink && (selectedLink.a.code === std.code || selectedLink.b.code === std.code)
          const inBasket = basket.has(std.code)
          return (
            <div key={std.code} ref={registerCard(`${side}:${std.code}`)}
              className={`group border rounded-xl px-3 py-2.5 bg-white transition ${
                isSel ? 'border-blue-500 ring-2 ring-blue-100'
                  : isConnected ? 'border-gray-200'
                  : 'border-gray-100 opacity-45 hover:opacity-80'
              }`}>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] font-bold text-blue-600">{std.code}</span>
                <span className="text-[10px] text-gray-400">{std.grade_group}</span>
                <button
                  onClick={() => onToggleBasket([std.code])}
                  title={inBasket ? '담기 해제' : '담기'}
                  className={`ml-auto p-0.5 rounded transition ${inBasket ? 'text-emerald-600' : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-blue-600'}`}>
                  {inBasket ? <Check size={13} /> : <Plus size={13} />}
                </button>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5 line-clamp-2">{std.content}</p>
              {!isConnected && (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5">
                  <Sparkles size={9} /> 연결 없음 — AI 탐색에서 제안받기
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
