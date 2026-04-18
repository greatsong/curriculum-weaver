import { create } from 'zustand'
import { apiGet, apiPost, apiStreamPost } from '../lib/api'
import { socket } from '../lib/socket'
import { useProcedureStore } from './procedureStore'
import { useProjectStore } from './projectStore'
import { useWorkspaceStore } from './workspaceStore'
import { PROCEDURES } from 'curriculum-weaver-shared/constants.js'

function isReadOnlyProject(project) {
  return project?.status === 'simulation' ||
    project?.status === 'generating' ||
    project?.status === 'failed' ||
    project?.title?.startsWith('[시뮬레이션]')
}

// ── XML 파서 유틸 ────────────────────────────

/**
 * AI 응답에서 <ai_suggestion> XML을 파싱한다
 * @returns {Array<{procedureCode: string, field: string, value: any, rationale: string}>}
 */
function parseAISuggestions(text) {
  const suggestions = []
  const regex = /<ai_suggestion\s+procedure="([^"]*?)"\s+field="([^"]*?)">([\s\S]*?)<\/ai_suggestion>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const [, procedureCode, field, inner] = match
    // rationale 추출
    const rationaleMatch = inner.match(/<rationale>([\s\S]*?)<\/rationale>/)
    const rationale = rationaleMatch ? rationaleMatch[1].trim() : ''
    // value 추출: rationale 이외의 부분
    const value = inner
      .replace(/<rationale>[\s\S]*?<\/rationale>/, '')
      .trim()
    // JSON 파싱 시도
    let parsedValue = value
    try {
      parsedValue = JSON.parse(value)
    } catch {
      // 문자열 그대로 사용
    }
    suggestions.push({ procedureCode, field, value: parsedValue, rationale })
  }
  return suggestions
}

/**
 * AI 응답에서 <coherence_check> XML을 파싱한다
 */
function parseCoherenceCheck(text) {
  const match = text.match(/<coherence_check>([\s\S]*?)<\/coherence_check>/)
  if (!match) return null
  const inner = match[1]
  const statusMatch = inner.match(/<status>([\s\S]*?)<\/status>/)
  const issuesMatch = inner.match(/<issues>([\s\S]*?)<\/issues>/)
  const suggestionsMatch = inner.match(/<suggestions>([\s\S]*?)<\/suggestions>/)
  return {
    status: statusMatch ? statusMatch[1].trim() : 'unknown',
    issues: issuesMatch ? issuesMatch[1].trim() : '',
    suggestions: suggestionsMatch ? suggestionsMatch[1].trim() : '',
  }
}

/**
 * AI 응답에서 <procedure_advance> XML을 파싱한다
 */
function parseProcedureAdvance(text) {
  const match = text.match(/<procedure_advance>([\s\S]*?)<\/procedure_advance>/)
  if (!match) return null
  const inner = match[1]
  const nextMatch = inner.match(/<next_procedure>([\s\S]*?)<\/next_procedure>/)
  const summaryMatch = inner.match(/<summary>([\s\S]*?)<\/summary>/)
  const nameMatch = inner.match(/<next_name>([\s\S]*?)<\/next_name>/)
  return {
    next_procedure: nextMatch ? nextMatch[1].trim() : null,
    next_name: nameMatch ? nameMatch[1].trim() : '',
    summary: summaryMatch ? summaryMatch[1].trim() : '',
  }
}

/**
 * 스트리밍 텍스트에서 모든 XML 마커를 제거
 */
function stripXmlMarkers(text) {
  return text
    .replace(/<ai_suggestion[\s\S]*?<\/ai_suggestion>/g, '')
    .replace(/<coherence_check>[\s\S]*?<\/coherence_check>/g, '')
    .replace(/<procedure_advance>[\s\S]*?<\/procedure_advance>/g, '')
    .replace(/<board_update\s+type="[^"]*">[\s\S]*?<\/board_update>/g, '')
    .replace(/<stage_advance>[\s\S]*?<\/stage_advance>/g, '')
    // 미완성 태그도 제거
    .replace(/<ai_suggestion[\s\S]*$/g, '')
    .replace(/<coherence_check[\s\S]*$/g, '')
    .replace(/<procedure_advance[\s\S]*$/g, '')
    .replace(/<board_update[\s\S]*$/g, '')
    .replace(/<stage_advance[\s\S]*$/g, '')
    .trim()
}

// ── Store ────────────────────────────────────

