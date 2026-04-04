import { useState, useMemo } from 'react'
import {
  PROCEDURES, PHASES, PHASE_LIST, ACTION_TYPES, ACTOR_COLUMNS,
  BOARD_TYPES, BOARD_TYPE_LABELS, PROCEDURE_ACTIVITIES,
} from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import { BOARD_SCHEMAS, getBoardSchemaForProcedure, createEmptyBoard } from 'curriculum-weaver-shared/boardSchemas.js'
import { useProcedureStore } from '../stores/procedureStore'
import { useChatStore } from '../stores/chatStore'

export default function ProcedureCanvas({ projectId, procedureCode, readOnly = false }) {
  const { boards, currentStep, setStep, updateBoard } = useProcedureStore()
  const { pendingSuggestions, coherenceCheckResult, acceptSuggestion, editAcceptSuggestion, rejectSuggestion, sendMessage } = useChatStore()
  const [editing, setEditing] = useState(false)

  const procInfo = PROCEDURES[procedureCode]
  const phase = procInfo ? PHASE_LIST.find((p) => p.id === procInfo.phase) : null
  const steps = PROCEDURE_STEPS[procedureCode] || []
  const activity = PROCEDURE_ACTIVITIES[procedureCode]
  const boardType = BOARD_TYPES[procedureCode]
  const schema = boardType ? BOARD_SCHEMAS[boardType] : null
  const board = boardType ? boards[boardType] : null

  const relevantSuggestions = pendingSuggestions.filter(
    (s) => s.procedureCode === procedureCode && s.status === 'pending'
  )

  if (!procInfo) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-text-tertiary)',
        fontSize: 14,
      }}>
        절차를 선택해주세요
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 절차 헤더 */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {phase && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              color: phase.color,
              background: `${phase.color}12`,
            }}>
              {procedureCode}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{phase?.name}</span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>
          {procInfo.name}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
          {procInfo.description}
        </p>
      </div>

      {/* 활동 설명 배너 */}
      {activity && (
        <div style={{
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: 'var(--radius-lg)',
          padding: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/>
          </svg>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#92400E', margin: '0 0 2px' }}>{activity.activity}</h3>
            <p style={{ fontSize: 13, color: '#A16207', margin: 0, lineHeight: 1.5 }}>{activity.description}</p>
          </div>
        </div>
      )}

      {/* 스텝 타임라인 */}
      {steps.length > 0 && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 14px' }}>
            진행 스텝
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {steps.map((step) => {
              const isActive = step.stepNumber === currentStep
              const actionInfo = ACTION_TYPES[step.actionType]
              const actorInfo = ACTOR_COLUMNS[step.actorColumn]

              return (
                <button
                  key={step.stepNumber}
                  onClick={() => setStep(step.stepNumber)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'left',
                    border: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
                    background: isActive ? 'var(--color-bg-primary)' : 'transparent',
                    boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    fontFamily: 'var(--font-sans)',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--color-bg-primary)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {/* 스텝 번호 */}
                  <span style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 1,
                    background: isActive ? (phase?.color || '#3B82F6') : 'var(--color-bg-tertiary)',
                    color: isActive ? '#fff' : 'var(--color-text-tertiary)',
                  }}>
                    {step.stepNumber}
                  </span>

                  {/* 스텝 내용 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: isActive ? `${phase?.color || '#3B82F6'}15` : 'var(--color-bg-tertiary)',
                        color: isActive ? (phase?.color || '#3B82F6') : 'var(--color-text-tertiary)',
                      }}>
                        {actionInfo?.name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {actorInfo?.name}
                      </span>
                      {step.aiCapability && (
                        <span style={{
                          padding: '1px 5px',
                          background: '#F5F3FF',
                          color: '#7C3AED',
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 'var(--radius-sm)',
                        }}>
                          AI {step.aiCapability}
                        </span>
                      )}
                    </div>
                    <p style={{
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      margin: 0,
                    }}>
                      {step.title}
                    </p>
                    {isActive && step.description && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '4px 0 0', lineHeight: 1.4 }}>
                        {step.description}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* AI 제안 카드 */}
      {!readOnly && relevantSuggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {relevantSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={() => acceptSuggestion(suggestion.id, projectId)}
              onReject={() => rejectSuggestion(suggestion.id, projectId)}
              onEditAccept={(edited) => editAcceptSuggestion(suggestion.id, edited, projectId)}
            />
          ))}
        </div>
      )}

      {/* 정합성 점검 결과 */}
      {coherenceCheckResult && <CoherenceCheckCard result={coherenceCheckResult} />}

      {/* 보드 카드 */}
      {boardType && schema && (
        <BoardCard
          boardType={boardType}
          schema={schema}
          board={board}
          editing={editing}
          setEditing={setEditing}
          readOnly={readOnly}
          onUpdate={async (content) => {
            await updateBoard(projectId, procedureCode, content)
            setEditing(false)
          }}
          onRequestAI={() => {
            const label = BOARD_TYPE_LABELS[boardType]
            sendMessage(projectId, `현재 논의된 내용을 바탕으로 "${label}" 보드의 내용을 구체적으로 작성해 주세요.`, procedureCode)
          }}
        />
      )}
    </div>
  )
}

