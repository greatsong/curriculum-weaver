/**
 * HostSetupWizard -- 호스트 워크스페이스 초기 설정 위자드
 *
 * 워크스페이스 생성 직후 또는 프로젝트가 없을 때 표시.
 * 5단계: 기본정보 -> AI설정 -> 워크플로우 -> 팀원초대 -> 완료
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROCEDURES, PHASES, PROCEDURE_LIST } from 'curriculum-weaver-shared/constants.js'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useProjectStore } from '../stores/projectStore'

const WIZARD_STEPS = [
  { id: 'info', title: '기본 정보', icon: '1' },
  { id: 'ai', title: 'AI 설정', icon: '2' },
  { id: 'workflow', title: '워크플로우', icon: '3' },
  { id: 'invite', title: '팀원 초대', icon: '4' },
  { id: 'done', title: '완료', icon: '5' },
]

// 워크플로우 프리셋
const WORKFLOW_PRESETS = {
  elementary: {
    label: '초등학교 간소화',
    description: '핵심 절차만 남기고 간소화',
    hidden: ['T-2-2', 'T-2-3', 'Ds-2-1', 'Ds-2-2', 'DI-1-1', 'E-2-1'],
  },
  secondary: {
    label: '중등 전체',
    description: '모든 절차를 사용',
    hidden: [],
  },
  custom: {
    label: '커스텀',
    description: '직접 선택',
    hidden: null,
  },
}

export default function HostSetupWizard({ workspaceId, workspace, onComplete, onDismiss }) {
  const navigate = useNavigate()
  const { inviteMember } = useWorkspaceStore()
  const { createProject } = useProjectStore()

  const [step, setStep] = useState(0)

  // Step 1: 기본 정보
  const [description, setDescription] = useState(workspace?.description || '')
  const [targetGrade, setTargetGrade] = useState('')

  // Step 2: AI 설정
  const [aiModel, setAiModel] = useState('claude-sonnet-4-20250514')
  const [enabledAI, setEnabledAI] = useState({ guide: true, generate: true, check: true, record: true })

  // Step 3: 워크플로우
  const [selectedPreset, setSelectedPreset] = useState('secondary')
  const [hiddenProcedures, setHiddenProcedures] = useState([])

  // Step 4: 초대
  const [inviteEmails, setInviteEmails] = useState([''])
  const [inviting, setInviting] = useState(false)

  const currentWizardStep = WIZARD_STEPS[step]

  const handlePresetChange = (preset) => {
    setSelectedPreset(preset)
    const p = WORKFLOW_PRESETS[preset]
    if (p.hidden !== null) {
      setHiddenProcedures(p.hidden)
    }
  }

  const toggleProcedure = (code) => {
    setSelectedPreset('custom')
    setHiddenProcedures((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const handleInvite = async () => {
    setInviting(true)
    const validEmails = inviteEmails.filter((e) => e.trim() && e.includes('@'))
    for (const email of validEmails) {
      try {
        await inviteMember(workspaceId, email.trim(), 'member')
      } catch {
        // 실패는 무시하고 진행
      }
    }
    setInviting(false)
    setStep(4)
  }

  const handleFinish = useCallback(() => {
    onComplete?.({
      aiConfig: { model: aiModel },
      hiddenProcedures,
      enabledAI,
      targetGrade,
    })
  }, [aiModel, hiddenProcedures, enabledAI, targetGrade, onComplete])

  const handleCreateProjectAndFinish = async () => {
    try {
      const project = await createProject(workspaceId, {
        title: `${targetGrade || ''} 융합수업 설계`.trim(),
        description: description || '',
      })
      handleFinish()
      navigate(`/workspaces/${workspaceId}/projects/${project.id}`)
    } catch (err) {
      alert(`프로젝트 생성 실패: ${err.message}`)
    }
  }

  const goNext = () => step < WIZARD_STEPS.length - 1 && setStep(step + 1)
  const goPrev = () => step > 0 && setStep(step - 1)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)' }} onClick={onDismiss} />
      <div
        className="animate-slide-up"
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 25px 80px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        {/* 프로그레스 */}
        <div style={{ height: 3, background: '#E5E7EB' }}>
          <div style={{
            height: '100%',
            background: '#3B82F6',
            width: `${((step + 1) / WIZARD_STEPS.length) * 100}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* 스텝 인디케이터 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '20px 24px 0' }}>
          {WIZARD_STEPS.map((ws, i) => (
            <div
              key={ws.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: i <= step ? '#3B82F6' : '#9CA3AF',
                fontWeight: i === step ? 600 : 400,
              }}
            >
              <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                background: i < step ? '#3B82F6' : i === step ? '#EFF6FF' : '#F3F4F6',
                color: i < step ? '#fff' : i === step ? '#3B82F6' : '#9CA3AF',
                border: i === step ? '2px solid #3B82F6' : '2px solid transparent',
                transition: 'all 0.3s',
              }}>
                {i < step ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                ) : ws.icon}
              </div>
              <span className="hidden sm:inline">{ws.title}</span>
              {i < WIZARD_STEPS.length - 1 && (
                <div style={{ width: 20, height: 1, background: i < step ? '#3B82F6' : '#E5E7EB' }} className="hidden sm:block" />
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: '24px 32px 32px' }}>
          {/* Step 1: 기본 정보 */}
          {step === 0 && (
            <div>
              <h2 style={titleStyle}>워크스페이스 기본 정보</h2>
              <p style={descStyle}>이미 입력한 이름 외에 추가 정보를 입력하세요.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
                <div>
                  <label style={labelStyle}>워크스페이스 이름</label>
                  <input
                    value={workspace?.name || ''}
                    disabled
                    style={{ ...inputStyle, background: '#F9FAFB', color: '#9CA3AF' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>설명</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="어떤 융합수업을 설계할 예정인가요?"
                    rows={2}
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>대상 학년</label>
                  <select value={targetGrade} onChange={(e) => setTargetGrade(e.target.value)} style={inputStyle}>
                    <option value="">선택하세요</option>
                    <option value="초등3-4">초등 3-4학년</option>
                    <option value="초등5-6">초등 5-6학년</option>
                    <option value="중학교">중학교</option>
                    <option value="고등1-2">고등학교 1-2학년</option>
                    <option value="고등3">고등학교 3학년</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: AI 설정 */}
          {step === 1 && (
            <div>
              <h2 style={titleStyle}>AI 설정</h2>
              <p style={descStyle}>AI 모델과 역할을 설정합니다.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
                <div>
                  <label style={labelStyle}>AI 모델</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', desc: '기본, 빠른 응답 속도', badge: '추천' },
                      { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', desc: '최고 품질, 응답이 느릴 수 있음', badge: null },
                    ].map(({ value, label, desc, badge }) => (
                      <label
                        key={value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 16px',
                          border: `2px solid ${aiModel === value ? '#3B82F6' : '#E5E7EB'}`,
                          borderRadius: 12,
                          cursor: 'pointer',
                          background: aiModel === value ? '#EFF6FF' : '#fff',
                          transition: 'all 0.15s',
                        }}
                      >
                        <input
                          type="radio"
                          name="aiModel"
                          value={value}
                          checked={aiModel === value}
                          onChange={() => setAiModel(value)}
                          style={{ accentColor: '#3B82F6' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{label}</span>
                            {badge && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 9999, background: '#DBEAFE', color: '#2563EB', fontWeight: 600 }}>{badge}</span>}
                          </div>
                          <span style={{ fontSize: 12, color: '#6B7280' }}>{desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>AI 역할</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { key: 'guide', label: '안내', desc: '단계 설명', color: '#3B82F6' },
                      { key: 'generate', label: '생성', desc: '초안/예시', color: '#F59E0B' },
                      { key: 'check', label: '점검', desc: '정합성 검토', color: '#22C55E' },
                      { key: 'record', label: '기록', desc: '자동 저장', color: '#6B7280' },
                    ].map(({ key, label, desc, color }) => (
                      <label
                        key={key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: `1px solid ${enabledAI[key] ? color + '40' : '#E5E7EB'}`,
                          background: enabledAI[key] ? color + '08' : '#fff',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={enabledAI[key]}
                          onChange={() => setEnabledAI((prev) => ({ ...prev, [key]: !prev[key] }))}
                          style={{ accentColor: color, width: 16, height: 16 }}
                        />
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</span>
                          <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>({desc})</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: 워크플로우 */}
          {step === 2 && (
            <div>
              <h2 style={titleStyle}>워크플로우 설정</h2>
              <p style={descStyle}>사용할 절차를 선택하세요. 프리셋으로 빠르게 설정할 수 있습니다.</p>

              {/* 프리셋 */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 16 }}>
                {Object.entries(WORKFLOW_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => handlePresetChange(key)}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      border: `2px solid ${selectedPreset === key ? '#3B82F6' : '#E5E7EB'}`,
                      borderRadius: 10,
                      background: selectedPreset === key ? '#EFF6FF' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      fontFamily: 'var(--font-sans, inherit)',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: selectedPreset === key ? '#2563EB' : '#374151' }}>{preset.label}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{preset.description}</div>
                  </button>
                ))}
              </div>

              {/* 절차 목록 */}
              <div style={{ maxHeight: 280, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {PROCEDURE_LIST.map((proc) => {
                  const phase = Object.values(PHASES).find((p) => p.id === proc.phase)
                  const isHidden = hiddenProcedures.includes(proc.code)
                  return (
                    <label
                      key={proc.code}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '6px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        opacity: isHidden ? 0.45 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggleProcedure(proc.code)}
                        style={{ accentColor: phase?.color || '#3B82F6', width: 15, height: 15 }}
                      />
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        width: 40,
                        textAlign: 'center',
                        padding: '2px 0',
                        borderRadius: 4,
                        background: (phase?.color || '#3B82F6') + '14',
                        color: phase?.color || '#3B82F6',
                        flexShrink: 0,
                      }}>
                        {proc.code}
                      </span>
                      <span style={{ fontSize: 13, color: '#374151' }}>{proc.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 4: 팀원 초대 */}
          {step === 3 && (
            <div>
              <h2 style={titleStyle}>팀원 초대</h2>
              <p style={descStyle}>동료 선생님의 이메일을 입력하여 초대하세요. 나중에 해도 됩니다.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                {inviteEmails.map((email, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const updated = [...inviteEmails]
                        updated[i] = e.target.value
                        setInviteEmails(updated)
                      }}
                      placeholder="teacher@school.edu"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    {inviteEmails.length > 1 && (
                      <button
                        onClick={() => setInviteEmails(inviteEmails.filter((_, j) => j !== i))}
                        style={{
                          width: 36, height: 36, border: '1px solid #E5E7EB', borderRadius: 8,
                          background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#9CA3AF', fontSize: 16,
                        }}
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setInviteEmails([...inviteEmails, ''])}
                  style={{
                    padding: '8px 16px', border: '1px dashed #D1D5DB', borderRadius: 8,
                    background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#6B7280',
                    fontFamily: 'var(--font-sans, inherit)',
                  }}
                >
                  + 멤버 추가
                </button>
              </div>
            </div>
          )}

          {/* Step 5: 완료 */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 style={{ ...titleStyle, textAlign: 'center' }}>설정 완료!</h2>
              <p style={{ ...descStyle, textAlign: 'center', marginBottom: 24 }}>
                워크스페이스가 준비되었습니다.<br />
                첫 번째 프로젝트를 만들어보세요.
              </p>
              <button
                onClick={handleCreateProjectAndFinish}
                style={{
                  padding: '12px 32px', background: '#111827', color: '#fff',
                  border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', transition: 'background 0.15s',
                  fontFamily: 'var(--font-sans, inherit)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#1F2937'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#111827'}
              >
                첫 프로젝트 만들기
              </button>
              <button
                onClick={handleFinish}
                style={{
                  display: 'block', margin: '12px auto 0', padding: '8px 16px',
                  background: 'transparent', border: 'none', fontSize: 13,
                  color: '#9CA3AF', cursor: 'pointer',
                  fontFamily: 'var(--font-sans, inherit)',
                }}
              >
                나중에 만들기
              </button>
            </div>
          )}

          {/* 네비게이션 버튼 */}
          {step < 4 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
              <div>
                {step > 0 ? (
                  <button onClick={goPrev} style={ghostBtnStyle}>이전</button>
                ) : (
                  <button onClick={onDismiss} style={ghostBtnStyle}>나중에</button>
                )}
              </div>
              <button
                onClick={step === 3 ? handleInvite : goNext}
                disabled={inviting}
                style={{
                  padding: '10px 24px', background: '#3B82F6', color: '#fff',
                  border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', transition: 'background 0.15s',
                  opacity: inviting ? 0.6 : 1,
                  fontFamily: 'var(--font-sans, inherit)',
                }}
                onMouseEnter={(e) => !inviting && (e.currentTarget.style.background = '#2563EB')}
                onMouseLeave={(e) => !inviting && (e.currentTarget.style.background = '#3B82F6')}
              >
                {step === 3 ? (inviting ? '초대 중...' : '초대 후 다음') : '다음'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const titleStyle = { fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 6px' }
const descStyle = { fontSize: 13, color: '#6B7280', margin: 0 }
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: '#6B7280', marginBottom: 6 }
const inputStyle = { width: '100%', padding: '10px 14px', fontSize: 14, boxSizing: 'border-box', borderRadius: 8, border: '1px solid #D1D5DB', outline: 'none' }
const ghostBtnStyle = {
  padding: '10px 20px', background: 'transparent', border: 'none', borderRadius: 10,
  fontSize: 13, color: '#9CA3AF', cursor: 'pointer', fontFamily: 'var(--font-sans, inherit)',
}