export const useChatStore = create((set, get) => ({
  messages: [],
  loadingMessages: false,
  streaming: false,
  streamingText: '',

  // AI 제안 관련 상태
  pendingSuggestions: [],        // 수락/편집/거부 대기 중인 AI 제안
  coherenceCheckResult: null,   // 정합성 점검 결과
  procedureAdvanceSuggestion: null, // 절차 전환 제안
  _lastAiMessageId: null,       // 마지막 AI 메시지 ID (제안 수락 시 사용)

  // 인트로 캐시 (절차별 인트로를 1회만 생성)
  introCache: {},               // { [procedureCode]: introContent }
  showIntroModal: false,
  introModalContent: '',
  introModalProcedure: '',

  // 레거시 호환
  boardSuggestions: [],
  stageAdvanceSuggestion: null,

  // ── Socket.IO 이벤트 리스너 ────

  subscribe: (sessionId) => {
    // 메시지 upsert — 동일 id 있으면 덮어쓰기, 없으면 append
    // 시스템 메시지의 processing_status가 parsing → completed로 바뀔 때 필요.
    const upsertHandler = (message) => {
      if (!message || !message.id) return
      set((state) => {
        const idx = state.messages.findIndex((m) => m.id === message.id)
        if (idx >= 0) {
          const next = state.messages.slice()
          next[idx] = { ...next[idx], ...message }
          return { messages: next }
        }
        return { messages: [...state.messages, message] }
      })
    }
    socket.on('message_added', upsertHandler)
    socket.on('message_updated', upsertHandler)
    set({ _messageHandler: upsertHandler })
  },

  unsubscribe: () => {
    const handler = get()._messageHandler
    if (handler) {
      socket.off('message_added', handler)
      socket.off('message_updated', handler)
    }
    set({
      messages: [],
      boardSuggestions: [],
      stageAdvanceSuggestion: null,
      pendingSuggestions: [],
      coherenceCheckResult: null,
      procedureAdvanceSuggestion: null,
      _messageHandler: null,
      introCache: {},
      showIntroModal: false,
      introModalContent: '',
      introModalProcedure: '',
    })
  },

  // ── 메시지 로드 ────

  loadMessages: async (projectId) => {
    set({ loadingMessages: true })
    try {
      const data = await apiGet(`/api/chat/${projectId}`)
      const msgs = Array.isArray(data) ? data : (data?.messages ?? [])
      // 메시지에서 절차별 첫 AI 인트로를 캐시에 복원
      const introsByProcedure = {}
      msgs.forEach(m => {
        const proc = m.stage_context || m.procedure_context
        if (m.sender_type === 'ai' && proc && !introsByProcedure[proc]) {
          introsByProcedure[proc] = m.content
        }
      })
      set({ messages: msgs, introCache: { ...get().introCache, ...introsByProcedure } })
      return true
    } catch {
      return false
    } finally {
      set({ loadingMessages: false })
    }
  },

  // ── 메시지 전송 + AI 응답 ────

  /**
   * 교사 메시지 전송 + AI 응답 스트리밍.
   *
   * 하위 호환:
   *   sendMessage(projectId, content, 'T-1-1')          // 레거시 — procedureCode 문자열
   *   sendMessage(projectId, content, { procedureCode, mentionedIds, currentStep })
   */
  sendMessage: async (projectId, content, optsOrCode) => {
    const project = useProjectStore.getState().currentProject
    if (isReadOnlyProject(project)) return

    // 옵션 정규화
    const opts = typeof optsOrCode === 'string' || optsOrCode == null
      ? { procedureCode: optsOrCode }
      : optsOrCode
    const procedureCode = opts.procedureCode
    const mentionedIds = Array.isArray(opts.mentionedIds)
      ? opts.mentionedIds
      : (opts.mentionedIds instanceof Set ? Array.from(opts.mentionedIds) : [])
    const currentStep = opts.currentStep

    // 로그인 사용자 정보 우선 사용
    let senderName = localStorage.getItem('cw_nickname') || '교사'
    let senderSubject = localStorage.getItem('cw_subject') || ''
    try {
      const { useAuthStore } = await import('./authStore')
      const user = useAuthStore.getState().user
      if (user) {
        const meta = user.user_metadata || {}
        senderName = meta.display_name || meta.full_name || meta.name || senderName
        // 소속/과목 정보: 프로필 우선, localStorage 폴백
        if (meta.subject || meta.school_name) {
          const parts = [meta.school_name, meta.subject].filter(Boolean)
          senderSubject = parts.join(' ') || senderSubject
        }
      }
    } catch { /* 무시 */ }

    // 1) 교사 메시지 저장
    const teacherMsg = await apiPost('/api/chat/teacher', {
      session_id: projectId,
      content,
      stage: procedureCode,
      sender_name: senderName,
      sender_subject: senderSubject,
      // 멘션된 자료 — 서버에서 기본값('{}')으로 처리하므로 하위 호환
      mentioned_material_ids: mentionedIds,
    })

    set((state) => ({ messages: [...state.messages, teacherMsg] }))
    socket.emit('new_message', { projectId, message: teacherMsg })

    // 2) AI 응답 (SSE)
    set({
      streaming: true,
      streamingText: '',
      pendingSuggestions: [],
      coherenceCheckResult: null,
      procedureAdvanceSuggestion: null,
      boardSuggestions: [],
      stageAdvanceSuggestion: null,
    })

    // AI 역할 프리셋을 워크스페이스 설정에서 가져옴
    const wsAiRole = useWorkspaceStore.getState().currentWorkspace?.workflow_config?.aiRole

    const aiModel = localStorage.getItem('cw_ai_model') || 'fast'

    await apiStreamPost('/api/chat/message', {
      session_id: projectId,
      content,
      stage: procedureCode,
      aiRole: wsAiRole || undefined,
      aiModel,
      mentioned_material_ids: mentionedIds,
      current_step: currentStep,
    }, {
      onText: (text) => {
        set((state) => ({ streamingText: state.streamingText + text }))
      },
      onPrinciples: () => {},
      onBoardSuggestions: (suggestions, appliedBoards) => {
        set({ boardSuggestions: suggestions || [] })
        // 서버 형식 suggestions → pendingSuggestions로 변환
        if (suggestions?.length > 0) {
          set({
            pendingSuggestions: suggestions.map((s, i) => ({
              id: `suggestion-${Date.now()}-${i}`,
              procedureCode: s.procedure || procedureCode,
              field: s.step || s.action || 'content',
              value: s.content,
              rationale: '',
              status: 'pending',
              _serverIndex: i,
            })),
          })
        }
        // 서버에서 자동 반영된 보드 → procedureStore에 업데이트
        if (appliedBoards?.length > 0) {
          const procState = useProcedureStore.getState()
          const updatedBoards = { ...procState.boards }
          for (const board of appliedBoards) {
            updatedBoards[board.board_type] = board
            socket.emit('board_updated', { projectId, board })
          }
          useProcedureStore.setState({ boards: updatedBoards })
        }
      },
      onStageAdvance: (data) => {
        // 서버 shape (current/suggested/reason) → 클라이언트 shape (next_procedure/summary/next_name)
        const advance = {
          next_procedure: data.suggested || data.next_procedure || data.next_stage,
          summary: data.reason || data.summary || '',
          next_name: PROCEDURES[data.suggested]?.name || data.next_name || '',
          current: data.current,
        }
        set({
          stageAdvanceSuggestion: advance,
          procedureAdvanceSuggestion: advance,
        })
      },
      onCoherenceCheck: (data) => {
        // 서버 shape (aligned/feedback/details) → 클라이언트 shape (status/issues/suggestions)
        set({
          coherenceCheckResult: {
            status: data.aligned ? 'pass' : 'warning',
            issues: data.feedback || '',
            suggestions: Array.isArray(data.details) ? data.details.join(', ') : (data.details || ''),
          },
        })
      },
      onMessageSaved: (data) => {
        if (data?.messageId) set({ _lastAiMessageId: data.messageId })
      },
      onDone: () => {
        const streamedText = get().streamingText
        const cleanText = stripXmlMarkers(streamedText)

        // XML 파싱: AI 제안, 정합성 점검, 절차 전환
        const suggestions = parseAISuggestions(streamedText)
        const coherence = parseCoherenceCheck(streamedText)
        const advance = parseProcedureAdvance(streamedText)

        const newState = {
          streaming: false,
          streamingText: '',
        }

        if (suggestions.length > 0) {
          newState.pendingSuggestions = suggestions.map((s, i) => ({
            ...s,
            id: `suggestion-${Date.now()}-${i}`,
            status: 'pending', // pending | accepted | rejected
          }))
        }
        if (coherence) {
          newState.coherenceCheckResult = coherence
        }
        if (advance) {
          newState.procedureAdvanceSuggestion = advance
        }

        if (cleanText) {
          const aiMsg = {
            id: `ai-${Date.now()}`,
            sender_type: 'ai',
            content: cleanText,
            stage_context: procedureCode,
            created_at: new Date().toISOString(),
          }
          newState.messages = [...get().messages, aiMsg]
          socket.emit('ai_response_done', { projectId, message: aiMsg })
        } else {
          newState.messages = get().messages
        }

        set(newState)
      },
      onError: (error) => {
        console.error('AI 응답 오류:', error)
        set({ streaming: false, streamingText: '' })
      },
    })
  },

  // ── 절차 인트로 요청 ────

  requestProcedureIntro: async (projectId, procedureCode) => {
    if (get().streaming) return
    if (get().introCache[procedureCode]) return // 이미 인트로 완료 → 스킵
    const project = useProjectStore.getState().currentProject
    if (isReadOnlyProject(project)) return

    set({ streaming: true, streamingText: '' })

    const aiModel = localStorage.getItem('cw_ai_model') || 'fast'

    await apiStreamPost('/api/chat/stage-intro', {
      session_id: projectId,
      stage: procedureCode,
      aiModel,
    }, {
      onText: (text) => {
        set((state) => ({ streamingText: state.streamingText + text }))
      },
      onPrinciples: () => {},
      onBoardSuggestions: () => {},
      onStageAdvance: () => {},
      onDone: () => {
        const streamedText = get().streamingText
        if (streamedText.trim()) {
          const cleanContent = stripXmlMarkers(streamedText)
          const aiMsg = {
            id: `intro-${Date.now()}`,
            sender_type: 'ai',
            content: cleanContent,
            stage_context: procedureCode,
            created_at: new Date().toISOString(),
          }
          set((state) => ({
            messages: [...state.messages, aiMsg],
            streaming: false,
            streamingText: '',
            introCache: { ...state.introCache, [procedureCode]: cleanContent },
          }))
          socket.emit('ai_response_done', { projectId, message: aiMsg })
        } else {
          set({ streaming: false, streamingText: '' })
        }
      },
      onError: (error) => {
        console.error('절차 인트로 오류:', error)
        set({ streaming: false, streamingText: '' })
      },
    })
  },

  // ── 인트로 모달 ────

  openIntroModal: (procedureCode) => {
    const content = get().introCache[procedureCode]
    if (content) set({ showIntroModal: true, introModalContent: content, introModalProcedure: procedureCode })
  },
  closeIntroModal: () => set({ showIntroModal: false, introModalContent: '', introModalProcedure: '' }),

  // ── AI 제안 수락/편집/거부 ────

  acceptSuggestion: async (suggestionId, projectId) => {
    const state = get()
    const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId)
    if (!suggestion) return

    // 1) procedureStore에 보드 반영 (로컬)
    const procStore = useProcedureStore.getState()
    if (suggestion.procedureCode && suggestion.field) {
      procStore.applyAISuggestion(suggestion.procedureCode, {
        field: suggestion.field,
        value: suggestion.value,
      })
    }

    // 2) 서버에 수락 저장
    const messageId = state._lastAiMessageId
    if (messageId) {
      const idx = state.pendingSuggestions.findIndex((s) => s.id === suggestionId)
      try {
        await apiPost(`/api/chat/suggestion/${messageId}/accept`, {
          session_id: projectId,
          procedure: suggestion.procedureCode,
          suggestionIndex: idx >= 0 ? idx : 0,
        })
      } catch (err) {
        console.error('제안 수락 서버 저장 실패:', err)
      }
    }

    // 3) 상태 업데이트
    set({
      pendingSuggestions: state.pendingSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'accepted' } : s
      ),
    })
  },

  editAcceptSuggestion: async (suggestionId, editedValue, projectId) => {
    const state = get()
    const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId)
    if (!suggestion) return

    // 1) 편집된 값으로 보드 반영
    const procStore = useProcedureStore.getState()
    if (suggestion.procedureCode && suggestion.field) {
      procStore.applyAISuggestion(suggestion.procedureCode, {
        field: suggestion.field,
        value: editedValue,
      })
    }

    // 2) 서버에 편집 수락 저장
    const messageId = state._lastAiMessageId
    if (messageId) {
      const idx = state.pendingSuggestions.findIndex((s) => s.id === suggestionId)
      try {
        await apiPost(`/api/chat/suggestion/${messageId}/edit-accept`, {
          session_id: projectId,
          procedure: suggestion.procedureCode,
          suggestionIndex: idx >= 0 ? idx : 0,
          editedContent: editedValue,
        })
      } catch (err) {
        console.error('제안 편집 수락 서버 저장 실패:', err)
      }
    }

    // 3) 상태 업데이트
    set({
      pendingSuggestions: state.pendingSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'accepted', value: editedValue } : s
      ),
    })
  },

  rejectSuggestion: async (suggestionId, projectId) => {
    const state = get()
    // 서버에 거부 저장
    const messageId = state._lastAiMessageId
    if (messageId) {
      const idx = state.pendingSuggestions.findIndex((s) => s.id === suggestionId)
      try {
        await apiPost(`/api/chat/suggestion/${messageId}/reject`, {
          session_id: projectId,
          procedure: state.pendingSuggestions[idx]?.procedureCode,
          suggestionIndex: idx >= 0 ? idx : 0,
        })
      } catch (err) {
        console.error('제안 거부 서버 저장 실패:', err)
      }
    }

    set({
      pendingSuggestions: state.pendingSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'rejected' } : s
      ),
    })
  },

  // ── 정리 ────

  clearPendingSuggestions: () => set({ pendingSuggestions: [] }),
  clearCoherenceCheck: () => set({ coherenceCheckResult: null }),
  clearProcedureAdvance: () => set({ procedureAdvanceSuggestion: null }),
  clearBoardSuggestions: () => set({ boardSuggestions: [] }),
  clearStageAdvance: () => set({ stageAdvanceSuggestion: null }),
}))
