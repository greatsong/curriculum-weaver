// Pretendard Variable 폰트 로드
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'

import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'

// 즉시 로드 (핵심 페이지)
import LoginPage from './pages/LoginPage'
import ToastContainer from './components/ToastContainer'
import WorkspacesPage from './pages/WorkspacesPage'
import WorkspaceDetailPage from './pages/WorkspaceDetailPage'
import ProjectPage from './pages/ProjectPage'

/**
 * 청크 로드 실패 대응 lazy 래퍼.
 * 배포로 해시가 바뀌면 열어둔 옛 탭이 참조하는 lazy 청크가 사라져
 * (404 → SPA fallback으로 index.html/text-html 반환) "Failed to fetch
 * dynamically imported module" 흰 화면이 뜬다. 이 경우 1회만 새로고침해
 * 최신 index.html·청크를 받게 하고, 무한 리로드는 sessionStorage 플래그로 막는다.
 */
function lazyWithReload(factory, key) {
  const flag = `chunk-reloaded:${key}`
  return lazy(() =>
    factory()
      .then((mod) => {
        sessionStorage.removeItem(flag) // 성공 시 플래그 해제 → 세션 후반 재배포도 재복구
        return mod
      })
      .catch((err) => {
        if (!sessionStorage.getItem(flag)) {
          sessionStorage.setItem(flag, '1')
          window.location.reload()
          return new Promise(() => {}) // 리로드 완료까지 렌더 보류
        }
        throw err // 새로고침 후에도 실패하면 진짜 오류 → 상위로 전파
      })
  )
}

// 지연 로드
const DataManage = lazyWithReload(() => import('./pages/DataManage'), 'DataManage')
const GraphPage = lazyWithReload(() => import('./pages/GraphPage'), 'GraphPage')
const IntroPage = lazyWithReload(() => import('./pages/IntroPage'), 'IntroPage')
const DemoMode = lazyWithReload(() => import('./components/DemoMode'), 'DemoMode')
const DemoPrepPage = lazyWithReload(() => import('./pages/DemoPrepPage'), 'DemoPrepPage')
const GuidePage = lazyWithReload(() => import('./pages/GuidePage'), 'GuidePage')
const AuthCallback = lazyWithReload(() => import('./pages/AuthCallback'), 'AuthCallback')

// 레거시 호환: /session/:id 로 들어오면 워크스페이스로 돌려보냄
function LegacySessionRedirect() {
  return <Navigate to="/workspaces" replace />
}

/**
 * 인증 필수 라우트 래퍼
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

/**
 * 루트 경로 핸들러
 */
function HomeRoute() {
  const { user, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--color-border, #E5E7EB)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/workspaces" replace />
  }

  return <Navigate to="/login" replace />
}

/**
 * 이미 로그인된 사용자가 로그인 페이지 접근 시 리다이렉트
 */
function AuthRoute({ children }) {
  const { user, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--color-border, #E5E7EB)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/workspaces" replace />
  }

  return children
}

/**
 * 초대 수락 페이지
 */
function InviteAcceptPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [workspace, setWorkspace] = useState(null)

  useEffect(() => {
    async function accept() {
      try {
        const { useWorkspaceStore } = await import('./stores/workspaceStore')
        const ws = await useWorkspaceStore.getState().acceptInvite(token)
        setWorkspace(ws)
        setStatus('success')
        setTimeout(() => navigate(`/workspaces/${ws.id}`), 3000)
      } catch (err) {
        setError(err.message)
        setStatus('error')
      }
    }
    accept()
  }, [token, navigate])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">초대를 처리 중입니다...</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm mx-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-red-600 text-xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">초대 수락 실패</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => navigate('/workspaces')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            워크스페이스 목록으로
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-sm mx-4">
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">참여 완료</h2>
        <p className="text-sm text-gray-500 mb-4">
          {workspace?.name || '워크스페이스'}에 참여했습니다.
          <br />잠시 후 자동으로 이동합니다.
        </p>
        <button
          onClick={() => navigate(`/workspaces/${workspace?.id}`)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          바로 이동
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const { initialize, cleanup } = useAuthStore()

  useEffect(() => {
    initialize()
    return () => cleanup()
  }, [])

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      {/* 전역 토스트 — 라우트와 무관하게 항상 마운트 (자료 분석 완료 알림 등) */}
      <ToastContainer />
      <Routes>
        {/* 홈 */}
        <Route path="/" element={<HomeRoute />} />

        {/* 인증 */}
        <Route
          path="/login"
          element={
            <AuthRoute>
              <LoginPage />
            </AuthRoute>
          }
        />

        {/* OAuth 콜백 (공개) */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* 인트로 (공개) */}
        <Route path="/intro" element={<IntroPage />} />

        {/* AI 시뮬레이션 (로그인 필수) */}
        <Route path="/demo" element={<DemoMode />} />

        {/* 시연 모드(임용 실연 준비) 진입 — 개인 워크스페이스+demo 프로젝트 부트스트랩 */}
        <Route
          path="/demo-prep"
          element={
            <ProtectedRoute>
              <DemoPrepPage />
            </ProtectedRoute>
          }
        />

        {/* 워크스페이스 */}
        <Route
          path="/workspaces"
          element={
            <ProtectedRoute>
              <WorkspacesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspaces/:workspaceId"
          element={
            <ProtectedRoute>
              <WorkspaceDetailPage />
            </ProtectedRoute>
          }
        />

        {/* 프로젝트 (메인 작업 공간) */}
        <Route
          path="/workspaces/:workspaceId/projects/:projectId"
          element={
            <ProtectedRoute>
              <ProjectPage />
            </ProtectedRoute>
          }
        />

        {/* 초대 수락 */}
        <Route
          path="/invite/:token"
          element={
            <ProtectedRoute>
              <InviteAcceptPage />
            </ProtectedRoute>
          }
        />

        {/* 관리 (관리자) */}
        <Route
          path="/data"
          element={
            <ProtectedRoute>
              <DataManage />
            </ProtectedRoute>
          }
        />

        {/* 공개 페이지 */}
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/graph" element={<GraphPage />} />

        {/* 레거시 호환: /session/:id */}
        <Route path="/session/:sessionId" element={<LegacySessionRedirect />} />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
