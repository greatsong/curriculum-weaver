import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, Check, ArrowRight } from 'lucide-react'
import { apiPost } from '../../lib/api'

/**
 * 실생활 문제 시나리오 — 렌즈 공용 (이웃·주제·과목쌍)
 *
 * useScenario(): 상태 + 열기/닫기. 쌍당 1회 생성 후 서버 캐시(link_scenarios)라
 * 같은 쌍의 재요청은 즉시 반환된다.
 * <ScenarioPanel>: 시나리오 표시 + "두 성취기준 담기"·"프로젝트 시작" 액션.
 */
export function useScenario() {
  // state: { pairKey, conceptCode, contexts, items:[{data,cached}|{error}], activeIndex, loading }
  const [state, _setState] = useState(null)
  const stateRef = useRef(null)
  const setState = useCallback((v) => { stateRef.current = v; _setState(v) }, [])
  const inflightRef = useRef(new Set()) // `${pairKey}#${variant}` (중복 클릭 차단)

  // 특정 variant 생성 — items[variant]에 채운다. 서버는 끊겨도 생성을 이어가 캐시에 넣으므로 재요청 안전.
  const fetchVariant = useCallback(async (pairKey, conceptCode, contexts, variant, angle = '') => {
    const flightKey = `${pairKey}#${variant}`
    if (inflightRef.current.has(flightKey)) return
    inflightRef.current.add(flightKey)
    try {
      let data, cached
      for (let attempt = 0; ; attempt++) {
        try {
          ;({ scenario: data, cached } = await apiPost('/api/standards/links/scenario', {
            concept_code: conceptCode, context_codes: contexts, variant, angle,
          }, { timeoutMs: 180_000 }))
          break
        } catch (err) {
          const isTimeout = /초과/.test(err.message || '')
          if (!isTimeout || attempt >= 1) throw err
          await new Promise(r => setTimeout(r, 2000))
        }
      }
      const s = stateRef.current
      if (s?.pairKey !== pairKey) return // 그 사이 다른 조합을 열었으면 버림
      const items = [...s.items]; items[variant] = { data, cached }
      setState({ ...s, items, activeIndex: variant, loading: false })
    } catch (err) {
      const s = stateRef.current
      if (s?.pairKey !== pairKey) return
      const isTimeout = /초과/.test(err.message || '')
      const items = [...s.items]
      items[variant] = { error: isTimeout
        ? '생성이 오래 걸리고 있어요 — 잠시 후 다시 누르면 완성된 시나리오가 바로 열립니다.'
        : (err.message || '생성에 실패했습니다') }
      setState({ ...s, items, activeIndex: variant, loading: false })
    } finally {
      inflightRef.current.delete(flightKey)
    }
  }, [setState])

  const openScenario = useCallback((conceptCode, contextCodes, opts = {}) => {
    const contexts = Array.isArray(contextCodes) ? contextCodes : [contextCodes]
    const angle = opts.angle || ''
    const pairKey = [conceptCode, ...contexts].sort().join('|') + (angle ? '@' + angle : '')
    if (stateRef.current?.pairKey === pairKey && stateRef.current.items[0]?.data) return
    setState({ pairKey, conceptCode, contexts, angle, items: [], activeIndex: 0, loading: true })
    fetchVariant(pairKey, conceptCode, contexts, 0, angle)
  }, [setState, fetchVariant])

  // 다른 아이디어 — 다음 variant 생성(최대 6개: 0~5)
  const moreIdea = useCallback(() => {
    const s = stateRef.current
    if (!s || s.loading) return
    const variant = s.items.length
    if (variant > 5) return
    setState({ ...s, loading: true, activeIndex: variant })
    fetchVariant(s.pairKey, s.conceptCode, s.contexts, variant, s.angle || '')
  }, [setState, fetchVariant])

  const setActiveIndex = useCallback((i) => {
    const s = stateRef.current
    if (!s || i < 0 || i >= s.items.length) return
    setState({ ...s, activeIndex: i })
  }, [setState])

  const closeScenario = useCallback(() => setState(null), [setState])
  return { scenario: state, openScenario, closeScenario, moreIdea, setActiveIndex }
}

