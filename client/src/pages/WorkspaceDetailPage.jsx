import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useProjectStore } from '../stores/projectStore'
import { useAuthStore } from '../stores/authStore'
import { PROCEDURES, PHASES } from 'curriculum-weaver-shared/constants.js'
import Logo from '../components/Logo'

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentWorkspace, fetchWorkspace, updateWorkspace, deleteWorkspace, inviteMember } = useWorkspaceStore()
  const { projects, loading: projectsLoading, fetchProjects, createProject, deleteProject } = useProjectStore()

  const [activeTab, setActiveTab] = useState('projects')
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [projectTitle, setProjectTitle] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchWorkspace(workspaceId)
    fetchProjects(workspaceId)
  }, [workspaceId, fetchWorkspace, fetchProjects])

  const isOwner = currentWorkspace?.owner_id === user?.id

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!projectTitle.trim()) return
    setCreating(true)
    try {
      const project = await createProject(workspaceId, {
        title: projectTitle.trim(),
        description: projectDescription.trim(),
      })
      setShowCreateProject(false)
      setProjectTitle('')
      setProjectDescription('')
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
    ...(isOwner ? [{ key: 'settings', label: '설정', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }] : []),
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
                    <button
                      key={project.id}
                      onClick={() => navigate(`/workspaces/${workspaceId}/projects/${project.id}`)}
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
                    </button>
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
                        {(member.display_name || member.email || member.user_id || '?')[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.display_name || member.email || member.user_id?.slice(0, 8) || '멤버'}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.email || member.role}
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
        {activeTab === 'settings' && isOwner && (
          <div style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 20px' }}>워크스페이스 설정</h2>
            <div style={{
              background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-border)',
              padding: 24,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>이름</label>
                  <input
                    defaultValue={currentWorkspace.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== currentWorkspace.name) updateWorkspace(workspaceId, { name: v })
                    }}
                    style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>설명</label>
                  <textarea
                    defaultValue={currentWorkspace.description || ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== (currentWorkspace.description || '')) updateWorkspace(workspaceId, { description: v })
                    }}
                    rows={3}
                    style={{ width: '100%', padding: '10px 14px', fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* 위험 영역 */}
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
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setShowCreateProject(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>취소</button>
              <button type="submit" disabled={creating} className="btn btn-primary" style={{ fontSize: 13, opacity: creating ? 0.5 : 1 }}>
                {creating ? '생성 중...' : '만들기'}
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
