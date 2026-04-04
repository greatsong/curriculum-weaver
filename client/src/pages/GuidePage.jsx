import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'

/* ───────────────────────── 유틸 ───────────────────────── */

/** IntersectionObserver 기반 fade-in 훅 */
function useFadeIn(threshold = 0.15) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])

  return { ref, style: { opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(32px)', transition: 'opacity 0.7s cubic-bezier(.16,1,.3,1), transform 0.7s cubic-bezier(.16,1,.3,1)' } }
}

/** 브라우저 프레임 래퍼 */
function BrowserFrame({ children, title = '', className = '' }) {
  return (
    <div className={`rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-white ${className}`}>
      {/* 타이틀 바 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-amber-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        {title && <span className="ml-2 text-xs text-slate-400 truncate">{title}</span>}
      </div>
      {/* 콘텐츠 */}
      <div className="p-4 bg-slate-50/50">{children}</div>
    </div>
  )
}

/** 섹션 컨테이너 */
function Section({ children, className = '', id }) {
  const fade = useFadeIn()
  return (
    <section ref={fade.ref} style={fade.style} id={id} className={`py-20 md:py-28 ${className}`}>
      <div className="max-w-[1120px] mx-auto px-5 md:px-8">{children}</div>
    </section>
  )
}

/** Phase 뱃지 */
function PhaseBadge({ code, label, color }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    violet: 'bg-violet-100 text-violet-700 border-violet-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    rose: 'bg-rose-100 text-rose-700 border-rose-200',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${colors[color] || colors.slate}`}>
      {code} <span className="font-normal">{label}</span>
    </span>
  )
}

/* ────────────────── 목업 컴포넌트들 ────────────────── */

