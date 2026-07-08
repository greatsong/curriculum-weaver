import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Plus, Check } from 'lucide-react'
import { apiGet } from '../../lib/api'
import { subjectColor, simBadge } from './lensCommon'

/**
 * 주제 렌즈 — 시맨틱 검색 결과를 교과군별 컬럼으로 배열
 * "이 주제로 어떤 교과들이 엮이나"에 답하는 화면
 *
 * props:
 *  - query, onQuery(q)
 *  - basket, onToggleBasket
 *  - onOpenNeighbor(code)
 */
export default function ThemeLens({ query, onQuery, basket, onToggleBasket, onOpenNeighbor }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(''); return }
    clearTimeout(timerRef.current)
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const data = await apiGet('/api/standards/semantic-search', { q: query.trim() })
        if (!Array.isArray(data)) throw new Error('invalid')
        setResults(data)
        setError('')
      } catch {
        setResults([])
        setError('의미 검색을 사용할 수 없습니다 — 잠시 후 다시 시도해 주세요.')
      } finally {
        setLoading(false)
      }
    }, 500)
    return () => clearTimeout(timerRef.current)
  }, [query])

  // 교과군별 컬럼 (컬럼 순서 = 최고 유사도순)
  const columns = useMemo(() => {
    const byGroup = new Map()
    for (const r of results) {
      const g = r.subject_group || r.subject || '기타'
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g).push(r)
    }
    return [...byGroup.entries()]
      .map(([group, items]) => ({ group, items, top: Math.max(...items.map(i => i._similarity ?? 0)) }))
      .sort((a, b) => b.top - a.top)
  }, [results])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-xl">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={query} onChange={e => onQuery(e.target.value)} autoFocus
          placeholder="주제로 검색 — 기후변화, 데이터, 에너지, 민주주의…"
          className="w-full pl-9 pr-3 py-2.5 border-2 border-blue-500/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
      </div>

      {loading && <p className="text-sm text-gray-400 animate-pulse">의미 검색 중…</p>}
      {error && <p className="text-sm text-amber-600">{error}</p>}

      {!loading && !error && query.trim() && columns.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">검색 결과가 없습니다</p>
      )}

      {!query.trim() && (
        <div className="flex gap-2 flex-wrap">
          {['기후변화', '데이터 분석', '에너지', '인공지능 윤리', '민주주의', '건강한 생활'].map(ex => (
            <button key={ex} onClick={() => onQuery(ex)}
              className="px-3 py-1.5 rounded-full border border-gray-300 text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600 transition">
              {ex}
            </button>
          ))}
        </div>
      )}

      {columns.length > 0 && (
        <>
          <p className="text-xs text-gray-500">
            <b className="text-gray-700">{columns.length}개 교과군</b>에서 관련 성취기준 {results.length}개 —
            교과군이 여러 개 걸리면 융합 수업 소재가 됩니다
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2 items-start">
            {columns.map(col => (
              <div key={col.group} className="w-[240px] shrink-0">
                <div className="flex items-center gap-1.5 pb-2 text-xs font-bold text-gray-700 sticky top-0">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subjectColor({ subject_group: col.group }) }} />
                  {col.group}
                  <span className="text-gray-400 font-medium">{col.items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.items.map(std => {
                    const badge = simBadge(std._similarity)
                    const inBasket = basket.has(std.code)
                    return (
                      <div key={std.code} className="group border border-gray-200 rounded-xl px-3 py-2 bg-white hover:shadow-sm transition">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => onOpenNeighbor(std.code)} title="이웃 렌즈로 보기"
                            className="font-mono text-[11px] font-bold text-blue-600 hover:underline underline-offset-2">{std.code}</button>
                          {badge && (
                            <span className={`px-1.5 py-px rounded border text-[9.5px] font-bold ${badge.cls}`}
                              title={`유사도 ${(std._similarity * 100).toFixed(0)}%`}>
                              {badge.label}
                            </span>
                          )}
                          <button onClick={() => onToggleBasket([std.code])}
                            className={`ml-auto p-0.5 rounded transition ${inBasket ? 'text-emerald-600' : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-blue-600'}`}>
                            {inBasket ? <Check size={12} /> : <Plus size={12} />}
                          </button>
                        </div>
                        <p className="text-[11.5px] text-gray-600 leading-relaxed mt-0.5 line-clamp-3">{std.content}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{std.subject} · {std.grade_group}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
