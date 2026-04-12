/**
 * LinkGuideOverlay — 3계층 링크 시스템 온보딩 가이드
 *
 * 교과 간 연결 그래프를 처음 사용하는 교사에게
 * 링크 상태(published/candidate/reviewed)와 시각적 구분,
 * AI 제안 토글, 상세 패널 활용법을 안내한다.
 *
 * localStorage 'cw_link_guide_done' 키로 표시 여부 판별.
 */

import { useState, useCallback, useEffect } from 'react'

// ============================================================
// 가이드 스텝 정의
// ============================================================

const GUIDE_STEPS = [
  {
    title: '교과 간 연결 그래프',
    subtitle: '3계층 링크 품질 시스템',
    content:
      '커리큘럼 위버는 교과 간 성취기준 연결을 3단계로 관리합니다. 검증된 연결만 기본 표시하고, AI가 제안한 후보 연결은 별도로 탐색할 수 있습니다.',
    visual: 'intro',
  },
  {
    title: '실선 = 검증된 연결',
    subtitle: 'Published 링크',
    content:
      '굵은 색상 실선으로 표시되는 연결은 교육적으로 검증된 링크입니다. 교과연계(주황), 동일개념(파랑), 적용(초록), 선수학습(빨강), 확장(보라)으로 유형이 구분됩니다.',
    visual: 'published',
  },
  {
    title: '점선 = AI 제안 후보',
    subtitle: 'Candidate / Reviewed 링크',
    content:
      '회색 점선으로 표시되는 연결은 아직 검증 전인 AI 제안 후보입니다. 투명도가 낮아 검증된 연결과 쉽게 구분됩니다. 유용한 후보를 발견하면 관리자가 승격할 수 있습니다.',
    visual: 'candidate',
  },
  {
    title: '"AI 제안 포함" 토글',
    subtitle: '그래프 헤더 오른쪽',
    content:
      '기본적으로 검증된 연결만 표시됩니다. 그래프 상단의 "AI 제안 포함" 체크박스를 켜면 후보 연결까지 함께 볼 수 있어, 새로운 융합 아이디어를 탐색할 수 있습니다.',
    visual: 'toggle',
  },
  {
    title: '연결 상세 정보',
    subtitle: '노드 클릭 → 오른쪽 패널',
    content:
      '성취기준 노드를 클릭하면 연결 상세가 표시됩니다. 연결 근거(💡), 융합 주제(🔗), 수업 아이디어(📝)를 확인하여 바로 수업 설계에 활용하세요.',
    visual: 'detail',
  },
]

// ============================================================
// 시각 요소 렌더링
// ============================================================

