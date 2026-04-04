import { useEffect, useState, useCallback, useRef, Component } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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
import InteractiveTour from '../components/InteractiveTour'

// Error Boundary — ChatPanel 등 하위 컴포넌트 크래시 시 전체 페이지 보호
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <p style={{ fontSize: 14 }}>컴포넌트 로딩 중 오류가 발생했습니다.</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 8, padding: '6px 16px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, cursor: 'pointer' }}>
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(4px)' }} />
      <form
        onSubmit={handleSubmit}
        className="animate-slide-up"
        style={{
          position: 'relative',
          background: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-xl)',
          width: '100%',
          maxWidth: 380,
          padding: 32,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: '#EFF6FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>참여자 정보</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>다른 선생님에게 표시될 정보예요</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 또는 닉네임 (예: 김교사)"
            maxLength={10}
            style={{ width: '100%', padding: '10px 14px', fontSize: 14, textAlign: 'center', boxSizing: 'border-box' }}
          />
          <input
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            placeholder="소속 (예: OO초등학교)"
            maxLength={20}
            style={{ width: '100%', padding: '10px 14px', fontSize: 14, textAlign: 'center', boxSizing: 'border-box' }}
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="담당 과목 또는 전공 (예: 과학)"
            maxLength={15}
            style={{ width: '100%', padding: '10px 14px', fontSize: 14, textAlign: 'center', boxSizing: 'border-box' }}
          />
        </div>
        <button
          type="submit"
          style={{
            width: '100%',
            marginTop: 16,
            padding: '12px 16px',
            background: '#111827',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background var(--transition-fast)',
            fontFamily: 'var(--font-sans)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#1F2937'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#111827'}
        >
          입장하기
        </button>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', margin: '12px 0 0' }}>
          닉네임을 비워두면 자동 생성돼요
        </p>
      </form>
    </div>
  )
}

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams()
  const navigate = useNavigate()
  const isDemo = new URLSearchParams(window.location.search).get('demo') === 'true' || workspaceId?.startsWith('demo-')

  const { currentProject, fetchProject, updateProcedure } = useProjectStore()
  const { currentWorkspace, fetchWorkspace } = useWorkspaceStore()
  const {
    currentProcedure, setProcedure, loadBoards, loadStandards, loadMaterials,
    loadPrinciples, loadGeneralPrinciples, subscribeBoardUpdates, unsubscribeBoardUpdates, reset,
  } = useProcedureStore()
  const {
    loadMessages, subscribe, unsubscribe, boardSuggestions, requestProcedureIntro,
  } = useChatStore()
  const { setMembers } = useSessionStore()

  const [showStandardSearch, setShowStandardSearch] = useState(false)
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('cw_tutorial_done'))
  const [showTour, setShowTour] = useState(() => !localStorage.getItem('cw_tour_done'))
  const [activePanel, setActivePanel] = useState('chat')
  const [boardUpdated, setBoardUpdated] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [needsNickname, setNeedsNickname] = useState(() => !localStorage.getItem('cw_nickname'))

  const joinedRef = useRef(false)
  const introRequestedRef = useRef(false)

  useEffect(() => {
    fetchProject(projectId)
    if (workspaceId) fetchWorkspace(workspaceId)
    loadMessages(projectId)
    loadGeneralPrinciples()
  }, [projectId, workspaceId])

  useEffect(() => {
    if (currentProject?.current_procedure) setProcedure(currentProject.current_procedure)
  }, [currentProject?.current_procedure])

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
    const handleStageUpdated = (stage) => setProcedure(stage)
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

  useEffect(() => {
    if (boardSuggestions.length > 0 && activePanel !== 'board') setBoardUpdated(true)
  }, [boardSuggestions, activePanel])

  useEffect(() => {
    if (activePanel === 'board') setBoardUpdated(false)
  }, [activePanel])

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const MOBILE_TABS = [
    { id: 'chat', label: '채팅', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg> },
    { id: 'board', label: '설계보드', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
    { id: 'principles', label: '원칙', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg> },
  ]

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ height: '100dvh', background: 'var(--color-bg-primary)' }}>
      {/* 상단 헤더 */}
      <header style={{
        background: 'var(--color-bg-secondary)',
        borderBottom: '1px solid var(--color-border)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <a
          href={`/workspaces/${workspaceId}`}
          onClick={(e) => { e.preventDefault(); navigate(`/workspaces/${workspaceId}`) }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            transition: 'opacity var(--transition-fast)',
            flexShrink: 0,
            minWidth: 44,
            minHeight: 44,
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          title="워크스페이스로"
        >
          <Logo size={24} />
          <span className="hidden sm:inline" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            커리큘럼 위버
          </span>
        </a>

        {/* 브레드크럼 */}
        <span className="hidden sm:inline" style={{ color: 'var(--color-border)', fontSize: 16 }}>/</span>
        <div className="hidden sm:flex items-center gap-1 text-xs min-w-0" style={{ color: 'var(--color-text-tertiary)' }}>
          <Link
            to={`/workspaces/${workspaceId}`}
            style={{
              color: 'inherit',
              textDecoration: 'none',
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: 'color var(--transition-fast)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#3B82F6'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
          >
            {currentWorkspace?.name || '워크스페이스'}
          </Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentProject.title}
          </span>
        </div>
        <h1 className="sm:hidden" style={{ fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 14, margin: 0 }}>
          {currentProject.title}
        </h1>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <MemberList />
          {[
            { onClick: () => setShowReport(true), color: '#7C3AED', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>, label: '보고서', title: '결과 보고서' },
            { onClick: () => setShowStandardSearch(true), color: '#16A34A', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>, label: '성취기준', title: '성취기준 탐색' },
            { onClick: handleCopyInvite, color: '#3B82F6', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>, label: '초대', title: '초대 코드 복사' },
          ].map(({ onClick, color, icon, label, title }) => (
            <button
              key={label}
              onClick={onClick}
              title={title}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 8px',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                color,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                fontFamily: 'var(--font-sans)',
                minHeight: 44,
                minWidth: 44,
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = `${color}08`}
              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
          <button
            onClick={() => { localStorage.removeItem('cw_tour_done'); setShowTour(true) }}
            title="투어 가이드"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              background: 'none',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-tertiary)'; e.currentTarget.style.color = '#3B82F6' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
        </div>
      </header>

      {/* 데모 배너 */}
      {isDemo && (
        <div style={{
          background: 'linear-gradient(90deg, #8B5CF6, #3B82F6)',
          color: '#fff',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 500,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <span>이것은 AI 시뮬레이션 데모입니다. 실제 프로젝트를 시작하려면 워크스페이스를 만드세요.</span>
          <button
            onClick={() => navigate('/workspaces')}
            style={{
              padding: '4px 12px', background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6,
              color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            워크스페이스 만들기
          </button>
        </div>
      )}

      {/* 자료 관리 바 */}
      <MaterialUploadBar sessionId={projectId} />

      {/* 절차 네비게이션 */}
      <div data-tour="procedure-nav">
        <ProcedureNav
          currentProcedure={currentProcedure}
          onProcedureChange={handleProcedureChange}
        />
      </div>

      {/* 메인 콘텐츠 — 3-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측: 채팅 */}
        <div
          data-tour="chat-panel"
          className={`${activePanel === 'chat' ? 'flex' : 'hidden'} md:flex`}
          style={{
            width: '100%',
            maxWidth: 400,
            flexShrink: 0,
            borderRight: '1px solid var(--color-border)',
            flexDirection: 'column',
            background: 'var(--color-bg-secondary)',
          }}
        >
          <ErrorBoundary>
            <ChatPanel
              sessionId={projectId}
              stage={currentProcedure}
              onStageChange={handleProcedureChange}
            />
          </ErrorBoundary>
        </div>

        {/* 중앙: 설계 캔버스 */}
        <div
          data-tour="design-board"
          className={`${activePanel === 'board' ? 'block' : 'hidden'} md:block`}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            width: '100%',
          }}
        >
          <ErrorBoundary>
            <ProcedureCanvas projectId={projectId} procedureCode={currentProcedure} />
          </ErrorBoundary>
        </div>

        {/* 우측: 원칙 패널 */}
        <div
          data-tour="principle-panel"
          className={`${activePanel === 'principles' ? 'block' : 'hidden'} md:block`}
          style={{
            width: '100%',
            maxWidth: 280,
            flexShrink: 0,
            borderLeft: '1px solid var(--color-border)',
            background: 'var(--color-bg-secondary)',
            overflow: 'auto',
          }}
        >
          <ErrorBoundary>
            <PrinciplePanel stage={currentProcedure} />
          </ErrorBoundary>
        </div>
      </div>

      {/* 모바일 하단 탭 바 */}
      <div className="md:hidden safe-bottom" style={{
        display: 'flex',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg-secondary)',
        flexShrink: 0,
      }}>
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '10px 0',
              border: 'none',
              background: activePanel === tab.id ? '#EFF6FF' : 'transparent',
              color: activePanel === tab.id ? '#3B82F6' : 'var(--color-text-tertiary)',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              fontFamily: 'var(--font-sans)',
              minHeight: 56,
              justifyContent: 'center',
              borderTop: activePanel === tab.id ? '2px solid #3B82F6' : '2px solid transparent',
              position: 'relative',
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'board' && boardUpdated && (
              <span style={{
                position: 'absolute',
                top: 8,
                right: '25%',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#F59E0B',
                animation: 'pulse 2s infinite',
              }} />
            )}
          </button>
        ))}
      </div>

      {/* 모달들 */}
      {needsNickname && <NicknameModal onConfirm={handleNicknameConfirm} />}
      {showStandardSearch && (
        <StandardSearch
          sessionId={projectId}
          onClose={() => { setShowStandardSearch(false); loadStandards(projectId) }}
        />
      )}
      {showReport && (
        <ReportDownload
          sessionId={projectId}
          sessionTitle={currentProject.title}
          onClose={() => setShowReport(false)}
        />
      )}
      {showTutorial && <Tutorial onComplete={() => setShowTutorial(false)} />}
      {showTour && <InteractiveTour onComplete={() => setShowTour(false)} />}
    </div>
  )
}
