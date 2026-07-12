/**
 * DesignModeCoach — 설계 모드 첫 방문 코치마크 (3스텝, 1회)
 *
 * "렌즈를 고르고 → 연결을 클릭해 수업 아이디어를 얻고 → 담아서 프로젝트로"
 * 핵심 흐름만 안내한다. localStorage 'cw_design_coach_done'으로 1회 표시.
 */
import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'cw_design_coach_done'

const STEPS = [
  {
    title: '질문으로 시작하세요',
    subtitle: '렌즈 4개',
    content: '상단의 렌즈가 교사의 질문에 하나씩 대응합니다 — 이웃(이 성취기준의 연결), 주제(어떤 교과가 엮이나), 계열(앞뒤 학습 흐름), 과목쌍(두 교과가 어떻게 붙나). 각 렌즈의 예시 버튼으로 바로 체험할 수 있어요.',
    visual: (
      <div className="flex gap-2 justify-center py-2">
        {['이웃', '주제', '계열', '과목쌍'].map((l, i) => (
          <span key={l} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
            i === 0 ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
            {l}
          </span>
        ))}
      </div>
    ),
  },
  {
    title: '연결을 클릭하면 수업 아이디어가',
    subtitle: '검증된 연결',
    content: '모든 연결에는 연결 근거(💡), 융합 주제(🔗), 수업 아이디어(📝)가 붙어 있습니다. 선이 굵을수록 교육적 품질이 높은 연결이고, 같은 학년군 연결이 먼저 보입니다.',
    visual: (
      <div className="py-2 px-1">
        <svg width="100%" height="34" viewBox="0 0 260 34">
          <line x1="10" y1="10" x2="250" y2="10" stroke="#3b82f6" strokeWidth="4" />
          <line x1="10" y1="26" x2="250" y2="26" stroke="#f59e0b" strokeWidth="1.8" opacity="0.6" />
        </svg>
        <p className="text-[10px] text-gray-400 text-center">굵은 선 = 품질 높은 연결 → 클릭해서 근거 확인</p>
      </div>
    ),
  },
  {
    title: '담아서 프로젝트로',
    subtitle: '탐색 → 설계',
    content: '마음에 드는 성취기준을 담으면(＋) 하단에 트레이가 생깁니다. "이 조합으로 프로젝트 시작"을 누르면 새 프로젝트에 자동으로 포함돼요. 전체 그림이 궁금하면 우상단 "✨ 탐험 3D"로 성운을 둘러보세요.',
    visual: (
      <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-gray-600">
        <span className="px-2 py-1 bg-gray-100 rounded-lg font-mono">🧺 담기</span>
        <span className="text-gray-300">→</span>
        <span className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-bold">프로젝트 시작</span>
        <span className="text-gray-300">→</span>
        <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg">자동 포함 ✓</span>
      </div>
    ),
  },
]

export default function DesignModeCoach({ forceShow = false, onComplete }) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (forceShow) { setStep(0); setVisible(true); return }
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [forceShow])

  const isLast = step === STEPS.length - 1

  const close = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
    onComplete?.()
  }, [onComplete])

  const next = useCallback(() => {
    if (isLast) close()
    else setStep(s => s + 1)
  }, [isLast, close])

  useEffect(() => {
    if (!visible) return
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft' && step > 0) setStep(s => s - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, next, close, step])

  if (!visible) return null
  const s = STEPS[step]

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="설계 모드 가이드">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={close} />
      <div className="relative w-[400px] max-w-[92vw] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="px-6 pt-5 pb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">{s.subtitle}</p>
              <h2 className="text-lg font-bold text-gray-900">{s.title}</h2>
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-blue-500' : i < step ? 'bg-blue-200' : 'bg-gray-200'}`} />
              ))}
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{s.content}</p>
          <div className="bg-gray-50 rounded-xl px-4 py-2 mb-5 border border-gray-100">{s.visual}</div>
          <div className="flex items-center justify-between">
            <button onClick={close} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">건너뛰기</button>
            <div className="flex gap-2">
              {step > 0 && (
                <button onClick={() => setStep(v => v - 1)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition">이전</button>
              )}
              <button onClick={next}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition">
                {isLast ? '시작하기' : '다음'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 코치마크 재표시 리셋 */
export function resetDesignCoach() {
  localStorage.removeItem(STORAGE_KEY)
}
