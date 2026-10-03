import { useState, useEffect, useMemo } from 'react'
import { EXPLORE_COPY } from '../../lib/explorationCopy'
import { Search, Plus, Check } from 'lucide-react'
import { apiGet } from '../../lib/api'
import { subjectColor, simBadge, nodeSchoolLevel, getLinkId, linkQuality, LINK_TYPE_LABELS, LINK_TYPE_COLORS } from './lensCommon'
import { useScenario, ScenarioButton, ScenarioPanel, scenarioPairKey } from './scenarioShared'
import { standardKey, pairId } from '../../lib/standardKey'
import MathText from '../MathText'

/**
 * 주제 렌즈 — 시맨틱 검색 결과를 교과군별 컬럼으로 배열
 * "이 주제로 어떤 교과들이 연결되나"에 답하는 화면
 *
 * props:
 *  - query, onQuery(q)
 *  - level: 셸의 학교급 필터 ('' = 전체) — 검색 결과를 필터링
 *  - basket: Set<key>, onToggleBasket(keys[])
 *  - onOpenNeighbor(key)
 * 성취기준 식별·선택·담기는 key(standardKey), 표시는 code.
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
  const [notice, setNotice] = useState('') // 일반 검색으로 이어 갔을 때의 안내
  const [retryTick, setRetryTick] = useState(0)

  // 외부에서 query가 바뀌면(예시 칩 클릭, 다른 렌즈에서 이동 등) 입력값 동기화
  useEffect(() => { setText(query) }, [query])

  // 2026-10-03 검토 반영
  // - 검색어가 바뀌거나 지워지면 이전 요청의 응답을 버린다(늦게 온 A 결과가 B 결과를 덮지 않게).
  // - 검색어를 지우면 로딩 표시도 끈다(타이머만 지우면 "검색 중"이 남았다).
  // - 의미 검색을 쓸 수 없으면(503·500·연결 실패) 일반 검색으로 이어 가고, 그 사실을 표시한다.
  //   일반 검색 결과에는 유사도가 없으므로 유사도 배지도 붙지 않는다.
  useEffect(() => {
    if (!text.trim()) {
      setResults([]); setError(''); setNotice(''); setLoading(false)
      if (query) onQuery('')
      return undefined
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      onQuery(text)
      const q = text.trim()
      try {
        const data = await apiGet('/api/standards/semantic-search', { q })
        if (cancelled) return
        if (!Array.isArray(data)) throw new Error('invalid')
        setResults(data); setError(''); setNotice('')
      } catch {
        if (cancelled) return
        try {
          const data = await apiGet('/api/standards/search', { q })
          if (cancelled) return
          if (!Array.isArray(data)) throw new Error('invalid')
          setResults(data.slice(0, 50)); setError('')
          setNotice('의미 검색을 사용할 수 없어 검색어가 들어간 성취기준을 보여 줍니다(일반 검색 결과).')
        } catch {
          if (cancelled) return
          setResults([]); setNotice('')
          setError('검색하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, retryTick])

  // 학교급 필터 — 셸(DesignMode) 상단 토글 값을 그대로 사용 (자체 토글은 셸로 일원화)
  const filtered = useMemo(() => (
    level ? results.filter(r => { const lv = nodeSchoolLevel(r); return lv === level || lv === null }) : results
  ), [results, level])

  const { scenario, openScenario, closeScenario, moreIdea, setActiveIndex } = useScenario()

  // 주제 매칭 성취기준 사이의 검증된 교과군 간 연결 — 시나리오 생성의 좋은 출발점
  const themePairs = useMemo(() => {
    if (!graph || filtered.length < 2) return []
    const matchedKeys = new Set(filtered.map(r => standardKey(r)))
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
    const pairs = []
    const seen = new Set()
    for (const l of graph.links) {
      const a = nodeById.get(getLinkId(l, 'source'))
      const b = nodeById.get(getLinkId(l, 'target'))
      if (!a || !b || !matchedKeys.has(standardKey(a)) || !matchedKeys.has(standardKey(b))) continue
      if ((a.subject_group || a.subject) === (b.subject_group || b.subject)) continue
      const key = pairId(standardKey(a), standardKey(b))
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

      {loading && <p className="text-sm text-gray-400 animate-pulse">검색 중…</p>}
      {error && (
        <p className="text-sm text-amber-600 flex items-center gap-2 flex-wrap">
          {error}
          <button onClick={() => setRetryTick((n) => n + 1)}
            className="px-2 py-0.5 rounded border border-amber-300 text-xs text-amber-700 hover:bg-amber-50">다시 시도</button>
        </p>
      )}
      {!loading && !error && notice && <p className="text-xs text-gray-500">{notice}</p>}

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
              const aKey = standardKey(a), bKey = standardKey(b)
              const key = pairId(aKey, bKey)
              const isOpen = scenario?.pairKey === scenarioPairKey(aKey, [bKey])
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
                    onClick={() => openScenario(aKey, bKey)} />
                </div>
              )
            })}
          </div>
          {scenario && (
            <ScenarioPanel scenario={scenario} onClose={closeScenario} onMore={moreIdea} onNav={setActiveIndex}
              subjectOf={(key) => filtered.find(r => standardKey(r) === key)?.subject}
              standardOf={(key) => filtered.find(r => standardKey(r) === key)}
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
                    const stdKey = standardKey(std)
                    const badge = simBadge(std._similarity)
                    const inBasket = basket.has(stdKey)
                    return (
                      <div key={stdKey} className="group border border-gray-200 rounded-xl px-3 py-2 bg-white hover:shadow-sm transition">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => onOpenNeighbor(stdKey)} title={EXPLORE_COPY.graph.openInNeighbor}
                            className="font-mono text-[11px] font-bold text-blue-600 hover:underline underline-offset-2">{std.code}</button>
                          {badge && (
                            <span className={`px-1.5 py-px rounded border text-[9.5px] font-bold ${badge.cls}`}
                              title={`유사도 ${(std._similarity * 100).toFixed(0)}%`}>
                              {badge.label}
                            </span>
                          )}
                          <button onClick={() => onToggleBasket([stdKey])}
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
