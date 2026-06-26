import { useEffect, useState, useCallback, useRef, useMemo, Component } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useProjectStore } from '../stores/projectStore'
import { useProcedureStore } from '../stores/procedureStore'
import { useChatStore } from '../stores/chatStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { socket, joinSession, leaveSession } from '../lib/socket'
import { PROCEDURES, PROCEDURE_LIST } from 'curriculum-weaver-shared/constants.js'
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
  const { user } = useAuthStore()
  const { currentProject, fetchProject, updateProcedure } = useProjectStore()
  const { currentWorkspace, fetchWorkspace } = useWorkspaceStore()
  const {
    currentProcedure, setProcedure, loadBoards, loadAllBoards, loadStandards, loadMaterials,
    loadPrinciples, loadGeneralPrinciples, subscribeBoardUpdates, unsubscribeBoardUpdates, reset,
    loadStepMemory, loadBoardSummaries, boardSummaries,
    loading: procedureLoading,
  } = useProcedureStore()
  const {
    loadMessages, subscribe, unsubscribe, boardSuggestions, requestProcedureIntro, loadingMessages,
  } = useChatStore()
  const { setMembers } = useSessionStore()

  const [showStandardSearch, setShowStandardSearch] = useState(false)
  // 신규 사용자는 InteractiveTour(6스텝)만 본다. 레거시 Tutorial(9스텝)은
  // 투어를 이미 끝낸 적이 있는데 튜토리얼은 못 본 과거 사용자에게만 1회 노출 →
  // 신규 사용자가 투어+튜토리얼 15스텝을 연달아 보던 중복 온보딩을 제거.
  const [showTutorial, setShowTutorial] = useState(
    () => !localStorage.getItem('cw_tutorial_done') && !!localStorage.getItem('cw_tour_done')
  )
  const [showTour, setShowTour] = useState(() => !localStorage.getItem('cw_tour_done'))
  const [activePanel, setActivePanel] = useState('chat')
  const [boardUpdated, setBoardUpdated] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [resumeRefreshing, setResumeRefreshing] = useState(false)
  // 로그인 사용자는 닉네임 모달 불필요
  const [needsNickname, setNeedsNickname] = useState(() => {
    if (user) return false // 로그인 상태면 건너뛰기
    return !localStorage.getItem('cw_nickname')
  })

  const joinedRef = useRef(false)
  const introRequestedRef = useRef(false)
  const messagesLoadedRef = useRef(false)
  const allBoardsLoadedRef = useRef(false)
  const resumeRefreshRef = useRef(false)

  // 레이아웃: 보드(좌) ↔ 채팅(우) 비율, 원리 드로어, 반응형
  const [boardRatio, setBoardRatio] = useState(() => {
    const saved = Number(localStorage.getItem('cw_board_ratio'))
    return saved >= 20 && saved <= 80 ? saved : 50
  })
  const [showPrinciples, setShowPrinciples] = useState(false)
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  )
  const mainContentRef = useRef(null)
  const resizingRef = useRef(false)
  const boardRatioRef = useRef(boardRatio)

  // 데스크톱/모바일 전환 감지 (Tailwind md 브레이크포인트와 동일)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 보드↔채팅 구분선 드래그로 비율 조절
  useEffect(() => {
    const onMove = (e) => {
      if (!resizingRef.current || !mainContentRef.current) return
      const rect = mainContentRef.current.getBoundingClientRect()
      const ratio = ((e.clientX - rect.left) / rect.width) * 100
      const clamped = Math.min(80, Math.max(20, ratio))
      boardRatioRef.current = clamped
      setBoardRatio(clamped)
    }
    const onUp = () => {
      if (!resizingRef.current) return
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('cw_board_ratio', String(Math.round(boardRatioRef.current)))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startResize = (e) => {
    e.preventDefault()
    resizingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // 메시지 로드 함수 (인증 실패 시 1회 재시도)
  const loadMessagesWithRetry = useCallback(async (pid) => {
    messagesLoadedRef.current = false
    const tryLoad = async () => {
      return loadMessages(pid)
    }
    let loaded = await tryLoad()
    // 첫 시도 실패 시 1.5초 후 재시도 (auth 초기화 대기)
    if (!loaded) {
      await new Promise((r) => setTimeout(r, 1500))
      loaded = await tryLoad()
    }
    messagesLoadedRef.current = true
    if (!introRequestedRef.current && loaded) {
      introRequestedRef.current = true
      const { messages: msgs, introCache } = useChatStore.getState()
      const hasContent = msgs.some((m) => m.sender_type === 'ai' || m.sender_type === 'teacher')
      const proj = useProjectStore.getState().currentProject
      const isReadOnly = proj?.status === 'simulation' || proj?.status === 'generating' || proj?.status === 'failed' || proj?.title?.startsWith('[시뮬레이션]')
      const proc = useProcedureStore.getState().currentProcedure
      // introCache에 이미 있으면 스킵 (이전에 인트로 생성된 절차)
      if (!isReadOnly && !hasContent && !introCache[proc] && localStorage.getItem('cw_tour_done')) {
        if (proc) requestProcedureIntro(projectId, proc)
      }
    }
  }, [projectId])

  // 새로고침 직후 auth 토큰 초기화/배포 재시작 등으로 첫 호출이 실패하면 currentProject가
  // null로 남아 절차 복원이 안 되고 1단계로 리셋된다. 메시지 로드처럼 1회 재시도한다.
  const fetchProjectWithRetry = useCallback(async (pid) => {
    const ok = await fetchProject(pid).then(() => true).catch(() => false)
    if (!ok) {
      await new Promise((r) => setTimeout(r, 1500))
      await fetchProject(pid).catch(() => null)
    }
  }, [fetchProject])

  const reloadProjectArtifacts = useCallback(async ({ forceReadonlyReload = false } = {}) => {
    const project = useProjectStore.getState().currentProject
    if (!project) return

    const isReadOnlyProject =
      project.status === 'simulation' ||
      project.status === 'failed' ||
      project.title?.startsWith('[시뮬레이션]')

    if (isReadOnlyProject) {
      const hasBoards = Object.keys(useProcedureStore.getState().boards).length > 0
      if (forceReadonlyReload) {
        allBoardsLoadedRef.current = false
      }
      if (!allBoardsLoadedRef.current || !hasBoards) {
        const loaded = await loadAllBoards(projectId)
        allBoardsLoadedRef.current = loaded
      }
    } else {
      await loadBoards(projectId, currentProcedure)
    }

    loadStandards(projectId)
    loadMaterials(projectId)
    loadPrinciples(currentProcedure)
    loadBoardSummaries(projectId)
  }, [currentProcedure, projectId])

  useEffect(() => {
    allBoardsLoadedRef.current = false
    loadStepMemory(projectId)
    fetchProjectWithRetry(projectId)
    if (workspaceId) fetchWorkspace(workspaceId)
    loadMessagesWithRetry(projectId)
    loadGeneralPrinciples()
    loadBoardSummaries(projectId)
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
    if (user) {
      const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '교사'
      const subject = user.user_metadata?.subject || ''
      localStorage.setItem('cw_nickname', displayName)
      connectSocket({ name: displayName, subject })
    } else {
      const savedName = localStorage.getItem('cw_nickname')
      const savedSubject = localStorage.getItem('cw_subject') || ''
      if (savedName) connectSocket({ name: savedName, subject: savedSubject })
    }
    return () => joinedRef.cleanup?.()
    // user 객체 전체가 아니라 user.id에만 의존한다. 탭 복귀 시 Supabase가
    // 토큰을 갱신하며 user 객체를 새 참조로 교체해도, 같은 사용자라면 이 effect가
    // 재실행되지 않아 cleanup의 reset()으로 절차/단계가 초기화되지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, connectSocket, user?.id])

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

    reloadProjectArtifacts()
  }, [currentProcedure, projectId, currentProject])

  useEffect(() => {
    const handleResumeRefresh = async () => {
      if (resumeRefreshRef.current) return
      if (document.visibilityState && document.visibilityState !== 'visible') return

      resumeRefreshRef.current = true
      setResumeRefreshing(true)
      try {
        await fetchProject(projectId).catch(() => null)
        await loadMessagesWithRetry(projectId)
        loadGeneralPrinciples()
        await reloadProjectArtifacts({ forceReadonlyReload: true })
      } finally {
        resumeRefreshRef.current = false
        setResumeRefreshing(false)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleResumeRefresh()
      }
    }

    window.addEventListener('pageshow', handleResumeRefresh)
    window.addEventListener('focus', handleResumeRefresh)
    window.addEventListener('online', handleResumeRefresh)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pageshow', handleResumeRefresh)
      window.removeEventListener('focus', handleResumeRefresh)
      window.removeEventListener('online', handleResumeRefresh)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentProcedure, projectId, currentProject])

  const handleProcedureChange = async (code) => {
    setProcedure(code)
    await updateProcedure(projectId, code)
    socket.emit('stage_changed', { sessionId: projectId, stage: code })
    // 시뮬레이션/generating/failed 프로젝트에서는 AI 인트로 요청하지 않음
    // introCache에 이미 있으면 스킵 (requestProcedureIntro 내부에서도 체크하지만 명시적으로)
    if (!isSimulation && !isGenerating && !isFailed) {
      const { introCache } = useChatStore.getState()
      if (!introCache[code]) {
        requestProcedureIntro(projectId, code)
      }
    }
  }

  const handleCopyInvite = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url)
      .then(() => alert('프로젝트 링크가 복사되었습니다. 같은 워크스페이스 멤버에게 공유하세요.'))
      .catch(() => alert(`링크를 복사하세요: ${url}`))
  }

  // 진행률(완료 절차) + 후행 절차 stale 감지.
  // stale = 내용 있는 절차인데, 그보다 앞 순서의 절차가 더 나중에 수정됨
  // → 앞 단계를 고친 뒤 이 절차를 아직 재검토하지 않았다는 신호.
  const { completedProcedures, boardStatuses } = useMemo(() => {
    const completed = []
    const statuses = {}
    const summaries = boardSummaries || {}
    let maxUpstreamUpdated = 0
    for (const proc of PROCEDURE_LIST) {
      const s = summaries[proc.code]
      if (!s?.hasContent) continue
      completed.push(proc.code)
      const ts = s.updatedAt ? new Date(s.updatedAt).getTime() : 0
      if (ts && maxUpstreamUpdated && ts < maxUpstreamUpdated) {
        statuses[proc.code] = 'stale'
      } else if (s.saveStatus === 'confirmed') {
        statuses[proc.code] = 'confirmed'
      }
      if (ts > maxUpstreamUpdated) maxUpstreamUpdated = ts
    }
    return { completedProcedures: completed, boardStatuses: statuses }
  }, [boardSummaries])

  const currentIsStale = boardStatuses[currentProcedure] === 'stale'

  const isSimulation = currentProject?.status === 'simulation' || currentProject?.title?.startsWith('[시뮬레이션]')
  const isGenerating = currentProject?.status === 'generating'
  const isFailed = currentProject?.status === 'failed'
  const isReadOnlyProject = isSimulation || isGenerating || isFailed
  const isReadOnlyLoading = isReadOnlyProject && (procedureLoading || loadingMessages || resumeRefreshing)

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
    <div className="work-shell flex flex-col overflow-hidden" style={{ background: 'var(--color-bg-primary)', '--app-zoom': isDesktop ? 1.5 : 1 }}>
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
            { onClick: handleCopyInvite, color: '#3B82F6', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>, label: '공유', title: '프로젝트 링크 복사' },
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

      {/* 프로젝트 상태 배너 */}
      {isGenerating && (
        <div style={{
          background: 'linear-gradient(90deg, #F59E0B, #EF4444)',
          color: '#fff',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 500,
          textAlign: 'center',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          AI가 수업을 생성하고 있습니다. 잠시 후 새로고침 해주세요.
        </div>
      )}
      {isFailed && (
        <div style={{
          background: '#DC2626',
          color: '#fff',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 500,
          textAlign: 'center',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          AI 생성에 실패한 프로젝트입니다. 부분 생성된 내용만 확인할 수 있습니다.
        </div>
      )}
      {isSimulation && !isGenerating && !isFailed && (
        <div style={{
          background: 'linear-gradient(90deg, #8B5CF6, #3B82F6)',
          color: '#fff',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 500,
          textAlign: 'center',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          AI 시뮬레이션으로 자동 생성된 읽기 전용 프로젝트입니다
        </div>
      )}

      {/* 자료 관리 바 */}
      <MaterialUploadBar projectId={projectId} />

      {/* 절차 네비게이션 */}
      <div data-tour="procedure-nav">
        <ProcedureNav
          currentProcedure={currentProcedure}
          onProcedureChange={handleProcedureChange}
          completedProcedures={completedProcedures}
          boardStatuses={boardStatuses}
        />
      </div>

      {/* 후행 절차 재검토 안내 — 앞 절차가 이 절차보다 나중에 수정된 경우 */}
      {currentIsStale && !isReadOnlyProject && (
        <div style={{
          background: '#FFFBEB',
          borderBottom: '1px solid #FDE68A',
          color: '#92400E',
          padding: '7px 16px',
          fontSize: 12.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          앞 단계 내용이 이 절차보다 나중에 수정되었습니다. 이 절차 내용을 다시 확인해 주세요.
        </div>
      )}

      {/* 메인 콘텐츠 — 보드(좌) + 채팅(우), 원리는 오른쪽 오버레이 드로어 */}
      <div ref={mainContentRef} className="flex-1 flex overflow-hidden" style={{ position: 'relative' }}>
        {/* 좌측: 설계 캔버스(보드) */}
        <div
          data-tour="design-board"
          style={{
            display: (isDesktop || activePanel === 'board') ? 'block' : 'none',
            width: isDesktop ? `${boardRatio}%` : '100%',
            flexShrink: 0,
            overflow: 'auto',
            padding: 16,
            borderRight: '1px solid var(--color-border)',
          }}
        >
          <ErrorBoundary>
            <ProcedureCanvas projectId={projectId} procedureCode={currentProcedure} readOnly={isReadOnlyProject} loading={isReadOnlyLoading} />
          </ErrorBoundary>
        </div>

        {/* 드래그 구분선 (데스크톱 전용) */}
        {isDesktop && (
          <div
            onMouseDown={startResize}
            title="드래그하여 보드/채팅 너비 조절"
            style={{
              width: 6,
              flexShrink: 0,
              cursor: 'col-resize',
              background: 'var(--color-border)',
              transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-border)')}
          />
        )}

        {/* 우측: 채팅 */}
        <div
          data-tour="chat-panel"
          style={{
            display: (isDesktop || activePanel === 'chat') ? 'flex' : 'none',
            width: isDesktop ? `${100 - boardRatio}%` : '100%',
            flex: isDesktop ? undefined : 1,
            minWidth: 0,
            flexShrink: 0,
            flexDirection: 'column',
            background: 'var(--color-bg-secondary)',
          }}
        >
          <ErrorBoundary>
            <ChatPanel
              sessionId={projectId}
              stage={currentProcedure}
              onStageChange={handleProcedureChange}
              readOnly={isReadOnlyProject}
              loading={isReadOnlyLoading}
            />
          </ErrorBoundary>
        </div>

        {/* 모바일: 원리 패널 (하단 탭에서 선택 시) */}
        {!isDesktop && (
          <div
            className={`${activePanel === 'principles' ? 'block' : 'hidden'}`}
            style={{ width: '100%', overflow: 'auto', background: 'var(--color-bg-secondary)' }}
          >
            <ErrorBoundary>
              <PrinciplePanel stage={currentProcedure} />
            </ErrorBoundary>
          </div>
        )}

        {/* 데스크톱: 원리 오버레이 드로어 — 왼쪽(보드 위)에서 펼침 (하단 바 '원칙' 버튼으로 토글) */}
        {isDesktop && showPrinciples && (
          <>
            <div
              onClick={() => setShowPrinciples(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 20 }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: 320,
                maxWidth: '80%',
                background: 'var(--color-bg-secondary)',
                borderRight: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-xl)',
                zIndex: 21,
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderBottom: '1px solid var(--color-border)',
                position: 'sticky',
                top: 0,
                background: 'var(--color-bg-secondary)',
                zIndex: 1,
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>원칙</span>
                <button
                  onClick={() => setShowPrinciples(false)}
                  title="닫기"
                  style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 4, borderRadius: 'var(--radius-md)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <ErrorBoundary>
                <PrinciplePanel stage={currentProcedure} />
              </ErrorBoundary>
            </div>
          </>
        )}
      </div>

      {/* 데스크톱 하단 바 — '원칙' 버튼으로 설계 원리 드로어 토글 */}
      {isDesktop && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-bg-secondary)',
          flexShrink: 0,
        }}>
          <button
            data-tour="principle-panel"
            onClick={() => setShowPrinciples((v) => !v)}
            title="원칙 보기"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              background: showPrinciples ? '#EFF6FF' : 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              margin: 4,
              color: showPrinciples ? '#3B82F6' : 'var(--color-text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => { if (!showPrinciples) e.currentTarget.style.background = 'var(--color-bg-tertiary)' }}
            onMouseLeave={(e) => { if (!showPrinciples) e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
            원칙
          </button>
        </div>
      )}

      {/* 모바일 하단 탭 바 (데스크톱 아닐 때만) */}
      <div className="safe-bottom" style={{
        display: isDesktop ? 'none' : 'flex',
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
      {showTutorial && !showTour && <Tutorial onComplete={() => setShowTutorial(false)} />}
      {showTour && <InteractiveTour onComplete={() => {
        setShowTour(false)
        // 투어를 끝낸 신규 사용자에게 레거시 Tutorial이 곧바로 겹쳐 뜨지 않도록 함께 완료 처리
        localStorage.setItem('cw_tutorial_done', '1')
        setShowTutorial(false)
        // 투어 완료 후 AI 환영 메시지 요청
        const msgs = useChatStore.getState().messages
        const hasContent = msgs.some((m) => m.sender_type === 'ai' || m.sender_type === 'teacher')
        const proj = useProjectStore.getState().currentProject
        const isReadOnly2 = proj?.status === 'simulation' || proj?.status === 'generating' || proj?.status === 'failed' || proj?.title?.startsWith('[시뮬레이션]')
        if (!isReadOnly2 && !hasContent) {
          const proc = useProcedureStore.getState().currentProcedure
          requestProcedureIntro(projectId, proc)
        }
      }} />}
    </div>
  )
}
