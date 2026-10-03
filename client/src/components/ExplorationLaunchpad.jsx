import { Link } from 'react-router-dom'

export default function ExplorationLaunchpad() {
  return <section id="exploration" aria-label="수업 탐색" className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 className="text-lg font-bold text-slate-800">수업 탐색</h2>
    <p className="mt-1 text-sm text-slate-600">새 수업의 재료를 찾거나, 고른 성취기준으로 수업 아이디어를 비교해 보세요.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Link to="/graph?mode=design" className="block rounded-xl border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100">
        <strong className="text-blue-900">성취기준 연결 찾기 →</strong>
        <p className="mt-2 text-sm text-blue-800">주제·함께할 두 과목·관심 성취기준에서 수업의 재료를 찾습니다.</p>
      </Link>
      <Link to="/futures-lab" className="block rounded-xl border border-emerald-200 bg-emerald-50 p-4 hover:bg-emerald-100">
        <strong className="text-emerald-900">미래보기 →</strong>
        <p className="mt-2 text-sm text-emerald-800">선택한 성취기준의 연결을 보고, 여덟 관점의 수업 아이디어를 비교합니다.</p>
      </Link>
    </div>
    <p className="mt-4 text-sm text-slate-700"><strong>진행 중인 프로젝트가 있나요?</strong> 해당 프로젝트의 ‘성취기준’에서 재료를 찾거나, A-3의 ‘미래보기로 연결 아이디어 검토’에서 이어가세요.</p>
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-sm">
      <Link to="/graph?mode=explore" className="text-slate-600 underline underline-offset-4">교육과정 전체 지도 · 3D</Link>
      <Link to="/demo" className="text-slate-600 underline underline-offset-4">AI 설계 예시 체험</Link>
    </div>
  </section>
}
