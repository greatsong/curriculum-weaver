import { create } from 'zustand'
import { apiGet, apiPost, apiStreamPost } from '../lib/api'
import { socket } from '../lib/socket'

// AI 응답에서 <board_update> 마커를 제거
function stripBoardMarkers(text) {
  return text
    .replace(/<board_update\s+type="[^"]*">[\s\S]*?<\/board_update>/g, '')
    .trim()
}

export const useChatStore = create((set, get) => ({
  messages: [],
  streaming: false,
  streamingText: '',
  boardSuggestions: [],

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
    set({ messages: [], boardSuggestions: [], _messageHandler: null })
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
    // 1) 교사 메시지를 API로 저장
    const teacherMsg = await apiPost('/api/chat/teacher', {
      session_id: sessionId,
      content,
      stage,
    })

    // 메시지 목록에 즉시 추가
    set((state) => ({ messages: [...state.messages, teacherMsg] }))

    // 다른 사용자에게 교사 메시지 브로드캐스트
    socket.emit('new_message', { sessionId, message: teacherMsg })

    // 2) AI 응답 요청 (SSE 스트리밍)
    set({ streaming: true, streamingText: '', boardSuggestions: [] })

    await apiStreamPost('/api/chat/message', {
      session_id: sessionId,
      content,
      stage,
    }, {
      onText: (text) => {
        set((state) => ({ streamingText: state.streamingText + text }))
      },
      onPrinciples: () => {},
      onBoardSuggestions: (suggestions) => {
        set({ boardSuggestions: suggestions || [] })
      },
      onDone: () => {
        const streamedText = get().streamingText
        const cleanText = stripBoardMarkers(streamedText)
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

  clearBoardSuggestions: () => set({ boardSuggestions: [] }),
}))
