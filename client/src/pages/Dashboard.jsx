import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, Clock, ArrowRight, Database, HelpCircle, Globe, Archive, RotateCcw, Trash2 } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import Logo from '../components/Logo'
import { STAGES, PHASES } from 'curriculum-weaver-shared/constants.js'
import Tutorial from '../components/Tutorial'

export default function Dashboard() {
  const navigate = useNavigate()
  const { sessions, loading, fetchSessions, createSession, joinSession, archiveSession, restoreSession, deleteSession, statusFilter, setStatusFilter } = useSessionStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hostName, setHostName] = useState('')
  const [hostAffiliation, setHostAffiliation] = useState('')
  const [hostSubject, setHostSubject] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showTutorial, setShowTutorial] = useState(false)

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions, statusFilter])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!title.trim() || !hostName.trim()) return
    try {
      // 호스트 정보를 localStorage에 저장 (SessionPage에서 사용)
      const nickname = hostName.trim()
      const affiliation = hostAffiliation.trim()
      const subject = hostSubject.trim()
      const displaySubject = [affiliation, subject].filter(Boolean).join(' · ') || ''
      localStorage.setItem('cw_nickname', nickname)
      localStorage.setItem('cw_subject', displaySubject)

      const session = await createSession({ title: title.trim(), description: description.trim() })
      setShowCreate(false)
      setTitle('')
      setDescription('')
      setHostName('')
      setHostAffiliation('')
      setHostSubject('')
      navigate(`/session/${session.id}`)
    } catch (err) {
      alert(`세션 생성 실패: ${err.message}`)
    }
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    try {
      const session = await joinSession(inviteCode.trim())
      setShowJoin(false)
      setInviteCode('')
      navigate(`/session/${session.id}`)
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} className="flex items-center gap-3 hover:opacity-80 transition">
            <Logo size={32} />
            <h1 className="text-xl font-bold text-gray-900">커리큘럼 위버</h1>
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTutorial(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
              title="튜토리얼 다시 보기"
            >
              <HelpCircle size={14} />
              가이드
            </button>
            <span className="text-sm text-gray-400">테스트 모드</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* 액션 버튼 */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium w-full sm:w-auto min-h-[44px]"
          >
            <Plus size={18} /> 새 설계 세션
          </button>
          <button
            onClick={() => setShowJoin(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium w-full sm:w-auto min-h-[44px]"
          >
            <Users size={18} /> 초대 코드로 참여
          </button>
          <button
            onClick={() => navigate('/data')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium w-full sm:w-auto min-h-[44px]"
          >
            <Database size={18} /> 교육과정 데이터
          </button>
          <button
            onClick={() => navigate('/graph')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition font-medium w-full sm:w-auto min-h-[44px]"
          >
            <Globe size={18} /> 3D 교육과정 그래프
          </button>
        </div>

        {/* 세션 생성 모달 */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
            <form onSubmit={handleCreate} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md mx-4 sm:mx-auto shadow-2xl max-h-[90vh] overflow-auto">
              <h2 className="text-lg font-bold mb-4">새 설계 세션 만들기</h2>

              {/* 호스트 정보 */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">호스트 정보</p>
              <input
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="이름 또는 닉네임 *"
                maxLength={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                required
              />
              <div className="flex gap-2 mb-4">
                <input
                  value={hostAffiliation}
                  onChange={(e) => setHostAffiliation(e.target.value)}
                  placeholder="소속 (예: ○○초등학교)"
                  maxLength={20}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  value={hostSubject}
                  onChange={(e) => setHostSubject(e.target.value)}
                  placeholder="과목/전공"
                  maxLength={10}
                  className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 세션 정보 */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">세션 정보</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="세션 제목 (예: 3학년 기후변화 융합수업) *"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="간략한 설명 (선택)"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">만들기</button>
              </div>
            </form>
          </div>
        )}

        {/* 참여 모달 */}
        {showJoin && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowJoin(false)}>
            <form onSubmit={handleJoin} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-sm mx-4 sm:mx-auto shadow-2xl">
              <h2 className="text-lg font-bold mb-4">세션 참여하기</h2>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="초대 코드 입력"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowJoin(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">참여</button>
              </div>
            </form>
          </div>
        )}

        {/* 세션 목록 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">설계 세션</h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[
              { key: 'active', label: '진행 중' },
              { key: 'archived', label: '아카이브' },
              { key: 'all', label: '전체' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1 text-sm rounded-md transition ${
                  statusFilter === tab.key
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-400">로딩 중...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Logo size={48} className="mx-auto mb-1 opacity-60" />
            <p className="text-gray-500 mb-2">아직 설계 세션이 없습니다</p>
            <p className="text-sm text-gray-400">새 세션을 만들거나 초대 코드로 참여하세요</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => {
              const stage = STAGES.find((s) => s.id === session.current_stage) || STAGES[0]
              return (
                <button
                  key={session.id}
                  onClick={() => navigate(`/session/${session.id}`)}
                  className={`flex items-center gap-3 sm:gap-4 rounded-xl border p-4 sm:p-5 hover:shadow-md transition text-left w-full group ${
                    session.status === 'archived'
                      ? 'bg-gray-50 border-gray-200 opacity-70 hover:opacity-100 hover:border-gray-300'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {(() => {
                    const phase = PHASES.find(p => p.id === stage.phase)
                    return (
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
                        style={{ backgroundColor: `${phase?.color || '#3b82f6'}15`, color: phase?.color || '#3b82f6' }}>
                        {stage.code}
                      </div>
                    )
                  })()}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{session.title}</h3>
                    <p className="text-sm text-gray-500 flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                      <Clock size={14} />
                      <span>{stage.code}: {stage.shortName}</span>
                      <span className="text-xs text-gray-400 hidden sm:inline">코드: {session.invite_code}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {session.status === 'archived' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); restoreSession(session.id) }}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="복원"
                      >
                        <RotateCcw size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); archiveSession(session.id) }}
                        className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        title="아카이브"
                      >
                        <Archive size={16} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('이 세션을 완전히 삭제하시겠습니까? 복구할 수 없습니다.')) {
                          deleteSession(session.id)
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                    <ArrowRight size={20} className="text-gray-300 group-hover:text-blue-500 transition ml-1" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* 튜토리얼 오버레이 */}
      {showTutorial && (
        <Tutorial onComplete={() => setShowTutorial(false)} />
      )}
    </div>
  )
}
