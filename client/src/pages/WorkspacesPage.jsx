import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Compass, Inbox } from 'lucide-react'
import Notice from '../components/ui/Notice'
import ContinueProjects from '../components/ContinueProjects'
import ExploreEntryCard from '../components/ExploreEntryCard'
import { EXPLORE_COPY } from '../lib/explorationCopy'
import { NEW_DESTINATION, readBasket } from '../lib/exploreDestination'
import { safeSessionStorage } from '../lib/explorationDraft'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { apiGet } from '../lib/api'
import Logo from '../components/Logo'
import ParticipationModePicker from '../components/ParticipationModePicker'
import BriefModeToggle from '../components/BriefModeToggle'
import { DEFAULT_PARTICIPATION_MODE_FOR_NEW_TEAM } from 'curriculum-weaver-shared/constants.js'

export default function WorkspacesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, logout } = useAuthStore()
  const { workspaces, loading, error, errorStatus, fetchWorkspaces, createWorkspace, acceptInvite } = useWorkspaceStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoinByLink, setShowJoinByLink] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [participationMode, setParticipationMode] = useState(DEFAULT_PARTICIPATION_MODE_FOR_NEW_TEAM)
  const [briefMode, setBriefMode] = useState(false)
  const [inviteToken, setInviteToken] = useState('')
  const [creating, setCreating] = useState(false)

  // 그래프(설계/탐험)에서 성취기준을 담아온 흐름 — 워크스페이스 선택 후
  // 상세 페이지에서 프로젝트 생성 모달이 자동으로 열리도록 쿼리를 이월한다.
  const wantsCreateProject = searchParams.get('createProject') === '1'
  // 새 프로젝트로 담아 온 성취기준 (기존 cw_design_basket과 새 키를 함께 읽는다)
  const [basketCount] = useState(() => readBasket(safeSessionStorage(), NEW_DESTINATION).length)
  const detailPath = (wsId) => `/workspaces/${wsId}${wantsCreateProject ? '?createProject=1' : ''}`

  // '교육과정 데이터' 관리 도구는 사이트 관리자 전용 — role 확인 전엔 숨김
  const [isSiteAdmin, setIsSiteAdmin] = useState(false)
  useEffect(() => {
    let cancelled = false
    apiGet('/api/auth/me').then((profile) => {
      if (!cancelled && profile?.role === 'admin') setIsSiteAdmin(true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => { fetchWorkspaces() }, [fetchWorkspaces])

  // 개인(시연) 워크스페이스는 협력 워크스페이스 목록에 섞이지 않도록 숨긴다.
  // (시연 모드는 /demo-prep 진입점으로만 접근)
  const visibleWorkspaces = workspaces.filter((ws) => !ws?.workflow_config?.personal)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const ws = await createWorkspace({
        name: name.trim(),
        description: description.trim(),
        workflow_config: { participationMode, briefMode },
      })
      setShowCreate(false)
      setName('')
      setDescription('')
      setParticipationMode(DEFAULT_PARTICIPATION_MODE_FOR_NEW_TEAM)
      setBriefMode(false)
      navigate(detailPath(ws.id))
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
          flexWrap: 'wrap',
          gap: 12,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/explore" className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-md text-sm font-semibold text-link hover:text-link-hover hover:bg-bg-tertiary no-underline">
              <Compass aria-hidden="true" size={16} />{EXPLORE_COPY.home.exploreLink}
            </Link>
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
        {/* 새 프로젝트로 담아 온 성취기준 안내 — 아직 저장 전임을 알린다 */}
        {basketCount > 0 && (
          <Notice tone="info" icon={Inbox} className="mb-5 animate-fade-in" role="status"
            title={EXPLORE_COPY.home.basketBanner(basketCount)} />
        )}

        {/* 이어서 하기(최근 프로젝트) → 수업 아이디어 탐색 → 내 워크스페이스 */}
        <ContinueProjects workspaces={visibleWorkspaces} />
        <ExploreEntryCard />

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
              onClick={() => navigate('/guide')}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              사용 안내
            </button>
            {isSiteAdmin && (
              <button
                onClick={() => navigate('/data')}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: 13 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                교육과정 데이터
              </button>
            )}
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
        ) : error ? (
          <div
            className="animate-fade-in"
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid #FCA5A5',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.8 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>
              {errorStatus === 401 ? '로그인이 만료되었습니다' : '워크스페이스를 불러오지 못했습니다'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 16px' }}>
              {errorStatus === 401
                ? '다시 로그인하면 기존 워크스페이스가 그대로 표시됩니다.'
                : '네트워크 상태를 확인하고 다시 시도해 주세요.'}
            </p>
            {errorStatus === 401 ? (
              <button onClick={handleLogout} className="btn btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>
                다시 로그인
              </button>
            ) : (
              <button onClick={() => fetchWorkspaces()} className="btn btn-secondary" style={{ fontSize: 13, padding: '8px 16px' }}>
                다시 시도
              </button>
            )}
          </div>
        ) : visibleWorkspaces.length === 0 ? (
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
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 20px' }}>
              워크스페이스는 함께 설계할 교사 팀의 공간입니다. 그 안에 수업별 프로젝트를 만듭니다
            </p>
            {/* 빈 화면에서 바로 다음 행동을 할 수 있게 — 상단 버튼까지 시선을 올리지 않아도 된다 */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowCreate(true)}
                className="btn btn-primary"
                style={{ padding: '10px 20px', fontSize: 14 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                워크스페이스 만들기
              </button>
              <button
                onClick={() => setShowJoinByLink(true)}
                className="btn btn-secondary"
                style={{ padding: '10px 20px', fontSize: 14 }}
              >
                초대 링크로 참여
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}>
            {visibleWorkspaces.map((ws, idx) => (
              <button
                key={ws.id}
                onClick={() => navigate(detailPath(ws.id))}
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
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>진행 방식</div>
                <ParticipationModePicker value={participationMode} onChange={setParticipationMode} disabled={creating} />
                <BriefModeToggle checked={briefMode} onChange={setBriefMode} disabled={creating} />
                <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '6px 0 0' }}>만든 뒤에도 워크스페이스 설정에서 바꿀 수 있습니다.</p>
              </div>
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
