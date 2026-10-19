import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

/**
 * 오늘 AI 사용 상태 (관리자 화면) — GET /api/admin/ai-usage 응답의 budget
 * 오늘(한국 시간) 비용 추정·하루 한도·초과 여부·사용자별 하루 상한을 보여 준다.
 * 관리자가 아니면(403) 아무것도 그리지 않는다.
 */
export default function AiBudgetStatus() {
  const [budget, setBudget] = useState(undefined) // undefined=로딩, null=표시 안 함

  useEffect(() => {
    let alive = true
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
    apiGet('/api/admin/ai-usage', { from: today, to: today })
      .then((res) => { if (alive) setBudget(res?.budget || null) })
      .catch(() => { if (alive) setBudget(null) })
    return () => { alive = false }
  }, [])

  if (!budget) return null
  const ratio = budget.budget_usd > 0 ? Math.min(1, budget.today_cost_usd / budget.budget_usd) : 0
  const exceeded = budget.exceeded === true

  return (
    <div
      className={`rounded-xl border p-5 mb-6 ${exceeded ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}
      data-testid="ai-budget-status"
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="font-semibold text-gray-800">오늘 AI 사용</h2>
        {exceeded && (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">한도 도달 · 관리자 외 AI 요청 중지</span>
        )}
        {!budget.enabled && <span className="text-xs text-gray-400">(로컬 개발 모드 — 상한 미적용)</span>}
      </div>
      <p className="text-sm text-gray-700">
        비용 추정 <strong className="tabular-nums">${Number(budget.today_cost_usd || 0).toFixed(2)}</strong>
        <span className="text-gray-400"> / 하루 한도 ${Number(budget.budget_usd || 0).toFixed(2)}</span>
        <span className="text-gray-400"> · 사용자별 하루 {budget.user_daily_limit}회</span>
      </p>
      <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
        <div className={`h-full ${exceeded ? 'bg-red-500' : ratio > 0.8 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        단가표 기준 추정치입니다(실제 청구액은 각 사 콘솔).{budget.admin_excluded && ' 관리자가 쓴 AI(미래보기 등)는 이 합계와 한도에서 빠집니다.'} 한도는 서버 환경 변수 AI_DAILY_BUDGET_USD·AI_DAILY_USER_LIMIT로 정합니다.
        {budget.cost_query_ok === false && ' 최근 비용 조회에 실패해 직전 값을 보여 줍니다.'}
      </p>
    </div>
  )
}