// 로딩 안내 — 별자리가 그려지듯 단계가 바뀌는 메시지 (생성 ~30초, 마지막 단계에서 유지)
const LOADING_STEPS = [
  '성취기준 별들의 위치를 확인하는 중',
  '교과 사이 가장 밝은 연결선을 찾는 중',
  '그 길 위에 수업 장면을 그리는 중',
  '학생이 직접 다룰 데이터를 고르는 중',
  '답을 미리 주지 않는 질문으로 다듬는 중',
  '별자리 완성 직전 — 마지막 획을 긋고 있어요',
]

// 별자리 미니 애니메이션 — 별 셋이 깜빡이며 연결선이 그어진다 (제품의 성운 은유)
function ConstellationLoader() {
  return (
    <svg viewBox="0 0 40 28" className="w-10 h-7 shrink-0" aria-hidden="true">
      <line x1="6" y1="21" x2="20" y2="6" className="scn-line" />
      <line x1="20" y1="6" x2="34" y2="17" className="scn-line" style={{ animationDelay: '0.9s' }} />
      <circle cx="6" cy="21" r="2" className="scn-star" />
      <circle cx="20" cy="6" r="2.6" className="scn-star" style={{ animationDelay: '0.6s' }} />
      <circle cx="34" cy="17" r="2" className="scn-star" style={{ animationDelay: '1.2s' }} />
    </svg>
  )
}

function ScenarioLoading() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1)), 4500)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex items-center gap-2.5 text-sm text-violet-600 py-2">
      <ConstellationLoader />
      <span key={step} className="animate-fade-in">{LOADING_STEPS[step]}…</span>
    </div>
  )
}

