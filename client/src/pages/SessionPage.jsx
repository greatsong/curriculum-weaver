import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Share2, BookMarked, HelpCircle, MessageSquare, LayoutDashboard, BookOpen } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useStageStore } from '../stores/stageStore'
import { useChatStore } from '../stores/chatStore'
import { socket, joinSession, leaveSession } from '../lib/socket'
import StageNav from '../components/StageNav'
import ChatPanel from '../components/ChatPanel'
import DesignBoard from '../components/DesignBoard'
import PrinciplePanel from '../components/PrinciplePanel'
import MemberList from '../components/MemberList'
import StandardSearch from '../components/StandardSearch'
import Tutorial from '../components/Tutorial'

export default function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { currentSession, fetchSession, updateStage, setMembers } = useSessionStore()
  const { loadBoards, loadStandards, loadMaterials, loadPrinciples, subscribeBoardUpdates, unsubscribeBoardUpdates, reset } = useStageStore()
  const { loadMessages, subscribe, unsubscribe } = useChatStore()
  const [showStandardSearch, setShowStandardSearch] = useState(false)
  const [showTutorial, setShowTutorial] = useState(
    () => !localStorage.getItem('cw_tutorial_done')
  )
  const [activePanel, setActivePanel] = useState('chat')

  useEffect(() => {
    fetchSession(sessionId)
    loadMessages(sessionId)

    // Socket.IO 세션 입장 (닉네임은 localStorage에 저장)
    let nickname = localStorage.getItem('cw_nickname')
    if (!nickname) {
      nickname = prompt('닉네임을 입력하세요 (예: 김교사)', '') || `교사${Math.floor(Math.random() * 100)}`
      localStorage.setItem('cw_nickname', nickname)
    }
    joinSession(sessionId, { name: nickname })

    // 채팅 + 보드 구독
    subscribe(sessionId)
    subscribeBoardUpdates()

    // Socket.IO 이벤트 리스너
    const handleMembersUpdated = (members) => setMembers(members)
    const handleStageUpdated = (stage) => {
      useSessionStore.setState((state) => ({
        currentSession: state.currentSession
          ? { ...state.currentSession, current_stage: stage }
          : null,
      }))
    }

    socket.on('members_updated', handleMembersUpdated)
    socket.on('stage_updated', handleStageUpdated)

    return () => {
      leaveSession(sessionId)
      unsubscribe()
      unsubscribeBoardUpdates()
      socket.off('members_updated', handleMembersUpdated)
      socket.off('stage_updated', handleStageUpdated)
      reset()
    }
  }, [sessionId])

  // 단계 변경 시 해당 단계 데이터 로드
  useEffect(() => {
    if (!currentSession) return
    const stage = currentSession.current_stage
    loadBoards(sessionId, stage)
    loadStandards(sessionId)
    loadMaterials(sessionId)
    loadPrinciples(stage)
  }, [currentSession?.current_stage, sessionId])

  const handleStageChange = async (stage) => {
    await updateStage(sessionId, stage)
  }

  const handleCopyInvite = () => {
    if (currentSession?.invite_code) {
      navigator.clipboard.writeText(currentSession.invite_code)
      alert(`초대 코드가 복사되었습니다: ${currentSession.invite_code}`)
    }
  }

  if (!currentSession) {
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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-gray-200 px-2 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-gray-900 truncate flex-1 text-sm sm:text-base">{currentSession.title}</h1>
        <MemberList />
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
          title="튜토리얼 다시 보기"
        >
          <HelpCircle size={18} />
        </button>
      </header>

      {/* 단계 네비게이션 */}
      <StageNav
        currentStage={currentSession.current_stage}
        onStageChange={handleStageChange}
      />

      {/* 메인 콘텐츠 — 데스크톱: 3패널, 모바일: 탭 전환 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측: 채팅 */}
        <div className={`
          ${activePanel === 'chat' ? 'flex' : 'hidden'}
          md:flex
          w-full md:w-[400px]
          border-r-0 md:border-r border-gray-200
          flex-col bg-white md:shrink-0
        `}>
          <ChatPanel sessionId={sessionId} stage={currentSession.current_stage} />
        </div>

        {/* 중앙: 설계 보드 */}
        <div className={`
          ${activePanel === 'board' ? 'block' : 'hidden'}
          md:block
          flex-1 overflow-auto p-3 sm:p-4
          w-full
        `}>
          <DesignBoard sessionId={sessionId} stage={currentSession.current_stage} />
        </div>

        {/* 우측: 원칙 패널 */}
        <div className={`
          ${activePanel === 'principles' ? 'block' : 'hidden'}
          md:block
          w-full md:w-[280px]
          border-l-0 md:border-l border-gray-200
          bg-white overflow-auto md:shrink-0
        `}>
          <PrinciplePanel stage={currentSession.current_stage} />
        </div>
      </div>

      {/* 모바일 하단 탭 바 */}
      <div className="md:hidden flex border-t border-gray-200 bg-white shrink-0 safe-bottom">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition min-h-[56px] justify-center ${
              activePanel === tab.id
                ? 'text-blue-600 bg-blue-50 border-t-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.Icon size={20} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* 성취기준 검색 모달 */}
      {showStandardSearch && (
        <StandardSearch
          sessionId={sessionId}
          onClose={() => {
            setShowStandardSearch(false)
            loadStandards(sessionId)
          }}
        />
      )}

      {/* 튜토리얼 오버레이 */}
      {showTutorial && (
        <Tutorial onComplete={() => setShowTutorial(false)} />
      )}
    </div>
  )
}
