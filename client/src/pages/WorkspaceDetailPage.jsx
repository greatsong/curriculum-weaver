import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useProjectStore } from '../stores/projectStore'
import { useAuthStore } from '../stores/authStore'
import { apiPost } from '../lib/api'
import { codeFromKey, subjectFromKey } from '../lib/standardKey'
import { NEW_DESTINATION, readBasket, readBasketMeta, writeBasket, clearBasket } from '../lib/exploreDestination'
import { safeSessionStorage } from '../lib/explorationDraft'
import { EXPLORE_COPY } from '../lib/explorationCopy'
import { PROCEDURES, PHASES, AI_ROLE_PRESETS, AI_ROLE_PRESET_LIST, DEFAULT_AI_ROLE, resolveParticipationMode, PROJECT_GRADE_OPTIONS } from 'curriculum-weaver-shared/constants.js'
import ParticipationModePicker from '../components/ParticipationModePicker'
import BriefModeToggle from '../components/BriefModeToggle'
import { saveProjectStandards, standardsSaveNotice } from '../lib/projectStandards'
import { resolveBriefMode, resolveCoreFormal } from 'curriculum-weaver-shared/briefMode.js'
import Logo from '../components/Logo'
import HostSetupWizard from '../components/HostSetupWizard'

// 최근 활동 상대시간 (동일 제목 프로젝트 구분용)
function formatRelativeTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMin = Math.floor((Date.now() - then) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}시간 전`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}일 전`
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, logout } = useAuthStore()
  const { currentWorkspace: storedWorkspace, detailError, fetchWorkspace, updateWorkspace, deleteWorkspace, inviteMember } = useWorkspaceStore()
  // 주소의 작업 공간과 같은 것만 쓴다. 다른 작업 공간의 데이터가 잠깐이라도 보이거나 저장되지 않게 한다.
  const currentWorkspace = storedWorkspace?.id === workspaceId ? storedWorkspace : null
  const { projects, projectsWorkspaceId, loading: projectsLoading, fetchProjects, createProject, deleteProject } = useProjectStore()

  const [activeTab, setActiveTab] = useState('projects')
  const [showSimulations, setShowSimulations] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [projectTitle, setProjectTitle] = useState('')
  const [titleSuggested, setTitleSuggested] = useState(false) // AI 추천 제목이 채워졌고 아직 사람이 안 고침
  const [descSuggested, setDescSuggested] = useState(false)   // AI 추천 설명이 채워졌고 아직 사람이 안 고침
  const [projectDescription, setProjectDescription] = useState('')
  const [projectSubjects, setProjectSubjects] = useState([])
  const [projectGrade, setProjectGrade] = useState('')
  // 설계 모드(교과 연결)에서 담아온 성취기준 — 프로젝트 생성 시 자동 포함
  const [designBasket, setDesignBasket] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteLinkInfo, setInviteLinkInfo] = useState(null) // 미가입자 토큰 초대 결과
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false) // 동기 더블서브밋 가드 (state 재렌더 전 두 번째 클릭 차단)

  // Feature 1: 호스트 설정 상태
  const [aiConfig, setAiConfig] = useState({ model: 'claude-sonnet-5-5' })
  const [enabledAI, setEnabledAI] = useState({ guide: true, generate: true, check: true, record: true })
  const [aiRole, setAiRole] = useState(DEFAULT_AI_ROLE)
  const [participationMode, setParticipationMode] = useState(() => resolveParticipationMode(null))
  const [briefMode, setBriefMode] = useState(false)
  const [briefCoreFormal, setBriefCoreFormal] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // Feature 3: 셋업 위자드
  const [showSetupWizard, setShowSetupWizard] = useState(false)

  useEffect(() => {
    // 실패는 스토어의 detailError로 화면에 보여 준다(여기서 삼키지 않으면 처리되지 않은 거부가 된다).
    fetchWorkspace(workspaceId).catch(() => {})
    fetchProjects(workspaceId)
  }, [workspaceId, fetchWorkspace, fetchProjects])

  const retryLoad = () => {
    fetchWorkspace(workspaceId).catch(() => {})
    fetchProjects(workspaceId)
  }

  // 워크스페이스 설정값 로드
  useEffect(() => {
    if (currentWorkspace) {
      const ac = currentWorkspace.ai_config || {}
      setAiConfig({
        // 레거시 저장값 정규화 — select 옵션과 불일치 방지. Opus 계열 저장값은 Opus 5.5로, 그 외(Sonnet 5 등)는 Sonnet 5.5로 승계
        model: ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8'].includes(ac.model) ? 'claude-opus-5-5' : 'claude-sonnet-5-5',
      })
      const wc = currentWorkspace.workflow_config || {}
      setEnabledAI({
        guide: wc.enabledAI?.guide !== false,
        generate: wc.enabledAI?.generate !== false,
        check: wc.enabledAI?.check !== false,
        record: wc.enabledAI?.record !== false,
      })
      // 과거에 저장된 'custom'은 미지원 — 기본 프리셋으로 정규화 (커스텀 UI 제거, 2026-07-13)
      setAiRole(!wc.aiRole || wc.aiRole === 'custom' ? DEFAULT_AI_ROLE : wc.aiRole)
      setParticipationMode(resolveParticipationMode(wc))
      setBriefMode(resolveBriefMode(wc))
      setBriefCoreFormal(resolveCoreFormal(wc))
    }
  }, [currentWorkspace])

  // Feature 3: 셋업 위자드 표시 판단
  // 그래프에서 담아온 생성 흐름(showCreateProject)이 진행 중이면 위자드가 모달을 덮지 않게 보류
  useEffect(() => {
    // 이 작업 공간의 목록을 실제로 받은 뒤에만 판단한다(조회 실패로 빈 목록이 된 경우 위자드를 띄우지 않는다)
    if (!currentWorkspace || projectsLoading || showCreateProject || projectsWorkspaceId !== workspaceId) return
    const isSetup = searchParams.get('setup') === 'true'
    const noProjects = projects.length === 0
    const isOwnerOrHost = currentWorkspace.owner_id === user?.id || currentWorkspace.my_role === 'host'
    if ((isSetup || noProjects) && isOwnerOrHost && !localStorage.getItem(`cw_wizard_done_${workspaceId}`)) {
      setShowSetupWizard(true)
    }
  }, [currentWorkspace, projects, projectsLoading, projectsWorkspaceId, searchParams, workspaceId, user, showCreateProject])

  // 시뮬레이션(데모·이어보기) 프로젝트는 별도 접이식 섹션으로 분리.
  // 이어보기 시뮬레이션은 생성자에게만 노출 (created_by 없는 과거 데모는 기존대로 전원 노출)
  const isSimulationProject = (p) =>
    p.status === 'simulation' || p.status === 'generating' || p.status === 'failed' || p.title?.startsWith('[시뮬레이션')
  const regularProjects = projects.filter((p) => !isSimulationProject(p))
  const simulations = projects.filter((p) => isSimulationProject(p) && (!p.created_by || p.created_by === user?.id))

  const isOwner = currentWorkspace?.owner_id === user?.id
  const isHostOrOwner = isOwner || currentWorkspace?.my_role === 'host'

  // Feature 1: 설정 저장
  const handleSaveSettings = useCallback(async () => {
    // 화면에 불러온 작업 공간이 주소와 다르면 저장하지 않는다(다른 작업 공간 설정을 덮어쓰지 않게)
    if (!currentWorkspace) return
    setSettingsSaving(true)
    try {
      await updateWorkspace(workspaceId, {
        ai_config: aiConfig,
        workflow_config: {
          enabledAI,
          aiRole,
          participationMode,
          briefMode,
          briefCoreFormal,
        },
      })
    } catch (err) {
      alert(`설정 저장 실패: ${err.message}`)
    } finally {
      setSettingsSaving(false)
    }
  }, [workspaceId, currentWorkspace, aiConfig, enabledAI, aiRole, participationMode, briefMode, briefCoreFormal, updateWorkspace])

  const toggleProcedure = (code) => {
    setHiddenProcedures((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  // 그래프(설계/탐험)에서 넘어온 흐름 — ?createProject=1이면 생성 모달 자동 오픈.
  // 쿼리는 즉시 제거해 새로고침/뒤로가기 시 모달이 다시 열리지 않게 한다.
  useEffect(() => {
    if (searchParams.get('createProject') !== '1') return
    setShowCreateProject(true)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('createProject')
      return next
    }, { replace: true })
  }, [searchParams, setSearchParams])

  // 생성 모달 열릴 때 설계 모드 장바구니 로드 + 담아온 성취기준의 교과 자동 선택
  useEffect(() => {
    if (!showCreateProject) return
    try {
      // 담기 저장값은 성취기준 key(충돌 코드는 "code|과목") — 서버 bulk 요청에도 그대로 보낸다
      // 새 프로젝트 담기: 새 키(cw_explore_basket:new)와 기존 키(cw_design_basket)를 함께 읽는다
      const keys = readBasket(safeSessionStorage(), NEW_DESTINATION)
      setDesignBasket(keys)
      // 교과 메타(key→subject_group)로 교과 칩 자동 선택 (사용자가 이미 고른 게 없을 때만)
      const meta = readBasketMeta(safeSessionStorage())
      const groups = [...new Set(keys.map(k => meta[k]).filter(Boolean))]
      if (groups.length > 0) {
        setProjectSubjects(prev => (prev.length > 0 ? prev : [...new Set([...prev, ...groups])]))
      }
      // AI 추천 제목 미리 채우기 — 시나리오 제목 우선, 없으면 교과 기반. 사람이 손보라는 신호로 표시.
      setProjectTitle(prev => {
        if (prev) return prev // 이미 입력한 게 있으면 존중
        let suggestion = ''
        try { suggestion = sessionStorage.getItem('cw_project_title_suggestion') || '' } catch { /* noop */ }
        sessionStorage.removeItem('cw_project_title_suggestion')
        if (!suggestion && groups.length > 0) suggestion = `${groups.slice(0, 3).join('·')} 융합 수업`
        if (suggestion) setTitleSuggested(true)
        return suggestion
      })
      // AI 추천 설명 미리 채우기 (시나리오 핵심 질문/상황)
      setProjectDescription(prev => {
        if (prev) return prev
        let desc = ''
        try { desc = sessionStorage.getItem('cw_project_desc_suggestion') || '' } catch { /* noop */ }
        sessionStorage.removeItem('cw_project_desc_suggestion')
        if (desc) setDescSuggested(true)
        return desc
      })
    } catch {
      setDesignBasket([])
    }
  }, [showCreateProject])

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!projectTitle.trim()) return
    // 동기 가드: 버튼 disabled가 재렌더되기 전의 빠른 더블클릭도 즉시 차단해
    // 동일 제목 쌍둥이 프로젝트 생성을 막는다.
    if (creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    try {
      const project = await createProject(workspaceId, {
        title: projectTitle.trim(),
        description: projectDescription.trim(),
        subjects: projectSubjects,
        grade: projectGrade,
      })

      // 설계 모드에서 담아온 성취기준 일괄 저장 (값은 전부 key — 서버가 해석)
      // 교과·학년만 고른 경우에는 성취기준을 자동으로 넣지 않는다(2026-10-05, 자동 추천 제거).
      // 실패한 항목은 한 번 더 보내고, 그래도 남으면 교사에게 어떤 기준이 빠졌는지 알린다.
      let standardsNotice = null
      if (designBasket.length > 0) {
        const outcome = await saveProjectStandards(apiPost, project.id, designBasket)
        if (outcome.error) console.warn('성취기준 일괄 저장 실패:', outcome.error.message)
        standardsNotice = standardsSaveNotice(outcome)
        // 이번에 보낸 기준은 저장 여부와 관계없이 장바구니에서 뺀다. 남겨 두면 다음에 만드는
        // 다른 프로젝트에 붙는다(2026-10-03 검토). 빠진 기준은 아래 안내로 알린다.
        clearBasket(safeSessionStorage(), NEW_DESTINATION)
        setDesignBasket([])
      }

      setShowCreateProject(false)
      setProjectTitle('')
      setTitleSuggested(false)
      setDescSuggested(false)
      setProjectDescription('')
      setProjectSubjects([])
      setProjectGrade('')
      if (standardsNotice) alert(standardsNotice)
      navigate(`/workspaces/${workspaceId}/projects/${project.id}`)
    } catch (err) {
      alert(`프로젝트 생성 실패: ${err.message}`)
    } finally {
      setCreating(false)
      creatingRef.current = false
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    try {
      const result = await inviteMember(workspaceId, inviteEmail.trim(), inviteRole)
      if (result?.kind === 'added') {
        setShowInvite(false)
        setInviteEmail('')
        setInviteLinkInfo(null)
        alert(`${result.member?.email || inviteEmail}님을 멤버로 추가했습니다.`)
        return
      }
      if (result?.kind === 'link') {
        // 가입되지 않은 이메일 — 호스트가 복사해서 공유할 초대 링크 표시
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        setInviteLinkInfo({
          email: result.email,
          url: `${origin}${result.invite_path}`,
          expiresAt: result.expires_at,
        })
      }
    } catch (err) {
      alert(`초대 실패: ${err.message}`)
    }
  }

  const handleCopyInviteLink = async () => {
    if (!inviteLinkInfo?.url) return
    try {
      await navigator.clipboard.writeText(inviteLinkInfo.url)
      alert('초대 링크가 복사되었습니다. 동료에게 공유해 주세요.')
    } catch {
      // 복사 실패 시 prompt로 폴백
      window.prompt('초대 링크 (Ctrl/Cmd+C로 복사)', inviteLinkInfo.url)
    }
  }

  const closeInviteModal = () => {
    setShowInvite(false)
    setInviteEmail('')
    setInviteLinkInfo(null)
  }

  const handleDeleteWorkspace = async () => {
    if (!confirm('이 워크스페이스를 삭제하시겠습니까? 모든 프로젝트가 삭제됩니다.')) return
    try {
      await deleteWorkspace(workspaceId)
      navigate('/workspaces', { replace: true })
    } catch (err) {
      alert(`삭제 실패: ${err.message}`)
    }
  }

  if (!currentWorkspace && detailError?.id === workspaceId) {
    const status = detailError.status
    const title = status === 401 ? '로그인이 만료되었습니다'
      : status === 403 ? '이 워크스페이스에 접근할 수 없습니다'
        : status === 404 ? '워크스페이스를 찾을 수 없습니다'
          : '워크스페이스를 불러오지 못했습니다'
    const desc = status === 401 ? '다시 로그인하면 이어서 사용할 수 있습니다.'
      : status === 403 ? '초대받은 워크스페이스인지 확인해 주세요.'
        : status === 404 ? '삭제되었거나 주소가 바뀌었을 수 있습니다.'
          : '연결 상태를 확인하고 다시 시도해 주세요.'
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)', padding: 16 }}>
        <div data-testid="workspace-load-error" style={{ textAlign: 'center', padding: '48px 24px', maxWidth: 420, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl)', border: '1px solid #FCA5A5' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>{title}</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 16px' }}>{desc}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {status === 401 ? (
              <button onClick={async () => { await logout(); navigate('/login', { replace: true }) }} className="btn btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>다시 로그인</button>
            ) : (status !== 403 && status !== 404) && (
              <button onClick={retryLoad} className="btn btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>다시 시도</button>
            )}
            <button onClick={() => navigate('/workspaces')} className="btn btn-secondary" style={{ fontSize: 13, padding: '8px 16px' }}>워크스페이스 목록으로</button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div style={{
          width: 28,
          height: 28,
          border: '3px solid var(--color-border)',
          borderTopColor: '#3B82F6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  const members = currentWorkspace.members || []

  const tabs = [
    { key: 'projects', label: '프로젝트', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> },
    { key: 'members', label: '멤버', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
    ...(isHostOrOwner ? [{ key: 'settings', label: '설정', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }] : []),
  ]

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      {/* 헤더 */}
      <header style={{
        background: 'var(--color-bg-secondary)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <button
            onClick={() => navigate('/workspaces')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-tertiary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <Logo size={24} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {currentWorkspace.name}
            </h1>
            {currentWorkspace.description && (
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentWorkspace.description}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="btn btn-secondary"
            style={{ padding: '6px 14px', fontSize: 13 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            <span className="hidden sm:inline">초대</span>
          </button>
        </div>
      </header>

      {/* 탭 */}
      <div style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 0 }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: 500,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderBottom: `2px solid ${activeTab === tab.key ? '#3B82F6' : 'transparent'}`,
                color: activeTab === tab.key ? '#3B82F6' : 'var(--color-text-secondary)',
                transition: 'all var(--transition-fast)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px' }}>
        {/* 프로젝트 탭 */}
        {activeTab === 'projects' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>프로젝트</h2>
              <button
                onClick={() => setShowCreateProject(true)}
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: 13 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                새 프로젝트
              </button>
            </div>

            {projectsLoading ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--color-text-tertiary)' }}>
                <div style={{ width: 24, height: 24, border: '3px solid var(--color-border)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <span style={{ fontSize: 13 }}>로딩 중...</span>
              </div>
            ) : regularProjects.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '64px 24px',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--color-border)',
              }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                </svg>
                <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>아직 프로젝트가 없습니다</p>
                <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 20px' }}>수업 하나가 프로젝트 하나입니다. 주제와 참여 교과를 정하면 AI와 설계를 시작합니다</p>
                {/* 빈 화면에서 바로 다음 행동을 할 수 있게 — 상단 버튼까지 시선을 올리지 않아도 된다 */}
                <button
                  onClick={() => setShowCreateProject(true)}
                  className="btn btn-primary"
                  style={{ padding: '10px 20px', fontSize: 14 }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  새 프로젝트 만들기
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {regularProjects.map((project, idx) => {
                  const proc = PROCEDURES[project.current_procedure] || PROCEDURES['T-1-1']
                  const phase = Object.values(PHASES).find((p) => p.id === proc?.phase)
                  return (
                    <div
                      key={project.id}
                      onClick={() => navigate(`/workspaces/${workspaceId}/projects/${project.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/workspaces/${workspaceId}/projects/${project.id}`) }}
                      className="card animate-slide-up"
                      style={{
                        animationDelay: `${idx * 40}ms`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '16px 20px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        width: '100%',
                      }}
                    >
                      {/* Phase badge */}
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: 'var(--radius-lg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                        background: `${phase?.color || '#3b82f6'}12`,
                        color: phase?.color || '#3b82f6',
                      }}>
                        {proc?.displayCode || 'T-1'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {project.title}
                        </h3>
                        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          <span>{proc?.name || PROCEDURES['T-1-1']?.name || ''}</span>
                          {typeof project.message_count === 'number' && (
                            <span>· 💬 {project.message_count}개</span>
                          )}
                          {project.updated_at && (
                            <span>· {formatRelativeTime(project.updated_at)} 활동</span>
                          )}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            // 동일 제목 프로젝트가 있을 수 있으므로 제목·대화 수를 확인에 노출해 오삭제 방지
                            const n = project.message_count
                            const detail = typeof n === 'number' && n > 0
                              ? `\n\n"${project.title}"\n대화 ${n}개가 함께 삭제되며, 되돌릴 수 없습니다.`
                              : `\n\n"${project.title}"`
                            if (confirm(`이 프로젝트를 삭제하시겠습니까?${detail}`)) deleteProject(project.id)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 32,
                            height: 32,
                            borderRadius: 'var(--radius-md)',
                            border: 'none',
                            background: 'none',
                            color: 'var(--color-text-tertiary)',
                            cursor: 'pointer',
                            transition: 'all var(--transition-fast)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 시뮬레이션 섹션 — AI 생성 참고용(읽기 전용), 접이식 */}
            {!projectsLoading && simulations.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <button
                  onClick={() => setShowSimulations((v) => !v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '10px 4px',
                    background: 'none',
                    border: 'none',
                    borderTop: '1px solid var(--color-border)',
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: showSimulations ? 'rotate(90deg)' : 'none', transition: 'transform var(--transition-fast)' }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  시뮬레이션 ({simulations.length})
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
                    AI 생성 참고용 · 읽기 전용
                  </span>
                </button>
                {showSimulations && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {simulations.map((project) => {
                      const meta = project.learner_context?.simulation_meta
                      const dateStr = (meta?.generated_at || project.created_at || '').slice(0, 10)
                      const isGen = project.status === 'generating'
                      const isFail = project.status === 'failed'
                      const badge = isGen
                        ? { label: '생성 중', color: '#D97706', bg: '#FEF3C7' }
                        : isFail
                          ? { label: '실패', color: '#DC2626', bg: '#FEE2E2' }
                          : { label: '시뮬레이션', color: '#8B5CF6', bg: '#EDE9FE' }
                      return (
                        <div
                          key={project.id}
                          onClick={() => navigate(`/workspaces/${workspaceId}/projects/${project.id}`)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/workspaces/${workspaceId}/projects/${project.id}`) }}
                          className="card"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            cursor: 'pointer',
                            width: '100%',
                            opacity: isFail ? 0.7 : 1,
                          }}
                        >
                          <span style={{
                            flexShrink: 0,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 11,
                            fontWeight: 700,
                            color: badge.color,
                            background: badge.bg,
                          }}>
                            {badge.label}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {project.title}
                            </h3>
                            <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {meta?.base_procedure_display ? `${meta.base_procedure_display}까지 작성 기준 · ` : ''}{dateStr}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm(`이 시뮬레이션을 삭제하시겠습니까?\n\n"${project.title}"\n참고용 복제본이므로 원본 프로젝트에는 영향이 없습니다.`)) deleteProject(project.id)
                            }}
                            title="시뮬레이션 삭제"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 30,
                              height: 30,
                              borderRadius: 'var(--radius-md)',
                              border: 'none',
                              background: 'none',
                              color: 'var(--color-text-tertiary)',
                              cursor: 'pointer',
                              flexShrink: 0,
                              transition: 'all var(--transition-fast)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 멤버 탭 */}
        {activeTab === 'members' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>멤버</h2>
              <button onClick={() => setShowInvite(true)} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: 13 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                멤버 초대
              </button>
            </div>
            <div style={{
              background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
            }}>
              {members.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                  아직 멤버가 없습니다
                </div>
              ) : (
                members.map((member, idx) => {
                  const colors = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4']
                  const avatarColor = colors[idx % colors.length]
                  // users join 데이터 추출
                  const u = member.users || {}
                  const displayName = u.display_name || member.display_name || u.email?.split('@')[0] || '멤버'
                  const schoolSubject = [u.school_name, u.subject].filter(Boolean).join(' ')
                  const email = u.email || member.email || ''
                  return (
                    <div
                      key={member.id || member.user_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 20px',
                        borderBottom: idx < members.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                      }}
                    >
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: avatarColor,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {displayName[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {displayName}{schoolSubject ? ` · ${schoolSubject}` : ''}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {email}
                        </p>
                      </div>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 10px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 500,
                        background: member.role === 'owner' ? '#FFFBEB' : 'var(--color-bg-tertiary)',
                        color: member.role === 'owner' ? '#D97706' : 'var(--color-text-secondary)',
                      }}>
                        {member.role === 'owner' ? '소유자' : member.role === 'admin' ? '관리자' : '멤버'}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* 설정 탭 */}
        {activeTab === 'settings' && isHostOrOwner && (
          <div style={{ maxWidth: 640 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 20px' }}>워크스페이스 설정</h2>

            {/* 기본 정보 */}
            <SettingsSection title="기본 정보">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>이름</label>
                  <input
                    defaultValue={currentWorkspace.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== currentWorkspace.name) updateWorkspace(workspaceId, { name: v })
                    }}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>설명</label>
                  <textarea
                    defaultValue={currentWorkspace.description || ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== (currentWorkspace.description || '')) updateWorkspace(workspaceId, { description: v })
                    }}
                    rows={3}
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>
              </div>
            </SettingsSection>

            {/* 1-A: AI 모델 설정 */}
            <SettingsSection title="AI 모델 설정" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 014 4v1a4 4 0 01-8 0V6a4 4 0 014-4z"/><path d="M16 14H8a4 4 0 00-4 4v2h16v-2a4 4 0 00-4-4z"/></svg>}>
              <div>
                <label style={labelStyle}>모델 선택</label>
                <select
                  value={aiConfig.model}
                  onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                  style={inputStyle}
                >
                  <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (기본, 빠름)</option>
                  <option value="claude-opus-5-5">Claude Opus 5.5 (최고 품질, 느림)</option>
                </select>
                <p style={hintStyle}>모든 프로젝트에 동일하게 적용됩니다</p>
              </div>
            </SettingsSection>

            {/* 1-B: 팀 진행 방식 (1인 기록 / 팀 채팅) */}
            <SettingsSection title="진행 방식" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}>
              <p style={{ ...hintStyle, marginBottom: 12, marginTop: 0 }}>팀이 채팅에 참여하는 방식을 선택하세요. AI가 질문하는 방식이 달라집니다.</p>
              <ParticipationModePicker value={participationMode} onChange={setParticipationMode} disabled={settingsSaving} />
              <BriefModeToggle checked={briefMode} onChange={setBriefMode} coreFormal={briefCoreFormal} onCoreFormalChange={setBriefCoreFormal} disabled={settingsSaving} />
            </SettingsSection>

            {/* 1-C: AI 역할 프리셋 설정 */}
            <SettingsSection title="AI 역할 프리셋" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>}>
              <p style={{ ...hintStyle, marginBottom: 12, marginTop: 0 }}>AI의 개입 수준을 선택하세요</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {AI_ROLE_PRESET_LIST.map((preset) => {
                  const isSelected = aiRole === preset.id
                  const isDefault = preset.id === DEFAULT_AI_ROLE
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setAiRole(preset.id)
                        setEnabledAI({ ...preset.enabledActions })
                      }}
                      style={{
                        padding: '12px 14px',
                        border: `2px solid ${isSelected ? '#3B82F6' : 'var(--color-border)'}`,
                        borderRadius: 'var(--radius-lg)',
                        background: isSelected ? '#EFF6FF' : 'var(--color-bg-secondary)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                        textAlign: 'left',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{preset.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#2563EB' : 'var(--color-text-primary)' }}>{preset.name}</span>
                        {isDefault && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 9999, background: '#DBEAFE', color: '#2563EB', fontWeight: 600 }}>기본</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{preset.description}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.3 }}>{preset.detail}</div>
                    </button>
                  )
                })}
              </div>

              {/* 현재 선택된 역할의 활성화 상태 표시 */}
              {aiRole && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  <span style={{ fontWeight: 600 }}>활성화된 기능: </span>
                  {Object.entries(enabledAI).map(([key, val]) => (
                    <span key={key} style={{ marginLeft: 6, color: val ? '#16A34A' : '#D1D5DB', fontWeight: val ? 600 : 400 }}>
                      {{ guide: '안내', generate: '생성', check: '점검', record: '기록' }[key]}
                    </span>
                  ))}
                </div>
              )}

            </SettingsSection>

            {/* 저장 버튼 */}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleSaveSettings}
                disabled={settingsSaving}
                className="btn btn-primary"
                style={{ padding: '10px 24px', fontSize: 14, opacity: settingsSaving ? 0.6 : 1 }}
              >
                {settingsSaving ? '저장 중...' : '설정 저장'}
              </button>
            </div>

            {/* 위험 영역 */}
            {isOwner && (
              <div style={{
                marginTop: 32,
                background: '#FEF2F2',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid #FECACA',
                padding: 24,
              }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#991B1B', margin: '0 0 8px' }}>위험 영역</h3>
                <p style={{ fontSize: 13, color: '#DC2626', margin: '0 0 16px' }}>
                  워크스페이스를 삭제하면 모든 프로젝트와 데이터가 영구 삭제됩니다.
                </p>
                <button onClick={handleDeleteWorkspace} className="btn btn-danger" style={{ fontSize: 13 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  워크스페이스 삭제
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 프로젝트 생성 모달 */}
      {showCreateProject && (
        <Modal onClose={() => setShowCreateProject(false)}>
          <form onSubmit={handleCreateProject}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 20px', color: 'var(--color-text-primary)' }}>새 프로젝트 만들기</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <input
                  value={projectTitle}
                  onChange={(e) => { setProjectTitle(e.target.value); if (titleSuggested) setTitleSuggested(false) }}
                  placeholder="프로젝트 제목 (예: 3학년 기후변화 융합수업)"
                  autoFocus
                  required
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box',
                    ...(titleSuggested ? { borderColor: 'var(--color-primary)', background: '#f5f3ff' } : {}),
                  }}
                />
                {titleSuggested && (
                  <p style={{ margin: '5px 2px 0', fontSize: 11.5, color: '#7c3aed' }}>
                    ✨ AI가 지은 {descSuggested ? '제목·설명' : '제목'} 초안이에요 — 자유롭게 고쳐 보세요
                  </p>
                )}
              </div>
              <textarea
                value={projectDescription}
                onChange={(e) => { setProjectDescription(e.target.value); if (descSuggested) setDescSuggested(false) }}
                placeholder="간략한 설명 (선택)"
                rows={2}
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 14, resize: 'none', boxSizing: 'border-box',
                  ...(descSuggested ? { borderColor: 'var(--color-primary)', background: '#f5f3ff' } : {}),
                }}
              />

              {/* 학년 선택 */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>학년</label>
                <select
                  value={projectGrade}
                  onChange={(e) => setProjectGrade(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                >
                  <option value="">선택하세요</option>
                  {PROJECT_GRADE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* 교과 선택 */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  교과 (2개 이상 선택)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['국어', '수학', '사회', '과학', '영어', '도덕', '정보', '음악', '미술', '체육', '기술·가정', '한문', '제2외국어', '교양', '실과'].map(subj => (
                    <button
                      key={subj}
                      type="button"
                      onClick={() => {
                        setProjectSubjects(projectSubjects.includes(subj)
                          ? projectSubjects.filter(s => s !== subj)
                          : [...projectSubjects, subj])
                      }}
                      style={{
                        padding: '5px 12px', fontSize: 12, borderRadius: 9999, border: '1px solid',
                        borderColor: projectSubjects.includes(subj) ? 'var(--color-primary)' : 'var(--color-border)',
                        background: projectSubjects.includes(subj) ? 'var(--color-primary)' : 'transparent',
                        color: projectSubjects.includes(subj) ? '#fff' : 'var(--color-text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {subj}
                    </button>
                  ))}
                </div>
              </div>

              {/* 설계 모드에서 담아온 성취기준 */}
              {designBasket.length > 0 && (
                <div style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, background: '#eff6ff' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', marginBottom: 8 }}>
                    {EXPLORE_COPY.createModal.basketLine(designBasket.length)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {designBasket.map(key => (
                      <span key={key} title={subjectFromKey(key) || undefined} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                        background: '#fff', border: '1px solid #dbeafe', borderRadius: 6,
                        fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#374151',
                      }}>
                        {codeFromKey(key)}
                        {subjectFromKey(key) && (
                          <span style={{ fontFamily: 'inherit', fontSize: 10, color: '#9ca3af' }}>{subjectFromKey(key)}</span>
                        )}
                        <button type="button" title="제외"
                          onClick={() => {
                            const next = designBasket.filter(k => k !== key)
                            setDesignBasket(next)
                            writeBasket(safeSessionStorage(), NEW_DESTINATION, next)
                          }}
                          style={{ border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, fontSize: 11 }}>
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setShowCreateProject(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>취소</button>
              <button type="submit" disabled={creating} className="btn btn-primary" style={{ fontSize: 13, opacity: creating ? 0.5 : 1 }}>
                {creating ? '생성 중...' : `만들기${designBasket.length > 0 ? ` (성취기준 ${designBasket.length}개 포함)` : ''}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 멤버 초대 모달 */}
      {showInvite && (
        <Modal onClose={closeInviteModal}>
          {inviteLinkInfo ? (
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text-primary)' }}>초대 링크가 생성되었습니다</h2>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                <strong>{inviteLinkInfo.email}</strong>님은 아직 가입하지 않아 자동 추가되지 않았습니다.<br />
                아래 링크를 공유해 주세요. 동료가 로그인한 뒤 링크를 열면 워크스페이스에 합류합니다.
              </p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input
                  value={inviteLinkInfo.url}
                  readOnly
                  onFocus={(e) => e.target.select()}
                  style={{ flex: 1, padding: '10px 14px', fontSize: 13, boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
                <button type="button" onClick={handleCopyInviteLink} className="btn btn-primary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  복사
                </button>
              </div>
              {inviteLinkInfo.expiresAt && (
                <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 16px' }}>
                  만료: {new Date(inviteLinkInfo.expiresAt).toLocaleString('ko-KR')}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { setInviteLinkInfo(null); setInviteEmail('') }}
                  className="btn btn-ghost"
                  style={{ fontSize: 13 }}
                >
                  다른 사람 초대
                </button>
                <button type="button" onClick={closeInviteModal} className="btn btn-primary" style={{ fontSize: 13 }}>
                  닫기
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleInvite}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text-primary)' }}>멤버 초대</h2>
              <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                가입된 동료는 즉시 멤버로 추가되고, 미가입자는 7일짜리 초대 링크가 생성됩니다.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>이메일</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teacher@school.edu"
                    autoFocus
                    required
                    style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>역할</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                  >
                    <option value="member">멤버</option>
                    <option value="admin">관리자</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" onClick={closeInviteModal} className="btn btn-ghost" style={{ fontSize: 13 }}>취소</button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>초대 보내기</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* Feature 3: 호스트 셋업 위자드 */}
      {showSetupWizard && (
        <HostSetupWizard
          workspaceId={workspaceId}
          workspace={currentWorkspace}
          onComplete={(config) => {
            localStorage.setItem(`cw_wizard_done_${workspaceId}`, '1')
            setShowSetupWizard(false)
            if (config) {
              setAiConfig(config.aiConfig || aiConfig)
              setEnabledAI(config.enabledAI || enabledAI)
              updateWorkspace(workspaceId, {
                ai_config: config.aiConfig || aiConfig,
                workflow_config: {
                  enabledAI: config.enabledAI || enabledAI,
                  aiRole: config.aiRole || 'facilitator',
                  // 설정 전체를 덮어쓰므로 팀 만들 때 고른 진행 방식을 함께 보존한다
                  participationMode: resolveParticipationMode(currentWorkspace?.workflow_config),
                  briefMode: resolveBriefMode(currentWorkspace?.workflow_config),
                  briefCoreFormal: resolveCoreFormal(currentWorkspace?.workflow_config),
                },
              }).catch(() => {})
            }
          }}
          onDismiss={() => {
            localStorage.setItem(`cw_wizard_done_${workspaceId}`, '1')
            setShowSetupWizard(false)
          }}
        />
      )}
    </div>
  )
}

// ============================================================
// 공유 스타일
// ============================================================

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }
const inputStyle = { width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }
const hintStyle = { fontSize: 12, color: 'var(--color-text-tertiary)', margin: '6px 0 0' }

// ============================================================
// 설정 섹션 컴포넌트
// ============================================================

function SettingsSection({ title, icon, children }) {
  return (
    <div style={{
      marginBottom: 20,
      background: 'var(--color-bg-secondary)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border)',
      padding: 24,
    }}>
      <h3 style={{
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--color-text-primary)',
        margin: '0 0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

function Modal({ onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="animate-slide-up" style={{
        position: 'relative',
        background: 'var(--color-bg-secondary)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-xl)',
        padding: 28,
        width: '100%',
        maxWidth: 420,
      }}>
        {children}
      </div>
    </div>
  )
}
