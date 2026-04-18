import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Paperclip,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useProcedureStore } from '../stores/procedureStore'
import {
  PROCEDURES,
  ACTION_TYPES,
  ACTOR_COLUMNS,
  MATERIAL_INTENTS,
  MATERIAL_INTENT_LABELS,
  MAX_INTENT_NOTE_LENGTH,
  MAX_MATERIAL_SIZE_BYTES,
  SUPPORTED_MATERIAL_EXTENSIONS,
  MATERIAL_PROCESSING_STATUSES,
} from 'curriculum-weaver-shared/constants.js'
import { getDefaultIntent } from '../lib/defaultIntentForStep'
import { validateMaterialFile } from '../lib/materialErrors'

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

export default function ChatPanel({ sessionId, projectId: projectIdProp, stage, onStageChange, readOnly = false, loading = false }) {
  const projectId = projectIdProp || sessionId
  const {
    messages, streaming, streamingText, sendMessage,
    pendingSuggestions, coherenceCheckResult, procedureAdvanceSuggestion,
    acceptSuggestion, editAcceptSuggestion, rejectSuggestion,
    clearProcedureAdvance, clearCoherenceCheck,
    stageAdvanceSuggestion, clearStageAdvance,
    introCache, showIntroModal, introModalContent, introModalProcedure,
    openIntroModal, closeIntroModal,
  } = useChatStore()
  const { currentStep, getCurrentStep, materials, uploadMaterial } = useProcedureStore()
  const [input, setInput] = useState('')
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('cw_ai_model') || 'fast')
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  // 드래그&드롭 오버레이
  const [dragActive, setDragActive] = useState(false)
  const dragDepthRef = useRef(0)

  // IntentPopover 상태 — 파일 선택/드롭 직후 표시
  const [pendingIntent, setPendingIntent] = useState(null)
  // { files: File[], intent: string, intentNote: string }

  // @멘션 상태
  const [mentionedIds, setMentionedIds] = useState(() => new Set())
  const [mentionBox, setMentionBox] = useState(null)
  // { query: string, startIdx: number, cursor: number }
  const [mentionCursor, setMentionCursor] = useState(0)

  // 업로드 에러 배너
  const [uploadBanner, setUploadBanner] = useState(null) // { kind, message }

  // 자료 상세 모달 (시스템 메시지 클릭)
  const [detailMaterialId, setDetailMaterialId] = useState(null)

  const currentStepInfo = getCurrentStep()
  const procInfo = PROCEDURES[stage]
  const completedMaterials = useMemo(
    () => materials.filter((m) => m.processing_status === MATERIAL_PROCESSING_STATUSES.COMPLETED),
    [materials],
  )

  // 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingText, pendingSuggestions, procedureAdvanceSuggestion, stageAdvanceSuggestion])

  const handleSend = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming) return

    // 전송 직전: 본문에 실제로 남아 있는 @파일명 토큰만 mentionedIds에 남김
    // (교사가 @filename 텍스트를 지웠다면 자동 제거)
    const nameById = new Map(materials.map((m) => [m.id, m.file_name]))
    const survivingIds = Array.from(mentionedIds).filter((id) => {
      const name = nameById.get(id)
      if (!name) return false
      // 파일명은 공백을 포함할 수 있으므로 단순 포함 매칭
      return text.includes(`@${name}`)
    })

    setInput('')
    setMentionedIds(new Set())
    setMentionBox(null)
    await sendMessage(projectId, text, {
      procedureCode: stage,
      mentionedIds: survivingIds,
      currentStep,
    })
  }

  // ──────────────────────────────
  // 파일 드래그&드롭 오버레이
  // ──────────────────────────────
  const onDragEnter = (e) => {
    if (readOnly) return
    const types = e.dataTransfer?.types
    if (!types || !Array.from(types).includes('Files')) return
    e.preventDefault()
    dragDepthRef.current += 1
    if (!dragActive) setDragActive(true)
  }
  const onDragOver = (e) => {
    if (readOnly) return
    const types = e.dataTransfer?.types
    if (types && Array.from(types).includes('Files')) {
      e.preventDefault()
    }
  }
  const onDragLeave = (e) => {
    if (readOnly) return
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragActive(false)
  }
  const onDrop = (e) => {
    if (readOnly) return
    e.preventDefault()
    dragDepthRef.current = 0
    setDragActive(false)
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length > 0) queueFilesForUpload(files)
  }

  // ──────────────────────────────
  // 파일 큐잉 → IntentPopover 표시
  // ──────────────────────────────
  const queueFilesForUpload = useCallback(
    (files) => {
      if (!projectId) {
        setUploadBanner({ kind: 'error', message: '프로젝트 정보가 아직 준비되지 않았어요.' })
        return
      }
      const valid = []
      for (const f of files) {
        const err = validateMaterialFile(f, {
          maxBytes: MAX_MATERIAL_SIZE_BYTES,
          allowedExts: SUPPORTED_MATERIAL_EXTENSIONS,
        })
        if (err) {
          setUploadBanner({ kind: 'error', message: `${f.name}: ${err.message}` })
        } else {
          valid.push(f)
        }
      }
      if (valid.length === 0) return
      setPendingIntent({
        files: valid,
        intent: getDefaultIntent(stage),
        intentNote: '',
      })
    },
    [projectId, stage],
  )

  const handleAttachClick = () => {
    if (readOnly || streaming) return
    fileInputRef.current?.click()
  }
  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) queueFilesForUpload(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const confirmIntentAndUpload = async () => {
    if (!pendingIntent) return
    const { files, intent, intentNote } = pendingIntent
    if (intent === MATERIAL_INTENTS.CUSTOM && !intentNote.trim()) {
      setUploadBanner({ kind: 'error', message: '기타(메모 입력) 선택 시 메모가 필요해요.' })
      return
    }
    setPendingIntent(null)
    for (const file of files) {
      try {
        await uploadMaterial(projectId, file, {
          intent,
          intentNote: intent === MATERIAL_INTENTS.CUSTOM ? intentNote.trim() : null,
          source: 'chat',
        })
      } catch (err) {
        setUploadBanner({
          kind: 'error',
          message: `${file.name} 첨부 실패 — ${err?.message || '알 수 없는 오류'}`,
        })
      }
    }
  }

  // ──────────────────────────────
  // @멘션 감지 & 선택
  // ──────────────────────────────
  const detectMention = (value, caret) => {
    // caret 왼쪽으로 스캔하다가 공백/개행 만나면 중단, '@' 만나면 히트
    let i = caret - 1
    while (i >= 0) {
      const ch = value[i]
      if (ch === '@') {
        // @ 앞이 문장 시작이거나 공백이어야 멘션으로 인정
        const prev = i === 0 ? ' ' : value[i - 1]
        if (/\s|\n/.test(prev) || i === 0) {
          const query = value.slice(i + 1, caret)
          // 공백 없는 토큰만
          if (!/\s/.test(query)) {
            return { query, startIdx: i, cursor: caret }
          }
        }
        return null
      }
      if (/\s|\n/.test(ch)) return null
      i -= 1
    }
    return null
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setInput(value)
    const caret = e.target.selectionStart ?? value.length
    const hit = detectMention(value, caret)
    setMentionBox(hit)
    setMentionCursor(0)
  }

  const filteredMentionItems = useMemo(() => {
    if (!mentionBox) return []
    const q = mentionBox.query.toLowerCase()
    const pool = completedMaterials.length > 0 ? completedMaterials : materials
    return pool
      .filter((m) => (q ? m.file_name?.toLowerCase().includes(q) : true))
      .slice(0, 10)
  }, [mentionBox, completedMaterials, materials])

  const pickMention = (material) => {
    if (!material || !mentionBox) return
    const before = input.slice(0, mentionBox.startIdx)
    const after = input.slice(mentionBox.cursor)
    const token = `@${material.file_name} `
    const nextValue = `${before}${token}${after}`
    setInput(nextValue)
    setMentionedIds((prev) => {
      const next = new Set(prev)
      next.add(material.id)
      return next
    })
    setMentionBox(null)
    // 커서를 토큰 직후로 이동
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        const pos = (before + token).length
        el.focus()
        try { el.setSelectionRange(pos, pos) } catch { /* noop */ }
      }
    })
  }

  const handleInputKeyDown = (e) => {
    if (mentionBox && filteredMentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionCursor((c) => Math.min(c + 1, filteredMentionItems.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionCursor((c) => Math.max(c - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pickMention(filteredMentionItems[mentionCursor])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionBox(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend(e)
    }
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
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--color-bg-secondary)', position: 'relative' }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 드래그&드롭 오버레이 */}
      {dragActive && !readOnly && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            background: 'rgba(59, 130, 246, 0.08)',
            backdropFilter: 'blur(2px)',
            border: '2px dashed #3B82F6',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '16px 24px',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          }}>
            <Upload size={28} color="#3B82F6" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1E40AF' }}>
              파일을 드롭하여 첨부
            </span>
            <span style={{ fontSize: 11, color: '#6B7280' }}>
              {SUPPORTED_MATERIAL_EXTENSIONS.join(', ').toUpperCase()} · 최대 {Math.round(MAX_MATERIAL_SIZE_BYTES / 1024 / 1024)}MB
            </span>
          </div>
        </div>
      )}

      {/* IntentPopover */}
      {pendingIntent && !readOnly && (
        <IntentPopover
          files={pendingIntent.files}
          intent={pendingIntent.intent}
          intentNote={pendingIntent.intentNote}
          onChangeIntent={(v) => setPendingIntent((p) => ({ ...p, intent: v }))}
          onChangeNote={(v) =>
            setPendingIntent((p) => ({ ...p, intentNote: v.slice(0, MAX_INTENT_NOTE_LENGTH) }))
          }
          onCancel={() => setPendingIntent(null)}
          onConfirm={confirmIntentAndUpload}
        />
      )}

      {/* 자료 상세 모달 */}
      {detailMaterialId && (
        <MaterialDetailMini
          material={materials.find((m) => m.id === detailMaterialId)}
          onClose={() => setDetailMaterialId(null)}
        />
      )}

      {/* AI 모델 토글 */}
      <div style={{
        padding: '6px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        flexShrink: 0,
      }}>
        {introCache[stage] && (
          <button
            onClick={() => openIntroModal(stage)}
            style={{
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              marginRight: 'auto',
              transition: 'all 0.15s',
            }}
          >
            절차 안내 보기
          </button>
        )}
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginRight: 4 }}>AI</span>
        {[
          { key: 'fast', label: 'Sonnet', desc: '빠른' },
          { key: 'precise', label: 'Opus', desc: '정밀' },
        ].map(({ key, label, desc }) => {
          const active = aiModel === key
          return (
            <button
              key={key}
              onClick={() => {
                setAiModel(key)
                localStorage.setItem('cw_ai_model', key)
              }}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                color: active ? '#fff' : 'var(--color-text-secondary)',
                background: active ? (key === 'fast' ? '#6B7280' : '#3B82F6') : 'transparent',
                border: active ? 'none' : '1px solid var(--color-border)',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'all 0.15s',
              }}
            >
              {desc}
            </button>
          )
        })}
      </div>
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
          {messages.length === 0 && loading && !streaming && (
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
                <div style={{ width: 20, height: 20, border: '2px solid #D1D5DB', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>
                시뮬레이션 대화를 불러오는 중입니다
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
                잠시만 기다려 주세요
              </p>
            </div>
          )}

          {messages.length === 0 && !loading && !streaming && (
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
              msg.attached_material_id ? (
                <SystemAttachmentMessage
                  key={msg.id}
                  message={msg}
                  onOpen={() => setDetailMaterialId(msg.attached_material_id)}
                />
              ) : (
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
              )
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
                      msg.sender_subject
                        ? `${msg.sender_name} · ${msg.sender_subject}`
                        : msg.sender_name || '교사'
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
                      <div className="prose-chat"><ReactMarkdown remarkPlugins={[remarkGfm]} children={msg.content || ''} /></div>
                    ) : (
                      renderWithMentions(msg.content || '')
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
                <div className="prose-chat"><ReactMarkdown remarkPlugins={[remarkGfm]} children={cleanStreamingText(streamingText) || ''} /></div>
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
              onAccept={() => acceptSuggestion(suggestion.id, sessionId)}
              onReject={() => rejectSuggestion(suggestion.id, sessionId)}
              onEditAccept={(val) => editAcceptSuggestion(suggestion.id, val, sessionId)}
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
      {readOnly ? (
        <div style={{
          borderTop: '1px solid var(--color-border)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: 'var(--color-bg-tertiary)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>시뮬레이션 프로젝트는 읽기 전용입니다</span>
        </div>
      ) : (
        <form
          onSubmit={handleSend}
          style={{
            position: 'relative',
            borderTop: '1px solid var(--color-border)',
            padding: '10px 12px',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          {/* 업로드 에러 배너 */}
          {uploadBanner && (
            <div
              role="alert"
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: 'calc(100% + 6px)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 10px',
                fontSize: 12,
                color: '#991B1B',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
              }}
            >
              <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ flex: 1, wordBreak: 'break-word' }}>{uploadBanner.message}</span>
              <button
                type="button"
                onClick={() => setUploadBanner(null)}
                aria-label="알림 닫기"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B' }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* 📎 첨부 버튼 */}
          <button
            type="button"
            onClick={handleAttachClick}
            disabled={streaming}
            aria-label="파일 첨부"
            title="파일 첨부"
            style={{
              width: 40,
              height: 44,
              borderRadius: 'var(--radius-lg)',
              background: 'transparent',
              color: streaming ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              cursor: streaming ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Paperclip size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            accept={SUPPORTED_MATERIAL_EXTENSIONS.map((e) => `.${e}`).join(',')}
            onChange={handleFileInputChange}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            rows={1}
            placeholder={streaming ? 'AI 응답 중...' : '메시지를 입력하세요. @를 입력하면 첨부된 자료를 언급할 수 있어요.'}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: 14,
              background: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-lg)',
              minHeight: 44,
              maxHeight: 140,
              boxSizing: 'border-box',
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
          />

          {/* @멘션 드롭다운 */}
          {mentionBox && filteredMentionItems.length > 0 && (
            <MentionDropdown
              items={filteredMentionItems}
              cursor={mentionCursor}
              onHover={setMentionCursor}
              onPick={pickMention}
            />
          )}
          {mentionBox && filteredMentionItems.length === 0 && materials.length === 0 && (
            <div style={{
              position: 'absolute',
              left: 60,
              right: 60,
              bottom: 'calc(100% + 6px)',
              padding: '6px 10px',
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
              background: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}>
              아직 첨부된 자료가 없어요. 파일을 드롭하거나 📎로 첨부하세요.
            </div>
          )}

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
      )}

      {/* 인트로 모달 */}
      {showIntroModal && (
        <div
          onClick={closeIntroModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-primary)',
              borderRadius: 16,
              width: '90%',
              maxWidth: 600,
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            {/* 모달 헤더 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid var(--color-border-subtle)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {introModalProcedure}: {PROCEDURES[introModalProcedure]?.name || '절차 안내'}
              </span>
              <button
                onClick={closeIntroModal}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  color: 'var(--color-text-tertiary)', fontSize: 18, lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            {/* 모달 본문 */}
            <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1 }}>
              <div className="prose-chat" style={{ fontSize: 14, lineHeight: 1.7 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} children={introModalContent || ''} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 본문 @멘션 chip 렌더 ──
// 정규식으로 `@토큰` 을 파란 chip 스타일 span으로 감싼다.
// 파일명에 공백이 들어갈 수 있으나, 본 매칭은 `@` 뒤 공백 이전까지만 잡는다 (단순화).
function renderWithMentions(text) {
  if (!text) return text
  const parts = []
  const re = /(^|\s)(@[^\s@]+)/g
  let lastIdx = 0
  let m
  let key = 0
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length
    if (start > lastIdx) parts.push(text.slice(lastIdx, start))
    parts.push(
      <span
        key={`mention-${key++}`}
        className="bg-blue-100 text-blue-800 px-1 rounded"
        style={{ fontSize: 'inherit' }}
      >
        {m[2]}
      </span>,
    )
    lastIdx = start + m[2].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return <>{parts}</>
}

// ── 시스템 첨부 메시지 ──
function SystemAttachmentMessage({ message, onOpen }) {
  const status = message.processing_status
  const StatusIcon = () => {
    if (status === 'parsing' || status === 'analyzing') {
      return <Loader2 size={12} className="animate-spin" style={{ color: '#3B82F6' }} />
    }
    if (status === 'completed') return <CheckCircle2 size={12} style={{ color: '#16A34A' }} />
    if (status === 'failed') return <AlertTriangle size={12} style={{ color: '#D97706' }} />
    return null
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <button
        type="button"
        onClick={onOpen}
        className="group"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: 'var(--color-bg-tertiary)',
          borderLeft: '3px solid #3B82F6',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          borderLeftWidth: 3,
          borderLeftColor: status === 'failed' ? '#D97706' : status === 'completed' ? '#16A34A' : '#3B82F6',
          borderLeftStyle: 'solid',
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          maxWidth: '85%',
          textAlign: 'left',
        }}
        title="자료 상세 보기"
      >
        <span style={{ fontSize: 13 }} aria-hidden="true">📎</span>
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {message.content}
        </span>
        <StatusIcon />
      </button>
    </div>
  )
}

// ── @멘션 드롭다운 ──
function MentionDropdown({ items, cursor, onHover, onPick }) {
  return (
    <div
      role="listbox"
      aria-label="첨부된 자료 멘션"
      style={{
        position: 'absolute',
        left: 60,
        bottom: 'calc(100% + 6px)',
        width: 'min(320px, calc(100% - 120px))',
        maxHeight: 220,
        overflow: 'auto',
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        zIndex: 30,
      }}
    >
      {items.map((m, i) => {
        const active = i === cursor
        const completed = m.processing_status === MATERIAL_PROCESSING_STATUSES.COMPLETED
        return (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(m)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 12px',
              background: active ? '#EFF6FF' : 'transparent',
              color: 'var(--color-text-primary)',
              border: 'none',
              borderBottom: '1px solid var(--color-border-subtle)',
              cursor: 'pointer',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            <Paperclip size={12} style={{ color: '#3B82F6', flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.file_name}
            </span>
            {!completed && (
              <span style={{ fontSize: 10, color: '#D97706', flexShrink: 0 }}>분석중</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Intent Popover ──
function IntentPopover({ files, intent, intentNote, onChangeIntent, onChangeNote, onCancel, onConfirm }) {
  const isCustom = intent === MATERIAL_INTENTS.CUSTOM
  const noteInvalid = isCustom && !intentNote.trim()
  return (
    <div
      role="dialog"
      aria-label="첨부 자료 의도 선택"
      style={{
        position: 'absolute',
        zIndex: 25,
        left: 16,
        right: 16,
        bottom: 80,
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Paperclip size={14} style={{ color: '#3B82F6' }} />
        <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
          {files.length === 1 ? files[0].name : `${files.length}개 파일 첨부`}
        </strong>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {(files.reduce((a, f) => a + f.size, 0) / 1024).toFixed(0)}KB
        </span>
      </div>
      {files.length > 1 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {files.map((f, i) => (
            <li key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              · {f.name}
            </li>
          ))}
        </ul>
      )}
      <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>AI가 이 자료를 어떻게 읽어야 할까요?</span>
        <select
          value={intent}
          onChange={(e) => onChangeIntent(e.target.value)}
          style={{
            padding: '6px 8px',
            fontSize: 13,
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            background: 'var(--color-bg-primary)',
          }}
        >
          {Object.entries(MATERIAL_INTENT_LABELS).map(([id, meta]) => (
            <option key={id} value={id}>
              {meta.icon} {meta.label} — {meta.description}
            </option>
          ))}
        </select>
      </label>
      {isCustom && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            value={intentNote}
            onChange={(e) => onChangeNote(e.target.value)}
            placeholder="이 자료에서 AI가 무엇을 읽어내야 하는지 적어주세요. (최대 120자)"
            rows={2}
            style={{
              padding: '6px 8px',
              fontSize: 12,
              border: `1px solid ${noteInvalid ? '#FCA5A5' : 'var(--color-border)'}`,
              borderRadius: 6,
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: noteInvalid ? '#DC2626' : 'var(--color-text-tertiary)',
          }}>
            <span>{noteInvalid ? '메모를 입력해주세요.' : `최대 ${MAX_INTENT_NOTE_LENGTH}자`}</span>
            <span>{intentNote.length} / {MAX_INTENT_NOTE_LENGTH}</span>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          취소
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={noteInvalid}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            background: noteInvalid ? 'var(--color-bg-tertiary)' : '#3B82F6',
            color: noteInvalid ? 'var(--color-text-tertiary)' : '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: noteInvalid ? 'not-allowed' : 'pointer',
          }}
        >
          첨부 및 분석
        </button>
      </div>
    </div>
  )
}

// ── 자료 상세 미니 모달 (시스템 메시지 클릭) ──
function MaterialDetailMini({ material, onClose }) {
  if (!material) {
    return null
  }
  const analysis = material.ai_analysis || {}
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: 'var(--color-bg-primary)',
          borderRadius: 12,
          width: '90%',
          maxWidth: 480,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {material.file_name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {MATERIAL_INTENT_LABELS[material.intent]?.label || '자료'} ·{' '}
              {material.processing_status === 'completed' ? '분석 완료' : material.processing_status}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 16, overflow: 'auto', fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
          {analysis.summary ? (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{analysis.summary}</p>
          ) : (
            <p style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>
              아직 분석 요약이 없습니다. 자료 관리 바에서 상세 정보를 확인하세요.
            </p>
          )}
        </div>
      </div>
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
