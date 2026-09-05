/**
 * InteractiveTour -- 교사 첫 사용 인터랙티브 투어
 *
 * 기존 Tutorial.jsx를 대체하는 모던 오버레이 투어.
 * 실제 UI 요소를 하이라이트하고 단계별 설명을 제공한다.
 * localStorage 'cw_tour_done' 키로 표시 여부 판별.
 */

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PHASE_LIST, PROCEDURE_LIST } from 'curriculum-weaver-shared/constants.js'

// ============================================================
// 투어 스텝 정의
// ============================================================

const TOUR_STEPS = [
  {
    id: 'chat-panel',
    title: '채팅 패널',
    description: 'AI 공동설계자와 대화하는 공간입니다. 질문하면 AI가 답하고, 보드 업데이트를 제안합니다.',
    targetSelector: '[data-tour="chat-panel"]',
    arrowPosition: 'right',
  },
  {
    id: 'design-board',
    title: '설계보드',
    description: '각 절차의 설계 결과물이 여기에 쌓입니다. AI 제안을 수락하거나 직접 편집할 수 있습니다.',
    targetSelector: '[data-tour="design-board"]',
    arrowPosition: 'left',
  },
  {
    id: 'procedure-nav',
    title: '절차 네비게이션',
    description: `준비부터 평가까지 ${PHASE_LIST.length}개 단계, ${PROCEDURE_LIST.length}개 세부 절차를 순서대로 진행합니다. 단계 이름을 누르면 그 안의 절차가 펼쳐지고, 절차를 누르면 이동합니다.`,
    targetSelector: '[data-tour="procedure-nav"]',
    arrowPosition: 'bottom',
  },
  {
    id: 'ai-suggestion',
    title: '수락 / 거부',
    // AI 제안 카드는 대화가 오간 뒤에 생기므로 첫 투어 시점에는 화면에 없다.
    // 타깃이 없으면 하이라이트 없이 가운데 안내만 띄운다(엉뚱한 곳을 비추지 않도록).
    description: 'AI가 보드 내용을 제안하면 설계보드 위에 제안 카드가 나타납니다. [수락] [편집] [거부] 중에서 고르면 보드에 반영됩니다.',
    targetSelector: '[data-tour="ai-suggestion"]',
    arrowPosition: 'right',
  },
  {
    id: 'principle-panel',
    title: '설계 원칙',
    description: '화면 아래 [원칙] 버튼을 누르면 지금 절차에 해당하는 협력 설계 원칙을 펼쳐 볼 수 있습니다.',
    targetSelector: '[data-tour="principle-panel"]',
    arrowPosition: 'left',
  },
  {
    id: 'complete',
    title: '준비 완료!',
    description: '이제 시작하세요! 첫 번째 절차인 "준비"부터 학습자 정보를 입력해보세요.',
    targetSelector: null,
    arrowPosition: 'center',
  },
]

// ============================================================
// 하이라이트 영역 계산
// ============================================================

function getTargetRect(step) {
  if (!step.targetSelector) return null
  const el = document.querySelector(step.targetSelector)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  // 화면에서 사라진(0×0) 요소는 하이라이트 대상으로 삼지 않는다.
  if (rect.width === 0 || rect.height === 0) return null
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function InteractiveTour({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const tooltipRef = useRef(null)
  const [tooltipHeight, setTooltipHeight] = useState(200)

  const step = TOUR_STEPS[currentStep]
  const isLastStep = currentStep === TOUR_STEPS.length - 1
  const isCenterStep = step.arrowPosition === 'center' || !step.targetSelector

  // 타겟 영역 계산 + 리사이즈 대응
  // 투어는 페이지 데이터(배너·메시지·isDesktop 판정 등)가 아직 로딩 중일 때도
  // 뜰 수 있어, 마운트 시점 1회 측정만으론 최종 레이아웃과 어긋난 위치에
  // 하이라이트가 고정돼버린다(이후 window resize가 없으면 영영 안 맞음).
  // DOM 변화를 감지해 하이라이트 위치를 레이아웃이 안정될 때까지 계속 재계산한다.
  useEffect(() => {
    const updateRect = () => {
      const rect = getTargetRect(step)
      setTargetRect(rect)
    }
    updateRect()
    window.addEventListener('resize', updateRect)

    let raf = null
    const scheduleUpdate = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(updateRect)
    }
    const observer = new MutationObserver(scheduleUpdate)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })

    return () => {
      window.removeEventListener('resize', updateRect)
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [currentStep])

  // 툴팁 실제 높이를 재서 클램프에 반영 (스텝마다 설명 길이가 달라 높이가 변한다)
  useLayoutEffect(() => {
    const el = tooltipRef.current
    if (!el) return
    const h = el.getBoundingClientRect().height
    if (h > 0 && Math.abs(h - tooltipHeight) > 1) setTooltipHeight(h)
  }, [currentStep, targetRect, tooltipHeight])

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

  // 툴팁 위치 계산 — 계산한 좌표는 반드시 뷰포트 안으로 가둔다.
  // (하이라이트 대상이 화면 아래쪽이면 툴팁이 화면 밖으로 밀려나 [다음]을 누를 수 없었다)
  const getTooltipStyle = () => {
    const centerStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
    if (isCenterStep || !targetRect) return centerStyle

    const padding = 16
    const tooltipWidth = 340
    const clampLeft = (v) => Math.min(Math.max(padding, v), Math.max(padding, window.innerWidth - tooltipWidth - padding))
    const clampTop = (v) => Math.min(Math.max(padding, v), Math.max(padding, window.innerHeight - tooltipHeight - padding))

    // 기본: 타겟 오른쪽
    if (step.arrowPosition === 'right') {
      return {
        position: 'fixed',
        top: clampTop(targetRect.top + 40),
        left: clampLeft(targetRect.left + targetRect.width + padding),
      }
    }
    // 타겟 왼쪽
    if (step.arrowPosition === 'left') {
      return {
        position: 'fixed',
        top: clampTop(targetRect.top + 40),
        left: clampLeft(targetRect.left - tooltipWidth - padding),
      }
    }
    // 타겟 아래 — 아래 공간이 모자라면 타겟 위로 올린다
    if (step.arrowPosition === 'bottom') {
      const below = targetRect.top + targetRect.height + padding
      const fitsBelow = below + tooltipHeight + padding <= window.innerHeight
      return {
        position: 'fixed',
        top: clampTop(fitsBelow ? below : targetRect.top - tooltipHeight - padding),
        left: clampLeft(targetRect.left + (targetRect.width - tooltipWidth) / 2),
      }
    }

    return centerStyle
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

  // ProjectPage는 .work-shell(zoom:1.5)로 감싸져 있다. getBoundingClientRect()가
  // 반환하는 실제 화면 좌표를 그대로 position:fixed에 쓰는 이 컴포넌트를 zoom
  // 조상 안에 두면 좌표에 zoom이 중복 적용돼 하이라이트가 엉뚱한 곳에 뜬다.
  // document.body로 포탈해서 zoom 영향을 받지 않는 좌표계에서 렌더링한다.
  return createPortal(
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
              다시 보지 않기
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
    </div>,
    document.body
  )
}
