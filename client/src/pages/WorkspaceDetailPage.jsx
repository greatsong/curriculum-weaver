import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useProjectStore } from '../stores/projectStore'
import { useAuthStore } from '../stores/authStore'
import { apiGet, apiPost } from '../lib/api'
import { PROCEDURES, PHASES, PROCEDURE_LIST, AI_ROLE_PRESETS, AI_ROLE_PRESET_LIST, DEFAULT_AI_ROLE } from 'curriculum-weaver-shared/constants.js'
import Logo from '../components/Logo'
import HostSetupWizard from '../components/HostSetupWizard'

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { currentWorkspace, fetchWorkspace, updateWorkspace, deleteWorkspace, inviteMember } = useWorkspaceStore()
  const { projects, loading: projectsLoading, fetchProjects, createProject, deleteProject } = useProjectStore()

  const [activeTab, setActiveTab] = useState('projects')
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [projectTitle, setProjectTitle] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectSubjects, setProjectSubjects] = useState([])
  const [projectGrade, setProjectGrade] = useState('')
  const [recommendedStandards, setRecommendedStandards] = useState([])
  const [selectedStandardIds, setSelectedStandardIds] = useState(new Set())
  const [loadingRecommend, setLoadingRecommend] = useState(false)
  const [standardSearchQuery, setStandardSearchQuery] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [creating, setCreating] = useState(false)

  // Feature 1: 호스트 설정 상태
  const [aiConfig, setAiConfig] = useState({ model: 'claude-sonnet-4-6' })
  const [hiddenProcedures, setHiddenProcedures] = useState([])
  const [enabledAI, setEnabledAI] = useState({ guide: true, generate: true, check: true, record: true })
  const [aiRole, setAiRole] = useState(DEFAULT_AI_ROLE)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // Feature 3: 셋업 위자드
  const [showSetupWizard, setShowSetupWizard] = useState(false)

  useEffect(() => {
    fetchWorkspace(workspaceId)
    fetchProjects(workspaceId)
  }, [workspaceId, fetchWorkspace, fetchProjects])

  // 워크스페이스 설정값 로드
  useEffect(() => {
    if (currentWorkspace) {
      const ac = currentWorkspace.ai_config || {}
      setAiConfig({
        model: ac.model || 'claude-sonnet-4-6',
      })
      const wc = currentWorkspace.workflow_config || {}
      setHiddenProcedures(wc.hiddenProcedures || [])
      setEnabledAI({
        guide: wc.enabledAI?.guide !== false,
        generate: wc.enabledAI?.generate !== false,
        check: wc.enabledAI?.check !== false,
        record: wc.enabledAI?.record !== false,
      })
      setAiRole(wc.aiRole || DEFAULT_AI_ROLE)
    }
  }, [currentWorkspace])

  // Feature 3: 셋업 위자드 표시 판단
  useEffect(() => {
    if (!currentWorkspace || projectsLoading) return
    const isSetup = searchParams.get('setup') === 'true'
    const noProjects = projects.length === 0
    const isOwnerOrHost = currentWorkspace.owner_id === user?.id || currentWorkspace.my_role === 'host'
    if ((isSetup || noProjects) && isOwnerOrHost && !localStorage.getItem(`cw_wizard_done_${workspaceId}`)) {
      setShowSetupWizard(true)
    }
  }, [currentWorkspace, projects, projectsLoading, searchParams, workspaceId, user])

  const isOwner = currentWorkspace?.owner_id === user?.id
  const isHostOrOwner = isOwner || currentWorkspace?.my_role === 'host'

  // Feature 1: 설정 저장
  const handleSaveSettings = useCallback(async () => {
    setSettingsSaving(true)
    try {
      await updateWorkspace(workspaceId, {
        ai_config: aiConfig,
        workflow_config: {
          hiddenProcedures,
          enabledAI,
          aiRole,
        },
      })
    } catch (err) {
      alert(`설정 저장 실패: ${err.message}`)
    } finally {
      setSettingsSaving(false)
    }
  }, [workspaceId, aiConfig, hiddenProcedures, enabledAI, aiRole, updateWorkspace])

  const toggleProcedure = (code) => {
    setHiddenProcedures((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const toggleAIRole = (role) => {
    setEnabledAI((prev) => ({ ...prev, [role]: !prev[role] }))
  }

  // 교과/학년 변경 시 성취기준 추천 로드
  const loadRecommendations = useCallback(async (subjects, grade) => {
    if (subjects.length === 0) {
      setRecommendedStandards([])
      setSelectedStandardIds(new Set())
      return
    }
    setLoadingRecommend(true)
    try {
      const params = new URLSearchParams({
        subjects: subjects.join(','),
        grade: grade || '',
        topic: projectTitle || '',
      })
      const data = await apiGet(`/api/standards/recommend?${params}`)
      const recs = data.recommendations || []
      setRecommendedStandards(recs)
      // 관련도 상위 항목만 기본 선택 (교과당 최대 5개)
      const autoSelected = new Set()
      const perSubject = {}
      for (const s of recs) {
        const sg = s.subject_group || s.subject
        if (!perSubject[sg]) perSubject[sg] = 0
        if (perSubject[sg] < 5 && (s._relevance > 0 || recs.length <= 20)) {
          autoSelected.add(s.id)
          perSubject[sg]++
        }
      }
      setSelectedStandardIds(autoSelected)
    } catch {
      setRecommendedStandards([])
    } finally {
      setLoadingRecommend(false)
    }
  }, [projectTitle])

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!projectTitle.trim()) return
    setCreating(true)
    try {
      const project = await createProject(workspaceId, {
        title: projectTitle.trim(),
        description: projectDescription.trim(),
        subjects: projectSubjects,
        grade: projectGrade,
      })

      // 선택된 성취기준 일괄 저장
      if (selectedStandardIds.size > 0) {
        try {
          await apiPost(`/api/standards/project/${project.id}/bulk`, {
            standard_ids: [...selectedStandardIds],
          })
        } catch (e) {
          console.warn('성취기준 일괄 저장 실패:', e.message)
        }
      }

      setShowCreateProject(false)
      setProjectTitle('')
      setProjectDescription('')
      setProjectSubjects([])
      setProjectGrade('')
      setRecommendedStandards([])
      setSelectedStandardIds(new Set())
      navigate(`/workspaces/${workspaceId}/projects/${project.id}`)
    } catch (err) {
      alert(`프로젝트 생성 실패: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    try {
      await inviteMember(workspaceId, inviteEmail.trim(), inviteRole)
      setShowInvite(false)
      setInviteEmail('')
      alert('초대가 전송되었습니다.')
    } catch (err) {
      alert(`초대 실패: ${err.message}`)
    }
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
            ) : projects.length === 0 ? (
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
                <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>새 프로젝트를 만들어 수업 설계를 시작하세요</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {projects.map((project, idx) => {
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
                        {project.current_procedure || 'T-1-1'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {project.title}
                        </h3>
                        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {proc?.name || '비전설정'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('이 프로젝트를 삭제하시겠습니까?')) deleteProject(project.id)
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
                  <option value="claude-sonnet-4-6">Claude Sonnet 4 (기본, 빠름)</option>
                  <option value="claude-opus-4-7">Claude Opus 4.7 (최고 품질, 느림)</option>
                </select>
                <p style={hintStyle}>모든 프로젝트에 동일하게 적용됩니다</p>
              </div>
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
              {aiRole && aiRole !== 'custom' && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  <span style={{ fontWeight: 600 }}>활성화된 기능: </span>
                  {Object.entries(enabledAI).map(([key, val]) => (
                    <span key={key} style={{ marginLeft: 6, color: val ? '#16A34A' : '#D1D5DB', fontWeight: val ? 600 : 400 }}>
                      {{ guide: '안내', generate: '생성', check: '점검', record: '기록' }[key]}
                    </span>
                  ))}
                </div>
              )}

              {/* 커스텀 세부 조절 */}
              <button
                type="button"
                onClick={() => {
                  if (aiRole === 'custom') {
                    setAiRole(DEFAULT_AI_ROLE)
                    setEnabledAI({ ...AI_ROLE_PRESETS[DEFAULT_AI_ROLE].enabledActions })
                  } else {
                    setAiRole('custom')
                  }
                }}
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: aiRole === 'custom' ? '#2563EB' : 'var(--color-text-tertiary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 0',
                  fontFamily: 'var(--font-sans)',
                  textDecoration: 'underline',
                }}
              >
                {aiRole === 'custom' ? '프리셋으로 돌아가기' : '직접 설정 (커스텀)'}
              </button>
              {aiRole === 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  {[
                    { key: 'guide', label: '안내', desc: '단계 설명', color: '#3B82F6' },
                    { key: 'generate', label: '생성', desc: '초안/예시', color: '#F59E0B' },
                    { key: 'check', label: '점검', desc: '정합성 검토', color: '#22C55E' },
                    { key: 'record', label: '기록', desc: '자동 저장', color: '#6B7280' },
                  ].map(({ key, label, desc, color }) => (
                    <label
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${enabledAI[key] ? color + '40' : 'var(--color-border)'}`,
                        background: enabledAI[key] ? color + '08' : 'transparent',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enabledAI[key]}
                        onChange={() => toggleAIRole(key)}
                        style={{ accentColor: color, width: 16, height: 16 }}
                      />
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>({desc})</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </SettingsSection>

            {/* 1-B: 워크플로우 커스터마이징 */}
            <SettingsSection title="워크플로우 설정" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>}>
              <p style={{ ...hintStyle, marginBottom: 12, marginTop: 0 }}>불필요한 절차를 숨길 수 있습니다</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {PROCEDURE_LIST.map((proc) => {
                  const phase = Object.values(PHASES).find((p) => p.id === proc.phase)
                  const isHidden = hiddenProcedures.includes(proc.code)
                  return (
                    <label
                      key={proc.code}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast)',
                        opacity: isHidden ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-tertiary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggleProcedure(proc.code)}
                        style={{ accentColor: phase?.color || '#3B82F6', width: 16, height: 16 }}
                      />
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                        width: 44,
                        padding: '2px 0',
                        borderRadius: 4,
                        background: (phase?.color || '#3B82F6') + '14',
                        color: phase?.color || '#3B82F6',
                        flexShrink: 0,
                      }}>
                        {proc.code}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{proc.name}</span>
                    </label>
                  )
                })}
              </div>
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
              <input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="프로젝트 제목 (예: 3학년 기후변화 융합수업)"
                autoFocus
                required
                style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
              />
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="간략한 설명 (선택)"
                rows={2}
                style={{ width: '100%', padding: '10px 14px', fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
              />

              {/* 학년 선택 */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>학년</label>
                <select
                  value={projectGrade}
                  onChange={(e) => {
                    setProjectGrade(e.target.value)
                    if (projectSubjects.length > 0) loadRecommendations(projectSubjects, e.target.value)
                  }}
                  style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                >
                  <option value="">선택하세요</option>
                  <option value="초등학교 3학년">초등학교 3-4학년</option>
                  <option value="초등학교 5학년">초등학교 5-6학년</option>
                  <option value="중학교 1학년">중학교</option>
                  <option value="고등학교 1학년">고등학교 (공통)</option>
                  <option value="고등학교 2학년">고등학교 (선택)</option>
                </select>
              </div>

              {/* 교과 선택 */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  교과 (2개 이상 선택)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['국어', '수학', '사회', '과학', '영어', '도덕', '정보', '음악', '미술', '체육', '기술·가정', '한문'].map(subj => (
                    <button
                      key={subj}
                      type="button"
                      onClick={() => {
                        const next = projectSubjects.includes(subj)
                          ? projectSubjects.filter(s => s !== subj)
                          : [...projectSubjects, subj]
                        setProjectSubjects(next)
                        if (next.length >= 2 && projectGrade) loadRecommendations(next, projectGrade)
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

              {/* 추천 성취기준 목록 */}
              {recommendedStandards.length > 0 && (() => {
                const q = standardSearchQuery.trim().toLowerCase()
                const filtered = q
                  ? recommendedStandards.filter(s => {
                      const haystack = `${s.code || ''} ${s.content || ''} ${s.area || ''} ${(s.keywords || []).join(' ')}`.toLowerCase()
                      return haystack.includes(q)
                    })
                  : recommendedStandards
                return (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, maxHeight: 280, overflowY: 'auto', background: 'var(--color-bg-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      추천 성취기준 ({selectedStandardIds.size}/{filtered.length}{q ? ` · 전체 ${recommendedStandards.length}` : ''}개)
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => setSelectedStandardIds(new Set([...selectedStandardIds, ...filtered.map(s => s.id)]))}
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                        전체 선택
                      </button>
                      <button type="button" onClick={() => setSelectedStandardIds(new Set())}
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                        전체 해제
                      </button>
                    </div>
                  </div>
                  {/* 키워드 검색 */}
                  <input
                    type="text"
                    value={standardSearchQuery}
                    onChange={(e) => setStandardSearchQuery(e.target.value)}
                    placeholder="성취기준 키워드 검색 (예: 함수, 환경, 데이터)"
                    style={{ width: '100%', padding: '6px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }}
                  />
                  {/* 교과별 그룹 */}
                  {filtered.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 16 }}>
                      "{standardSearchQuery}"에 해당하는 성취기준이 없습니다
                    </div>
                  ) : (() => {
                    const groups = {}
                    for (const s of filtered) {
                      const key = s.subject_group || s.subject
                      if (!groups[key]) groups[key] = []
                      groups[key].push(s)
                    }
                    return Object.entries(groups).map(([subj, stds]) => (
                      <div key={subj} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 4 }}>{subj} ({stds.length}개)</div>
                        {stds.map(s => (
                          <label key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 0', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-primary)' }}>
                            <input
                              type="checkbox"
                              checked={selectedStandardIds.has(s.id)}
                              onChange={() => {
                                const next = new Set(selectedStandardIds)
                                next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                                setSelectedStandardIds(next)
                              }}
                              style={{ marginTop: 2, flexShrink: 0 }}
                            />
                            <span><strong>{s.code}</strong> {s.content?.slice(0, 60)}{s.content?.length > 60 ? '...' : ''}</span>
                          </label>
                        ))}
                      </div>
                    ))
                  })()}
                </div>
                )
              })()}
              {loadingRecommend && (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 8 }}>
                  성취기준 추천 로딩 중...
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setShowCreateProject(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>취소</button>
              <button type="submit" disabled={creating} className="btn btn-primary" style={{ fontSize: 13, opacity: creating ? 0.5 : 1 }}>
                {creating ? '생성 중...' : `만들기${selectedStandardIds.size > 0 ? ` (성취기준 ${selectedStandardIds.size}개 포함)` : ''}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 멤버 초대 모달 */}
      {showInvite && (
        <Modal onClose={() => setShowInvite(false)}>
          <form onSubmit={handleInvite}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 20px', color: 'var(--color-text-primary)' }}>멤버 초대</h2>
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
              <button type="button" onClick={() => setShowInvite(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>취소</button>
              <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>초대 보내기</button>
            </div>
          </form>
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
              setHiddenProcedures(config.hiddenProcedures || [])
              setEnabledAI(config.enabledAI || enabledAI)
              updateWorkspace(workspaceId, {
                ai_config: config.aiConfig || aiConfig,
                workflow_config: {
                  hiddenProcedures: config.hiddenProcedures || [],
                  enabledAI: config.enabledAI || enabledAI,
                  aiRole: config.aiRole || 'facilitator',
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
