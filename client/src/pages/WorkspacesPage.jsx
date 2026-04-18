import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

  useEffect(() => { fetchWorkspaces() }, [fetchWorkspaces])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const ws = await createWorkspace({ name: name.trim(), description: description.trim() })
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
    const raw = inviteToken.trim()
    if (!raw) return
    // 사용자가 전체 URL을 붙여넣은 경우 토큰만 추출
    const match = raw.match(/\/invite\/([^/?#\s]+)/)
    const token = match ? match[1] : raw
    try {
      const ws = await acceptInvite(token)
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
          justifyContent: 'space-between',
        }}>
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); navigate('/workspaces') }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              transition: 'opacity var(--transition-fast)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            <Logo size={28} />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              커리큘럼 위버
            </span>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }} className="hidden sm:inline">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FEF2F2'
                e.currentTarget.style.color = '#DC2626'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = 'var(--color-text-secondary)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px' }}>
        {/* 타이틀 + 액션 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            내 워크스페이스
          </h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              새 워크스페이스
            </button>
            <button
              onClick={() => setShowJoinByLink(true)}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              초대 링크로 참여
            </button>
            <button
              onClick={() => navigate('/data')}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              교육과정 데이터
            </button>
            <button
              onClick={() => navigate('/demo')}
              className="btn"
              style={{
                padding: '8px 16px',
                fontSize: 13,
                background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
                color: '#fff',
                border: 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              데모 체험
            </button>
            <button
              onClick={() => navigate('/graph')}
              className="btn"
              style={{
                padding: '8px 16px',
                fontSize: 13,
                background: '#111827',
                color: '#fff',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#1F2937'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#111827'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
              3D 교육과정 그래프
            </button>
          </div>
        </div>

        {/* 워크스페이스 목록 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-tertiary)' }}>
            <div style={{
              width: 28,
              height: 28,
              border: '3px solid var(--color-border)',
              borderTopColor: '#3B82F6',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }} />
            <span style={{ fontSize: 13 }}>로딩 중...</span>
          </div>
        ) : workspaces.length === 0 ? (
          <div
            className="animate-fade-in"
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-border)',
            }}
          >
            {/* 일러스트 SVG */}
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }}>
              <rect x="8" y="16" width="64" height="48" rx="4" stroke="#9CA3AF" strokeWidth="2" fill="none" />
              <path d="M8 28h64" stroke="#9CA3AF" strokeWidth="2" />
              <circle cx="16" cy="22" r="2" fill="#9CA3AF" />
              <circle cx="22" cy="22" r="2" fill="#9CA3AF" />
              <circle cx="28" cy="22" r="2" fill="#9CA3AF" />
              <rect x="20" y="36" width="40" height="4" rx="2" fill="#D1D5DB" />
              <rect x="24" y="46" width="32" height="4" rx="2" fill="#E5E7EB" />
            </svg>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>
              아직 워크스페이스가 없습니다
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
              새 워크스페이스를 만들거나 초대 링크로 참여하세요
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}>
            {workspaces.map((ws, idx) => (
              <button
                key={ws.id}
                onClick={() => navigate(`/workspaces/${ws.id}`)}
                className="card animate-slide-up"
                style={{
                  animationDelay: `${idx * 50}ms`,
                  padding: 24,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-lg)',
                    background: '#EFF6FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 4, transition: 'transform var(--transition-fast)' }}>
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>
                <div>
                  <h3 style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    margin: '0 0 4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {ws.name}
                  </h3>
                  {ws.description && (
                    <p style={{
                      fontSize: 13,
                      color: 'var(--color-text-secondary)',
                      margin: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {ws.description}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    {ws.member_count || 1}명
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                    {ws.project_count || 0}개 프로젝트
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* 워크스페이스 생성 모달 */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 20px', color: 'var(--color-text-primary)' }}>
              새 워크스페이스 만들기
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="워크스페이스 이름 (예: 3학년 교사팀)"
                autoFocus
                required
                style={{ width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box' }}
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="설명 (선택)"
                rows={2}
                style={{ width: '100%', padding: '10px 14px', fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>
                취소
              </button>
              <button type="submit" disabled={creating} className="btn btn-primary" style={{ fontSize: 13, opacity: creating ? 0.5 : 1 }}>
                {creating ? '생성 중...' : '만들기'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 초대 참여 모달 */}
      {showJoinByLink && (
        <Modal onClose={() => setShowJoinByLink(false)}>
          <form onSubmit={handleJoinByLink}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-text-primary)' }}>
              초대 링크로 참여
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 16px', lineHeight: 1.5 }}>
              호스트가 공유한 초대 링크를 그대로 붙여넣거나, 링크 끝의 토큰만 입력하세요.
            </p>
            <input
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              placeholder="https://.../invite/abc123 또는 abc123"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setShowJoinByLink(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>
                취소
              </button>
              <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>
                참여
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

/** 공유 모달 컴포넌트 */
function Modal({ onClose, children }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.2)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />
      <div
        className="animate-slide-up"
        style={{
          position: 'relative',
          background: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-xl)',
          padding: '28px',
          width: '100%',
          maxWidth: 420,
        }}
      >
        {children}
      </div>
    </div>
  )
}
