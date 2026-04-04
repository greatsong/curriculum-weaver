import { useNavigate } from 'react-router-dom'
import { PHASES } from 'curriculum-weaver-shared/constants.js'
import Logo from '../components/Logo'
import { Bot, Users, User, ArrowRight, Sparkles, MessageSquare, LayoutDashboard, BookOpen } from 'lucide-react'

const PROCESS_STEPS = [
  { phase: 'T', stages: ['T-1 비전·방향', 'T-2 환경 조성'], color: '#8b5cf6' },
  { phase: 'A', stages: ['A-1 주제 선정', 'A-2 내용·목표 분석'], color: '#3b82f6' },
  { phase: 'Ds', stages: ['Ds-1 활동 설계', 'Ds-2 지원 설계'], color: '#22c55e' },
  { phase: 'DI', stages: ['DI-1 자료 개발', 'DI-2 수업 실행'], color: '#f59e0b' },
  { phase: 'E', stages: ['E-1 수시 평가', 'E-2 종합평가'], color: '#ef4444' },
]

const FEATURES = [
  { icon: MessageSquare, title: 'AI 퍼실리테이터', desc: '단계별 핵심 질문과 예시로 설계를 안내합니다' },
  { icon: LayoutDashboard, title: '설계 보드', desc: 'AI 대화 내용이 보드에 자동 반영됩니다' },
  { icon: BookOpen, title: '40가지 설계 원칙', desc: '검증된 설계 원칙으로 수업 품질을 높입니다' },
  { icon: Users, title: '실시간 협업', desc: '초대 코드로 동료 교사와 함께 설계합니다' },
]

export default function IntroPage() {
  const navigate = useNavigate()

  const handleStart = () => {
    localStorage.setItem('cw_intro_done', 'true')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* 히어로 섹션 */}
      <div className="max-w-4xl mx-auto px-4 pt-12 sm:pt-20 pb-8 text-center">
        {/* 서울특별시교육청 배지 */}
        <p className="text-xs font-medium text-gray-400 tracking-widest uppercase mb-6">
          서울특별시교육청 &middot; Human-AI Agency
        </p>

        <div className="flex items-center justify-center gap-2 mb-4">
          <Logo size={32} />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">커리큘럼 위버</h1>
        </div>

        <p className="text-lg sm:text-xl text-gray-600 mb-2">
          협력적 수업설계를 위한 AI 에이전트
        </p>
        <p className="text-sm text-gray-500 max-w-xl mx-auto leading-relaxed">
          교사 팀의 협력적 수업설계 과정을 AI가 퍼실리테이터로서 함께합니다.
          단계별 핵심 질문과 예시 자료를 통해 설계를 안내하고,
          40가지 검증된 설계 원칙으로 수업의 품질을 높입니다.
        </p>
      </div>

      {/* TADDs-DIE 프로세스 */}
      <div className="max-w-4xl mx-auto px-4 pb-10">
        <h2 className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">
          TADDs-DIE 설계 프로세스 (10단계)
        </h2>
        <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-1">
          {PROCESS_STEPS.map((step, i) => {
            const phaseInfo = PHASES.find((p) => p.id === step.phase)
            return (
              <div key={step.phase} className="flex-1 flex flex-col">
                <div
                  className="rounded-xl p-3 text-center flex-1"
                  style={{ backgroundColor: `${step.color}10`, border: `1px solid ${step.color}30` }}
                >
                  <div
                    className="text-xs font-bold px-2 py-0.5 rounded-full inline-block mb-2"
                    style={{ color: step.color, backgroundColor: `${step.color}20` }}
                  >
                    {step.phase}
                  </div>
                  <p className="text-xs font-medium text-gray-700 mb-1.5">{phaseInfo?.name}</p>
                  <div className="space-y-0.5">
                    {step.stages.map((s) => (
                      <p key={s} className="text-xs text-gray-500">{s}</p>
                    ))}
                  </div>
                </div>
                {i < PROCESS_STEPS.length - 1 && (
                  <div className="hidden sm:flex justify-center py-1">
                    <ArrowRight size={14} className="text-gray-300 rotate-0" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 주요 기능 */}
      <div className="max-w-4xl mx-auto px-4 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FEATURES.map((feat) => (
            <div key={feat.title} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-2">
                <feat.icon size={20} className="text-blue-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">{feat.title}</h3>
              <p className="text-xs text-gray-500">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 시작 버튼 */}
      <div className="max-w-md mx-auto px-4 pb-16">
        <div className="space-y-3">
          <button
            onClick={handleStart}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl text-base font-semibold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20"
          >
            <Users size={20} />
            수업설계 시작하기
            <Sparkles size={16} className="opacity-70" />
          </button>
          <p className="text-xs text-gray-400 text-center">
            워크스페이스를 만들어 동료 교사를 초대하고, 함께 수업을 설계하세요
          </p>
        </div>
      </div>

      {/* 푸터 */}
      <footer className="pb-8 text-center">
        <p className="text-xs text-gray-300">
          서울특별시교육청 &middot; Human-AI Agency
        </p>
      </footer>
    </div>
  )
}
