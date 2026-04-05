/**
 * DemoMode -- AI 수업 설계 시뮬레이션
 *
 * 로그인 사용자 전용. 워크스페이스를 선택하고 기초 정보를 입력하면
 * AI가 19개 절차의 설계를 자동 생성하여 Supabase 프로젝트로 저장.
 * SSE 스트리밍으로 절차별 실시간 진행률을 표시한다.
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from './Logo'
import { API_BASE, apiGet, getHeaders } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

const GRADE_GROUPS = [
  {
    label: '초등',
    grades: [
      { value: '초5', label: '5학년' },
      { value: '초6', label: '6학년' },
    ],
  },
  {
    label: '중학교',
    grades: [
      { value: '중1', label: '1학년' },
      { value: '중2', label: '2학년' },
      { value: '중3', label: '3학년' },
    ],
  },
  {
    label: '고등학교',
    grades: [
      { value: '고1', label: '1학년' },
      { value: '고2', label: '2학년' },
      { value: '고3', label: '3학년' },
    ],
  },
]

const SUBJECT_OPTIONS = [
  '국어', '수학', '사회', '과학', '영어', '도덕',
  '정보', '음악', '미술', '체육', '기술가정', '한문',
]

export default function DemoMode() {
  const navigate = useNavigate()
  const { user, initialized } = useAuthStore()

  // 워크스페이스
  const [workspaces, setWorkspaces] = useState([])
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [loadingWs, setLoadingWs] = useState(false)

  // 입력 폼
  const [selectedGrades, setSelectedGrades] = useState([])
  const [selectedSubjects, setSelectedSubjects] = useState([])
  const [customSubject, setCustomSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')

  // 생성 상태
  const [generating, setGenerating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [partialProject, setPartialProject] = useState(null) // { projectId, workspaceId, savedBoards }

  // SSE 진행률
  const [progressList, setProgressList] = useState([])
  const [progressTotal, setProgressTotal] = useState(19)
  const [tokenCount, setTokenCount] = useState(0)
  const [currentPhase, setCurrentPhase] = useState('')
  const abortRef = useRef(null)

  // 미로그인 → 로그인 페이지로
  useEffect(() => {
    if (initialized && !user) {
      navigate('/login', { state: { from: '/demo' } })
    }
  }, [initialized, user, navigate])

  // 워크스페이스 목록 로드
  useEffect(() => {
    if (!user) return
    setLoadingWs(true)
    apiGet('/api/workspaces')
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.workspaces ?? [])
        setWorkspaces(list)
        if (list.length === 1) setSelectedWorkspace(list[0].id)
      })
      .catch(() => setWorkspaces([]))
      .finally(() => setLoadingWs(false))
  }, [user])

  const toggleGrade = (val) => {
    setSelectedGrades((prev) =>
      prev.includes(val) ? prev.filter((g) => g !== val) : [...prev, val]
    )
  }

  const toggleSubject = (subj) => {
    setSelectedSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    )
  }

  const addCustomSubject = () => {
    const trimmed = customSubject.trim()
    if (trimmed && !selectedSubjects.includes(trimmed) && !SUBJECT_OPTIONS.includes(trimmed)) {
      setSelectedSubjects((prev) => [...prev, trimmed])
      setCustomSubject('')
    }
  }

  const canSubmit = selectedWorkspace && selectedGrades.length > 0 && selectedSubjects.length >= 2 && topic.trim()

  // 경과 시간 카운터
  useEffect(() => {
    if (!generating) return
    setElapsed(0)
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(interval)
  }, [generating])

  const handleGenerate = async () => {
    setGenerating(true)
    setElapsed(0)
    setError('')
    setProgressList([])
    setCurrentPhase('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const headers = await getHeaders()
      const res = await fetch(`${API_BASE}/api/demo/generate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: selectedWorkspace,
          grade: selectedGrades.join(', '),
          subjects: selectedSubjects,
          topic: topic.trim(),
          description: description.trim(),
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      // SSE 스트리밍 읽기
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const parsed = JSON.parse(line.slice(6))

            if (parsed.type === 'started') {
              setPartialProject({ projectId: parsed.projectId, workspaceId: parsed.workspaceId, savedBoards: 0 })
            } else if (parsed.type === 'progress') {
              setProgressList((prev) => [...prev, parsed])
              setProgressTotal(parsed.total)
            } else if (parsed.type === 'heartbeat') {
              setTokenCount(parsed.tokens)
              if (parsed.phase) setCurrentPhase(parsed.phase)
            } else if (parsed.type === 'phase_complete') {
              setPartialProject((prev) => prev ? { ...prev, savedBoards: (prev.savedBoards || 0) + parsed.saved } : prev)
            } else if (parsed.type === 'complete') {
              setTimeout(() => {
                navigate(`/workspaces/${parsed.workspaceId}/projects/${parsed.projectId}`)
              }, 800)
              return
            } else if (parsed.type === 'partial_failure') {
              setPartialProject({ projectId: parsed.projectId, workspaceId: parsed.workspaceId, savedBoards: parsed.savedBoards })
              setError(parsed.message || `${parsed.savedBoards}개만 저장되어 생성에 실패했습니다.`)
              setGenerating(false)
              return
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message)
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('생성이 취소되었습니다.')
      } else if (partialProject?.projectId) {
        // SSE 연결 끊김 (모바일 백그라운드 등) — 서버는 계속 생성 중일 수 있음
        // 프로젝트 상태를 폴링하여 완료 여부 확인
        console.log('[demo] SSE 끊김 — 서버 완료 대기 폴링 시작')
        setError('')
        setCurrentPhase('서버에서 생성 완료 대기 중...')
        const pollInterval = setInterval(async () => {
          try {
            const proj = await apiGet(`/api/projects/${partialProject.projectId}`)
            if (proj?.status === 'simulation') {
              clearInterval(pollInterval)
              navigate(`/workspaces/${partialProject.workspaceId}/projects/${partialProject.projectId}`)
            } else if (proj?.status === 'failed') {
              clearInterval(pollInterval)
              setError('서버에서 생성이 실패했습니다.')
              setGenerating(false)
            }
          } catch {
            // 폴링 실패는 무시 (다음 시도에서 재시도)
          }
        }, 5000) // 5초마다 확인
        // 5분 후 타임아웃
        setTimeout(() => {
          clearInterval(pollInterval)
          if (generating) {
            setError('생성 시간이 초과되었습니다. 워크스페이스에서 프로젝트를 확인해주세요.')
            setGenerating(false)
          }
        }, 5 * 60 * 1000)
        return
      } else {
        setError(err.message || '데모 생성 중 오류가 발생했습니다.')
      }
      setGenerating(false)
    }
  }

  const progressPercent = progressList.length > 0
    ? Math.round((progressList.length / progressTotal) * 100)
    : 0
  const lastProgress = progressList[progressList.length - 1]

  // 미로그인 시 로딩 표시
  if (!initialized || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
        <div style={{ width: 28, height: 28, border: '3px solid #E5E7EB', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F0F4FF 0%, #FFF7ED 100%)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 헤더 */}
      <header style={{
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate('/') }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
        >
          <Logo size={24} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>커리큘럼 위버</span>
        </a>
        <button
          onClick={() => navigate('/workspaces')}
          style={{
            padding: '8px 16px', background: '#111827', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-sans, inherit)',
            transition: 'background 0.15s',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#374151'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#111827'}
        >
          {user.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url}
              alt=""
              style={{ width: 20, height: 20, borderRadius: '50%' }}
            />
          )}
          내 워크스페이스
        </button>
      </header>

      {/* 메인 */}
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
      }}>
        {!generating ? (
          <div style={{
            width: '100%',
            maxWidth: 520,
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}>
            {/* 타이틀 */}
            <div style={{
              background: 'linear-gradient(135deg, #111827 0%, #1E3A5F 100%)',
              padding: '28px 32px',
              color: '#fff',
            }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>
                AI 수업 설계 시뮬레이션
              </h1>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                기초 정보를 입력하면 AI가 19개 절차의 설계를 자동으로 생성합니다
              </p>
            </div>

            <div style={{ padding: '28px 32px' }}>
              {/* 에러 + 부분 생성 복구 */}
              {error && (
                <div style={{
                  padding: '10px 14px', marginBottom: 16,
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 10, fontSize: 13, color: '#DC2626',
                }}>
                  {error}
                  {partialProject?.savedBoards > 0 && (
                    <button
                      onClick={() => navigate(`/workspaces/${partialProject.workspaceId}/projects/${partialProject.projectId}`)}
                      style={{
                        display: 'block', marginTop: 8, padding: '6px 14px',
                        background: '#fff', border: '1px solid #FECACA', borderRadius: 6,
                        fontSize: 12, color: '#DC2626', cursor: 'pointer',
                        fontFamily: 'var(--font-sans, inherit)',
                      }}
                    >
                      부분 생성된 프로젝트 보기 ({partialProject.savedBoards}개 절차)
                    </button>
                  )}
                </div>
              )}

              {/* 워크스페이스 선택 */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>저장할 워크스페이스 *</label>
                {loadingWs ? (
                  <div style={{ fontSize: 13, color: '#9CA3AF' }}>워크스페이스 목록 로딩 중...</div>
                ) : workspaces.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#EF4444' }}>
                    워크스페이스가 없습니다. 먼저 <a href="/workspaces" onClick={(e) => { e.preventDefault(); navigate('/workspaces') }} style={{ color: '#3B82F6' }}>워크스페이스를 생성</a>하세요.
                  </div>
                ) : (
                  <select
                    value={selectedWorkspace}
                    onChange={(e) => setSelectedWorkspace(e.target.value)}
                    style={{
                      ...inputStyle,
                      cursor: 'pointer',
                      appearance: 'auto',
                    }}
                  >
                    <option value="">워크스페이스를 선택하세요</option>
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>{ws.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* 대상 학년 (복수 선택) */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>대상 학년 * (복수 선택 가능)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {GRADE_GROUPS.map((group) => (
                    <div key={group.label}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4, display: 'block' }}>
                        {group.label}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {group.grades.map((g) => {
                          const active = selectedGrades.includes(g.value)
                          return (
                            <button
                              key={g.value}
                              onClick={() => toggleGrade(g.value)}
                              style={{
                                padding: '7px 16px',
                                border: `1.5px solid ${active ? '#3B82F6' : '#E5E7EB'}`,
                                borderRadius: 8,
                                background: active ? '#EFF6FF' : '#fff',
                                fontSize: 13, fontWeight: active ? 600 : 400,
                                color: active ? '#2563EB' : '#374151',
                                cursor: 'pointer', transition: 'all 0.15s',
                                fontFamily: 'var(--font-sans, inherit)',
                              }}
                            >
                              {g.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 참여 교과 */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>참여 교과 * (2개 이상)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SUBJECT_OPTIONS.map((subj) => {
                    const active = selectedSubjects.includes(subj)
                    return (
                      <button
                        key={subj}
                        onClick={() => toggleSubject(subj)}
                        style={{
                          padding: '6px 14px',
                          border: `1.5px solid ${active ? '#3B82F6' : '#E5E7EB'}`,
                          borderRadius: 9999,
                          background: active ? '#EFF6FF' : '#fff',
                          fontSize: 12, fontWeight: active ? 600 : 400,
                          color: active ? '#2563EB' : '#6B7280',
                          cursor: 'pointer', transition: 'all 0.15s',
                          fontFamily: 'var(--font-sans, inherit)',
                        }}
                      >
                        {subj}
                      </button>
                    )
                  })}
                  {selectedSubjects
                    .filter((s) => !SUBJECT_OPTIONS.includes(s))
                    .map((subj) => (
                      <button
                        key={subj}
                        onClick={() => toggleSubject(subj)}
                        style={{
                          padding: '6px 14px',
                          border: '1.5px solid #3B82F6',
                          borderRadius: 9999,
                          background: '#EFF6FF',
                          fontSize: 12, fontWeight: 600,
                          color: '#2563EB',
                          cursor: 'pointer', transition: 'all 0.15s',
                          fontFamily: 'var(--font-sans, inherit)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {subj} <span style={{ fontSize: 14, lineHeight: 1 }}>x</span>
                      </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomSubject())}
                    placeholder="교과명 직접 입력"
                    style={{
                      ...inputStyle, flex: 1, padding: '6px 12px', fontSize: 12,
                      marginBottom: 0,
                    }}
                  />
                  <button
                    type="button"
                    onClick={addCustomSubject}
                    disabled={!customSubject.trim()}
                    style={{
                      padding: '6px 14px', border: '1px solid #D1D5DB', borderRadius: 8,
                      background: customSubject.trim() ? '#F3F4F6' : '#fff',
                      fontSize: 12, color: '#374151', cursor: customSubject.trim() ? 'pointer' : 'default',
                      fontFamily: 'var(--font-sans, inherit)', whiteSpace: 'nowrap',
                    }}
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* 주제 키워드 */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>주제 키워드 *</label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value.slice(0, 100))}
                  placeholder="예: 기후변화, AI 윤리, 지역사회 문제..."
                  maxLength={100}
                  style={inputStyle}
                />
              </div>

              {/* 설명 (선택) */}
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>간략한 설명 (선택)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  placeholder="수업의 목표나 특별히 고려할 사항이 있다면 입력하세요"
                  rows={2}
                  maxLength={500}
                  style={{ ...inputStyle, resize: 'none' }}
                />
              </div>

              {/* 제출 */}
              <button
                onClick={handleGenerate}
                disabled={!canSubmit}
                style={{
                  width: '100%', padding: '14px 24px',
                  background: canSubmit ? '#111827' : '#D1D5DB',
                  color: '#fff', border: 'none', borderRadius: 12,
                  fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                  fontFamily: 'var(--font-sans, inherit)',
                }}
                onMouseEnter={(e) => canSubmit && (e.currentTarget.style.background = '#374151')}
                onMouseLeave={(e) => canSubmit && (e.currentTarget.style.background = '#111827')}
              >
                시뮬레이션 시작
              </button>
            </div>
          </div>
        ) : (
          /* 로딩 화면 — 실시간 진행률 */
          <div style={{
            width: '100%',
            maxWidth: 480,
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
            padding: '40px 36px',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 16px' }}>
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="35" fill="none" stroke="#E5E7EB" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="35" fill="none"
                    stroke="#3B82F6" strokeWidth="6"
                    strokeDasharray={`${2 * Math.PI * 35}`}
                    strokeDashoffset={`${2 * Math.PI * 35 * (1 - progressPercent / 100)}`}
                    strokeLinecap="round"
                    transform="rotate(-90 40 40)"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                  />
                </svg>
                <span style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700, color: '#111827',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {progressPercent}%
                </span>
              </div>

              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
                AI가 수업을 설계하고 있습니다
              </h2>
              <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
                {progressList.length === 0
                  ? 'AI에게 수업 설계를 요청했습니다...'
                  : `${progressList.length}/${progressTotal}개 절차 완료`
                }
              </p>
              {currentPhase && (
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                  {currentPhase === '1차' ? '준비~분석 단계 생성 중' : '설계~평가 단계 생성 중'}
                </p>
              )}
            </div>

            {/* 절차 진행 로그 */}
            <div style={{
              background: '#F9FAFB', borderRadius: 12, padding: '14px 16px',
              maxHeight: 220, overflowY: 'auto', marginBottom: 20,
              border: '1px solid #F3F4F6',
            }}>
              {progressList.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid #E5E7EB', borderTopColor: '#3B82F6',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <span style={{ fontSize: 13, color: '#9CA3AF' }}>
                    {tokenCount > 0 ? `AI 생성 중... (${tokenCount.toLocaleString()}토큰)` : '응답 대기 중...'}
                  </span>
                </div>
              ) : (
                progressList.map((p) => (
                  <div key={p.procedure} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '3px 0',
                    animation: 'fadeIn 0.3s ease',
                  }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#10B981', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      ✓
                    </span>
                    <span style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace', minWidth: 44 }}>
                      {p.procedure}
                    </span>
                    <span style={{ fontSize: 12, color: '#374151' }}>{p.name}</span>
                  </div>
                ))
              )}
              {progressList.length > 0 && progressList.length < progressTotal && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: '2px solid #E5E7EB', borderTopColor: '#3B82F6',
                    animation: 'spin 0.8s linear infinite', flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {lastProgress?.nextName
                      ? `${lastProgress.nextProcedure} ${lastProgress.nextName} 생성 중...`
                      : '마무리 중...'}
                    {tokenCount > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#D1D5DB' }}>({tokenCount.toLocaleString()}토큰)</span>}
                  </span>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 14, color: '#9CA3AF',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} 경과
              </span>
              <button
                onClick={() => abortRef.current?.abort()}
                style={{
                  padding: '8px 20px', background: 'transparent', color: '#9CA3AF',
                  border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'var(--font-sans, inherit)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = '#FCA5A5' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = '#E5E7EB' }}
              >
                생성 취소
              </button>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }
const inputStyle = {
  width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box',
  borderRadius: 10, border: '1px solid #D1D5DB', outline: 'none',
  fontFamily: 'var(--font-sans, inherit)',
}
