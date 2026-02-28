import { create } from 'zustand'
import { apiGet, apiPost, apiStreamPost } from '../lib/api'

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

  // 테스트 모드: Supabase Realtime 대신 API 폴링
  subscribe: () => {},
  unsubscribe: () => {
    set({ messages: [], boardSuggestions: [] })
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
          set((state) => ({
            messages: [...state.messages, {
              id: `ai-${Date.now()}`,
              sender_type: 'ai',
              content: cleanText,
              stage_context: stage,
              created_at: new Date().toISOString(),
            }],
            streaming: false,
            streamingText: '',
          }))
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
