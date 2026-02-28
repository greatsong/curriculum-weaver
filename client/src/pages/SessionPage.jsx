import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Share2, BookMarked } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useStageStore } from '../stores/stageStore'
import { useChatStore } from '../stores/chatStore'
import StageNav from '../components/StageNav'
import ChatPanel from '../components/ChatPanel'
import DesignBoard from '../components/DesignBoard'
import PrinciplePanel from '../components/PrinciplePanel'
import MemberList from '../components/MemberList'
import StandardSearch from '../components/StandardSearch'

export default function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { currentSession, fetchSession, updateStage } = useSessionStore()
  const { loadBoards, loadStandards, loadMaterials, loadPrinciples, reset } = useStageStore()
  const { loadMessages, unsubscribe } = useChatStore()
  const [showStandardSearch, setShowStandardSearch] = useState(false)

  useEffect(() => {
    fetchSession(sessionId)
    loadMessages(sessionId)

    return () => {
      unsubscribe()
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

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-gray-900 truncate flex-1">{currentSession.title}</h1>
        <MemberList />
        <button
          onClick={() => setShowStandardSearch(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-lg transition"
          title="성취기준 탐색"
        >
          <BookMarked size={14} />
          성취기준
        </button>
        <button
          onClick={handleCopyInvite}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
          title="초대 코드 복사"
        >
          <Share2 size={14} />
          초대
        </button>
      </header>

      {/* 단계 네비게이션 */}
      <StageNav
        currentStage={currentSession.current_stage}
        onStageChange={handleStageChange}
      />

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측: 채팅 */}
        <div className="w-[400px] border-r border-gray-200 flex flex-col bg-white shrink-0">
          <ChatPanel sessionId={sessionId} stage={currentSession.current_stage} />
        </div>

        {/* 중앙: 설계 보드 */}
        <div className="flex-1 overflow-auto p-4">
          <DesignBoard sessionId={sessionId} stage={currentSession.current_stage} />
        </div>

        {/* 우측: 원칙 패널 */}
        <div className="w-[280px] border-l border-gray-200 bg-white overflow-auto shrink-0">
          <PrinciplePanel stage={currentSession.current_stage} />
        </div>
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
    </div>
  )
}
