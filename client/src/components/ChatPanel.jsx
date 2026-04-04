import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatStore } from '../stores/chatStore'
import { useProcedureStore } from '../stores/procedureStore'
import { PROCEDURES, ACTION_TYPES, ACTOR_COLUMNS } from 'curriculum-weaver-shared/constants.js'

// 스트리밍 텍스트에서 XML 마커 제거
function cleanStreamingText(text) {
  return text
    .replace(/<ai_suggestion[\s\S]*?<\/ai_suggestion>/g, '')
    .replace(/<coherence_check>[\s\S]*?<\/coherence_check>/g, '')
    .replace(/<procedure_advance>[\s\S]*?<\/procedure_advance>/g, '')
    .replace(/<board_update\s+type="[^"]*">[\s\S]*?<\/board_update>/g, '')
    .replace(/<stage_advance>[\s\S]*?<\/stage_advance>/g, '')
    .replace(/<ai_suggestion[\s\S]*$/g, '')
    .replace(/<coherence_check[\s\S]*$/g, '')
    .replace(/<procedure_advance[\s\S]*$/g, '')
    .replace(/<board_update[\s\S]*$/g, '')
    .replace(/<stage_advance[\s\S]*$/g, '')
    .trim() || '...'
}

export default function ChatPanel({ sessionId, stage, onStageChange }) {
  const {
    messages, streaming, streamingText, sendMessage,
    pendingSuggestions, coherenceCheckResult, procedureAdvanceSuggestion,
    acceptSuggestion, editAcceptSuggestion, rejectSuggestion,
    clearProcedureAdvance, clearCoherenceCheck,
    stageAdvanceSuggestion, clearStageAdvance,
  } = useChatStore()
  const { currentStep, getCurrentStep } = useProcedureStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  const currentStepInfo = getCurrentStep()
  const procInfo = PROCEDURES[stage]

  // 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingText, pendingSuggestions, procedureAdvanceSuggestion, stageAdvanceSuggestion])

  const handleSend = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    await sendMessage(sessionId, text, stage)
  }

  const handleProcedureAdvance = () => {
    const advance = procedureAdvanceSuggestion || stageAdvanceSuggestion
    if (!advance) return
    const nextCode = advance.next_procedure || advance.next_stage
    if (nextCode && onStageChange) {
      onStageChange(nextCode)
      clearProcedureAdvance()
      clearStageAdvance()
    }
  }

  const dismissAdvance = () => {
    clearProcedureAdvance()
    clearStageAdvance()
  }

  const advance = procedureAdvanceSuggestion || stageAdvanceSuggestion

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-secondary)' }}>
      {/* 스텝 컨텍스트 바 */}
      {currentStepInfo && (
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--color-text-tertiary)',
          }}>
            Step {currentStep}
          </span>
          <span style={{ width: 1, height: 12, background: 'var(--color-border)', flexShrink: 0 }} />
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            padding: '1px 6px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-secondary)',
          }}>
            {ACTION_TYPES[currentStepInfo.actionType]?.name || currentStepInfo.actionType}
          </span>
          <span style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {currentStepInfo.title}
          </span>
          {currentStepInfo.aiCapability && (
            <span style={{
              padding: '1px 6px',
              background: '#F5F3FF',
              color: '#7C3AED',
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              flexShrink: 0,
            }}>
              AI
            </span>
          )}
        </div>
      )}

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-auto" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.length === 0 && !streaming && (
            <div style={{ textAlign: 'center', padding: '48px 16px' }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                </svg>
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>
                AI 공동설계자와 대화를 시작하세요
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
                현재 절차의 설계 원칙에 기반하여 안내합니다
              </p>
              {procInfo && (
                <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '8px 0 0', opacity: 0.6 }}>
                  {stage}: {procInfo.name}
                </p>
              )}
            </div>
          )}

          {messages.map((msg) => (
            msg.sender_type === 'system' ? (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'center' }}>
                <p style={{
                  fontSize: 11,
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-bg-tertiary)',
                  borderRadius: 9999,
                  padding: '4px 14px',
                  margin: 0,
                }}>
                  {msg.content}
                </p>
              </div>
            ) : (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.sender_type === 'teacher' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{ maxWidth: '85%' }}>
                  {/* 발신자 이름 */}
                  <p style={{
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                    margin: '0 0 3px',
                    padding: '0 4px',
                    textAlign: msg.sender_type === 'teacher' ? 'right' : 'left',
                  }}>
                    {msg.sender_type === 'ai' ? 'AI 공동설계자' : (
                      <>
                        {msg.sender_name}
                        {msg.sender_subject ? ` -- ${msg.sender_subject}` : ''}
                      </>
                    )}
                  </p>
                  {/* 메시지 버블 */}
                  <div style={{
                    borderRadius: 16,
                    padding: '10px 16px',
                    fontSize: 14,
                    lineHeight: 1.6,
                    ...(msg.sender_type === 'teacher' ? {
                      background: '#111827',
                      color: '#fff',
                      borderBottomRightRadius: 4,
                    } : msg.sender_type === 'ai' ? {
                      background: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-primary)',
                      borderBottomLeftRadius: 4,
                    } : {
                      background: '#FFFBEB',
                      color: '#92400E',
                      border: '1px solid #FDE68A',
                      borderBottomLeftRadius: 4,
                    }),
                  }}>
                    {msg.sender_type === 'ai' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose-chat">
                        {msg.content || ''}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              </div>
            )
          ))}

          {/* 스트리밍 중인 AI 응답 */}
          {streaming && streamingText && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                maxWidth: '85%',
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                borderRadius: 16,
                borderBottomLeftRadius: 4,
                padding: '10px 16px',
                fontSize: 14,
                lineHeight: 1.6,
              }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose-chat">
                  {cleanStreamingText(streamingText) || ''}
                </ReactMarkdown>
                <span style={{
                  display: 'inline-block',
                  width: 5,
                  height: 16,
                  background: '#3B82F6',
                  borderRadius: 1,
                  marginLeft: 2,
                  animation: 'pulse 1s infinite',
                }} />
              </div>
            </div>
          )}

          {/* 타이핑 인디케이터 */}
          {streaming && !streamingText && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                background: 'var(--color-bg-tertiary)',
                borderRadius: 16,
                borderBottomLeftRadius: 4,
                padding: '12px 16px',
                display: 'flex',
                gap: 4,
              }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#9CA3AF',
                    animation: `bounce 1.4s infinite ${i * 0.16}s`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* AI 인라인 제안 카드 */}
          {!streaming && pendingSuggestions.filter((s) => s.status === 'pending').map((suggestion) => (
            <InlineSuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={() => acceptSuggestion(suggestion.id)}
              onReject={() => rejectSuggestion(suggestion.id)}
              onEditAccept={(val) => editAcceptSuggestion(suggestion.id, val)}
            />
          ))}

          {/* 정합성 점검 인라인 */}
          {!streaming && coherenceCheckResult && (
            <div style={{ maxWidth: '90%', margin: '0 auto' }}>
              <CoherenceInline result={coherenceCheckResult} onClose={clearCoherenceCheck} />
            </div>
          )}

          {/* 절차 전환 제안 */}
          {advance && !streaming && (
            <div style={{ maxWidth: '90%', margin: '0 auto' }}>
              <div style={{
                background: 'linear-gradient(135deg, #F5F3FF 0%, #EFF6FF 100%)',
                border: '1px solid #DDD6FE',
                borderRadius: 'var(--radius-lg)',
                padding: 16,
              }}>
                <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  {advance.summary}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleProcedureAdvance}
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '6px 14px', background: '#7C3AED' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#6D28D9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#7C3AED'}
                  >
                    {advance.next_procedure || advance.next_code || advance.next_stage}{' '}
                    {advance.next_name || ''}(으)로 이동
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </button>
                  <button
                    onClick={dismissAdvance}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '6px 14px' }}
                  >
                    계속 작업하기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 입력 영역 */}
      <form
        onSubmit={handleSend}
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: '10px 12px',
          display: 'flex',
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={streaming ? 'AI 응답 중...' : '메시지를 입력하세요...'}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: 14,
            background: 'var(--color-bg-primary)',
            borderRadius: 'var(--radius-lg)',
            minHeight: 44,
            boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-lg)',
            background: streaming || !input.trim() ? 'var(--color-bg-tertiary)' : '#111827',
            color: streaming || !input.trim() ? 'var(--color-text-tertiary)' : '#fff',
            border: 'none',
            cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => { if (!streaming && input.trim()) e.currentTarget.style.background = '#1F2937' }}
          onMouseLeave={(e) => { if (!streaming && input.trim()) e.currentTarget.style.background = '#111827' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </form>
    </div>
  )
}

