import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Share2, BookMarked, HelpCircle, MessageSquare, LayoutDashboard,
  BookOpen, UserCircle, Download, ChevronRight,
} from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { useProcedureStore } from '../stores/procedureStore'
import { useChatStore } from '../stores/chatStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useSessionStore } from '../stores/sessionStore'
import { socket, joinSession, leaveSession } from '../lib/socket'
import { PROCEDURES } from 'curriculum-weaver-shared/constants.js'
import Logo from '../components/Logo'
import ProcedureNav from '../components/ProcedureNav'
import ChatPanel from '../components/ChatPanel'
import ProcedureCanvas from '../components/ProcedureCanvas'
import PrinciplePanel from '../components/PrinciplePanel'
import MemberList from '../components/MemberList'
import StandardSearch from '../components/StandardSearch'
import ReportDownload from '../components/ReportDownload'
import MaterialUploadBar from '../components/MaterialUploadBar'
import Tutorial from '../components/Tutorial'

// 참여자 정보 입력 모달
function NicknameModal({ onConfirm }) {
  const [name, setName] = useState('')
  const [affiliation, setAffiliation] = useState('')
  const [subject, setSubject] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const nickname = name.trim() || `교사${Math.floor(Math.random() * 100)}`
    const displaySubject = [affiliation.trim(), subject.trim()].filter(Boolean).join(' -- ') || ''
    localStorage.setItem('cw_nickname', nickname)
    localStorage.setItem('cw_subject', displaySubject)
    onConfirm({ name: nickname, subject: displaySubject })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <form onSubmit={handleSubmit} className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6">
        <div className="flex flex-col items-center gap-3 mb-5">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
            <UserCircle size={32} className="text-blue-500" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-900">참여자 정보</h2>
            <p className="text-sm text-gray-500 mt-1">다른 선생님에게 표시될 정보예요</p>
          </div>
        </div>
        <div className="space-y-3">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 또는 닉네임 (예: 김교사)"
            maxLength={10}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
          <input
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            placeholder="소속 (예: OO초등학교)"
            maxLength={20}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="담당 과목 또는 전공 (예: 과학)"
            maxLength={15}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>
        <button
          type="submit"
          className="w-full mt-4 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition"
        >
          입장하기
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
          닉네임을 비워두면 자동 생성돼요
        </p>
      </form>
    </div>
  )
}

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams()
  const navigate = useNavigate()

  // stores
  const { currentProject, fetchProject, updateProcedure } = useProjectStore()
  const { currentWorkspace, fetchWorkspace } = useWorkspaceStore()
  const {
    currentProcedure, setProcedure, loadBoards, loadStandards, loadMaterials,
    loadPrinciples, loadGeneralPrinciples, subscribeBoardUpdates, unsubscribeBoardUpdates, reset,
  } = useProcedureStore()
  const {
    loadMessages, subscribe, unsubscribe, boardSuggestions,
    requestProcedureIntro,
  } = useChatStore()
  const { setMembers } = useSessionStore()

  // local state
  const [showStandardSearch, setShowStandardSearch] = useState(false)
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('cw_tutorial_done'))
  const [activePanel, setActivePanel] = useState('chat')
  const [boardUpdated, setBoardUpdated] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [needsNickname, setNeedsNickname] = useState(() => !localStorage.getItem('cw_nickname'))

  const joinedRef = useRef(false)
  const introRequestedRef = useRef(false)

  // 프로젝트 + 워크스페이스 데이터 로드
  useEffect(() => {
    fetchProject(projectId)
    if (workspaceId) fetchWorkspace(workspaceId)
    loadMessages(projectId)
    loadGeneralPrinciples()
  }, [projectId, workspaceId])

  // 프로젝트에서 현재 절차 복원
  useEffect(() => {
    if (currentProject?.current_procedure) {
      setProcedure(currentProject.current_procedure)
    }
  }, [currentProject?.current_procedure])

  // 소켓 연결
  const connectSocket = useCallback(({ name: nickname, subject: subjectName }) => {
    if (joinedRef.current) return
    joinedRef.current = true

    joinSession(projectId, { name: nickname, subject: subjectName || '' })
    subscribe(projectId)
    subscribeBoardUpdates()

    const handleMembersUpdated = (members) => {
      setMembers(members)
      if (!introRequestedRef.current) {
        introRequestedRef.current = true
        const msgs = useChatStore.getState().messages
        const hasContent = msgs.some((m) => m.sender_type === 'ai' || m.sender_type === 'teacher')
        if (!hasContent) {
          const proc = useProcedureStore.getState().currentProcedure
          setTimeout(() => requestProcedureIntro(projectId, proc), 500)
        }
      }
    }
    const handleStageUpdated = (stage) => {
      setProcedure(stage)
    }

    socket.on('members_updated', handleMembersUpdated)
    socket.on('stage_updated', handleStageUpdated)

    joinedRef.cleanup = () => {
      leaveSession(projectId)
      unsubscribe()
      unsubscribeBoardUpdates()
      socket.off('members_updated', handleMembersUpdated)
      socket.off('stage_updated', handleStageUpdated)
      reset()
      joinedRef.current = false
      introRequestedRef.current = false
    }
  }, [projectId])

  // 닉네임 있으면 바로 연결
  useEffect(() => {
    const savedName = localStorage.getItem('cw_nickname')
    const savedSubject = localStorage.getItem('cw_subject') || ''
    if (savedName) connectSocket({ name: savedName, subject: savedSubject })
    return () => joinedRef.cleanup?.()
  }, [projectId, connectSocket])

  const handleNicknameConfirm = (info) => {
    setNeedsNickname(false)
    connectSocket(info)
  }

  // 보드 업데이트 알림 배지
  useEffect(() => {
    if (boardSuggestions.length > 0 && activePanel !== 'board') {
      setBoardUpdated(true)
    }
  }, [boardSuggestions, activePanel])

  useEffect(() => {
    if (activePanel === 'board') setBoardUpdated(false)
  }, [activePanel])

  // 절차 변경 시 데이터 로드
  useEffect(() => {
    if (!currentProject) return
    loadBoards(projectId, currentProcedure)
    loadStandards(projectId)
    loadMaterials(projectId)
    loadPrinciples(currentProcedure)
  }, [currentProcedure, projectId, currentProject])

  const handleProcedureChange = async (code) => {
    setProcedure(code)
    await updateProcedure(projectId, code)
    // 절차 전환 시 소켓 브로드캐스트
    socket.emit('stage_changed', { sessionId: projectId, stage: code })
    requestProcedureIntro(projectId, code)
  }

  const handleCopyInvite = () => {
    if (currentProject?.invite_code) {
      navigator.clipboard.writeText(currentProject.invite_code)
      alert(`초대 코드가 복사되었습니다: ${currentProject.invite_code}`)
    }
  }

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const MOBILE_TABS = [
    { id: 'chat', label: '채팅', Icon: MessageSquare },
    { id: 'board', label: '설계보드', Icon: LayoutDashboard },
    { id: 'principles', label: '원칙', Icon: BookOpen },
  ]

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden" style={{ height: '100dvh' }}>
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-gray-200 px-2 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-3 shrink-0">
        <a
          href={`/workspaces/${workspaceId}`}
          onClick={(e) => { e.preventDefault(); navigate(`/workspaces/${workspaceId}`) }}
          className="flex items-center gap-1.5 hover:opacity-80 transition shrink-0 min-w-[44px] min-h-[44px]"
          title="워크스페이스로"
        >
          <Logo size={24} />
          <span className="hidden sm:inline text-sm font-bold text-gray-900">커리큘럼 위버</span>
        </a>

        {/* 브레드크럼 */}
        <span className="text-gray-300 hidden sm:inline">|</span>
        <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400 min-w-0">
          <Link to={`/workspaces/${workspaceId}`} className="hover:text-blue-600 transition truncate max-w-[100px]">
            {currentWorkspace?.name || '워크스페이스'}
          </Link>
          <ChevronRight size={12} />
          <span className="text-gray-700 font-medium truncate">{currentProject.title}</span>
        </div>
        <h1 className="sm:hidden font-semibold text-gray-900 truncate flex-1 text-sm">
          {currentProject.title}
        </h1>

        <div className="ml-auto flex items-center gap-1">
          <MemberList />
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition min-h-[44px]"
            title="결과 보고서"
          >
            <Download size={16} />
            <span className="hidden sm:inline">보고서</span>
          </button>
          <button
            onClick={() => setShowStandardSearch(true)}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-lg transition min-h-[44px]"
            title="성취기준 탐색"
          >
            <BookMarked size={16} />
            <span className="hidden sm:inline">성취기준</span>
          </button>
          <button
            onClick={handleCopyInvite}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition min-h-[44px]"
            title="초대 코드 복사"
          >
            <Share2 size={16} />
            <span className="hidden sm:inline">초대</span>
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('cw_tutorial_done')
              setShowTutorial(true)
            }}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="튜토리얼"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      {/* 자료 관리 바 */}
      <MaterialUploadBar sessionId={projectId} />

      {/* 절차 네비게이션 */}
      <ProcedureNav
        currentProcedure={currentProcedure}
        onProcedureChange={handleProcedureChange}
      />

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측: 채팅 */}
        <div className={`
          ${activePanel === 'chat' ? 'flex' : 'hidden'}
          md:flex w-full md:w-[400px]
          border-r-0 md:border-r border-gray-200
          flex-col bg-white md:shrink-0
        `}>
          <ChatPanel
            sessionId={projectId}
            stage={currentProcedure}
            onStageChange={handleProcedureChange}
          />
        </div>

        {/* 중앙: 설계 캔버스 */}
        <div className={`
          ${activePanel === 'board' ? 'block' : 'hidden'}
          md:block flex-1 overflow-auto p-3 sm:p-4 w-full
        `}>
          <ProcedureCanvas projectId={projectId} procedureCode={currentProcedure} />
        </div>

        {/* 우측: 원칙 패널 */}
        <div className={`
          ${activePanel === 'principles' ? 'block' : 'hidden'}
          md:block w-full md:w-[280px]
          border-l-0 md:border-l border-gray-200
          bg-white overflow-auto md:shrink-0
        `}>
          <PrinciplePanel stage={currentProcedure} />
        </div>
      </div>

      {/* 모바일 하단 탭 바 */}
      <div className="md:hidden flex border-t border-gray-200 bg-white shrink-0 safe-bottom">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition min-h-[56px] justify-center ${
              activePanel === tab.id
                ? 'text-blue-600 bg-blue-50 border-t-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.Icon size={20} />
            {tab.label}
            {tab.id === 'board' && boardUpdated && (
              <span className="absolute top-1.5 right-1/4 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* 모달들 */}
      {needsNickname && <NicknameModal onConfirm={handleNicknameConfirm} />}

      {showStandardSearch && (
        <StandardSearch
          sessionId={projectId}
          onClose={() => {
            setShowStandardSearch(false)
            loadStandards(projectId)
          }}
        />
      )}

      {showReport && (
        <ReportDownload
          sessionId={projectId}
          sessionTitle={currentProject.title}
          onClose={() => setShowReport(false)}
        />
      )}

      {showTutorial && (
        <Tutorial onComplete={() => setShowTutorial(false)} />
      )}
    </div>
  )
}
