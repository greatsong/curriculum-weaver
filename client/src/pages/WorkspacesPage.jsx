import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, FolderOpen, ArrowRight, LogOut, Globe, Database, Settings } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import Logo from '../components/Logo'

export default function WorkspacesPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { workspaces, loading, fetchWorkspaces, createWorkspace, acceptInvite } = useWorkspaceStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoinByLink, setShowJoinByLink] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const ws = await createWorkspace({
        name: name.trim(),
        description: description.trim(),
      })
      setShowCreate(false)
      setName('')
      setDescription('')
      navigate(`/workspaces/${ws.id}`)
    } catch (err) {
      alert(`워크스페이스 생성 실패: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  const handleJoinByLink = async (e) => {
    e.preventDefault()
    if (!inviteToken.trim()) return
    try {
      const ws = await acceptInvite(inviteToken.trim())
      setShowJoinByLink(false)
      setInviteToken('')
      navigate(`/workspaces/${ws.id}`)
    } catch (err) {
      alert(`참여 실패: ${err.message}`)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); navigate('/workspaces') }}
            className="flex items-center gap-3 hover:opacity-80 transition"
          >
            <Logo size={32} />
            <h1 className="text-xl font-bold text-gray-900">커리큘럼 위버</h1>
          </a>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 hidden sm:inline">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* 액션 버튼 */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium w-full sm:w-auto min-h-[44px]"
          >
            <Plus size={18} /> 새 워크스페이스
          </button>
          <button
            onClick={() => setShowJoinByLink(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium w-full sm:w-auto min-h-[44px]"
          >
            <Users size={18} /> 초대 링크로 참여
          </button>
          <button
            onClick={() => navigate('/data')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium w-full sm:w-auto min-h-[44px]"
          >
            <Database size={18} /> 교육과정 데이터
          </button>
          <button
            onClick={() => navigate('/graph')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition font-medium w-full sm:w-auto min-h-[44px]"
          >
            <Globe size={18} /> 3D 교육과정 그래프
          </button>
        </div>

        {/* 워크스페이스 생성 모달 */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
            <form
              onSubmit={handleCreate}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md mx-4 sm:mx-auto shadow-2xl"
            >
              <h2 className="text-lg font-bold mb-4">새 워크스페이스 만들기</h2>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="워크스페이스 이름 (예: 3학년 교사팀)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                required
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="설명 (선택)"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
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

        {/* 초대 참여 모달 */}
        {showJoinByLink && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowJoinByLink(false)}>
            <form
              onSubmit={handleJoinByLink}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-sm mx-4 sm:mx-auto shadow-2xl"
            >
              <h2 className="text-lg font-bold mb-4">워크스페이스 참여</h2>
              <input
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="초대 토큰 입력"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center tracking-widest"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowJoinByLink(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  참여
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 워크스페이스 목록 */}
        <h2 className="text-lg font-semibold text-gray-800 mb-4">내 워크스페이스</h2>

        {loading ? (
          <div className="text-center py-12 text-gray-400">로딩 중...</div>
        ) : workspaces.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Logo size={48} className="mx-auto mb-1 opacity-60" />
            <p className="text-gray-500 mb-2">아직 워크스페이스가 없습니다</p>
            <p className="text-sm text-gray-400">
              새 워크스페이스를 만들거나 초대 링크로 참여하세요
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => navigate(`/workspaces/${ws.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition text-left group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FolderOpen size={20} className="text-blue-600" />
                  </div>
                  <ArrowRight
                    size={18}
                    className="text-gray-300 group-hover:text-blue-500 transition mt-1"
                  />
                </div>
                <h3 className="font-semibold text-gray-900 truncate">{ws.name}</h3>
                {ws.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{ws.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {ws.member_count || 1}명
                  </span>
                  <span className="flex items-center gap-1">
                    <FolderOpen size={12} />
                    {ws.project_count || 0}개 프로젝트
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
