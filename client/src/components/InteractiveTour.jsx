/**
 * InteractiveTour -- 교사 첫 사용 인터랙티브 투어
 *
 * 기존 Tutorial.jsx를 대체하는 모던 오버레이 투어.
 * 실제 UI 요소를 하이라이트하고 단계별 설명을 제공한다.
 * localStorage 'cw_tour_done' 키로 표시 여부 판별.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

// ============================================================
// 투어 스텝 정의
// ============================================================

const TOUR_STEPS = [
  {
    id: 'chat-panel',
    title: '채팅 패널',
    description: 'AI 공동설계자와 대화하는 공간입니다. 질문하면 AI가 답하고, 보드 업데이트를 제안합니다.',
    // CSS selector or position hint for highlight
    targetSelector: '[data-tour="chat-panel"]',
    fallbackPosition: { top: 60, left: 0, width: 400, height: 'calc(100vh - 160px)' },
    arrowPosition: 'right',
  },
  {
    id: 'design-board',
    title: '설계보드',
    description: '각 절차의 설계 결과물이 여기에 쌓입니다. AI 제안을 수락하거나 직접 편집할 수 있습니다.',
    targetSelector: '[data-tour="design-board"]',
    fallbackPosition: { top: 60, left: 400, width: 'calc(100vw - 680px)', height: 'calc(100vh - 160px)' },
    arrowPosition: 'left',
  },
  {
    id: 'procedure-nav',
    title: '절차 네비게이션',
    description: '6개 Phase, 19개 절차를 순서대로 진행합니다. 클릭하여 이동하세요.',
    targetSelector: '[data-tour="procedure-nav"]',
    fallbackPosition: { top: 48, left: 0, width: '100vw', height: 48 },
    arrowPosition: 'bottom',
  },
  {
    id: 'ai-suggestion',
    title: '수락/거부',
    description: 'AI가 보드 내용을 제안하면 [수락] [편집 후 수락] [거부]를 선택합니다.',
    targetSelector: '[data-tour="ai-suggestion"]',
    fallbackPosition: { top: 200, left: 20, width: 360, height: 120 },
    arrowPosition: 'right',
  },
  {
    id: 'principle-panel',
    title: '설계 원칙',
    description: '각 절차에 맞는 설계 원칙이 표시됩니다. 참고하여 설계하세요.',
    targetSelector: '[data-tour="principle-panel"]',
    fallbackPosition: { top: 60, left: 'calc(100vw - 280px)', width: 280, height: 'calc(100vh - 160px)' },
    arrowPosition: 'left',
  },
  {
    id: 'complete',
    title: '준비 완료!',
    description: '이제 시작하세요! 첫 번째 절차인 "준비"부터 학습자 정보를 입력해보세요.',
    targetSelector: null,
    fallbackPosition: null,
    arrowPosition: 'center',
  },
]

// ============================================================
// 하이라이트 영역 계산
// ============================================================

function getTargetRect(step) {
  if (step.targetSelector) {
    const el = document.querySelector(step.targetSelector)
    if (el) {
      const rect = el.getBoundingClientRect()
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }
    }
  }
  // fallback
  if (step.fallbackPosition) {
    const fp = step.fallbackPosition
    return {
      top: typeof fp.top === 'number' ? fp.top : 0,
      left: typeof fp.left === 'number' ? fp.left : 0,
      width: typeof fp.width === 'number' ? fp.width : 400,
      height: typeof fp.height === 'number' ? fp.height : 300,
    }
  }
  return null
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function InteractiveTour({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const tooltipRef = useRef(null)

  const step = TOUR_STEPS[currentStep]
  const isLastStep = currentStep === TOUR_STEPS.length - 1
  const isCenterStep = step.arrowPosition === 'center' || !step.targetSelector

  // 타겟 영역 계산 + 리사이즈 대응
  useEffect(() => {
    const updateRect = () => {
      const rect = getTargetRect(step)
      setTargetRect(rect)
    }
    updateRect()
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [currentStep])

  const handleNext = useCallback(() => {
    if (isLastStep) {
      localStorage.setItem('cw_tour_done', '1')
      onComplete?.()
    } else {
      setCurrentStep((s) => s + 1)
    }
  }, [isLastStep, onComplete])

  const handleSkip = useCallback(() => {
    localStorage.setItem('cw_tour_done', '1')
    onComplete?.()
  }, [onComplete])

  // 키보드 내비게이션
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext()
      else if (e.key === 'Escape') handleSkip()
      else if (e.key === 'ArrowLeft' && currentStep > 0) setCurrentStep((s) => s - 1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handleSkip, currentStep])

  // 툴팁 위치 계산
  const getTooltipStyle = () => {
    if (isCenterStep || !targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }

    const padding = 16
    const tooltipWidth = 340

    // 기본: 타겟 오른쪽
    if (step.arrowPosition === 'right') {
      return {
        position: 'fixed',
        top: Math.max(padding, targetRect.top + 40),
        left: Math.min(targetRect.left + targetRect.width + padding, window.innerWidth - tooltipWidth - padding),
      }
    }
    // 타겟 왼쪽
    if (step.arrowPosition === 'left') {
      return {
        position: 'fixed',
        top: Math.max(padding, targetRect.top + 40),
        left: Math.max(padding, targetRect.left - tooltipWidth - padding),
      }
    }
    // 타겟 아래
    if (step.arrowPosition === 'bottom') {
      return {
        position: 'fixed',
        top: targetRect.top + targetRect.height + padding,
        left: Math.max(padding, targetRect.left + (targetRect.width - tooltipWidth) / 2),
      }
    }

    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  // box-shadow 기반 하이라이트 마스크
  const getMaskStyle = () => {
    if (!targetRect || isCenterStep) {
      return { boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)' }
    }
    const p = 6 // 패딩
    return {
      position: 'fixed',
      top: targetRect.top - p,
      left: targetRect.left - p,
      width: targetRect.width + p * 2,
      height: targetRect.height + p * 2,
      borderRadius: 12,
      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
      transition: 'all 0.3s ease',
      pointerEvents: 'none',
      zIndex: 9998,
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9997 }}
      role="dialog"
      aria-modal="true"
      aria-label="인터랙티브 투어"
    >
      {/* 하이라이트 마스크 */}
      {targetRect && !isCenterStep ? (
        <div style={getMaskStyle()} />
      ) : (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            zIndex: 9998,
          }}
        />
      )}

      {/* 툴팁 */}
      <div
        ref={tooltipRef}
        className="animate-slide-up"
        style={{
          ...getTooltipStyle(),
          zIndex: 9999,
          width: 340,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}
      >
        {/* 프로그레스 바 */}
        <div style={{ height: 3, background: '#E5E7EB' }}>
          <div
            style={{
              height: '100%',
              background: '#3B82F6',
              width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%`,
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: '#3B82F6',
              }}>
                {currentStep + 1}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>
                {step.title}
              </h3>
            </div>
            {/* 스텝 인디케이터 */}
            <div style={{ display: 'flex', gap: 4 }}>
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: i === currentStep ? '#3B82F6' : i < currentStep ? '#93C5FD' : '#D1D5DB',
                    transition: 'background 0.3s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* 설명 */}
          <p style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: '#4B5563',
            margin: '0 0 20px',
          }}>
            {step.description}
          </p>

          {/* 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={handleSkip}
              style={{
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                fontSize: 13,
                color: '#9CA3AF',
                cursor: 'pointer',
                borderRadius: 8,
                transition: 'all 0.15s',
                fontFamily: 'var(--font-sans, inherit)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F3F4F6'; e.currentTarget.style.color = '#6B7280' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9CA3AF' }}
            >
              건너뛰기
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep((s) => s - 1)}
                  style={{
                    padding: '8px 16px',
                    background: '#F3F4F6',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#374151',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontFamily: 'var(--font-sans, inherit)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#E5E7EB'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#F3F4F6'}
                >
                  이전
                </button>
              )}
              <button
                onClick={handleNext}
                style={{
                  padding: '8px 20px',
                  background: '#3B82F6',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: 'var(--font-sans, inherit)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#2563EB'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#3B82F6'}
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