function StepVisual({ type }) {
  if (type === 'intro') {
    return (
      <div className="flex items-center justify-center gap-6 py-3">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl mb-1">📋</div>
          <p className="text-[10px] text-gray-500">후보</p>
          <p className="text-[9px] text-gray-400">candidate</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-gray-300 text-lg">→</div>
        </div>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl mb-1">🔍</div>
          <p className="text-[10px] text-gray-500">검토됨</p>
          <p className="text-[9px] text-gray-400">reviewed</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-gray-300 text-lg">→</div>
        </div>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-xl mb-1">✅</div>
          <p className="text-[10px] text-gray-500">게시</p>
          <p className="text-[9px] text-gray-400">published</p>
        </div>
      </div>
    )
  }

  if (type === 'published') {
    return (
      <div className="flex flex-col gap-2 py-2">
        {[
          { label: '교과연계', color: '#f59e0b' },
          { label: '동일개념', color: '#3b82f6' },
          { label: '적용', color: '#22c55e' },
          { label: '선수학습', color: '#ef4444' },
          { label: '확장', color: '#a855f7' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-3">
            <svg width="80" height="12">
              <line x1="0" y1="6" x2="80" y2="6" stroke={color} strokeWidth="2.5" />
            </svg>
            <span className="px-2 py-0.5 rounded text-white text-[10px] font-bold" style={{ backgroundColor: color }}>{label}</span>
          </div>
        ))}
      </div>
    )
  }

  if (type === 'candidate') {
    return (
      <div className="flex flex-col gap-3 py-2">
        <div className="flex items-center gap-3">
          <svg width="80" height="12">
            <line x1="0" y1="6" x2="80" y2="6" stroke="#f59e0b" strokeWidth="2.5" />
          </svg>
          <span className="text-[11px] text-gray-700">검증된 연결 (실선, 색상)</span>
        </div>
        <div className="flex items-center gap-3">
          <svg width="80" height="12">
            <line x1="0" y1="6" x2="80" y2="6" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" />
          </svg>
          <span className="text-[11px] text-gray-500">AI 후보 (점선, 회색, 반투명)</span>
        </div>
      </div>
    )
  }

  if (type === 'toggle') {
    return (
      <div className="flex items-center justify-center py-3">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 shadow-sm flex items-center gap-2">
          <div className="w-4 h-4 rounded border-2 border-blue-500 bg-blue-500 flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" fill="none" stroke="white" strokeWidth="1.5" /></svg>
          </div>
          <span className="text-[12px] text-gray-700 font-medium">AI 제안 포함</span>
        </div>
      </div>
    )
  }

  if (type === 'detail') {
    return (
      <div className="space-y-1.5 py-2">
        <div className="bg-amber-50 rounded px-2.5 py-1.5 text-[11px] text-amber-700">
          💡 두 교과 모두 에너지 보존 법칙을 다루며, 실험 설계에 공통 요소가 있음
        </div>
        <div className="bg-blue-50 rounded px-2.5 py-1.5 text-[11px] text-blue-700">
          🔗 융합 주제: 에너지와 환경
        </div>
        <div className="bg-green-50 rounded px-2.5 py-1.5 text-[11px] text-green-700">
          📝 수업 아이디어: 물리 에너지 실험 후 경제적 비용 분석 활동
        </div>
      </div>
    )
  }

  return null
}

// ============================================================
// 메인 컴포넌트
// ============================================================

const STORAGE_KEY = 'cw_link_guide_done'

export default function LinkGuideOverlay({ onComplete, forceShow = false }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (forceShow) {
      setVisible(true)
      return
    }
    const done = localStorage.getItem(STORAGE_KEY)
    if (!done) setVisible(true)
  }, [forceShow])

  const step = GUIDE_STEPS[currentStep]
  const isLastStep = currentStep === GUIDE_STEPS.length - 1

  const handleNext = useCallback(() => {
    if (isLastStep) {
      localStorage.setItem(STORAGE_KEY, '1')
      setVisible(false)
      onComplete?.()
    } else {
      setCurrentStep(s => s + 1)
    }
  }, [isLastStep, onComplete])

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
    onComplete?.()
  }, [onComplete])

  // 키보드 내비게이션
  useEffect(() => {
    if (!visible) return
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext()
      else if (e.key === 'Escape') handleSkip()
      else if (e.key === 'ArrowLeft' && currentStep > 0) setCurrentStep(s => s - 1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, handleNext, handleSkip, currentStep])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="링크 가이드"
    >
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={handleSkip} />

      {/* 가이드 카드 */}
      <div className="relative w-[420px] max-w-[92vw] bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* 프로그레스 바 */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-400"
            style={{ width: `${((currentStep + 1) / GUIDE_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="px-6 pt-5 pb-5">
          {/* 스텝 인디케이터 */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">
                {step.subtitle}
              </p>
              <h2 className="text-lg font-bold text-gray-900">{step.title}</h2>
            </div>
            <div className="flex gap-1.5">
              {GUIDE_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentStep ? 'bg-blue-500' : i < currentStep ? 'bg-blue-200' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* 설명 */}
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            {step.content}
          </p>

          {/* 시각 요소 */}
          <div className="bg-gray-50 rounded-xl px-4 py-2 mb-5 border border-gray-100">
            <StepVisual type={step.visual} />
          </div>

          {/* 버튼 */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              건너뛰기
            </button>

            <div className="flex gap-2">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep(s => s - 1)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  이전
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition"
              >
                {isLastStep ? '시작하기' : '다음'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 가이드를 다시 표시하도록 리셋하는 유틸리티
 */
export function resetLinkGuide() {
  localStorage.removeItem(STORAGE_KEY)
}
