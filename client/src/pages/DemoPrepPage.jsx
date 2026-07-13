import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiPost } from '../lib/api'
import Logo from '../components/Logo'

/**
 * 시연 모드(임용 2차 수업 실연 준비) 진입점.
 *
 * 팀/워크스페이스/초대/닉네임 계층 없이, 개인 워크스페이스 + demo 프로젝트를
 * 서버에서 idempotent하게 확보(POST /api/demo/bootstrap)한 뒤 곧바로 프로젝트
 * 작업 공간(ProjectPage)으로 이동한다.
 *
 * Stage 0(골격): 부트스트랩 + 이동만 담당. 시연 전용 스텝 네비/보드 UI는 이후 단계에서 확장.
 */
export default function DemoPrepPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    // React StrictMode의 이중 effect 호출에서도 부트스트랩이 한 번만 실행되도록 ref로 가드.
    // (effect 로컬 cancelled 플래그로 네비게이션을 막으면, 첫 호출의 cleanup이 cancelled를
    //  세운 뒤 두 번째 호출은 ref 가드로 조기 반환해 navigate가 영영 안 되는 함정이 있다.)
    if (startedRef.current) return
    startedRef.current = true

    ;(async () => {
      try {
        const { workspaceId, projectId } = await apiPost('/api/demo/bootstrap', {})
        if (!workspaceId || !projectId) throw new Error('시연 준비 공간을 확인하지 못했습니다.')
        navigate(`/workspaces/${workspaceId}/projects/${projectId}`, { replace: true })
      } catch (err) {
        setError(err.message || '시연 준비 공간을 준비하지 못했습니다.')
      }
    })()
  }, [navigate])

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-bg-primary)', padding: 24 }}
    >
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Logo size={40} />
        </div>
        {error ? (
          <>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
              시연 준비 공간을 열지 못했어요
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 20px', lineHeight: 1.6 }}>
              {error}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => { startedRef.current = false; setError(''); navigate(0) }}
                className="btn btn-primary"
                style={{ fontSize: 13, padding: '8px 16px' }}
              >
                다시 시도
              </button>
              <button
                onClick={() => navigate('/workspaces')}
                className="btn btn-secondary"
                style={{ fontSize: 13, padding: '8px 16px' }}
              >
                워크스페이스로
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{
              width: 28,
              height: 28,
              border: '3px solid var(--color-border)',
              borderTopColor: '#8B5CF6',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 14px',
            }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>
              임용 실연 준비 공간을 여는 중...
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', margin: 0 }}>
              혼자 쓰는 준비 공간을 확인하고 있어요
            </p>
          </>
        )}
      </div>
    </div>
  )
}
