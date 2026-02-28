/**
 * Tutorial -- 커리큘럼 위버 인터랙티브 튜토리얼
 *
 * 🧶 위버가 플랫폼의 각 기능을 친절하게 안내하는 오버레이 튜토리얼.
 * localStorage 'cw_tutorial_done' 키로 표시 여부 판별.
 */

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react'

// ============================================================
// 튜토리얼 스텝 정의
// ============================================================

const STEPS = [
  {
    title: '환영합니다!',
    // image: '/images/tutorial/cw-00-welcome.png',
    lines: [
      { text: '선생님, 커리큘럼 위버에 오신 걸 환영해요!', highlight: true },
      { text: '저는 위버, AI 공동설계자에요.' },
      { text: '' },
      { text: '이 플랫폼에서 동료 선생님들과 함께' },
      { text: '융합 수업을 7단계로 설계할 수 있어요.' },
      { text: '' },
      { text: '40가지 설계 원리에 기반한 AI가' },
      { text: '매 단계마다 함께 고민하고 제안해 드려요.' },
      { text: '' },
      { text: '3분이면 충분해요! 한번 둘러볼까요?', icon: 'clock' },
    ],
    isWelcome: true,
  },
  {
    title: '대시보드',
    badge: '1',
    // image: '/images/tutorial/cw-01-dashboard.png',
    lines: [
      { text: '대시보드에서 설계 세션을 관리해요.', highlight: true },
      { text: '' },
      { text: '새 설계 세션: "새 설계 세션" 버튼으로 시작하세요.', icon: 'plus' },
      { text: '   제목과 간략한 설명을 입력하면 바로 만들어져요.' },
      { text: '' },
      { text: '초대 코드: 동료 선생님에게 초대 코드를 공유하면', icon: 'invite' },
      { text: '   같은 세션에서 함께 설계할 수 있어요.' },
      { text: '' },
      { text: '교육과정 데이터: 성취기준 DB를 관리하고', icon: 'data' },
      { text: '   새로운 교육과정 자료를 업로드할 수 있어요.' },
      { text: '' },
      { text: '팁: 세션 카드를 클릭하면 바로 작업 공간으로 이동해요!', icon: 'bulb' },
    ],
  },
  {
    title: '작업 공간 구조',
    badge: '2',
    // image: '/images/tutorial/cw-02-workspace.png',
    lines: [
      { text: '작업 공간은 3개의 패널로 구성되어 있어요.', highlight: true },
      { text: '' },
      { text: '왼쪽 — AI 공동설계자 채팅', icon: 'chat' },
      { text: '   현재 단계에 맞는 설계 대화를 나눌 수 있어요.' },
      { text: '' },
      { text: '가운데 — 설계 보드', icon: 'board' },
      { text: '   AI가 제안한 내용이 보드 카드로 정리돼요.' },
      { text: '   직접 수정도 가능해요.' },
      { text: '' },
      { text: '오른쪽 — 설계 원칙 패널', icon: 'principle' },
      { text: '   현재 단계에서 활용할 40가지 설계 원칙 중' },
      { text: '   관련 원칙들을 보여줘요.' },
    ],
  },
  {
    title: '7단계 워크플로',
    badge: '3',
    // image: '/images/tutorial/cw-03-stages.png',
    lines: [
      { text: '융합 수업 설계를 7단계로 체계적으로 진행해요.', highlight: true },
      { text: '' },
      { text: '1단계: 주제 탐색 — 핵심 주제와 탐구 질문 선정', icon: 'search' },
      { text: '2단계: 교육과정 분석 — 성취기준 탐색 및 매핑', icon: 'map' },
      { text: '3단계: 수업 구조 — 차시 구성과 활동 설계', icon: 'build' },
      { text: '4단계: 평가 설계 — 루브릭과 평가 계획', icon: 'chart' },
      { text: '5단계: 자료 준비 — 활동지, 교구, 도구', icon: 'package' },
      { text: '6단계: 실행 점검 — 일정 확정 및 점검', icon: 'rocket' },
      { text: '7단계: 성찰 — 수업 후 개선', icon: 'refresh' },
      { text: '' },
      { text: '상단 네비게이션에서 자유롭게 단계를 이동할 수 있어요.', icon: 'bulb' },
    ],
  },
  {
    title: 'AI 공동설계자',
    badge: '4',
    // image: '/images/tutorial/cw-04-chat.png',
    lines: [
      { text: 'AI가 매 단계의 설계를 함께 고민해요.', highlight: true },
      { text: '' },
      { text: '이런 식으로 대화를 시작해 보세요:', icon: 'chat' },
      { text: '  "기후변화 주제로 과학-사회 융합수업 해보고 싶어요"' },
      { text: '  "이 성취기준에 맞는 탐구 질문을 만들어줘"' },
      { text: '  "3차시 분량으로 수업을 구성해줘"' },
      { text: '' },
      { text: 'AI가 응답하면서 설계 보드에', icon: 'board' },
      { text: '   자동으로 카드를 생성해요.' },
      { text: '   제안이 마음에 안 들면 수정을 요청하세요!' },
      { text: '' },
      { text: '팁: 구체적으로 질문할수록 좋은 답변을 받아요.', icon: 'bulb' },
      { text: '   학년, 교과, 차시 수 등을 함께 알려주세요.' },
    ],
  },
  {
    title: '성취기준 매핑',
    badge: '5',
    // image: '/images/tutorial/cw-05-standards.png',
    lines: [
      { text: '교육과정 성취기준을 탐색하고 수업에 연결해요.', highlight: true },
      { text: '' },
      { text: '성취기준 검색: 상단 "성취기준" 버튼을 누르면', icon: 'search' },
      { text: '   교과별, 학년별로 성취기준을 검색할 수 있어요.' },
      { text: '' },
      { text: '연결 유형: 성취기준 간 관계를 지정할 수 있어요.', icon: 'link' },
      { text: '   교과 간 융합, 선수 학습, 심화/확장 등' },
      { text: '   다양한 연결 유형을 지원해요.' },
      { text: '' },
      { text: '지식 그래프: 연결된 성취기준이 그래프로 시각화돼요.', icon: 'graph', isNew: true },
      { text: '   교과 간 연계를 한눈에 파악할 수 있어요.' },
      { text: '' },
      { text: '팁: 2단계(교육과정 분석)에서 이 기능을 적극 활용하세요!', icon: 'bulb' },
    ],
  },
  {
    title: '협업 & 시작하기',
    // image: '/images/tutorial/cw-06-collab.png',
    lines: [
      { text: '동료 선생님과 함께 설계하면 더 풍성해져요!', highlight: true },
      { text: '' },
      { text: '초대 코드를 공유해서 동료를 초대하세요.', icon: 'invite' },
      { text: '같은 보드에서 실시간으로 함께 작업할 수 있어요.' },
      { text: '' },
      { text: '자료 업로드: 교과서, 활동지, 참고자료를', icon: 'upload' },
      { text: '   PDF, 한글 파일로 올리면 AI가 분석해서' },
      { text: '   설계에 반영해요.' },
      { text: '' },
      { text: '그럼 즐거운 수업 설계 되세요, 선생님!', icon: 'heart' },
      { text: '' },
      { text: '도움이 필요하면 AI 공동설계자에게 언제든 물어보세요.' },
    ],
    isFinal: true,
  },
]

