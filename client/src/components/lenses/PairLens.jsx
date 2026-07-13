import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { Sparkles, Plus, Check, Loader2 } from 'lucide-react'
import { apiGet, apiPost } from '../../lib/api'
import { useScenario, ScenarioPanel } from './scenarioShared'
import { LINK_TYPE_LABELS, LINK_TYPE_COLORS, getLinkId, subjectColor, linkQuality, linkPriority, isSameGrade, gradeBucket } from './lensCommon'
import MathText from '../MathText'

// 탐색 버튼을 보여줄 연결 수 임계 — 이보다 적으면 "더 찾기"가 의미 있다
const SPARSE_LINK_THRESHOLD = 3

/**
 * 과목쌍 렌즈 — 두 교과 성취기준을 좌우 2열로 놓고 연결을 이분 다이어그램으로 표시
 *
 * candidate(AI 제안) 링크는 이 렌즈에서 항상 점선으로 노출한다 —
 * 2열 집중 뷰라 노이즈 부담이 적고, 빈 쌍 화면이 막다른 길이 되지 않게 한다.
 * 연결이 없거나 적은 쌍은 온디맨드 AI 탐색으로 그 자리에서 후보를 생성할 수 있다.
 *
 * props:
 *  - graph: { nodes, links } (status=all — published+candidate 전체)
 *  - subjects: 과목명 목록 (셸의 학교급 필터 적용 후)
 *  - subjectGroups: [{ label: 학교급, subjects: [과목명] }] — 드롭다운 <optgroup> 용
 *  - pair: [subjectA, subjectB] (없으면 선택 안내)
 *  - onPickPair(nextPair)
 *  - basket: Set<code>, onToggleBasket(codes: string[])
 *  - onOpenNeighbor(code)
 *  - subjectLinkCounts: Map<과목명, published 연결 수> — 드롭다운 표기용
 *  - onGraphRefresh(): AI 탐색 완료 후 그래프 재조회
 */
