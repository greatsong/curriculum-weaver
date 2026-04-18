/**
 * Tutorial -- 커리큘럼 위버 인터랙티브 튜토리얼
 *
 * TADDs-DIE 협력적 수업 설계 모형에 맞춘 온보딩 가이드.
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
    lines: [
      { text: '선생님, 커리큘럼 위버에 오신 걸 환영해요!', highlight: true },
      { text: '저는 위버, AI 공동설계자에요.' },
      { text: '' },
      { text: '이 플랫폼은 동료 선생님들과 함께' },
      { text: '교과 융합 수업을 협력적으로 설계하는 공간이에요.' },
      { text: '' },
      { text: 'TADDs-DIE 모형에 기반한 AI가' },
      { text: '매 단계마다 설계 원리를 안내하고,' },
      { text: '함께 고민하며 제안해 드려요.' },
      { text: '' },
      { text: '3분이면 충분해요! 한번 둘러볼까요?', icon: 'clock' },
    ],
    isWelcome: true,
  },
  {
    title: '워크스페이스',
    badge: '1',
    lines: [
      { text: '워크스페이스에서 프로젝트를 관리해요.', highlight: true },
      { text: '' },
      { text: '새 프로젝트: 융합 수업 설계를 시작해요.', icon: 'plus' },
      { text: '   제목과 설명을 입력하면 바로 만들어져요.' },
      { text: '' },
      { text: '초대 링크: 동료 선생님에게 링크를 공유하면', icon: 'invite' },
      { text: '   같은 프로젝트에서 함께 설계할 수 있어요.' },
      { text: '' },
      { text: '교육과정 데이터: 성취기준 DB를 관리하고', icon: 'data' },
      { text: '   CSV/Excel로 업로드할 수 있어요.' },
      { text: '' },
      { text: '3D 그래프: 성취기준 간 연결을 3D로 탐색해요.', icon: 'graph' },
      { text: '' },
      { text: '팁: 프로젝트 카드를 클릭하면 바로 작업 공간으로!', icon: 'bulb' },
    ],
  },
  {
    title: '작업 공간',
    badge: '2',
    lines: [
      { text: '작업 공간은 3개 영역으로 구성되어 있어요.', highlight: true },
      { text: '' },
      { text: '왼쪽 — AI 공동설계자 채팅', icon: 'chat' },
      { text: '   현재 단계에 맞는 설계 대화를 나눠요.' },
      { text: '   AI가 설계 원리에 기반해 조언해요.' },
      { text: '' },
      { text: '가운데 — 설계 보드', icon: 'board' },
      { text: '   AI 제안이 보드 카드로 정리돼요.' },
      { text: '   비전, 주제탐색, 차시구성표 등' },
      { text: '   단계별 설계 산출물이 쌓여가요.' },
      { text: '' },
      { text: '오른쪽 — 설계 원칙 패널', icon: 'principle' },
      { text: '   현재 단계에 해당하는 설계 원칙 4개를 보여줘요.' },
      { text: '   원칙을 클릭하면 상세 안내를 볼 수 있어요.' },
      { text: '' },
      { text: '실시간 협업: 동료와 함께 작업할 수 있어요!', icon: 'realtime', isNew: true },
      { text: '   채팅·보드·단계가 모든 참여자에게 즉시 동기화돼요.' },
    ],
  },
  {
    title: 'TADDs-DIE 모형',
    badge: '3',
    lines: [
      { text: '분산인지 기반 협력적 수업 설계 모형이에요.', highlight: true },
      { text: '' },
      { text: 'T  팀 준비하기', icon: 'team', color: '#8b5cf6' },
      { text: '   T-1 비전·방향  |  T-2 환경 조성' },
      { text: '' },
      { text: 'A  분석하기', icon: 'search', color: '#3b82f6' },
      { text: '   A-1 주제 선정  |  A-2 내용·목표 분석' },
      { text: '' },
      { text: 'Ds 설계하기', icon: 'build', color: '#22c55e' },
      { text: '   Ds-1 활동 설계  |  Ds-2 지원 설계' },
      { text: '' },
      { text: 'DI 개발·실행', icon: 'rocket', color: '#f59e0b' },
      { text: '   DI-1 자료 개발  |  DI-2 수업 실행' },
      { text: '' },
      { text: 'E  성찰·평가', icon: 'refresh', color: '#ef4444' },
      { text: '   E-1 수시 평가  |  E-2 종합평가' },
      { text: '' },
      { text: '상단 네비게이션에서 단계를 자유롭게 이동해요.', icon: 'bulb' },
    ],
  },
  {
    title: '설계 원칙 40개',
    badge: '4',
    lines: [
      { text: '각 하위단계마다 4개씩, 총 40개 원칙이 있어요.', highlight: true },
      { text: '' },
      { text: '설계 원칙은 AI의 두뇌 역할을 해요.', icon: 'principle' },
      { text: '   AI가 응답할 때 해당 단계의 원칙을' },
      { text: '   자동으로 참고해서 조언해요.' },
      { text: '' },
      { text: '예시 원칙:', icon: 'star' },
      { text: '   "삶 연결 주제" — 학생의 실제 삶과 연결' },
      { text: '   "역설계" — 평가부터 거꾸로 설계' },
      { text: '   "점진적 스캐폴딩" — 단계적 도움 제공' },
      { text: '' },
      { text: '각 원칙에는 가이드라인과 점검 질문이 있어요.', icon: 'check' },
      { text: '   오른쪽 패널에서 확인해 보세요!' },
    ],
  },
  {
    title: 'AI 공동설계자',
    badge: '5',
    lines: [
      { text: 'AI가 매 단계의 설계를 함께 고민해요.', highlight: true },
      { text: '' },
      { text: '이런 식으로 대화를 시작해 보세요:', icon: 'chat' },
      { text: '  "기후변화 주제로 과학-사회 융합수업 해보고 싶어요"' },
      { text: '  "이 성취기준에 맞는 탐구 질문을 만들어줘"' },
      { text: '  "3차시 분량으로 역설계 방식으로 구성해줘"' },
      { text: '' },
      { text: 'AI 응답이 설계 보드에 자동 반영돼요.', icon: 'board' },
      { text: '   제안이 마음에 안 들면 수정을 요청하세요!' },
      { text: '' },
      { text: '팁: 학년, 교과, 차시 수를 구체적으로 알려주면', icon: 'bulb' },
      { text: '   더 실용적인 설계안을 받을 수 있어요.' },
    ],
  },
  {
    title: '교육과정 & 성취기준',
    badge: '6',
    lines: [
      { text: '교육과정 성취기준을 탐색하고 매핑해요.', highlight: true },
      { text: '' },
      { text: '3D 지식 그래프: 성취기준 연결을 시각화해요.', icon: 'graph' },
      { text: '   교과별 색상으로 구분되고, 선 위에' },
      { text: '   마우스를 올리면 연결 근거가 표시돼요.' },
      { text: '' },
      { text: '멀티 과목 필터: 교과 버튼을 여러 개 눌러서', icon: 'link', isNew: true },
      { text: '   원하는 과목 조합의 교차 연결만 볼 수 있어요.' },
      { text: '   3개 이상 선택 시 2+/3+/N 조합 수도 조절!' },
      { text: '' },
      { text: '포커스 모드: 조준 버튼을 누르면', icon: 'principle', isNew: true },
      { text: '   선택한 성취기준과 직접 연결된 것만 보여요.' },
      { text: '' },
      { text: 'AI 탐색: 그래프의 AI 채팅에서 질문하면', icon: 'chat', isNew: true },
      { text: '   선택한 과목과 노드를 AI가 자동으로 파악해서' },
      { text: '   맥락에 맞는 새 교과 간 연결을 제안해요.' },
      { text: '' },
      { text: '팁: 과목 선택 → 노드 클릭 → AI 질문 순서로', icon: 'bulb' },
      { text: '   활용하면 정확한 융합 아이디어를 얻을 수 있어요!' },
    ],
  },
  {
    title: '함께 시작해요!',
    lines: [
      { text: '동료 선생님과 함께하면 더 풍성해져요!', highlight: true },
      { text: '' },
      { text: '초대 링크를 공유해서 동료를 초대하세요.', icon: 'invite' },
      { text: '같은 프로젝트에 들어오면 자동으로 연결돼요.' },
      { text: '' },
      { text: '실시간 동기화가 되는 것들:', icon: 'realtime', isNew: true },
      { text: '   채팅 — 내 메시지와 AI 응답이 즉시 공유' },
      { text: '   보드 — 설계 보드 변경이 바로 반영' },
      { text: '   단계 — 단계 이동 시 함께 이동' },
      { text: '   접속자 — 헤더에서 누가 있는지 확인' },
      { text: '' },
      { text: '분산인지의 핵심: 한 사람이 모든 걸 알 필요 없어요.', icon: 'team' },
      { text: '   각자의 교과 전문성이 팀의 집단 지성이 됩니다.' },
      { text: '' },
      { text: '그럼 즐거운 수업 설계 되세요, 선생님!', icon: 'heart' },
      { text: '도움이 필요하면 AI 공동설계자에게 언제든 물어보세요.' },
    ],
    isFinal: true,
  },
]

// ============================================================
// 상수
// ============================================================

const MASCOT = '\u{1F9F6}' // 🧶

// ============================================================
// 아이콘 매핑 (이모지)
// ============================================================

const ICON_MAP = {
  clock: '\u23F1\uFE0F',   // ⏱️
  plus: '\u2795',           // ➕
  invite: '\u{1F465}',      // 👥
  data: '\u{1F4DA}',        // 📚
  bulb: '\u{1F4A1}',        // 💡
  chat: '\u{1F4AC}',        // 💬
  board: '\u{1F4CB}',       // 📋
  principle: '\u{1F3AF}',   // 🎯
  search: '\u{1F50D}',      // 🔍
  map: '\u{1F5FA}\uFE0F',   // 🗺️
  build: '\u{1F3D7}\uFE0F', // 🏗️
  chart: '\u{1F4CA}',       // 📊
  package: '\u{1F4E6}',     // 📦
  rocket: '\u{1F680}',      // 🚀
  refresh: '\u{1F504}',     // 🔄
  link: '\u{1F517}',        // 🔗
  graph: '\u{1F310}',       // 🌐
  upload: '\u{1F4CE}',      // 📎
  heart: '\u{1F499}',       // 💙
  warn: '\u26A0\uFE0F',     // ⚠️
  team: '\u{1F91D}',        // 🤝
  star: '\u2B50',            // ⭐
  check: '\u2705',           // ✅
  flow: '\u27A1\uFE0F',     // ➡️
  realtime: '\u26A1',        // ⚡
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
                        : line.color
                          ? 'font-bold'
                          : 'text-gray-500'
                    }`}
                    style={line.color ? { color: line.color } : undefined}
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
