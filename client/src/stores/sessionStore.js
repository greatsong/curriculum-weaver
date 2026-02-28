import { create } from 'zustand'
import { apiGet, apiPost, apiPut } from '../lib/api'
import { socket } from '../lib/socket'

export const useSessionStore = create((set, get) => ({
  sessions: [],
  currentSession: null,
  loading: false,
  error: null,
  members: [],

  fetchSessions: async () => {
    set({ loading: true, error: null })
    try {
      const data = await apiGet('/api/sessions')
      set({ sessions: data, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  fetchSession: async (sessionId) => {
    set({ loading: true, error: null })
    try {
      const data = await apiGet(`/api/sessions/${sessionId}`)
      set({ currentSession: data, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  createSession: async ({ title, description }) => {
    const data = await apiPost('/api/sessions', { title, description })
    set((state) => ({ sessions: [data, ...state.sessions] }))
    return data
  },

  joinSession: async (inviteCode) => {
    const data = await apiPost('/api/sessions/join', { invite_code: inviteCode })
    set((state) => ({ sessions: [data, ...state.sessions] }))
    return data
  },

  updateStage: async (sessionId, stage) => {
    const data = await apiPut(`/api/sessions/${sessionId}`, { current_stage: stage })
    set({ currentSession: data })
    // 다른 사용자에게 단계 변경 브로드캐스트
    socket.emit('stage_changed', { sessionId, stage })
    return data
  },

  setMembers: (members) => set({ members }),

  clearCurrent: () => set({ currentSession: null, members: [] }),
}))
