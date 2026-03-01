import { create } from 'zustand'
import { apiGet, apiPost, apiStreamPost } from '../lib/api'
import { socket } from '../lib/socket'
import { useStageStore } from './stageStore'

// AI 응답에서 <board_update> 및 <stage_advance> 마커를 제거
function stripXmlMarkers(text) {
  return text
    .replace(/<board_update\s+type="[^"]*">[\s\S]*?<\/board_update>/g, '')
    .replace(/<stage_advance>[\s\S]*?<\/stage_advance>/g, '')
    .trim()
}

export const useChatStore = create((set, get) => ({
  messages: [],
  streaming: false,
  streamingText: '',
  boardSuggestions: [],
  stageAdvanceSuggestion: null,

  // Socket.IO 이벤트 리스너 등록
  subscribe: (sessionId) => {
    const handler = (message) => {
      set((state) => {
        // 중복 방지
        if (state.messages.some((m) => m.id === message.id)) return state
        return { messages: [...state.messages, message] }
      })
    }
    socket.on('message_added', handler)
    // 해제용 핸들러 저장
    set({ _messageHandler: handler })
  },

  unsubscribe: () => {
    const handler = get()._messageHandler
    if (handler) socket.off('message_added', handler)
    set({ messages: [], boardSuggestions: [], stageAdvanceSuggestion: null, _messageHandler: null })
  },

  // 이전 메시지 로드 (API 사용)
  loadMessages: async (sessionId) => {
    try {
      const data = await apiGet(`/api/chat/${sessionId}`)
      set({ messages: data || [] })
    } catch {
      set({ messages: [] })
    }
  },

  // 교사 메시지 저장 + AI 응답 요청
  sendMessage: async (sessionId, content, stage) => {
    // 1) 교사 메시지를 API로 저장 (발신자 정보 포함)
    const senderName = localStorage.getItem('cw_nickname') || '교사'
    const senderSubject = localStorage.getItem('cw_subject') || ''
    const teacherMsg = await apiPost('/api/chat/teacher', {
      session_id: sessionId,
      content,
      stage,
      sender_name: senderName,
      sender_subject: senderSubject,
    })

    // 메시지 목록에 즉시 추가
    set((state) => ({ messages: [...state.messages, teacherMsg] }))

    // 다른 사용자에게 교사 메시지 브로드캐스트
    socket.emit('new_message', { sessionId, message: teacherMsg })

    // 2) AI 응답 요청 (SSE 스트리밍)
    set({ streaming: true, streamingText: '', boardSuggestions: [], stageAdvanceSuggestion: null })

    await apiStreamPost('/api/chat/message', {
      session_id: sessionId,
      content,
      stage,
    }, {
      onText: (text) => {
        set((state) => ({ streamingText: state.streamingText + text }))
      },
      onPrinciples: () => {},
      onBoardSuggestions: (suggestions, appliedBoards) => {
        set({ boardSuggestions: suggestions || [] })
        // 서버에서 자동 반영된 보드를 stageStore에 즉시 업데이트
        if (appliedBoards?.length > 0) {
          const stageState = useStageStore.getState()
          const updatedBoards = { ...stageState.boards }
          for (const board of appliedBoards) {
            updatedBoards[board.board_type] = board
            // 다른 사용자에게 보드 변경 브로드캐스트
            socket.emit('board_updated', { sessionId, board })
          }
          useStageStore.setState({ boards: updatedBoards })
        }
      },
      onStageAdvance: (data) => {
        set({ stageAdvanceSuggestion: data })
      },
      onDone: () => {
        const streamedText = get().streamingText
        const cleanText = stripXmlMarkers(streamedText)
        if (cleanText) {
          const aiMsg = {
            id: `ai-${Date.now()}`,
            sender_type: 'ai',
            content: cleanText,
            stage_context: stage,
            created_at: new Date().toISOString(),
          }
          set((state) => ({
            messages: [...state.messages, aiMsg],
            streaming: false,
            streamingText: '',
          }))
          // 다른 사용자에게 AI 응답 브로드캐스트
          socket.emit('ai_response_done', { sessionId, message: aiMsg })
        } else {
          set({ streaming: false, streamingText: '' })
        }
      },
      onError: (error) => {
        console.error('AI 응답 오류:', error)
        set({ streaming: false, streamingText: '' })
      },
    })
  },

  // 단계 진입 시 AI 인트로 가이드 요청
  requestStageIntro: async (sessionId, stage) => {
    if (get().streaming) return // 이미 스트리밍 중이면 무시

    set({ streaming: true, streamingText: '' })

    await apiStreamPost('/api/chat/stage-intro', {
      session_id: sessionId,
      stage,
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
            content: streamedText.trim(),
            stage_context: stage,
            created_at: new Date().toISOString(),
          }
          set((state) => ({
            messages: [...state.messages, aiMsg],
            streaming: false,
            streamingText: '',
          }))
          socket.emit('ai_response_done', { sessionId, message: aiMsg })
        } else {
          set({ streaming: false, streamingText: '' })
        }
      },
      onError: (error) => {
        console.error('단계 인트로 오류:', error)
        set({ streaming: false, streamingText: '' })
      },
    })
  },

  clearBoardSuggestions: () => set({ boardSuggestions: [] }),
  clearStageAdvance: () => set({ stageAdvanceSuggestion: null }),
}))
