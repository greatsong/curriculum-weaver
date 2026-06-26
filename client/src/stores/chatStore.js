import { create } from 'zustand'
import { apiGet, apiPost, apiStreamPost } from '../lib/api'
import { socket } from '../lib/socket'
import { useProcedureStore } from './procedureStore'
import { useProjectStore } from './projectStore'
import { useWorkspaceStore } from './workspaceStore'
import { PROCEDURES, BOARD_TYPES } from 'curriculum-weaver-shared/constants.js'

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
  // 서버 extractAiSuggestions(chat.js) 및 AI 생성 형식과 동일하게 파싱한다.
  // <ai_suggestion type="board_update" procedure=".." step=".." action="..">{JSON}</ai_suggestion>
  // (SSE board_suggestions 경로가 주력이며, 이 텍스트 파싱은 SSE 누락 시의 백업이다.)
  const regex = /<ai_suggestion\s+type="([^"]+)"\s+procedure="([^"]+)"\s+step="([^"]*?)"\s*(?:action="([^"]*?)")?\s*>\s*([\s\S]*?)\s*<\/ai_suggestion>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const [, type, procedureCode, , , inner] = match
    let value = inner.trim()
    try {
      value = JSON.parse(value)
    } catch {
      // 문자열 그대로 사용
    }
    // onBoardSuggestions(SSE) 콜백과 동일한 형태로 맞춘다(field 없는 board_update).
    suggestions.push({ procedureCode, type: type || 'board_update', field: null, value, rationale: '' })
  }
  return suggestions
}

/**
 * AI 응답에서 <coherence_check> XML을 파싱한다.
 * 서버 extractCoherenceCheck 및 AI 생성 형식과 동일:
 * <coherence_check procedure=".." against="..">{"aligned":..,"feedback":..,"details":[..]}</coherence_check>
 * 반환 형태는 onCoherenceCheck(SSE) 콜백과 동일(status/issues/suggestions).
 */
function parseCoherenceCheck(text) {
  const match = text.match(/<coherence_check\b[^>]*>([\s\S]*?)<\/coherence_check>/)
  if (!match) return null
  let data
  try {
    data = JSON.parse(match[1].trim())
  } catch {
    return null
  }
  return {
    status: data.aligned ? 'pass' : 'warning',
    issues: data.feedback || '',
    suggestions: Array.isArray(data.details)
      ? data.details.map((d) => d.suggestion || d.item || '').filter(Boolean).join(', ')
      : (data.details || ''),
  }
}

/**
 * AI 응답에서 <procedure_advance> XML을 파싱한다
 */