/** 시나리오 트리거 버튼 (카드 안에서 쓰는 작은 버튼) */
export function ScenarioButton({ onClick, isOpen, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[11px] font-semibold transition ${
        isOpen ? 'text-violet-700' : 'text-violet-500 hover:text-violet-700'} ${className}`}>
      <Sparkles size={11} /> {isOpen ? '시나리오 열림' : '실생활 문제 시나리오'}
    </button>
  )
}

/**
 * 시나리오 패널 — 로딩/에러/본문 + 담기·프로젝트 액션
 * props:
 *  - scenario: useScenario의 상태
 *  - onClose
 *  - subjectOf(code): 코드 → 과목명 (푸터 안내용, 없으면 '상대 교과')
 *  - standardOf(code): 코드 → { subject, content, grade_group } (엮인 성취기준 표시용)
 *  - basket: Set<code>, onToggleBasket(codes[])
 *  - onMore(): 다른 아이디어(다음 variant) 생성 / onNav(i): variant 이동
 */
export function ScenarioPanel({ scenario, onClose, subjectOf, standardOf, basket, onToggleBasket, onMore, onNav }) {
  const navigate = useNavigate()
  if (!scenario) return null
  const items = scenario.items || []
  const cur = items[scenario.activeIndex]
  const isLoading = scenario.loading && !cur
  const sc = cur?.data
  const curError = cur?.error
  const cached = cur?.cached
  const total = items.length
  const contextCodes = sc ? (Array.isArray(sc.context_codes) ? sc.context_codes : [sc.context_code].filter(Boolean)) : []
  const pairCodes = sc ? [sc.concept_code, ...contextCodes].filter(Boolean) : []
  const allInBasket = pairCodes.length > 0 && pairCodes.every(c => basket.has(c))

  // 프로젝트 시작: 두 성취기준이 담겨 있게 보장한 뒤 워크스페이스로
  // (toggleBasket은 전부 담긴 상태면 빼버리므로, 빠진 것만 추가)
  const startProject = () => {
    const missing = pairCodes.filter(c => !basket.has(c))
    if (missing.length > 0) onToggleBasket(missing)
    navigate('/workspaces?createProject=1')
  }

  return (
    <div className="border border-violet-200 bg-violet-50/40 rounded-xl px-4 py-3.5">
      {isLoading ? (
        <ScenarioLoading />
      ) : curError ? (
        <div className="flex items-center justify-between text-sm text-red-500">
          <span>{curError}</span>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
      ) : sc ? (
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-violet-900">🌍 {sc.title}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {total > 1 && (
                <span className="flex items-center gap-1 text-[11px] text-violet-400">
                  <button onClick={() => onNav?.(scenario.activeIndex - 1)} disabled={scenario.activeIndex === 0}
                    className="px-1 disabled:opacity-30 hover:text-violet-700">‹</button>
                  아이디어 {scenario.activeIndex + 1}/{total}
                  <button onClick={() => onNav?.(scenario.activeIndex + 1)} disabled={scenario.activeIndex >= total - 1}
                    className="px-1 disabled:opacity-30 hover:text-violet-700">›</button>
                </span>
              )}
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
          </div>
          <p className="text-[13px] text-gray-700 leading-relaxed">{sc.situation}</p>
          {/* 엮는 성취기준 — 각 과목의 실제 성취기준을 코드·교과·내용으로 명시(신뢰) */}
          {standardOf && pairCodes.length > 0 && (
            <div className="rounded-lg bg-white border border-violet-100 px-3 py-2 space-y-1.5">
              <p className="text-[11px] font-bold text-violet-500">🔗 엮는 성취기준 {pairCodes.length}개</p>
              {pairCodes.map((code) => {
                const std = standardOf(code)
                return (
                  <div key={code} className="text-[12px] leading-snug">
                    <span className="font-mono font-semibold text-violet-700">{code}</span>
                    {std?.subject && <span className="ml-1 px-1.5 py-px rounded bg-violet-50 text-violet-600 text-[10.5px] font-medium">{std.subject}</span>}
                    {std?.content && <span className="block text-gray-600 mt-0.5">{std.content}</span>}
                  </div>
                )
              })}
            </div>
          )}
          <div className="rounded-lg bg-white border border-violet-100 px-3 py-2">
            <p className="text-[11px] font-bold text-violet-500 mb-0.5">핵심 질문</p>
            <p className="text-[13px] font-semibold text-gray-800">{sc.driving_question}</p>
          </div>
          <p className="text-[12px] text-gray-600 leading-relaxed"><b className="text-violet-700">왜 이 개념이 필요한가 —</b> {sc.why_needed}</p>
          {Array.isArray(sc.data_sources) && sc.data_sources.length > 0 && (
            <p className="text-[12px] text-gray-600">📊 <b>데이터:</b> {sc.data_sources.join(' · ')}</p>
          )}
          {Array.isArray(sc.activity_steps) && sc.activity_steps.length > 0 && (
            <ol className="text-[12px] text-gray-600 space-y-0.5 list-decimal list-inside">
              {sc.activity_steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          {sc.assessment_idea && (
            <p className="text-[12px] text-gray-500">✅ <b>평가:</b> {sc.assessment_idea}</p>
          )}
          {/* 액션: 이 시나리오로 바로 설계 시작 */}
          <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-violet-100">
            <button
              onClick={() => onToggleBasket(pairCodes)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                allInBasket
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-white border border-gray-300 text-gray-700 hover:border-violet-400'}`}>
              {allInBasket ? <><Check size={12} /> 성취기준 {pairCodes.length}개 담김</> : <>🧺 성취기준 {pairCodes.length}개 담기</>}
            </button>
            <button
              onClick={startProject}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 transition">
              이 시나리오로 프로젝트 시작 <ArrowRight size={12} />
            </button>
            {onMore && total <= 5 && (
              <button
                onClick={onMore}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 bg-white border border-violet-200 hover:border-violet-400 transition">
                <Sparkles size={12} /> 다른 아이디어
              </button>
            )}
            <span className="basis-full sm:basis-auto sm:ml-auto text-[10.5px] text-gray-400">
              AI가 만든 초안이에요 — {[...new Set(contextCodes.map(c => subjectOf?.(c)).filter(Boolean))].join('·') || '상대 교과'} 선생님과 함께 다듬어 보세요.
              {cached && ' (캐시된 시나리오)'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
