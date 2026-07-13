import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Plus, Check } from 'lucide-react'
import { apiGet } from '../../lib/api'
import { subjectColor, simBadge, nodeSchoolLevel, getLinkId, linkQuality, LINK_TYPE_LABELS, LINK_TYPE_COLORS } from './lensCommon'
import { useScenario, ScenarioButton, ScenarioPanel } from './scenarioShared'
import MathText from '../MathText'

/**
 * 주제 렌즈 — 시맨틱 검색 결과를 교과군별 컬럼으로 배열
 * "이 주제로 어떤 교과들이 연결되나"에 답하는 화면
 *
 * props:
 *  - query, onQuery(q)
 *  - level: 셸의 학교급 필터 ('' = 전체) — 검색 결과를 필터링
 *  - basket, onToggleBasket
 *  - onOpenNeighbor(code)
 */
export default function ThemeLens({ graph, query, onQuery, level, basket, onToggleBasket, onOpenNeighbor }) {
  // 입력창은 로컬 state로 관리한다. query/onQuery는 URL(searchParams)에 바로
  // 연결되어 있어서, 매 키 입력마다 onQuery를 호출해 <input value={query}>로
  // 되돌리면 그 라운드트립이 한글 IME 조합을 깨뜨린다("안녕" → "ㅇ안ㄴㅕㅇ").
  // 로컬 state로 타이핑을 받고, 디바운스된 시점에만 URL에 반영한다.
  const [text, setText] = useState(query)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  // 외부에서 query가 바뀌면(예시 칩 클릭, 다른 렌즈에서 이동 등) 입력값 동기화
  useEffect(() => { setText(query) }, [query])

  useEffect(() => {
    if (!text.trim()) { setResults([]); setError(''); if (query) onQuery(''); return }
    clearTimeout(timerRef.current)
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      onQuery(text)
      try {
        const data = await apiGet('/api/standards/semantic-search', { q: text.trim() })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  // 학교급 필터 — 셸(DesignMode) 상단 토글 값을 그대로 사용 (자체 토글은 셸로 일원화)
  const filtered = useMemo(() => (
    level ? results.filter(r => { const lv = nodeSchoolLevel(r); return lv === level || lv === null }) : results
  ), [results, level])

  const { scenario, openScenario, closeScenario } = useScenario()

  // 주제 매칭 성취기준 사이의 검증된 교과군 간 연결 — 시나리오 생성의 좋은 출발점
  const themePairs = useMemo(() => {
    if (!graph || filtered.length < 2) return []
    const matchedCodes = new Set(filtered.map(r => r.code))
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
    const pairs = []
    const seen = new Set()
    for (const l of graph.links) {
      const a = nodeById.get(getLinkId(l, 'source'))
      const b = nodeById.get(getLinkId(l, 'target'))
      if (!a || !b || !matchedCodes.has(a.code) || !matchedCodes.has(b.code)) continue
      if ((a.subject_group || a.subject) === (b.subject_group || b.subject)) continue
      const key = [a.code, b.code].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ link: l, a, b })
    }
    return pairs.sort((x, y) => linkQuality(y.link) - linkQuality(x.link)).slice(0, 6)
  }, [graph, filtered])

  // 교과군별 컬럼 (컬럼 순서 = 최고 유사도순)
  const columns = useMemo(() => {
    const byGroup = new Map()
    for (const r of filtered) {
      const g = r.subject_group || r.subject || '기타'
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g).push(r)
    }
    return [...byGroup.entries()]
      .map(([group, items]) => ({ group, items, top: Math.max(...items.map(i => i._similarity ?? 0)) }))
      .sort((a, b) => b.top - a.top)
  }, [filtered])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-xl">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={text} onChange={e => setText(e.target.value)} autoFocus
          placeholder="주제로 검색 — 기후변화, 데이터, 에너지, 민주주의…"
          className="w-full pl-9 pr-3 py-2.5 border-2 border-blue-500/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
      </div>

      {loading && <p className="text-sm text-gray-400 animate-pulse">의미 검색 중…</p>}
      {error && <p className="text-sm text-amber-600">{error}</p>}

      {!loading && !error && text.trim() && columns.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">검색 결과가 없습니다</p>
      )}

      {!text.trim() && (
        <div className="flex gap-2 flex-wrap">
          {['기후변화', '데이터 분석', '에너지', '인공지능 윤리', '민주주의', '건강한 생활'].map(ex => (
            <button key={ex} onClick={() => onQuery(ex)}
              className="px-3 py-1.5 rounded-full border border-gray-300 text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600 transition">
              {ex}
            </button>
          ))}
        </div>
      )}

      {results.length > 0 && level && filtered.length < results.length && (
        <p className="text-[11px] text-gray-400">
          {level} 필터 적용 중 — 전체 {results.length}개 중 {filtered.length}개 표시 (상단 토글로 변경)
        </p>
      )}

      {themePairs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500">
            🔗 <b className="text-gray-700">이 주제로 검증된 교과 간 연결 {themePairs.length}개</b> — 융합 수업의 출발점으로 좋아요
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {themePairs.map(({ link, a, b }) => {
              const key = [a.code, b.code].sort().join('|')
              const isOpen = scenario?.pairKey === key
              return (
                <div key={key} className="w-[260px] shrink-0 border border-gray-200 rounded-xl px-3 py-2.5 bg-white hover:shadow-sm transition">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-bold"
                      style={{ backgroundColor: LINK_TYPE_COLORS[link.link_type] || '#6b7280' }}>
                      {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                    </span>
                    <span className="text-[10px] text-gray-400">{a.subject} ↔ {b.subject}</span>
                  </div>
                  <p className="font-mono text-[10.5px] font-bold text-blue-600">{a.code} ↔ {b.code}</p>
                  {link.integration_theme && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">🔗 {link.integration_theme}</p>}
                  <ScenarioButton isOpen={isOpen} className="mt-1.5"
                    onClick={() => openScenario(a.code, b.code)} />
                </div>
              )
            })}
          </div>
          {scenario && (
            <ScenarioPanel scenario={scenario} onClose={closeScenario}
              subjectOf={(code) => filtered.find(r => r.code === code)?.subject}
              basket={basket} onToggleBasket={onToggleBasket} />
          )}
        </div>
      )}

      {columns.length > 0 && (
        <>
          <p className="text-xs text-gray-500">
            <b className="text-gray-700">{columns.length}개 교과군</b>에서 관련 성취기준 {filtered.length}개 —
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
                        <p className="text-[11.5px] text-gray-600 leading-relaxed mt-0.5 line-clamp-3"><MathText text={std.content} /></p>
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
