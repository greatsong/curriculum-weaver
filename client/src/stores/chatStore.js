import { create } from 'zustand'
import { apiGet, apiPost, apiStreamPost } from '../lib/api'
import { socket } from '../lib/socket'
import { useProcedureStore } from './procedureStore'

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
  streaming: false,
  streamingText: '',

  // AI 제안 관련 상태
  pendingSuggestions: [],        // 수락/편집/거부 대기 중인 AI 제안
  coherenceCheckResult: null,   // 정합성 점검 결과
  procedureAdvanceSuggestion: null, // 절차 전환 제안

  // 레거시 호환
  boardSuggestions: [],
  stageAdvanceSuggestion: null,

  // ── Socket.IO 이벤트 리스너 ────

  subscribe: (sessionId) => {
    const handler = (message) => {
      set((state) => {
        if (state.messages.some((m) => m.id === message.id)) return state
        return { messages: [...state.messages, message] }
      })
    }
    socket.on('message_added', handler)
    set({ _messageHandler: handler })
  },

  unsubscribe: () => {
    const handler = get()._messageHandler
    if (handler) socket.off('message_added', handler)
    set({
      messages: [],
      boardSuggestions: [],
      stageAdvanceSuggestion: null,
      pendingSuggestions: [],
      coherenceCheckResult: null,
      procedureAdvanceSuggestion: null,
      _messageHandler: null,
    })
  },

  // ── 메시지 로드 ────

  loadMessages: async (projectId) => {
    try {
      const data = await apiGet(`/api/chat/${projectId}`)
      set({ messages: data || [] })
    } catch {
      set({ messages: [] })
    }
  },

  // ── 메시지 전송 + AI 응답 ────

  sendMessage: async (projectId, content, procedureCode) => {
    const senderName = localStorage.getItem('cw_nickname') || '교사'
    const senderSubject = localStorage.getItem('cw_subject') || ''

    // 1) 교사 메시지 저장
    const teacherMsg = await apiPost('/api/chat/teacher', {
      session_id: projectId,
      content,
      stage: procedureCode,
      sender_name: senderName,
      sender_subject: senderSubject,
    })

    set((state) => ({ messages: [...state.messages, teacherMsg] }))
    socket.emit('new_message', { sessionId: projectId, message: teacherMsg })

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

    await apiStreamPost('/api/chat/message', {
      session_id: projectId,
      content,
      stage: procedureCode,
    }, {
      onText: (text) => {
        set((state) => ({ streamingText: state.streamingText + text }))
      },
      onPrinciples: () => {},
      onBoardSuggestions: (suggestions, appliedBoards) => {
        set({ boardSuggestions: suggestions || [] })
        // 서버에서 자동 반영된 보드 → procedureStore에 업데이트
        if (appliedBoards?.length > 0) {
          const procState = useProcedureStore.getState()
          const updatedBoards = { ...procState.boards }
          for (const board of appliedBoards) {
            updatedBoards[board.board_type] = board
            socket.emit('board_updated', { sessionId: projectId, board })
          }
          useProcedureStore.setState({ boards: updatedBoards })
        }
      },
      onStageAdvance: (data) => {
        set({ stageAdvanceSuggestion: data })
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
          socket.emit('ai_response_done', { sessionId: projectId, message: aiMsg })
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

    set({ streaming: true, streamingText: '' })

    await apiStreamPost('/api/chat/stage-intro', {
      session_id: projectId,
      stage: procedureCode,
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
          const aiMsg = {
            id: `intro-${Date.now()}`,
            sender_type: 'ai',
            content: stripXmlMarkers(streamedText),
            stage_context: procedureCode,
            created_at: new Date().toISOString(),
          }
          set((state) => ({
            messages: [...state.messages, aiMsg],
            streaming: false,
            streamingText: '',
          }))
          socket.emit('ai_response_done', { sessionId: projectId, message: aiMsg })
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

  // ── AI 제안 수락/편집/거부 ────

  acceptSuggestion: (suggestionId) => {
    set((state) => {
      const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId)
      if (!suggestion) return state

      // procedureStore에 보드 반영
      const procStore = useProcedureStore.getState()
      if (suggestion.procedureCode && suggestion.field) {
        procStore.applyAISuggestion(suggestion.procedureCode, {
          field: suggestion.field,
          value: suggestion.value,
        })
      }

      return {
        pendingSuggestions: state.pendingSuggestions.map((s) =>
          s.id === suggestionId ? { ...s, status: 'accepted' } : s
        ),
      }
    })
  },

  editAcceptSuggestion: (suggestionId, editedValue) => {
    set((state) => {
      const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId)
      if (!suggestion) return state

      // 편집된 값으로 보드 반영
      const procStore = useProcedureStore.getState()
      if (suggestion.procedureCode && suggestion.field) {
        procStore.applyAISuggestion(suggestion.procedureCode, {
          field: suggestion.field,
          value: editedValue,
        })
      }

      return {
        pendingSuggestions: state.pendingSuggestions.map((s) =>
          s.id === suggestionId ? { ...s, status: 'accepted', value: editedValue } : s
        ),
      }
    })
  },

  rejectSuggestion: (suggestionId) => {
    set((state) => ({
      pendingSuggestions: state.pendingSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'rejected' } : s
      ),
    }))
  },

  // ── 정리 ────

  clearPendingSuggestions: () => set({ pendingSuggestions: [] }),
  clearCoherenceCheck: () => set({ coherenceCheckResult: null }),
  clearProcedureAdvance: () => set({ procedureAdvanceSuggestion: null }),
  clearBoardSuggestions: () => set({ boardSuggestions: [] }),
  clearStageAdvance: () => set({ stageAdvanceSuggestion: null }),
}))
