import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Users, FolderOpen, ArrowRight, ArrowLeft, Settings,
  Trash2, UserPlus, Clock, Copy, Mail, Shield, ChevronLeft,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useProjectStore } from '../stores/projectStore'
import { useAuthStore } from '../stores/authStore'
import { PROCEDURES, PHASES, PROCEDURE_LIST } from 'curriculum-weaver-shared/constants.js'
import Logo from '../components/Logo'

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentWorkspace, fetchWorkspace, updateWorkspace, deleteWorkspace, inviteMember } = useWorkspaceStore()
  const { projects, loading: projectsLoading, fetchProjects, createProject, deleteProject } = useProjectStore()

  const [activeTab, setActiveTab] = useState('projects') // 'projects' | 'members' | 'settings'
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const members = currentWorkspace.members || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/workspaces')}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition min-w-[44px] min-h-[44px] justify-center"
          >
            <ChevronLeft size={20} />
          </button>
          <Logo size={24} />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">
              {currentWorkspace.name}
            </h1>
            {currentWorkspace.description && (
              <p className="text-sm text-gray-500 truncate">{currentWorkspace.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">초대</span>
            </button>
          </div>
        </div>
      </header>

      {/* 탭 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-0">
          {[
            { key: 'projects', label: '프로젝트', icon: FolderOpen },
            { key: 'members', label: '멤버', icon: Users },
            ...(isOwner ? [{ key: 'settings', label: '설정', icon: Settings }] : []),
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* 프로젝트 탭 */}
        {activeTab === 'projects' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">프로젝트</h2>
              <button
                onClick={() => setShowCreateProject(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
              >
                <Plus size={16} /> 새 프로젝트
              </button>
            </div>

            {projectsLoading ? (
              <div className="text-center py-12 text-gray-400">로딩 중...</div>
            ) : projects.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <FolderOpen size={48} className="mx-auto mb-2 text-gray-300" />
                <p className="text-gray-500 mb-2">아직 프로젝트가 없습니다</p>
                <p className="text-sm text-gray-400">새 프로젝트를 만들어 수업 설계를 시작하세요</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {projects.map((project) => {
                  const proc = PROCEDURES[project.current_procedure] || PROCEDURES['T-1-1']
                  const phase = Object.values(PHASES).find((p) => p.id === proc?.phase)
                  return (
                    <button
                      key={project.id}
                      onClick={() => navigate(`/workspaces/${workspaceId}/projects/${project.id}`)}
                      className="flex items-center gap-3 sm:gap-4 bg-white rounded-xl border border-gray-200 p-4 sm:p-5 hover:shadow-md hover:border-blue-300 transition text-left group w-full"
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: `${phase?.color || '#3b82f6'}15`,
                          color: phase?.color || '#3b82f6',
                        }}
                      >
                        {project.current_procedure || 'T-1-1'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{project.title}</h3>
                        <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                          <Clock size={14} />
                          <span>{proc?.name || '비전설정'}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('이 프로젝트를 삭제하시겠습니까?')) {
                              deleteProject(project.id)
                            }
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 size={16} />
                        </button>
                        <ArrowRight
                          size={20}
                          className="text-gray-300 group-hover:text-blue-500 transition"
                        />
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">멤버</h2>
              <button
                onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
              >
                <UserPlus size={16} /> 멤버 초대
              </button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {members.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  아직 멤버가 없습니다
                </div>
              ) : (
                members.map((member) => (
                  <div key={member.id || member.user_id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                      {(member.display_name || member.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.display_name || member.email}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{member.email}</p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      {member.role === 'owner' && <Shield size={12} className="text-amber-500" />}
                      {member.role === 'owner' ? '소유자' : member.role === 'admin' ? '관리자' : '멤버'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 설정 탭 */}
        {activeTab === 'settings' && isOwner && (
          <div className="max-w-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">워크스페이스 설정</h2>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                <input
                  defaultValue={currentWorkspace.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== currentWorkspace.name) {
                      updateWorkspace(workspaceId, { name: v })
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                <textarea
                  defaultValue={currentWorkspace.description || ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v !== (currentWorkspace.description || '')) {
                      updateWorkspace(workspaceId, { description: v })
                    }
                  }}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {/* 위험 영역 */}
            <div className="mt-8 bg-red-50 rounded-xl border border-red-200 p-5">
              <h3 className="text-sm font-semibold text-red-800 mb-2">위험 영역</h3>
              <p className="text-sm text-red-600 mb-3">
                워크스페이스를 삭제하면 모든 프로젝트와 데이터가 영구 삭제됩니다.
              </p>
              <button
                onClick={handleDeleteWorkspace}
                className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
              >
                <Trash2 size={14} /> 워크스페이스 삭제
              </button>
            </div>
          </div>
        )}
      </main>

      {/* 프로젝트 생성 모달 */}
      {showCreateProject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreateProject(false)}>
          <form
            onSubmit={handleCreateProject}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md mx-4 sm:mx-auto shadow-2xl"
          >
            <h2 className="text-lg font-bold mb-4">새 프로젝트 만들기</h2>
            <input
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="프로젝트 제목 (예: 3학년 기후변화 융합수업)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              required
            />
            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="간략한 설명 (선택)"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateProject(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? '생성 중...' : '만들기'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 멤버 초대 모달 */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowInvite(false)}>
          <form
            onSubmit={handleInvite}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-sm mx-4 sm:mx-auto shadow-2xl"
          >
            <h2 className="text-lg font-bold mb-4">멤버 초대</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teacher@school.edu"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">역할</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="member">멤버</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowInvite(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                초대 보내기
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
