import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Share2, BookMarked, HelpCircle, MessageSquare, LayoutDashboard, BookOpen, UserCircle } from 'lucide-react'
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

// 참여자 정보 입력 모달 (초대 코드로 참여 시)
function NicknameModal({ onConfirm }) {
  const [name, setName] = useState('')
  const [affiliation, setAffiliation] = useState('')
  const [subject, setSubject] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const nickname = name.trim() || `교사${Math.floor(Math.random() * 100)}`
    const displaySubject = [affiliation.trim(), subject.trim()].filter(Boolean).join(' · ') || ''
    localStorage.setItem('cw_nickname', nickname)
    localStorage.setItem('cw_subject', displaySubject)
    onConfirm({ name: nickname, subject: displaySubject })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6"
      >
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
            placeholder="소속 (예: ○○초등학교)"
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

export default function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { currentSession, fetchSession, updateStage, setMembers } = useSessionStore()
  const { loadBoards, loadStandards, loadMaterials, loadPrinciples, subscribeBoardUpdates, unsubscribeBoardUpdates, reset } = useStageStore()
  const { loadMessages, subscribe, unsubscribe, boardSuggestions } = useChatStore()
  const [showStandardSearch, setShowStandardSearch] = useState(false)
  const [showTutorial, setShowTutorial] = useState(
    () => !localStorage.getItem('cw_tutorial_done')
  )
  const [activePanel, setActivePanel] = useState('chat')
  const [boardUpdated, setBoardUpdated] = useState(false)
  const [needsNickname, setNeedsNickname] = useState(
    () => !localStorage.getItem('cw_nickname')
  )
  const joinedRef = useRef(false)

  // 세션 데이터 로드 (닉네임과 무관)
  useEffect(() => {
    fetchSession(sessionId)
    loadMessages(sessionId)
  }, [sessionId])

  // 소켓 연결 (닉네임 확정 후)
  const connectSocket = useCallback(({ name: nickname, subject: subjectName }) => {
    if (joinedRef.current) return
    joinedRef.current = true

    joinSession(sessionId, { name: nickname, subject: subjectName || '' })
    subscribe(sessionId)
    subscribeBoardUpdates()

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

    // cleanup 함수를 ref에 저장
    joinedRef.cleanup = () => {
      leaveSession(sessionId)
      unsubscribe()
      unsubscribeBoardUpdates()
      socket.off('members_updated', handleMembersUpdated)
      socket.off('stage_updated', handleStageUpdated)
      reset()
      joinedRef.current = false
    }
  }, [sessionId])

  // 이미 닉네임이 있으면 바로 연결
  useEffect(() => {
    const savedName = localStorage.getItem('cw_nickname')
    const savedSubject = localStorage.getItem('cw_subject') || ''
    if (savedName) connectSocket({ name: savedName, subject: savedSubject })
    return () => joinedRef.cleanup?.()
  }, [sessionId, connectSocket])

  // 닉네임 모달에서 확인
  const handleNicknameConfirm = (info) => {
    setNeedsNickname(false)
    connectSocket(info)
  }

  // 보드 자동 반영 시 모바일 알림 뱃지
  useEffect(() => {
    if (boardSuggestions.length > 0 && activePanel !== 'board') {
      setBoardUpdated(true)
    }
  }, [boardSuggestions, activePanel])

  // 보드 탭 전환 시 뱃지 제거
  useEffect(() => {
    if (activePanel === 'board') setBoardUpdated(false)
  }, [activePanel])

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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden" style={{ height: '100dvh' }}>
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

      {/* 닉네임 입력 모달 */}
      {needsNickname && <NicknameModal onConfirm={handleNicknameConfirm} />}

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