/** 워크스페이스 카드 목업 */
function MockWorkspaceCard() {
  return (
    <BrowserFrame title="커리큘럼 위버 - 워크스페이스">
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-500">내 워크스페이스</div>
        <div className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">&#128218;</span>
                <span className="font-bold text-slate-900 text-sm">2026 융합수업 연구회</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">기후변화, 데이터 리터러시 중심 융합 수업 설계</p>
            </div>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">관리자</span>
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
            <div className="flex -space-x-2">
              {['#3B82F6', '#8B5CF6', '#10B981'].map((c, i) => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-white text-[10px] font-bold text-white flex items-center justify-center" style={{ background: c }}>
                  {['김', '이', '박'][i]}
                </div>
              ))}
            </div>
            <span className="text-xs text-slate-400">3명 참여 중</span>
            <span className="text-xs text-slate-400 ml-auto">프로젝트 2개</span>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

/** 팀원 초대 UI 목업 */
function MockInviteUI() {
  return (
    <BrowserFrame title="팀원 초대">
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-700">팀원 초대</div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">
            이메일 주소를 입력하세요
          </div>
          <button className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium shrink-0">초대</button>
        </div>
        <div className="space-y-2">
          {[
            { name: '김수진', email: 'kim@school.ac.kr', role: '관리자', color: '#3B82F6' },
            { name: '이정현', email: 'lee@school.ac.kr', role: '편집자', color: '#8B5CF6' },
            { name: '박민수', email: 'park@school.ac.kr', role: '편집자', color: '#10B981' },
          ].map((m, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-slate-100">
              <div className="w-7 h-7 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0" style={{ background: m.color }}>
                {m.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-800">{m.name}</div>
                <div className="text-[11px] text-slate-400 truncate">{m.email}</div>
              </div>
              <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full">{m.role}</span>
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  )
}

/** 프로젝트 카드 목업 */
function MockProjectCard() {
  return (
    <BrowserFrame title="프로젝트 목록">
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-500">프로젝트</div>
        <div className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">&#127758;</span>
            <div className="flex-1">
              <div className="font-bold text-slate-900 text-sm">기후변화와 데이터 리터러시</div>
              <p className="text-xs text-slate-500 mt-1">고1 과학+수학 융합 | 12차시</p>
              <div className="flex gap-1.5 mt-2.5">
                <span className="text-[10px] bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full">과학</span>
                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">수학</span>
                <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">사회</span>
              </div>
            </div>
          </div>
          {/* 진행률 */}
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
              <span>설계 진행률</span>
              <span className="font-medium text-emerald-600">35%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '35%' }} />
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

/** 3패널 레이아웃 미니 목업 */
function MockThreePanel() {
  return (
    <BrowserFrame title="기후변화와 데이터 리터러시 - 수업 설계">
      <div className="flex gap-2 min-h-[160px]">
        {/* 좌: 절차 내비 */}
        <div className="w-[100px] shrink-0 bg-white rounded-lg border border-slate-200 p-2 space-y-1.5">
          <div className="text-[10px] font-bold text-slate-400 mb-1">PHASES</div>
          {[
            { label: 'T 팀준비', color: '#8B5CF6', active: false },
            { label: 'A 분석', color: '#3B82F6', active: true },
            { label: 'Ds 설계', color: '#10B981', active: false },
            { label: 'DI 개발', color: '#F59E0B', active: false },
            { label: 'E 평가', color: '#F43F5E', active: false },
          ].map((p, i) => (
            <div key={i} className={`text-[10px] px-2 py-1.5 rounded-md font-medium truncate ${p.active ? 'text-white' : 'text-slate-600 bg-slate-50'}`} style={p.active ? { background: p.color } : {}}>
              {p.label}
            </div>
          ))}
        </div>
        {/* 중: 보드 */}
        <div className="flex-1 bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[11px] font-bold text-blue-700 mb-2">A-1-2 주제선정</div>
          <div className="space-y-1.5">
            <div className="text-[10px] bg-blue-50 text-blue-800 px-2 py-1.5 rounded-md">주제: 기후변화와 데이터 리터러시</div>
            <div className="text-[10px] bg-blue-50 text-blue-800 px-2 py-1.5 rounded-md">교과: 과학, 수학, 사회</div>
            <div className="text-[10px] bg-blue-50 text-blue-800 px-2 py-1.5 rounded-md">학년: 고등학교 1학년</div>
          </div>
        </div>
        {/* 우: 채팅 */}
        <div className="w-[130px] shrink-0 bg-white rounded-lg border border-slate-200 p-2 flex flex-col">
          <div className="text-[10px] font-bold text-slate-400 mb-1.5">AI 위버</div>
          <div className="flex-1 space-y-1.5 overflow-hidden">
            <div className="text-[9px] bg-slate-100 text-slate-600 px-2 py-1.5 rounded-md rounded-tl-none">주제를 선정해 볼까요?</div>
            <div className="text-[9px] bg-blue-500 text-white px-2 py-1.5 rounded-md rounded-tr-none ml-auto max-w-[90%]">기후변화를 하고 싶어요</div>
            <div className="text-[9px] bg-slate-100 text-slate-600 px-2 py-1.5 rounded-md rounded-tl-none">좋은 선택이에요!</div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

/** 채팅 패널 목업 (대화 예시) */
function MockChatPanel() {
  return (
    <BrowserFrame title="AI 공동설계자 - 위버">
      <div className="space-y-3 max-h-[320px]">
        {/* 교사 메시지 */}
        <div className="flex gap-2 justify-end">
          <div className="max-w-[85%] bg-blue-600 text-white rounded-xl rounded-tr-sm px-3.5 py-2.5 text-xs leading-relaxed">
            기후변화를 주제로 과학과 수학을 융합하고 싶어요. 고1 학생들이 데이터를 직접 분석하면서 기후 문제를 이해할 수 있는 수업을 설계하고 싶습니다.
          </div>
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 text-[11px] font-bold flex items-center justify-center shrink-0 mt-auto">
            김
          </div>
        </div>
        {/* AI 응답 */}
        <div className="flex gap-2">
          <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center shrink-0 mt-auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V11h3a3 3 0 0 1 3 3v1a2 2 0 0 1-2 2h-1v2a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3v-2H6a2 2 0 0 1-2-2v-1a3 3 0 0 1 3-3h3V9.5A4 4 0 0 1 12 2z"/></svg>
          </div>
          <div className="max-w-[85%] space-y-2">
            <div className="bg-slate-100 rounded-xl rounded-tl-sm px-3.5 py-2.5 text-xs leading-relaxed text-slate-800">
              <p className="mb-2">좋은 방향이에요! 기후변화 데이터를 수학적으로 분석하는 것은 훌륭한 융합 주제입니다. 몇 가지 방향을 제안드릴게요:</p>
              <ol className="space-y-1.5 ml-0.5">
                <li className="flex gap-1.5"><span className="text-violet-600 font-bold shrink-0">1.</span> 기온 변화 데이터의 추세선 분석 (수학: 함수와 그래프)</li>
                <li className="flex gap-1.5"><span className="text-violet-600 font-bold shrink-0">2.</span> 탄소 배출량과 기온 상관관계 (과학: 기후 시스템)</li>
                <li className="flex gap-1.5"><span className="text-violet-600 font-bold shrink-0">3.</span> 지역별 기후 데이터 비교 (사회: 지리적 관점)</li>
              </ol>
              <p className="mt-2">어떤 방향이 마음에 드시나요?</p>
            </div>
            {/* AI 제안 수락/편집/거부 */}
            <div className="flex gap-1.5">
              <button className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[11px] font-medium hover:bg-emerald-200 transition">수락</button>
              <button className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-md text-[11px] font-medium hover:bg-amber-200 transition">편집</button>
              <button className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-md text-[11px] font-medium hover:bg-slate-200 transition">거부</button>
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

/** 보드 목업 */
function MockBoard() {
  return (
    <BrowserFrame title="T-1-1 팀 비전 보드">
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <PhaseBadge code="T-1-1" label="비전설정" color="violet" />
          <span className="text-xs text-slate-400">|</span>
          <span className="text-xs text-slate-500">AI 제안 반영됨</span>
        </div>
        {[
          { key: '교육 비전', value: '데이터 기반 사고력을 갖춘 세계 시민 양성', icon: '&#127775;' },
          { key: '핵심 가치', value: '협력, 탐구, 실생활 연결', icon: '&#128161;' },
          { key: '기대 역량', value: '데이터 리터러시, 비판적 사고, 의사소통', icon: '&#127919;' },
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 flex gap-3 items-start">
            <span className="text-base mt-0.5" dangerouslySetInnerHTML={{ __html: item.icon }} />
            <div>
              <div className="text-[11px] font-semibold text-slate-500 mb-0.5">{item.key}</div>
              <div className="text-xs text-slate-800 leading-relaxed">{item.value}</div>
            </div>
          </div>
        ))}
        {/* 코멘트 */}
        <div className="flex items-start gap-2 pt-2 border-t border-slate-100">
          <div className="w-5 h-5 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">김</div>
          <div className="flex-1">
            <div className="text-[10px] text-slate-400 mb-0.5">김수진 <span className="text-slate-300">| 2분 전</span></div>
            <div className="text-[11px] text-slate-600">"실생활 연결" 부분이 좋아요. 학생들 생활 데이터도 포함하면 어떨까요?</div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

/** 설계 원리 패널 목업 */
function MockPrinciplesPanel() {
  const principles = [
    { name: '상호 의존의 원리', desc: '팀원 간 역할이 유기적으로 연결되어 협력이 필수가 되는 과제 구조', color: '#8B5CF6' },
    { name: '인지 분산의 원리', desc: '정보처리 부담을 팀원 간에 효과적으로 분배하는 학습 설계', color: '#3B82F6' },
    { name: '활성화의 원리', desc: '학습자의 사전 지식과 경험을 새로운 학습의 출발점으로 활용', color: '#10B981' },
  ]
  return (
    <BrowserFrame title="설계 원리 패널">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-500 mb-2">현재 절차에 관련된 설계 원리</div>
        {principles.map((p, i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 flex gap-3 items-start">
            <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: p.color }} />
            <div>
              <div className="text-xs font-semibold text-slate-800">{p.name}</div>
              <div className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{p.desc}</div>
            </div>
          </div>
        ))}
        <div className="text-[10px] text-slate-400 text-center mt-2">40가지 원리 중 3개 매칭됨</div>
      </div>
    </BrowserFrame>
  )
}

/** 실시간 협업 목업 */
function MockRealtimeCollab() {
  return (
    <BrowserFrame title="실시간 협업">
      <div className="space-y-3">
        {/* 온라인 멤버 */}
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {[
              { name: '김', color: '#3B82F6', online: true },
              { name: '이', color: '#8B5CF6', online: true },
              { name: '박', color: '#10B981', online: false },
            ].map((m, i) => (
              <div key={i} className="relative">
                <div className="w-8 h-8 rounded-full border-2 border-white text-xs font-bold text-white flex items-center justify-center" style={{ background: m.color }}>
                  {m.name}
                </div>
                {m.online && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                )}
              </div>
            ))}
          </div>
          <span className="text-xs text-slate-500">2명 온라인</span>
        </div>
        {/* 편집 활동 */}
        <div className="space-y-2">
          {[
            { name: '김수진', action: '팀 비전 보드를 편집 중...', time: '방금', color: '#3B82F6' },
            { name: '이정현', action: '주제선정 보드에 댓글 추가', time: '1분 전', color: '#8B5CF6' },
          ].map((a, i) => (
            <div key={i} className="flex items-center gap-2.5 bg-white rounded-lg border border-slate-100 p-2.5">
              <div className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0" style={{ background: a.color }}>
                {a.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-slate-700 truncate">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-slate-400"> {a.action}</span>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">{a.time}</span>
            </div>
          ))}
        </div>
        {/* 커서 표시 */}
        <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100 text-[11px] text-blue-700">
          <span className="inline-block w-0.5 h-3.5 bg-blue-500 mr-1 animate-pulse" />
          김수진 님이 입력 중...
        </div>
      </div>
    </BrowserFrame>
  )
}

/* ───────────────────────── FAQ ───────────────────────── */

const FAQ_DATA = [
  {
    q: '커리큘럼 위버는 무료인가요?',
    a: '현재 베타 기간 동안 무료로 제공됩니다. 정식 출시 후에는 교사 개인 사용은 무료, 학교/기관 단위의 확장 기능은 별도 요금제가 적용될 예정입니다.',
  },
  {
    q: '어떤 AI를 사용하나요?',
    a: 'Anthropic의 Claude를 AI 공동설계자로 사용합니다. 교육과정 전문 프롬프트 엔지니어링을 통해 40가지 설계 원리에 기반한 맥락 있는 제안을 제공합니다.',
  },
  {
    q: '몇 명까지 함께 설계할 수 있나요?',
    a: '하나의 워크스페이스에 최대 20명까지 참여할 수 있습니다. 실시간 동시 편집은 현재 5명까지 안정적으로 지원되며, 점진적으로 확대할 예정입니다.',
  },
  {
    q: '생성된 수업 설계를 다운로드할 수 있나요?',
    a: 'PDF와 DOCX 형식으로 내보내기가 가능합니다. 19개 절차별 보드 내용, AI 대화 기록, 팀 댓글까지 포함된 완전한 설계 문서를 받아보실 수 있습니다.',
  },
  {
    q: '교육과정 성취기준은 어떻게 활용되나요?',
    a: '2022 개정 교육과정 성취기준 2,200여 개가 내장되어 있습니다. 주제를 선정하면 AI가 관련 성취기준을 자동으로 추천하고, 교과 간 연결 가능성을 분석해 줍니다.',
  },
]

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        className="w-full flex items-center justify-between py-5 text-left group"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm md:text-base font-medium text-slate-800 pr-4">{q}</span>
        <svg
          className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? 200 : 0, opacity: open ? 1 : 0 }}
      >
        <p className="pb-5 text-sm text-slate-600 leading-relaxed pr-8">{a}</p>
      </div>
    </div>
  )
}

/* ─────────────── 워크플로우 데이터 ─────────────── */

const PHASES = [
  {
    code: 'T', name: '팀준비', color: 'violet',
    procedures: ['T-1-1 비전설정', 'T-1-2 방향수립', 'T-2-1 역할분담', 'T-2-2 팀규칙', 'T-2-3 팀일정'],
  },
  {
    code: 'A', name: '분석', color: 'blue',
    procedures: ['A-1-1 주제선정기준', 'A-1-2 주제선정', 'A-2-1 성취기준분석', 'A-2-2 통합목표'],
  },
  {
    code: 'Ds', name: '설계', color: 'emerald',
    procedures: ['Ds-1-1 평가계획', 'Ds-1-2 문제상황', 'Ds-1-3 학습활동', 'Ds-2-1 지원도구', 'Ds-2-2 스캐폴딩'],
  },
  {
    code: 'DI', name: '개발/실행', color: 'amber',
    procedures: ['DI-1-1 자료목록', 'DI-2-1 수업기록'],
  },
  {
    code: 'E', name: '평가', color: 'rose',
    procedures: ['E-1-1 수업성찰', 'E-2-1 과정성찰'],
  },
]

const PHASE_BG = {
  violet: 'from-violet-50 to-violet-100/50 border-violet-200',
  blue: 'from-blue-50 to-blue-100/50 border-blue-200',
  emerald: 'from-emerald-50 to-emerald-100/50 border-emerald-200',
  amber: 'from-amber-50 to-amber-100/50 border-amber-200',
  rose: 'from-rose-50 to-rose-100/50 border-rose-200',
}

const PHASE_TEXT = {
  violet: 'text-violet-700',
  blue: 'text-blue-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  rose: 'text-rose-700',
}

const PHASE_DOT = {
  violet: 'bg-violet-400',
  blue: 'bg-blue-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400',
}

/* ═══════════════════════ 메인 페이지 ═══════════════════════ */

export default function GuidePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Pretendard Variable', var(--font-sans, system-ui), sans-serif" }}>

      {/* ───── 네비게이션 바 ───── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200/60">
        <div className="max-w-[1120px] mx-auto px-5 md:px-8 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-80 transition">
            <Logo size={26} />
            <span className="text-sm font-bold text-slate-900">커리큘럼 위버</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/demo')}
              className="hidden sm:block px-3.5 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition"
            >
              데모 체험
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              시작하기
            </button>
          </div>
        </div>
      </nav>

      {/* ───── S1: 히어로 ───── */}
      <section className="relative pt-32 pb-24 md:pt-40 md:pb-32 overflow-hidden">
        {/* 그라디언트 배경 */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-amber-50/40" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-200/20 rounded-full blur-3xl" />

        <div className="relative max-w-[1120px] mx-auto px-5 md:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-xs text-blue-700 font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            베타 서비스 운영 중
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 leading-tight tracking-tight mb-5">
            AI와 함께<br className="sm:hidden" /> 융합 수업을<br />설계하세요
          </h1>
          <p className="text-base sm:text-lg text-slate-500 max-w-xl mx-auto mb-10 leading-relaxed">
            40가지 설계 원리 기반 협력적 수업 설계 플랫폼.<br className="hidden sm:block" />
            교사 팀이 AI 공동설계자와 함께 19개 절차를 따라<br className="hidden sm:block" />
            체계적으로 융합 수업을 만들어갑니다.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate('/workspaces')}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20"
            >
              시작하기
            </button>
            <button
              onClick={() => navigate('/demo')}
              className="px-6 py-3 bg-white text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition border border-slate-200 shadow-sm"
            >
              데모 체험
            </button>
          </div>
        </div>
      </section>

      {/* ───── S2: 빠른 시작 (4단계) ───── */}
      <Section id="quickstart">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold text-blue-600 tracking-widest uppercase mb-3 block">Quick Start</span>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">4단계로 시작하세요</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 md:gap-12">
          {[
            { step: 1, title: '워크스페이스 만들기', desc: '교사 연구회, 학년 팀 등 협업 단위로 워크스페이스를 생성합니다.', mockup: <MockWorkspaceCard /> },
            { step: 2, title: '팀원 초대', desc: '이메일로 동료 교사를 초대하고 역할을 부여합니다.', mockup: <MockInviteUI /> },
            { step: 3, title: '프로젝트 생성', desc: '융합 수업 주제와 참여 교과를 설정하고 프로젝트를 시작합니다.', mockup: <MockProjectCard /> },
            { step: 4, title: 'AI와 설계 시작', desc: '3패널 인터페이스에서 AI와 대화하며 수업을 설계합니다.', mockup: <MockThreePanel /> },
          ].map((item) => {
            const fade = useFadeIn(0.1)
            return (
              <div key={item.step} ref={fade.ref} style={fade.style} className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
                {item.mockup}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ───── S3: 수업설계 워크플로우 ───── */}
      <Section id="workflow" className="bg-slate-50/80">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold text-violet-600 tracking-widest uppercase mb-3 block">Workflow</span>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">5 Phase, 19 절차의 체계적 설계</h2>
          <p className="text-sm text-slate-500 max-w-lg mx-auto">
            팀 준비부터 평가까지, 검증된 절차를 따라 빈틈 없이 수업을 설계합니다.
          </p>
        </div>

        {/* Phase 카드 */}
        <div className="space-y-4">
          {PHASES.map((phase) => (
            <div
              key={phase.code}
              className={`bg-gradient-to-r ${PHASE_BG[phase.color]} border rounded-xl p-5 md:p-6`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                <PhaseBadge code={`Phase ${phase.code}`} label={phase.name} color={phase.color} />
                <span className="text-xs text-slate-400">{phase.procedures.length}개 절차</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {phase.procedures.map((proc) => (
                  <span
                    key={proc}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/80 rounded-lg text-xs font-medium ${PHASE_TEXT[phase.color]} border border-white/50 shadow-sm`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${PHASE_DOT[phase.color]}`} />
                    {proc}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 연결선 시각화 (간단 표현) */}
        <div className="flex items-center justify-center gap-2 mt-8 text-xs text-slate-400">
          {PHASES.map((p, i) => (
            <span key={p.code} className="flex items-center gap-2">
              <PhaseBadge code={p.code} label="" color={p.color} />
              {i < PHASES.length - 1 && (
                <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                  <path d="M0 6h16M14 2l4 4-4 4" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          ))}
        </div>
      </Section>

      {/* ───── S4: 핵심 기능 ───── */}

      {/* S4-1: AI 공동설계자 */}
      <Section id="ai-codesigner">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <span className="text-xs font-semibold text-violet-600 tracking-widest uppercase mb-3 block">AI Co-Designer</span>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">AI 공동설계자, 위버</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              단순한 챗봇이 아닙니다. 교육과정 전문가로서 4가지 역할을 수행하며 교사의 수업 설계를 지원합니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '&#128204;', title: '안내', desc: '다음 절차를 안내하고 설계 방향을 제시' },
                { icon: '&#9997;', title: '생성', desc: '맥락에 맞는 보드 초안을 자동 작성' },
                { icon: '&#128269;', title: '점검', desc: '설계 원리 기반 피드백과 개선 제안' },
                { icon: '&#128221;', title: '기록', desc: '대화 내용을 보드에 자동 반영' },
              ].map((r, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                  <span className="text-lg" dangerouslySetInnerHTML={{ __html: r.icon }} />
                  <div className="text-xs font-bold text-slate-800 mt-1.5 mb-0.5">{r.title}</div>
                  <div className="text-[11px] text-slate-500 leading-relaxed">{r.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <MockChatPanel />
        </div>
      </Section>

      {/* S4-2: 설계 보드 */}
      <Section id="design-board" className="bg-slate-50/80">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div className="order-2 md:order-1">
            <MockBoard />
          </div>
          <div className="order-1 md:order-2">
            <span className="text-xs font-semibold text-emerald-600 tracking-widest uppercase mb-3 block">Design Boards</span>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">19개 설계 보드</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              각 절차마다 전용 보드가 자동으로 생성됩니다. AI가 초안을 제안하면 교사가 수락, 편집, 거부를 선택할 수 있습니다.
            </p>
            <ul className="space-y-2.5 text-sm text-slate-600">
              {[
                'AI가 절차에 맞는 보드 초안을 자동 생성',
                '교사가 수락/편집/거부로 의사결정',
                '팀원 간 댓글과 피드백 기능',
                '진행 상황 실시간 추적',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* S4-3: 40가지 설계 원리 */}
      <Section id="principles">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <span className="text-xs font-semibold text-blue-600 tracking-widest uppercase mb-3 block">Design Principles</span>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">40가지 설계 원리</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              교육학 연구에서 검증된 40가지 설계 원리가 각 절차에 맞게 자동으로 제시됩니다. AI가 원리에 기반하여 설계를 점검하고 개선점을 제안합니다.
            </p>
            <div className="flex flex-wrap gap-2">
              {['상호 의존', '인지 분산', '활성화', '시연', '적용', '통합', '점진적 복잡성', '메타인지'].map((p) => (
                <span key={p} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium border border-blue-100">
                  {p}
                </span>
              ))}
              <span className="px-3 py-1.5 bg-slate-50 text-slate-400 text-xs rounded-full font-medium border border-slate-100">
                +32개
              </span>
            </div>
          </div>
          <MockPrinciplesPanel />
        </div>
      </Section>

      {/* S4-4: 실시간 협업 */}
      <Section id="realtime" className="bg-slate-50/80">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div className="order-2 md:order-1">
            <MockRealtimeCollab />
          </div>
          <div className="order-1 md:order-2">
            <span className="text-xs font-semibold text-amber-600 tracking-widest uppercase mb-3 block">Real-time Collaboration</span>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">실시간 협업</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              같은 프로젝트에서 동시에 작업하세요. 보드 편집, 댓글, AI 대화가 실시간으로 동기화됩니다.
            </p>
            <ul className="space-y-2.5 text-sm text-slate-600">
              {[
                '실시간 동시 편집 및 커서 표시',
                '절차별 댓글과 스레드형 피드백',
                '역할 기반 권한 관리 (관리자/편집자/뷰어)',
                '오프라인 작업 후 자동 동기화',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ───── S5: 데모 체험 ───── */}
      <Section id="demo">
        <div className="max-w-2xl mx-auto text-center">
          <span className="text-xs font-semibold text-emerald-600 tracking-widest uppercase mb-3 block">Try Demo</span>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">3분 만에 체험해 보세요</h2>
          <p className="text-sm text-slate-500 mb-10">
            학년, 교과, 주제만 입력하면 AI가 19개 절차의 수업 설계를 자동으로 생성합니다.
          </p>

          {/* 데모 입력 폼 목업 */}
          <BrowserFrame title="데모 체험" className="max-w-lg mx-auto text-left">
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">학년</label>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">고등학교 1학년</div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">교과</label>
                <div className="flex gap-2">
                  {['과학', '수학', '사회'].map((s) => (
                    <span key={s} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] rounded-full font-medium border border-blue-100">{s}</span>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">주제</label>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">기후변화와 데이터 리터러시</div>
              </div>
              <button className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition mt-1">
                AI 수업 설계 시작
              </button>
            </div>
          </BrowserFrame>

          <button
            onClick={() => navigate('/demo')}
            className="mt-8 px-8 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20"
          >
            데모 시작하기
          </button>
        </div>
      </Section>

      {/* ───── S6: FAQ ───── */}
      <Section id="faq" className="bg-slate-50/80">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-3 block">FAQ</span>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900">자주 묻는 질문</h2>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 md:px-8 divide-y divide-slate-200">
            {FAQ_DATA.map((item, i) => (
              <FAQItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───── S7: CTA 푸터 ───── */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-violet-700" />
        <div className="absolute top-10 left-1/3 w-72 h-72 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-white/5 rounded-full blur-3xl" />

        <div className="relative max-w-[1120px] mx-auto px-5 md:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">지금 바로 시작하세요</h2>
          <p className="text-sm md:text-base text-blue-100 max-w-md mx-auto mb-8 leading-relaxed">
            AI와 함께 체계적인 융합 수업을 설계하는 경험을 시작해 보세요.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate('/workspaces')}
              className="px-6 py-3 bg-white text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-50 transition shadow-lg"
            >
              시작하기
            </button>
            <button
              onClick={() => navigate('/demo')}
              className="px-6 py-3 bg-white/10 text-white rounded-xl text-sm font-semibold hover:bg-white/20 transition border border-white/20"
            >
              데모 체험
            </button>
          </div>
        </div>
      </section>

      {/* ───── 푸터 ───── */}
      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="max-w-[1120px] mx-auto px-5 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size={20} />
            <span className="text-xs text-slate-500">커리큘럼 위버</span>
          </div>
          <p className="text-xs text-slate-600">
            40가지 설계 원리 기반 AI 협력적 수업 설계 플랫폼
          </p>
        </div>
      </footer>
    </div>
  )
}