// ============================================================
// 상수
// ============================================================

const MASCOT = '🧶'

// ============================================================
// 아이콘 매핑 (이모지)
// ============================================================

const ICON_MAP = {
  clock: '⏱️',
  plus: '➕',
  invite: '👥',
  data: '📚',
  bulb: '💡',
  chat: '💬',
  board: '📋',
  principle: '🎯',
  search: '🔍',
  map: '🗺️',
  build: '🏗️',
  chart: '📊',
  package: '📦',
  rocket: '🚀',
  refresh: '🔄',
  link: '🔗',
  graph: '🌐',
  upload: '📎',
  heart: '💙',
  warn: '⚠️',
}

// ============================================================
// 스크린샷 이미지 컴포넌트 (graceful fallback)
// ============================================================

function StepScreenshot({ src, alt }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'loaded' | 'error'

  useEffect(() => {
    setStatus('loading')
  }, [src])

  if (!src) return null

  return (
    <div className="relative mx-5 mb-2 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}
      {status === 'error' ? null : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={`w-full h-auto max-h-[180px] sm:max-h-[220px] object-cover object-top transition-opacity duration-300 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  )
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function Tutorial({ onComplete }) {
  const [step, setStep] = useState(0)
  const [typedChars, setTypedChars] = useState(0)
  const [isTyping, setIsTyping] = useState(true)

  const currentStep = STEPS[step]
  const firstLine = currentStep.lines[0]?.text || ''
  const totalSteps = STEPS.length

  // 타이핑 애니메이션 (첫 줄만)
  useEffect(() => {
    setTypedChars(0)
    setIsTyping(true)
  }, [step])

  useEffect(() => {
    if (!isTyping) return
    if (typedChars >= firstLine.length) {
      setIsTyping(false)
      return
    }
    const timer = setTimeout(() => {
      setTypedChars((c) => c + 1)
    }, 30)
    return () => clearTimeout(timer)
  }, [typedChars, isTyping, firstLine.length])

  // 타이핑 스킵
  const skipTyping = useCallback(() => {
    if (isTyping) {
      setTypedChars(firstLine.length)
      setIsTyping(false)
    }
  }, [isTyping, firstLine.length])

  // 네비게이션
  const goNext = useCallback(() => {
    if (step < totalSteps - 1) {
      setStep((s) => s + 1)
    }
  }, [step, totalSteps])

  const goPrev = useCallback(() => {
    if (step > 0) {
      setStep((s) => s - 1)
    }
  }, [step])

  const dismiss = useCallback(() => {
    localStorage.setItem('cw_tutorial_done', '1')
    onComplete?.()
  }, [onComplete])

  const startDesign = useCallback(() => {
    localStorage.setItem('cw_tutorial_done', '1')
    onComplete?.()
  }, [onComplete])

  // 키보드 네비게이션
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (isTyping) {
          skipTyping()
        } else if (currentStep.isFinal) {
          startDesign()
        } else {
          goNext()
        }
      } else if (e.key === 'ArrowLeft') {
        goPrev()
      } else if (e.key === 'Escape') {
        dismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTyping, skipTyping, goNext, goPrev, dismiss, startDesign, currentStep])

  // 프로그레스 퍼센트
  const progress = ((step + 1) / totalSteps) * 100

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="커리큘럼 위버 튜토리얼"
    >
      {/* 백드롭 */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={dismiss}
        onKeyDown={(e) => e.key === 'Escape' && dismiss()}
        role="button"
        tabIndex={-1}
        aria-label="튜토리얼 닫기"
      />

      {/* 카드 */}
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={skipTyping}
      >
        {/* 프로그레스 바 */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
              <span className="text-lg">{MASCOT}</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-gray-900">
                  {currentStep.title}
                </span>
                {currentStep.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    {currentStep.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-400">
                {MASCOT} AI 공동설계자
              </span>
            </div>
          </div>

          {/* 스텝 인디케이터 (도트) */}
          <div className="flex items-center gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === step
                    ? 'bg-blue-500'
                    : i < step
                      ? 'bg-blue-300'
                      : 'bg-gray-200'
                }`}
              />
            ))}
            <button
              onClick={dismiss}
              className="ml-2 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              aria-label="튜토리얼 닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 스크린샷 */}
        <StepScreenshot src={currentStep.image} alt={currentStep.title} />

        {/* 본문 */}
        <div className="px-5 py-3 min-h-[180px] sm:min-h-[200px] max-h-[40vh] overflow-y-auto">
          <div className="space-y-0.5">
            {currentStep.lines.map((line, i) => {
              // 빈 줄 -> 간격
              if (line.text === '') {
                return <div key={i} className="h-2" />
              }

              const isFirstLine = i === 0

              return (
                <div key={i} className="flex items-start gap-1.5">
                  {/* 아이콘 */}
                  {line.icon && (
                    <span className="text-sm shrink-0 mt-0.5 w-5 text-center">
                      {ICON_MAP[line.icon] || ''}
                    </span>
                  )}
                  {!line.icon && !isFirstLine && (
                    <span className="w-5 shrink-0" />
                  )}

                  {/* 텍스트 */}
                  <span
                    className={`text-sm leading-relaxed ${
                      line.highlight
                        ? 'font-semibold text-gray-900'
                        : 'text-gray-500'
                    }`}
                  >
                    {isFirstLine ? (
                      <>
                        {firstLine.slice(0, typedChars)}
                        {isTyping && (
                          <span className="inline-block w-0.5 h-4 ml-0.5 bg-blue-500 animate-pulse align-middle" />
                        )}
                      </>
                    ) : (
                      <>
                        {isTyping ? '' : line.text}
                      </>
                    )}
                  </span>

                  {/* NEW 배지 */}
                  {line.isNew && !isTyping && (
                    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold mt-0.5">
                      NEW
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          {/* 이전 버튼 */}
          <div>
            {step > 0 && !currentStep.isWelcome && (
              <button
                onClick={goPrev}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                이전
              </button>
            )}
          </div>

          {/* 페이지 번호 */}
          <span className="text-xs text-gray-400">
            {step + 1} / {totalSteps}
          </span>

          {/* 메인 액션 버튼 */}
          <div>
            {currentStep.isWelcome ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={dismiss}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  나중에 할게요
                </button>
                <button
                  onClick={goNext}
                  className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  둘러볼게요
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : currentStep.isFinal ? (
              <button
                onClick={startDesign}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                설계 시작하기
              </button>
            ) : (
              <button
                onClick={goNext}
                className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                다음
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}