// ── 인라인 AI 제안 카드 ──
function InlineSuggestionCard({ suggestion, onAccept, onReject, onEditAccept }) {
  const [showEdit, setShowEdit] = useState(false)
  const [editedValue, setEditedValue] = useState(
    typeof suggestion.value === 'string' ? suggestion.value : JSON.stringify(suggestion.value, null, 2)
  )

  return (
    <div style={{ maxWidth: '90%', margin: '0 auto' }}>
      <div style={{
        background: '#F5F3FF',
        border: '1px solid #DDD6FE',
        borderRadius: 'var(--radius-lg)',
        padding: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6D28D9' }}>AI 제안</span>
          <span style={{ fontSize: 11, color: '#A78BFA' }}>{suggestion.field}</span>
        </div>

        {suggestion.rationale && (
          <p style={{
            fontSize: 11,
            color: '#7C3AED',
            background: '#EDE9FE',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            margin: '0 0 8px',
          }}>
            {suggestion.rationale}
          </p>
        )}

        <div style={{
          fontSize: 12,
          color: 'var(--color-text-primary)',
          background: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-md)',
          padding: 10,
          marginBottom: 8,
          maxHeight: 120,
          overflowY: 'auto',
        }}>
          {typeof suggestion.value === 'string' ? (
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{suggestion.value}</p>
          ) : (
            <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{JSON.stringify(suggestion.value, null, 2)}</pre>
          )}
        </div>

        {showEdit && (
          <textarea
            value={editedValue}
            onChange={(e) => setEditedValue(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #DDD6FE',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
              marginBottom: 8,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => {
              if (showEdit) {
                let val = editedValue
                try { val = JSON.parse(editedValue) } catch { /* string */ }
                onEditAccept(val)
              } else {
                onAccept()
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              background: '#7C3AED',
              color: '#fff',
              border: 'none',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#6D28D9'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#7C3AED'}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8 6.5 11.5 13 4.5"/></svg>
            {showEdit ? '편집 수락' : '수락'}
          </button>
          <button
            onClick={() => setShowEdit(!showEdit)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              background: 'var(--color-bg-secondary)',
              color: '#7C3AED',
              border: '1px solid #DDD6FE',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            {showEdit ? '취소' : '편집'}
          </button>
          <button
            onClick={onReject}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              border: 'none',
              borderRadius: 9999,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
            거부
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 정합성 점검 인라인 ──
function CoherenceInline({ result, onClose }) {
  const isGood = result.status === 'pass' || result.status === 'good'
  return (
    <div style={{
      borderRadius: 'var(--radius-lg)',
      border: `1px solid ${isGood ? '#BBF7D0' : '#FDE68A'}`,
      background: isGood ? '#F0FDF4' : '#FFFBEB',
      padding: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {isGood ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        )}
        <span style={{ fontSize: 12, fontWeight: 600, color: isGood ? '#166534' : '#92400E' }}>정합성 점검</span>
      </div>
      {result.issues && <p style={{ fontSize: 12, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>{result.issues}</p>}
      {result.suggestions && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0, fontStyle: 'italic' }}>{result.suggestions}</p>}
      <button
        onClick={onClose}
        style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text-primary)'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
      >
        닫기
      </button>
    </div>
  )
}
