import { useState, useMemo } from 'react'
import { Search, Plus, Check } from 'lucide-react'
import { LINK_TYPE_LABELS, LINK_TYPE_COLORS, getLinkId, subjectColor, gradeBucket, linkQuality, nodeSchoolLevel } from './lensCommon'
import MathText from '../MathText'

/**
 * 계열 렌즈 — 성취기준을 중심으로 연결된 항목을 학년군 타임라인 위에 배치
 * 방향은 학년 순서로 추론: 중심보다 낮은 학년 = 선수 후보, 높은 학년 = 심화 후보
 *
 * props: graph, focusCode, onFocus(code), level(학교급 필터 — 검색 결과에 적용), basket, onToggleBasket
 */
export default function SeriesLens({ graph, focusCode, onFocus, level, basket, onToggleBasket }) {
  const [query, setQuery] = useState('')

  const nodeByCode = useMemo(() => new Map((graph?.nodes || []).map(n => [n.code, n])), [graph])
  const nodeById = useMemo(() => new Map((graph?.nodes || []).map(n => [n.id, n])), [graph])
  const center = focusCode ? nodeByCode.get(focusCode) : null

  // 중심의 이웃을 학년 버킷으로 분류
  const lanes = useMemo(() => {
    if (!graph || !center) return null
    const centerBucket = gradeBucket(center)
    const items = graph.links
      .filter(l => getLinkId(l, 'source') === center.id || getLinkId(l, 'target') === center.id)
      .map(l => {
        const otherId = getLinkId(l, 'source') === center.id ? getLinkId(l, 'target') : getLinkId(l, 'source')
        const node = nodeById.get(otherId)
        return node ? { link: l, node, bucket: gradeBucket(node) } : null
      })
      .filter(Boolean)
      .sort((a, b) => linkQuality(b.link) - linkQuality(a.link))

    // 버킷별 그룹 (중심 버킷 포함해 존재하는 버킷만, 학년 순 정렬)
    const byBucket = new Map()
    byBucket.set(centerBucket.key, { bucket: centerBucket, items: [], isCenter: true })
    for (const it of items) {
      if (!byBucket.has(it.bucket.key)) byBucket.set(it.bucket.key, { bucket: it.bucket, items: [] })
      byBucket.get(it.bucket.key).items.push(it)
    }
    return {
      centerBucket,
      lanes: [...byBucket.values()].sort((a, b) => a.bucket.order - b.bucket.order),
      total: items.length,
    }
  }, [graph, center, nodeById])

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !graph) return []
    return graph.nodes
      .filter(n => { if (!level) return true; const lv = nodeSchoolLevel(n); return lv === level || lv === null })
      .filter(n => n.code.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q) || n.subject?.toLowerCase().includes(q))
      .slice(0, 12)
  }, [query, graph, level])

  if (!center) {
    return (
      <div className="flex flex-col items-center py-16 gap-4">
        <p className="text-gray-600 font-medium">계열을 볼 성취기준을 찾아보세요</p>
        <p className="text-xs text-gray-400 -mt-2">이 성취기준의 앞(선수)과 뒤(심화)에 무엇이 오는지 학년 흐름으로 봅니다</p>
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
              <span className="text-[10px] text-gray-400 ml-1.5">{n.subject} · {n.grade_group}</span>
              <p className="text-xs text-gray-600 line-clamp-1"><MathText text={n.content} /></p>
            </button>
          ))}
        </div>
        {!query.trim() && nodeByCode.has('[12인기03-01]') && (
          <button onClick={() => onFocus('[12인기03-01]')}
            className="px-3.5 py-2 rounded-full border border-blue-300 bg-blue-50/60 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition">
            예시: 인공지능 기초의 학년 계열 보기 (중 → 고)
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="font-mono font-bold text-blue-700 text-sm">{center.code}</span>
        <span className="text-gray-500">{center.subject}의 학년 계열 — 연결 {lanes.total}개</span>
        <button onClick={() => onFocus('')} className="text-gray-400 hover:text-gray-600 underline underline-offset-2">다른 성취기준 찾기</button>
      </div>

      {lanes.total === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">아직 검증된 연결이 없어 계열을 그릴 수 없습니다</p>
      )}

      {/* 학년 레인 (가로 스크롤) */}
      <div className="overflow-x-auto">
        <div className="flex gap-0 min-w-fit items-stretch">
          {lanes.lanes.map((lane, i) => {
            const rel = lane.bucket.order < lanes.centerBucket.order ? 'before'
              : lane.bucket.order > lanes.centerBucket.order ? 'after' : 'center'
            return (
              <div key={lane.bucket.key} className="flex items-stretch">
                {i > 0 && (
                  <div className="flex items-center px-1.5">
                    <span className={`text-lg font-bold ${rel === 'after' ? 'text-purple-400' : 'text-red-400'}`}>→</span>
                  </div>
                )}
                <div className={`w-[230px] shrink-0 rounded-xl border p-2.5 ${
                  rel === 'center' ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-gray-50/50'}`}>
                  <div className="flex items-center justify-between pb-2">
                    <span className={`text-[11px] font-bold ${rel === 'center' ? 'text-blue-700' : 'text-gray-500'}`}>
                      {lane.bucket.label}
                    </span>
                    <span className="text-[10px] font-medium text-gray-400">
                      {rel === 'before' ? '선수 후보' : rel === 'after' ? '심화·확장 후보' : '현재'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {lane.isCenter && (
                      <div className="border-2 border-blue-400 bg-white rounded-lg px-2.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: subjectColor(center) }} />
                          <span className="font-mono text-[10.5px] font-bold text-blue-700">{center.code}</span>
                          <BasketBtn code={center.code} basket={basket} onToggleBasket={onToggleBasket} />
                        </div>
                        <p className="text-[11px] text-gray-700 leading-relaxed mt-0.5 line-clamp-3"><MathText text={center.content} /></p>
                      </div>
                    )}
                    {lane.items.map(({ link, node }) => (
                      <button key={node.code} onClick={() => onFocus(node.code)}
                        className="group text-left border border-gray-200 bg-white rounded-lg px-2.5 py-2 hover:border-blue-300 hover:shadow-sm transition">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1 py-px rounded text-white text-[9px] font-bold"
                            style={{ backgroundColor: LINK_TYPE_COLORS[link.link_type] || '#6b7280' }}>
                            {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                          </span>
                          <span className="font-mono text-[10.5px] font-bold text-gray-700">{node.code}</span>
                          <BasketBtn code={node.code} basket={basket} onToggleBasket={onToggleBasket} hoverOnly />
                        </div>
                        <p className="text-[11px] text-gray-600 leading-relaxed mt-0.5 line-clamp-2"><MathText text={node.content} /></p>
                        <p className="text-[9.5px] text-gray-400 mt-0.5">{node.subject}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        방향은 학년 순서로 추론합니다 — 중심보다 낮은 학년은 선수 후보(빨강 →), 높은 학년은 심화·확장 후보(보라 →).
        카드를 클릭하면 그 성취기준의 계열로 이동합니다.
      </p>
    </div>
  )
}

function BasketBtn({ code, basket, onToggleBasket, hoverOnly }) {
  const inBasket = basket.has(code)
  return (
    <span role="button" tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onToggleBasket([code]) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onToggleBasket([code]) } }}
      className={`ml-auto p-0.5 rounded cursor-pointer transition ${
        inBasket ? 'text-emerald-600' : `text-gray-300 hover:text-blue-600 ${hoverOnly ? 'opacity-0 group-hover:opacity-100' : ''}`}`}>
      {inBasket ? <Check size={12} /> : <Plus size={12} />}
    </span>
  )
}