function parseProcedureAdvance(text) {
  // 속성 형식 (AI가 실제로 생성하는 형식, aiAgent.js 시스템 프롬프트 기준):
  // <procedure_advance current="A-1-1" suggested="A-2-1" reason="..."/>
  const selfClosing = text.match(/<procedure_advance\b([^>]*?)\/?>/)
  if (selfClosing && /suggested=/.test(selfClosing[1])) {
    const attrs = selfClosing[1]
    const suggested = attrs.match(/suggested="([^"]*)"/)?.[1] || null
    const current = attrs.match(/current="([^"]*)"/)?.[1] || null
    const reason = attrs.match(/reason="([^"]*)"/)?.[1] || ''
    if (suggested) {
      return {
        next_procedure: suggested,
        next_name: PROCEDURES[suggested]?.name || '',
        summary: reason,
        current,
      }
    }
  }
  // 레거시 자식 태그 형식: <procedure_advance><next_procedure>...</next_procedure></procedure_advance>
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
    .replace(/<procedure_advance\b[^>]*\/?>/g, '') // 속성/self-closing 형식
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
    // 스트리밍 중에는 서버 스냅샷으로 덮어쓰지 않는다.
    // (탭 복귀/포커스/재연결로 loadMessages가 불려도 진행 중인 대화가 유실되지 않게)
    if (get().streaming) return false
    set({ loadingMessages: true })
    try {
      const data = await apiGet(`/api/chat/${projectId}`)
      const msgs = Array.isArray(data) ? data : (data?.messages ?? [])
      // 서버 스냅샷이 로컬보다 메시지 수가 적으면(방금 보낸/응답받은 메시지가
      // 아직 서버에 반영되기 전) 덮어쓰지 않는다 — '대화가 이전으로 되돌아가는' 현상 방지.
      // 로컬 AI 메시지는 임시 id라 id 머지는 중복을 만들 수 있어 개수 기준으로 판단한다.
      const local = get().messages
      if (local.length > 0 && msgs.length < local.length) {
        return true
      }
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
    // selectedIds: 교사가 체크박스로 선택한 자료 ID. 미지정이면 undefined → 서버는 전체 포함(하위 호환).
    const selectedIds = Array.isArray(opts.selectedIds)
      ? opts.selectedIds
      : (opts.selectedIds instanceof Set ? Array.from(opts.selectedIds) : undefined)
    const materialSelectionExplicit = opts.materialSelectionExplicit === true
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
      selected_material_ids: selectedIds,
      material_selection_explicit: materialSelectionExplicit,
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
              // board_update는 보드 전체 content 제안(field 단위 아님). step/action을
              // field로 쓰면 content["1"]처럼 잘못 중첩되어 보드에 안 뜬다.
              type: s.type || 'board_update',
              field: s.field || null,
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
    if (suggestion.procedureCode) {
      if (suggestion.field) {
        // 레거시 field 단위 부분 업데이트
        procStore.applyAISuggestion(suggestion.procedureCode, {
          field: suggestion.field,
          value: suggestion.value,
        })
      } else if (suggestion.value && typeof suggestion.value === 'object') {
        // board_update: 보드 전체 content 병합
        procStore.applyBoardContent(suggestion.procedureCode, suggestion.value)
      }
    }

    // 2) 서버 영속 — 병합된 '전체' 보드 content를 권위본으로 저장
    // 서버 accept 라우트는 제안 원본(suggestion.content)만 replace 저장해, AI가 일부
    // 필드만 담은 제안을 수락하면 기존 필드가 DB에서 유실되던 문제가 있었다. 클라가
    // deep-merge한 전체 content를 updateBoard로 저장(권위본)해 유실을 막고, updateBoard가
    // design_updated를 emit하므로 협업자 보드도 함께 갱신된다.
    const boardType = BOARD_TYPES[suggestion.procedureCode]
    const mergedContent = boardType
      ? useProcedureStore.getState().boards[boardType]?.content
      : null

    // (a) 제안 상태 추적용 accept 라우트 (best-effort). 보드 본문 저장은 아래 updateBoard가 권위.
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
        console.error('제안 수락 상태 저장 실패:', err)
      }
    }
    // (b) 병합 전체 content 영속 + 브로드캐스트 (유실 방지 핵심)
    if (mergedContent && suggestion.procedureCode) {
      try {
        await useProcedureStore.getState().updateBoard(projectId, suggestion.procedureCode, mergedContent)
      } catch (err) {
        console.error('보드 영속 실패:', err)
      }
    }

    // 3) 상태 업데이트
    set({
      pendingSuggestions: state.pendingSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'accepted' } : s
      ),
    })
    // 진행률/네비게이션 갱신
    useProcedureStore.getState().loadBoardSummaries(projectId)
  },

  editAcceptSuggestion: async (suggestionId, editedValue, projectId) => {
    const state = get()
    const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId)
    if (!suggestion) return

    // 1) 편집된 값으로 보드 반영
    // board_update 편집은 editedValue가 JSON 문자열일 수 있으므로 파싱한다.
    const procStore = useProcedureStore.getState()
    let parsedEdited = editedValue
    if (typeof editedValue === 'string') {
      try { parsedEdited = JSON.parse(editedValue) } catch { /* 문자열 그대로 사용 */ }
    }
    if (suggestion.procedureCode) {
      if (suggestion.field) {
        procStore.applyAISuggestion(suggestion.procedureCode, {
          field: suggestion.field,
          value: parsedEdited,
        })
      } else if (parsedEdited && typeof parsedEdited === 'object') {
        procStore.applyBoardContent(suggestion.procedureCode, parsedEdited)
      }
    }

    // 2) 서버 영속 — 병합된 '전체' 보드 content를 권위본으로 저장 (acceptSuggestion과 동일 원칙)
    const boardType = BOARD_TYPES[suggestion.procedureCode]
    const mergedContent = boardType
      ? useProcedureStore.getState().boards[boardType]?.content
      : null

    // (a) 편집 수락 상태 추적용 라우트 (best-effort)
    const messageId = state._lastAiMessageId
    if (messageId) {
      const idx = state.pendingSuggestions.findIndex((s) => s.id === suggestionId)
      try {
        await apiPost(`/api/chat/suggestion/${messageId}/edit-accept`, {
          session_id: projectId,
          procedure: suggestion.procedureCode,
          suggestionIndex: idx >= 0 ? idx : 0,
          editedContent: parsedEdited,
        })
      } catch (err) {
        console.error('제안 편집 수락 상태 저장 실패:', err)
      }
    }
    // (b) 병합 전체 content 영속 + 브로드캐스트 (유실 방지 핵심)
    if (mergedContent && suggestion.procedureCode) {
      try {
        await useProcedureStore.getState().updateBoard(projectId, suggestion.procedureCode, mergedContent)
      } catch (err) {
        console.error('보드 영속 실패:', err)
      }
    }

    // 3) 상태 업데이트
    set({
      pendingSuggestions: state.pendingSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'accepted', value: editedValue } : s
      ),
    })
    // 진행률/네비게이션 갱신
    useProcedureStore.getState().loadBoardSummaries(projectId)
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
