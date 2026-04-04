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

const GRADE_OPTIONS = [
  { value: '초등5-6', label: '초등 5-6학년' },
  { value: '중학교', label: '중학교' },
  { value: '고등1-2', label: '고등학교 1-2학년' },
]

const SUBJECT_OPTIONS = [
  '국어', '수학', '사회', '과학', '영어', '도덕',
  '정보', '음악', '미술', '체육', '기술가정', '한문',
]

const PROGRESS_MESSAGES = [
  '교육과정을 분석하고 있습니다...',
  '융합 주제를 탐색하고 있습니다...',
  '학습 목표를 설계하고 있습니다...',
  '활동 구조를 구성하고 있습니다...',
  '평가 계획을 수립하고 있습니다...',
  '최종 점검 중입니다...',
]

export default function DemoMode() {
  const navigate = useNavigate()

  // 입력 폼
  const [grade, setGrade] = useState('')
  const [selectedSubjects, setSelectedSubjects] = useState([])
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')

  // 생성 상태
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState('')

  const toggleSubject = (subj) => {
    setSelectedSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    )
  }

  const canSubmit = grade && selectedSubjects.length >= 2 && topic.trim()

  // 프로그레스 애니메이션
  useEffect(() => {
    if (!generating) return
    let idx = 0
    const interval = setInterval(() => {
      idx = (idx + 1) % PROGRESS_MESSAGES.length
      setProgressMessage(PROGRESS_MESSAGES[idx])
      setProgress((p) => Math.min(p + Math.random() * 12 + 3, 92))
    }, 3000)
    return () => clearInterval(interval)
  }, [generating])

  const handleGenerate = async () => {
    setGenerating(true)
    setProgress(5)
    setProgressMessage(PROGRESS_MESSAGES[0])
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/demo/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade,
          subjects: selectedSubjects,
          topic: topic.trim(),
          description: description.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setProgress(100)

      // 데모 프로젝트로 이동
      setTimeout(() => {
        navigate(`/workspaces/${data.workspaceId}/projects/${data.projectId}?demo=true`)
      }, 600)
    } catch (err) {
      setError(err.message || '데모 생성 중 오류가 발생했습니다.')
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

              {/* 대상 학년 */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>대상 학년 *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {GRADE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGrade(opt.value)}
                      style={{
                        flex: 1, padding: '10px 8px',
                        border: `2px solid ${grade === opt.value ? '#3B82F6' : '#E5E7EB'}`,
                        borderRadius: 10,
                        background: grade === opt.value ? '#EFF6FF' : '#fff',
                        fontSize: 13, fontWeight: grade === opt.value ? 600 : 400,
                        color: grade === opt.value ? '#2563EB' : '#374151',
                        cursor: 'pointer', transition: 'all 0.15s',
                        fontFamily: 'var(--font-sans, inherit)',
                      }}
                    >
                      {opt.label}
                    </button>
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
              AI가 수업 설계를 시뮬레이션 중입니다
            </h2>
            <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 24px' }}>
              {progressMessage}
            </p>

            {/* 프로그레스 바 */}
            <div style={{
              height: 6, background: '#F3F4F6', borderRadius: 9999,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
                borderRadius: 9999,
                width: `${progress}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
              {Math.round(progress)}% 완료
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