export default function PairLens({ graph, subjects, subjectGroups, pair, onPickPair, basket, onToggleBasket, onOpenNeighbor, subjectLinkCounts, onGraphRefresh }) {
  const [selectedLink, setSelectedLink] = useState(null)
  const { scenario, openScenario, closeScenario } = useScenario()
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
      // published 우선 → 같은 학년군 우선 → 품질순 (융합 수업 기본 = 같은 학년군)
      .sort((x, y) => {
        const pubX = (x.status || 'published') === 'published' ? 100 : 0
        const pubY = (y.status || 'published') === 'published' ? 100 : 0
        return (pubY + linkPriority(y, y.a, y.b)) - (pubX + linkPriority(x, x.a, x.b))
      })

    // 연결된 코드 → 정렬: 같은 학년군 연결 카드 먼저, 그다음 교차 학년, 미연결은 뒤에 흐리게
    const connectedA = new Map(), connectedB = new Map() // code -> best priority
    links.forEach(l => {
      const p = linkPriority(l, l.a, l.b)
      connectedA.set(l.a.code, Math.max(connectedA.get(l.a.code) || 0, p))
      connectedB.set(l.b.code, Math.max(connectedB.get(l.b.code) || 0, p))
    })
    const sortCol = (stds, connected) => [...stds].sort((x, y) => {
      const qx = connected.get(x.code) ?? -1, qy = connected.get(y.code) ?? -1
      return qy - qx || x.code.localeCompare(y.code)
    })
    const publishedCount = links.filter(l => (l.status || 'published') === 'published').length
    return {
      links,
      publishedCount,
      candidateCount: links.length - publishedCount,
      colA: sortCol(stdsA, connectedA), colB: sortCol(stdsB, connectedB),
      connectedA, connectedB,
      avgQuality: links.length ? links.reduce((s, l) => s + linkQuality(l), 0) / links.length : 0,
    }
  }, [graph, subjA, subjB])

  // ── 온디맨드 AI 탐색 상태 ──
  // idle → starting → running(폴링) → done | already | error
  const [explore, setExplore] = useState({ phase: 'idle' })
  useEffect(() => { setExplore({ phase: 'idle' }) }, [subjA, subjB])

  const startExplore = useCallback(async () => {
    setExplore({ phase: 'starting' })
    try {
      const resp = await apiPost('/api/standards/pairs/explore', { subjectA: subjA, subjectB: subjB })
      if (resp.alreadyExplored) {
        // 다른 사용자가 이미 탐색한 쌍 — 결과가 이미 그래프에 있으므로 재조회만
        onGraphRefresh?.()
        setExplore({ phase: 'already', accepted: resp.alreadyExplored.accepted })
        return
      }
      setExplore({ phase: 'running', jobId: resp.job.id, progress: resp.job.progress })
    } catch (e) {
      const message = e?.status === 401
        ? '로그인 후 사용할 수 있는 기능이에요.'
        : (e?.message || 'AI 탐색을 시작하지 못했습니다.')
      setExplore({ phase: 'error', message })
    }
  }, [subjA, subjB, onGraphRefresh])

  // 잡 상태 폴링 (3초 간격, 최대 3분 — 서버 판정은 통상 30~60초)
  useEffect(() => {
    if (explore.phase !== 'running' || !explore.jobId) return
    let cancelled = false
    let timer = null
    let tries = 0
    const tick = async () => {
      if (cancelled) return
      tries += 1
      try {
        const { job } = await apiGet(`/api/standards/pairs/jobs/${explore.jobId}`)
        if (cancelled) return
        if (job.status === 'completed') {
          onGraphRefresh?.()
          setExplore({ phase: 'done', result: job.result })
          return
        }
        if (job.status === 'failed') {
          setExplore({ phase: 'error', message: job.error || 'AI 탐색에 실패했습니다.' })
          return
        }
        setExplore(prev => ({ ...prev, progress: job.progress }))
      } catch {
        // 일시적 네트워크 오류 — 다음 폴링에서 재시도
      }
      if (tries >= 60) {
        setExplore({ phase: 'error', message: '탐색이 예상보다 오래 걸립니다. 잠시 후 페이지를 새로고침해 주세요.' })
        return
      }
      timer = setTimeout(tick, 3000)
    }
    timer = setTimeout(tick, 2500)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [explore.phase, explore.jobId, onGraphRefresh])

  // ── 연결이 풍부한 상대 과목 추천 (published 링크 수 기준) ──
  // 95%의 과목쌍이 비어 있는 데이터 현실에서, 교사가 운으로 헤매지 않게 한다
  const partnerSuggestions = useMemo(() => {
    if (!graph || !subjA || !subjB) return null
    const subjById = new Map(graph.nodes.map(n => [n.id, n.subject]))
    const pairCounts = new Map()
    for (const l of graph.links) {
      if ((l.status || 'published') !== 'published') continue
      const sa = subjById.get(getLinkId(l, 'source'))
      const sb = subjById.get(getLinkId(l, 'target'))
      if (!sa || !sb || sa === sb) continue
      const k = sa < sb ? `${sa}|${sb}` : `${sb}|${sa}`
      pairCounts.set(k, (pairCounts.get(k) || 0) + 1)
    }
    const topFor = (subj, exclude) => {
      const rows = []
      for (const [k, n] of pairCounts) {
        const [x, y] = k.split('|')
        if (x !== subj && y !== subj) continue
        const other = x === subj ? y : x
        if (other === exclude) continue
        rows.push({ other, n })
      }
      return rows.sort((p, q) => q.n - p.n).slice(0, 4)
    }
    return { forA: topFor(subjA, subjB), forB: topFor(subjB, subjA) }
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
        <p className="text-sm text-gray-400 mb-6">직접 고르거나, 예시로 바로 체험해 보세요</p>
        <PairPicker subjects={subjects} subjectGroups={subjectGroups} pair={pair} onPickPair={onPickPair} subjectLinkCounts={subjectLinkCounts} />
        <div className="flex gap-2 flex-wrap justify-center mt-5">
          {[
            ['데이터 과학(진로선택)', '인공지능 기초(진로선택)'],
            ['과학', '수학'],
            ['통합과학1', '통합사회1'],
          ].filter(p => p.every(s => subjects.includes(s))).map(p => (
            <button key={p.join()} onClick={() => onPickPair(p)}
              className="px-3.5 py-2 rounded-full border border-blue-300 bg-blue-50/60 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition">
              예시: {p[0].replace(/\(.+\)/, '')} × {p[1].replace(/\(.+\)/, '')}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const laneW = 110
  const laneH = laneRef.current?.getBoundingClientRect().height || 0

  return (
    <div className="flex flex-col gap-4">
      {/* 선택 요약 */}
      <div className="flex items-center gap-2 flex-wrap">
        <PairPicker subjects={subjects} subjectGroups={subjectGroups} pair={pair} onPickPair={onPickPair} compact subjectLinkCounts={subjectLinkCounts} />
        {data && data.links.length > 0 && (
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700">
            검증된 연결 {data.publishedCount}
            {data.candidateCount > 0 && <span className="text-gray-500 font-medium"> · AI 제안 {data.candidateCount} (점선)</span>}
          </span>
        )}
        {data && data.links.length === 0 && (
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700">
            아직 아무도 탐색하지 않은 조합이에요
          </span>
        )}
        {/* 온디맨드 AI 탐색 — 연결이 없거나 적은 쌍에서 그 자리에서 후보 생성 */}
        {data && data.links.length < SPARSE_LINK_THRESHOLD && (explore.phase === 'idle' || explore.phase === 'error') && (
          <button onClick={startExplore}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition">
            <Sparkles size={13} />
            {data.links.length === 0 ? 'AI로 이 조합 첫 탐색하기' : 'AI로 연결 더 찾기'}
          </button>
        )}
      </div>

      {/* AI 탐색 진행/결과 배너 */}
      {explore.phase === 'starting' && (
        <ExploreBanner tone="progress" icon={<Loader2 size={14} className="animate-spin" />}
          text="AI 탐색을 시작하는 중…" />
      )}
      {explore.phase === 'running' && (
        <ExploreBanner tone="progress" icon={<Loader2 size={14} className="animate-spin" />}
          text={`AI가 두 과목의 성취기준 조합을 검토하고 있어요 (${explore.progress?.done ?? 0}/${explore.progress?.total ?? '…'}쌍) — 보통 1분 안에 끝나요`} />
      )}
      {explore.phase === 'done' && (
        <ExploreBanner tone={explore.result?.accepted > 0 ? 'success' : 'neutral'}
          text={explore.result?.accepted > 0
            ? `AI가 새 연결 제안 ${explore.result.accepted}개를 찾았어요 — 점선으로 표시됩니다. 좋은 제안은 "담기"로 수업 설계에 바로 쓸 수 있어요.`
            : `AI가 ${explore.result?.judged ?? 0}개 조합을 검토했지만 교육적으로 확실한 연결을 찾지 못했어요. 이 조합은 다른 렌즈(주제 검색)로 접근해 보세요.`} />
      )}
      {explore.phase === 'already' && (
        <ExploreBanner tone="neutral"
          text={`이 조합은 최근에 이미 AI 탐색을 마쳤어요${explore.accepted > 0 ? ` (제안 ${explore.accepted}개 — 점선으로 표시)` : ' (새 제안 없음)'}.`} />
      )}
      {explore.phase === 'error' && (
        <ExploreBanner tone="error" text={explore.message} />
      )}

      {/* 연결이 적은 쌍 → 연결이 풍부한 상대 과목 추천 */}
      {data && data.links.length < SPARSE_LINK_THRESHOLD && partnerSuggestions
        && (partnerSuggestions.forA.length > 0 || partnerSuggestions.forB.length > 0) && (
        <div className="flex flex-col gap-1.5 text-xs text-gray-500">
          {partnerSuggestions.forA.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="shrink-0"><b className="text-gray-700">{subjA}</b>와(과) 연결이 풍부한 과목:</span>
              {partnerSuggestions.forA.map(({ other, n }) => (
                <button key={other} onClick={() => onPickPair([subjA, other])}
                  className="px-2 py-0.5 rounded-full border border-gray-200 bg-white hover:border-blue-400 hover:text-blue-700 transition">
                  {other} <span className="text-gray-400">{n}</span>
                </button>
              ))}
            </div>
          )}
          {partnerSuggestions.forB.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="shrink-0"><b className="text-gray-700">{subjB}</b>와(과) 연결이 풍부한 과목:</span>
              {partnerSuggestions.forB.map(({ other, n }) => (
                <button key={other} onClick={() => onPickPair([other, subjB])}
                  className="px-2 py-0.5 rounded-full border border-gray-200 bg-white hover:border-blue-400 hover:text-blue-700 transition">
                  {other} <span className="text-gray-400">{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
            {!isSameGrade(selectedLink.a, selectedLink.b) && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium"
                title="학년군이 달라 한 교실 융합보다는 계열(선수·심화) 연계에 적합합니다">
                학년군 차이 ({gradeBucket(selectedLink.a).label} ↔ {gradeBucket(selectedLink.b).label})
              </span>
            )}
          </div>
          {selectedLink.rationale && <p className="text-sm text-gray-700 leading-relaxed">{selectedLink.rationale}</p>}
          <div className="flex gap-4 flex-wrap text-xs text-gray-600">
            {selectedLink.integration_theme && <span>🔗 융합 주제 — {selectedLink.integration_theme}</span>}
            {selectedLink.lesson_hook && <span>📝 수업 아이디어 — {selectedLink.lesson_hook}</span>}
          </div>
          <div className="flex gap-2 mt-1 flex-wrap">
            <button
              onClick={() => onToggleBasket([selectedLink.a.code, selectedLink.b.code])}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition">
              ＋ 이 연결 담기
            </button>
            <button
              onClick={() => openScenario(selectedLink.a.code, selectedLink.b.code)}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition">
              ✨ 실생활 문제 시나리오
            </button>
            <button
              onClick={() => onOpenNeighbor(selectedLink.a.code)}
              className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium transition">
              이웃 렌즈로 보기
            </button>
          </div>
        </div>
      )}

      {/* 실생활 문제 시나리오 (연결 상세에서 생성) */}
      {scenario && (
        <ScenarioPanel scenario={scenario} onClose={closeScenario}
          subjectOf={(code) => (selectedLink && [selectedLink.a, selectedLink.b].find(n => n.code === code)?.subject)}
          basket={basket} onToggleBasket={onToggleBasket} />
      )}
    </div>
  )
}

/* ── AI 탐색 상태 배너 ── */
function ExploreBanner({ tone, icon, text }) {
  const cls = {
    progress: 'border-violet-200 bg-violet-50/70 text-violet-800',
    success: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
    neutral: 'border-gray-200 bg-gray-50 text-gray-600',
    error: 'border-red-200 bg-red-50/70 text-red-700',
  }[tone] || 'border-gray-200 bg-gray-50 text-gray-600'
  return (
    <div className={`flex items-center gap-2 border rounded-xl px-3.5 py-2.5 text-xs font-medium ${cls}`}>
      {icon}
      <span className="leading-relaxed">{text}</span>
    </div>
  )
}

/* ── 과목 선택 (학교급별 optgroup 그룹화, 과목별 연결 수 표기) ── */
function PairPicker({ subjects, subjectGroups, pair, onPickPair, compact, subjectLinkCounts }) {
  const [a, b] = pair || ['', '']
  const sel = (idx) => (e) => {
    const next = [...(pair || ['', ''])]
    next[idx] = e.target.value
    onPickPair(next)
  }
  const cls = 'border border-gray-300 rounded-lg text-sm text-gray-700 bg-white px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px]'
  // 연결 수를 라벨에 표기 — 고르기 전에 어디가 풍성한지 보이게 (option value는 과목명 그대로)
  const label = (s) => {
    const n = subjectLinkCounts?.get(s)
    return n ? `${s} · 연결 ${n}` : s
  }
  const renderOptions = (other) => (
    subjectGroups?.length > 0
      ? subjectGroups.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.subjects.map(s => <option key={`${g.label}:${s}`} value={s} disabled={s === other}>{label(s)}</option>)}
          </optgroup>
        ))
      : subjects.map(s => <option key={s} value={s} disabled={s === other}>{label(s)}</option>)
  )
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'flex-col sm:flex-row'}`}>
      <select value={a || ''} onChange={sel(0)} className={cls}>
        <option value="">교과 A 선택…</option>
        {renderOptions(b)}
      </select>
      <span className="text-gray-400 text-sm font-bold">×</span>
      <select value={b || ''} onChange={sel(1)} className={cls}>
        <option value="">교과 B 선택…</option>
        {renderOptions(a)}
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
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5 line-clamp-2"><MathText text={std.content} /></p>
              {!isConnected && (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5">
                  <Sparkles size={9} /> 아직 연결 없음
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