// ── AI 제안 카드 ──
function SuggestionCard({ suggestion, onAccept, onReject, onEditAccept }) {
  const [showEdit, setShowEdit] = useState(false)
  const [editedValue, setEditedValue] = useState(
    typeof suggestion.value === 'string' ? suggestion.value : JSON.stringify(suggestion.value, null, 2)
  )

  return (
    <div className="glass-card" style={{
      background: 'linear-gradient(135deg, rgba(245,243,255,0.8), rgba(239,246,255,0.6))',
      border: '1px solid #DDD6FE',
      borderRadius: 'var(--radius-lg)',
      padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6D28D9' }}>AI 제안</span>
        <span style={{ fontSize: 12, color: '#A78BFA' }}>{suggestion.field} 필드</span>
      </div>

      {suggestion.rationale && (
        <p style={{ fontSize: 12, color: '#7C3AED', background: '#EDE9FE', borderRadius: 'var(--radius-sm)', padding: '6px 10px', margin: '0 0 10px' }}>
          {suggestion.rationale}
        </p>
      )}

      <div style={{
        fontSize: 13,
        color: 'var(--color-text-primary)',
        background: 'var(--color-bg-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        marginBottom: 12,
        maxHeight: 160,
        overflowY: 'auto',
        lineHeight: 1.6,
      }}>
        {typeof suggestion.value === 'string' ? (
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{suggestion.value}</p>
        ) : (
          <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{JSON.stringify(suggestion.value, null, 2)}</pre>
        )}
      </div>

      {showEdit && (
        <textarea
          value={editedValue}
          onChange={(e) => setEditedValue(e.target.value)}
          rows={4}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #DDD6FE',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            marginBottom: 12,
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            if (showEdit) {
              let finalVal = editedValue
              try { finalVal = JSON.parse(editedValue) } catch { /* string */ }
              onEditAccept(finalVal)
            } else {
              onAccept()
            }
          }}
          className="btn"
          style={{ fontSize: 12, padding: '6px 14px', background: '#7C3AED', color: '#fff', borderRadius: 9999 }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#6D28D9'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#7C3AED'}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8 6.5 11.5 13 4.5"/></svg>
          {showEdit ? '편집 후 수락' : '수락'}
        </button>
        <button
          onClick={() => setShowEdit(!showEdit)}
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 9999 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          {showEdit ? '편집 취소' : '편집'}
        </button>
        <button
          onClick={onReject}
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 9999 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
          거부
        </button>
      </div>
    </div>
  )
}

// ── 정합성 점검 카드 ──
function CoherenceCheckCard({ result }) {
  const isGood = result.status === 'pass' || result.status === 'good'
  return (
    <div style={{
      borderRadius: 'var(--radius-lg)',
      border: `1px solid ${isGood ? '#BBF7D0' : '#FDE68A'}`,
      background: isGood ? '#F0FDF4' : '#FFFBEB',
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {isGood ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: isGood ? '#166534' : '#92400E' }}>정합성 점검 결과</span>
        <span style={{
          fontSize: 11,
          padding: '1px 8px',
          borderRadius: 9999,
          background: isGood ? '#DCFCE7' : '#FEF3C7',
          color: isGood ? '#16A34A' : '#D97706',
          fontWeight: 500,
        }}>
          {result.status}
        </span>
      </div>
      {result.issues && <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: '0 0 4px', lineHeight: 1.5 }}>{result.issues}</p>}
      {result.suggestions && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>{result.suggestions}</p>}
    </div>
  )
}

// ── 보드 카드 ──
function BoardCard({ boardType, schema, board, editing, setEditing, onUpdate, onRequestAI, readOnly = false }) {
  const label = BOARD_TYPE_LABELS[boardType] || boardType
  const hasContent = board?.content && Object.keys(board.content).length > 0 &&
    Object.values(board.content).some((v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== null && v !== 0))

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 20px',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-primary)',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, flex: 1 }}>{label}</h3>
        {board?.version > 1 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>v{board.version}</span>
        )}
        {hasContent && !editing && !readOnly && (
          <button
            onClick={() => setEditing(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'none',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-tertiary)'; e.currentTarget.style.color = '#3B82F6' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        )}
      </div>

      <div style={{ padding: 20 }}>
        {editing && schema ? (
          <BoardEditor
            schema={schema}
            content={board?.content || schema.empty}
            onSave={onUpdate}
            onCancel={() => setEditing(false)}
          />
        ) : hasContent && schema ? (
          <BoardRenderer schema={schema} content={board.content} />
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-tertiary)' }}>
            <p style={{ fontSize: 13, margin: '0 0 4px' }}>아직 내용이 없습니다</p>
            {readOnly ? (
              <p style={{ fontSize: 12, margin: 0 }}>이 절차의 시뮬레이션 결과가 생성되지 않았습니다</p>
            ) : (
              <>
                <p style={{ fontSize: 12, margin: '0 0 16px' }}>AI와 대화하면 자동으로 이 보드가 채워집니다</p>
                <button
                  onClick={onRequestAI}
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '6px 14px', margin: '0 auto' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                    <line x1="12" y1="8" x2="12" y2="12"/><line x1="8" y1="10" x2="16" y2="10"/>
                  </svg>
                  AI에게 이 보드 내용 요청
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 필드 타입별 아이콘 ──
const FIELD_ICONS = {
  table: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  list: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  tags: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  textarea: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  json: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
}

const FIELD_COLORS = [
  { bg: '#F8FAFC', border: '#E2E8F0', accent: '#3B82F6' },
  { bg: '#FAFAF9', border: '#E7E5E4', accent: '#059669' },
  { bg: '#FEFCE8', border: '#FEF08A', accent: '#CA8A04' },
  { bg: '#FFF7ED', border: '#FED7AA', accent: '#EA580C' },
  { bg: '#FAF5FF', border: '#E9D5FF', accent: '#9333EA' },
  { bg: '#F0FDFA', border: '#99F6E4', accent: '#0D9488' },
  { bg: '#FFF1F2', border: '#FECDD3', accent: '#E11D48' },
  { bg: '#EFF6FF', border: '#BFDBFE', accent: '#2563EB' },
]

// ── 스키마 기반 렌더러 ──
function BoardRenderer({ schema, content }) {
  if (!schema || !content) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {schema.fields.map((field, idx) => {
        const value = content[field.name]
        if (value === undefined || value === null) return null
        if (Array.isArray(value) && value.length === 0) return null
        if (value === '' && field.type !== 'number') return null
        const color = FIELD_COLORS[idx % FIELD_COLORS.length]
        const icon = FIELD_ICONS[field.type] || FIELD_ICONS.textarea
        return (
          <div key={field.name} style={{
            background: color.bg,
            border: `1px solid ${color.border}`,
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderBottom: `1px solid ${color.border}`,
              background: `${color.accent}08`,
            }}>
              <span style={{ color: color.accent, display: 'flex', flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: color.accent, letterSpacing: '0.02em' }}>
                {field.label}
              </span>
              {field.required && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: `${color.accent}15`, color: color.accent, fontWeight: 600 }}>필수</span>
              )}
            </div>
            <div style={{ padding: 16 }}>
              {field.type === 'table' ? (
                <TableRenderer columns={field.columns} data={value} />
              ) : field.type === 'list' ? (
                <ListRenderer items={value} itemSchema={field.itemSchema} />
              ) : field.type === 'tags' ? (
                <TagsRenderer tags={value} />
              ) : field.type === 'textarea' ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0 }}>{value}</p>
              ) : field.type === 'json' ? (
                <ClusterMapRenderer value={value} label={field.label} />
              ) : (
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{String(value)}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 클러스터맵/JSON 시각화 ──
const CLUSTER_COLORS = [
  { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', tag: '#DBEAFE' },
  { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', tag: '#DCFCE7' },
  { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412', tag: '#FFEDD5' },
  { bg: '#FAF5FF', border: '#E9D5FF', text: '#6B21A8', tag: '#F3E8FF' },
  { bg: '#FFF1F2', border: '#FECDD3', text: '#9F1239', tag: '#FFE4E6' },
  { bg: '#F0FDFA', border: '#99F6E4', text: '#115E59', tag: '#CCFBF1' },
]

function ClusterMapRenderer({ value, label }) {
  // 객체 형태의 클러스터맵인지 확인
  const isClusterMap = value && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).some((v) => Array.isArray(v) || typeof v === 'string')

  if (!isClusterMap) {
    // 일반 JSON 폴백
    return (
      <pre style={{ fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-bg-primary)', padding: 10, borderRadius: 'var(--radius-md)', overflowX: 'auto', maxHeight: 200, margin: 0, fontFamily: 'var(--font-mono)' }}>
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    )
  }

  const entries = Object.entries(value)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {entries.map(([clusterName, items], idx) => {
        const color = CLUSTER_COLORS[idx % CLUSTER_COLORS.length]
        const itemList = Array.isArray(items) ? items : (typeof items === 'string' ? [items] : [])
        return (
          <div key={clusterName} style={{
            background: color.bg,
            border: `1px solid ${color.border}`,
            borderRadius: 'var(--radius-lg)',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: color.text, margin: 0 }}>
              {clusterName}
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {itemList.map((item, i) => (
                <span key={i} style={{
                  fontSize: 12,
                  padding: '3px 10px',
                  borderRadius: 9999,
                  background: color.tag,
                  color: color.text,
                  lineHeight: 1.4,
                }}>
                  {String(item)}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TableRenderer({ columns, data }) {
  if (!Array.isArray(data) || data.length === 0) return null
  return (
    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#64748B', borderBottom: '2px solid #CBD5E1', width: 32 }}>#</th>
            {columns.map((col) => (
              <th key={col.name} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', borderBottom: '2px solid #CBD5E1' }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={{
              background: i % 2 === 0 ? '#fff' : '#F8FAFC',
              borderBottom: i < data.length - 1 ? '1px solid #E2E8F0' : 'none',
              transition: 'background 0.15s',
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#EFF6FF'}
              onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#F8FAFC'}
            >
              <td style={{ textAlign: 'center', padding: '10px 8px', fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>{i + 1}</td>
              {columns.map((col) => (
                <td key={col.name} style={{ padding: '10px 12px', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                  {String(row[col.name] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ListRenderer({ items, itemSchema }) {
  if (!Array.isArray(items) || items.length === 0) return null
  const toText = (item) => {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object') {
      const values = Object.values(item).filter((v) => typeof v === 'string' && v.trim())
      if (values.length > 0) return values.join(' -- ')
    }
    return String(item)
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
          <span style={{ color: '#3B82F6', marginTop: 2, flexShrink: 0 }}>-</span>
          <span>{toText(item)}</span>
        </li>
      ))}
    </ul>
  )
}

function TagsRenderer({ tags }) {
  if (!Array.isArray(tags) || tags.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map((tag, i) => (
        <span key={i} style={{
          padding: '3px 10px',
          background: '#EFF6FF',
          color: '#2563EB',
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 9999,
        }}>
          {tag}
        </span>
      ))}
    </div>
  )
}

// ── 보드 편집기 ──
function BoardEditor({ schema, content, onSave, onCancel }) {
  const [draft, setDraft] = useState(JSON.parse(JSON.stringify(content || schema.empty)))

  const updateField = (name, value) => setDraft((prev) => ({ ...prev, [name]: value }))

  const updateTableRow = (fieldName, rowIdx, colName, value) => {
    setDraft((prev) => {
      const rows = [...(prev[fieldName] || [])]
      rows[rowIdx] = { ...rows[rowIdx], [colName]: value }
      return { ...prev, [fieldName]: rows }
    })
  }

  const addTableRow = (field) => {
    const emptyRow = {}
    for (const col of field.columns) emptyRow[col.name] = ''
    setDraft((prev) => ({ ...prev, [field.name]: [...(prev[field.name] || []), emptyRow] }))
  }

  const removeTableRow = (fieldName, rowIdx) => {
    setDraft((prev) => ({ ...prev, [fieldName]: (prev[fieldName] || []).filter((_, i) => i !== rowIdx) }))
  }

  const addListItem = (fieldName) => {
    setDraft((prev) => ({ ...prev, [fieldName]: [...(prev[fieldName] || []), ''] }))
  }

  const updateListItem = (fieldName, idx, value) => {
    setDraft((prev) => {
      const items = [...(prev[fieldName] || [])]
      items[idx] = value
      return { ...prev, [fieldName]: items }
    })
  }

  const removeListItem = (fieldName, idx) => {
    setDraft((prev) => ({ ...prev, [fieldName]: (prev[fieldName] || []).filter((_, i) => i !== idx) }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {schema.fields.map((field) => (
        <div key={field.name}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            {field.label}
            {field.required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
          </label>
          {field.description && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 6px' }}>{field.description}</p>
          )}

          {field.type === 'text' && (
            <input
              value={draft[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-primary)', boxSizing: 'border-box' }}
            />
          )}
          {field.type === 'textarea' && (
            <textarea
              value={draft[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-primary)', resize: 'vertical', boxSizing: 'border-box' }}
            />
          )}
          {field.type === 'number' && (
            <input
              type="number"
              value={draft[field.name] ?? ''}
              onChange={(e) => updateField(field.name, e.target.value ? parseInt(e.target.value) : null)}
              style={{ width: 96, padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-primary)', boxSizing: 'border-box' }}
            />
          )}
          {field.type === 'select' && (
            <select
              value={draft[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value || null)}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-primary)', boxSizing: 'border-box' }}
            >
              <option value="">선택...</option>
              {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          )}
          {field.type === 'tags' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(draft[field.name] || []).map((tag, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#EFF6FF', color: '#2563EB', fontSize: 12, borderRadius: 9999 }}>
                    {tag}
                    <button
                      onClick={() => removeListItem(field.name, i)}
                      style={{ background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer', padding: 0, display: 'flex' }}
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
                    </button>
                  </span>
                ))}
              </div>
              <input
                placeholder="입력 후 Enter"
                style={{ padding: '6px 10px', fontSize: 12, background: 'var(--color-bg-primary)', boxSizing: 'border-box', width: 200 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    updateField(field.name, [...(draft[field.name] || []), e.target.value.trim()])
                    e.target.value = ''
                  }
                }}
              />
            </div>
          )}
          {field.type === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(draft[field.name] || []).map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 16, textAlign: 'right' }}>{i + 1}.</span>
                  <input
                    value={typeof item === 'string' ? item : JSON.stringify(item)}
                    onChange={(e) => updateListItem(field.name, i, e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', fontSize: 13, background: 'var(--color-bg-primary)', boxSizing: 'border-box' }}
                  />
                  <button
                    onClick={() => removeListItem(field.name, i)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 4, display: 'flex', transition: 'color var(--transition-fast)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              ))}
              <button
                onClick={() => addListItem(field.name)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: '4px 0' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                항목 추가
              </button>
            </div>
          )}
          {field.type === 'table' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-primary)' }}>
                      {field.columns.map((col) => (
                        <th key={col.name} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          {col.label}
                        </th>
                      ))}
                      <th style={{ width: 32 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {(draft[field.name] || []).map((row, rowIdx) => (
                      <tr key={rowIdx} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                        {field.columns.map((col) => (
                          <td key={col.name} style={{ padding: '4px 4px' }}>
                            <input
                              value={row[col.name] || ''}
                              onChange={(e) => updateTableRow(field.name, rowIdx, col.name, e.target.value)}
                              style={{ width: '100%', padding: '4px 8px', fontSize: 12, border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }}
                            />
                          </td>
                        ))}
                        <td style={{ padding: '4px' }}>
                          <button
                            onClick={() => removeTableRow(field.name, rowIdx)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 2, display: 'flex' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => addTableRow(field)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: '4px 0' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                행 추가
              </button>
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--color-border-subtle)' }}>
        <button onClick={() => onSave(draft)} className="btn btn-primary" style={{ fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8 6.5 11.5 13 4.5"/></svg>
          저장
        </button>
        <button onClick={onCancel} className="btn btn-ghost" style={{ fontSize: 13 }}>취소</button>
      </div>
    </div>
  )
}
