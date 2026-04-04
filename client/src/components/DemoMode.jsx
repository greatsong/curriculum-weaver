/**
 * DemoMode -- 시뮬레이션 데모 모드
 *
 * 로그인 없이 AI가 자동으로 19절차 보드를 생성하는 데모.
 * 교사가 기초 정보를 입력하면 AI가 전체 설계를 시뮬레이션한다.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from './Logo'
import { API_BASE } from '../lib/api'
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

// 정직한 상태 메시지 (경과 시간에 따라 변경)
const STATUS_BY_ELAPSED = [
  { at: 0,   msg: 'AI에게 19개 절차의 수업 설계를 요청했습니다...' },
  { at: 15,  msg: 'AI가 응답을 생성하고 있습니다. 보통 2~4분 정도 걸려요.' },
  { at: 45,  msg: '아직 생성 중입니다. 복잡한 설계일수록 시간이 더 걸립니다.' },
  { at: 90,  msg: '거의 다 됐습니다. 잠시만 기다려주세요...' },
  { at: 150, msg: '평소보다 오래 걸리고 있습니다. 조금만 더 기다려주세요.' },
  { at: 240, msg: '응답 대기 중입니다. 최대 5분까지 소요될 수 있습니다.' },
]

export default function DemoMode() {
  const navigate = useNavigate()
  const { user, initialized } = useAuthStore()

  // 입력 폼
  const [selectedGrades, setSelectedGrades] = useState([])
  const [selectedSubjects, setSelectedSubjects] = useState([])
  const [customSubject, setCustomSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')

  // 생성 상태
  const [generating, setGenerating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')

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

  const canSubmit = selectedGrades.length > 0 && selectedSubjects.length >= 2 && topic.trim()

  // 경과 시간 카운터 + 상태 메시지
  useEffect(() => {
    if (!generating) return
    setElapsed(0)
    const interval = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1
        // 경과 시간에 맞는 메시지 선택
        const status = [...STATUS_BY_ELAPSED].reverse().find((s) => next >= s.at)
        if (status) setStatusMessage(status.msg)
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [generating])

  const handleGenerate = async () => {
    setGenerating(true)
    setElapsed(0)
    setStatusMessage(STATUS_BY_ELAPSED[0].msg)
    setError('')

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 300_000) // 5분 타임아웃
      const res = await fetch(`${API_BASE}/api/demo/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: selectedGrades.join(', '),
          subjects: selectedSubjects,
          topic: topic.trim(),
          description: description.trim(),
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      // 데모 결과 프로젝트로 이동 (워크스페이스 경유 없이)
      setTimeout(() => {
        navigate(`/demo/result/${data.projectId}`)
      }, 600)
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')
      } else {
        setError(err.message || '데모 생성 중 오류가 발생했습니다.')
      }
      setGenerating(false)
    }
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
        {initialized && user ? (
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
        ) : (
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '8px 16px', background: '#111827', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans, inherit)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#374151'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#111827'}
          >
            로그인
          </button>
        )}
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
              {/* 에러 */}
              {error && (
                <div style={{
                  padding: '10px 14px', marginBottom: 16,
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 10, fontSize: 13, color: '#DC2626',
                }}>
                  {error}
                </div>
              )}

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
                  {/* 사용자 직접 추가한 교과 */}
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
                        {subj} <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
                      </button>
                    ))}
                </div>
                {/* 교과 직접 입력 */}
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
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="예: 기후변화, AI 윤리, 지역사회 문제..."
                  style={inputStyle}
                />
              </div>

              {/* 설명 (선택) */}
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>간략한 설명 (선택)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="수업의 목표나 특별히 고려할 사항이 있다면 입력하세요"
                  rows={2}
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
                데모 시작
              </button>

              <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 12 }}>
                실제 프로젝트를 시작하려면 로그인 후 워크스페이스를 만드세요
              </p>
            </div>
          </div>
        ) : (
          /* 로딩 화면 */
          <div style={{
            width: '100%',
            maxWidth: 440,
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
            padding: '48px 40px',
            textAlign: 'center',
          }}>
            {/* 스피너 */}
            <div style={{
              width: 64, height: 64,
              borderRadius: '50%',
              border: '4px solid #E5E7EB',
              borderTopColor: '#3B82F6',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 24px',
            }} />

            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
              AI가 수업 설계를 생성하고 있습니다
            </h2>
            <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 20px' }}>
              {statusMessage}
            </p>

            {/* 경과 시간 */}
            <p style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </p>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
              경과 시간
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }
const inputStyle = {
  width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box',
  borderRadius: 10, border: '1px solid #D1D5DB', outline: 'none',
  fontFamily: 'var(--font-sans, inherit)',
}
