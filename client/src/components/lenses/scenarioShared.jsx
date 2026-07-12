import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, Loader2, Check, ArrowRight } from 'lucide-react'
import { apiPost } from '../../lib/api'

/**
 * 실생활 문제 시나리오 — 렌즈 공용 (이웃·주제·과목쌍)
 *
 * useScenario(): 상태 + 열기/닫기. 쌍당 1회 생성 후 서버 캐시(link_scenarios)라
 * 같은 쌍의 재요청은 즉시 반환된다.
 * <ScenarioPanel>: 시나리오 표시 + "두 성취기준 담기"·"프로젝트 시작" 액션.
 */
export function useScenario() {
  const [scenario, setScenario] = useState(null) // { pairKey, loading, data|error, cached }

  const openScenario = useCallback(async (conceptCode, contextCodes) => {
    const contexts = Array.isArray(contextCodes) ? contextCodes : [contextCodes]
    const pairKey = [conceptCode, ...contexts].sort().join('|')
    setScenario(prev => {
      if (prev?.pairKey === pairKey && !prev.error) return prev // 이미 열림
      return { pairKey, loading: true }
    })
    try {
      const { scenario: data, cached } = await apiPost('/api/standards/links/scenario', {
        concept_code: conceptCode, context_codes: contexts,
      })
      setScenario({ pairKey, data, cached })
    } catch (err) {
      setScenario({ pairKey, error: err.message || '생성에 실패했습니다' })
    }
  }, [])

  const closeScenario = useCallback(() => setScenario(null), [])
  return { scenario, openScenario, closeScenario }
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
 *  - basket: Set<code>, onToggleBasket(codes[])
 */
export function ScenarioPanel({ scenario, onClose, subjectOf, basket, onToggleBasket }) {
  const navigate = useNavigate()
  if (!scenario) return null
  const sc = scenario.data
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
      {scenario.loading ? (
        <div className="flex items-center gap-2 text-sm text-violet-600 py-2">
          <Loader2 size={15} className="animate-spin" />
          두 성취기준을 연결하는 수업 시나리오를 만들고 있어요… 10초 정도 걸려요
        </div>
      ) : scenario.error ? (
        <div className="flex items-center justify-between text-sm text-red-500">
          <span>{scenario.error}</span>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
      ) : sc ? (
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-violet-900">🌍 {sc.title}</h3>
            <button onClick={onClose} className="shrink-0 p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <p className="text-[13px] text-gray-700 leading-relaxed">{sc.situation}</p>
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
            <span className="basis-full sm:basis-auto sm:ml-auto text-[10.5px] text-gray-400">
              AI가 만든 초안이에요 — {[...new Set(contextCodes.map(c => subjectOf?.(c)).filter(Boolean))].join('·') || '상대 교과'} 선생님과 함께 다듬어 보세요.
              {scenario.cached && ' (캐시된 시나리오)'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
