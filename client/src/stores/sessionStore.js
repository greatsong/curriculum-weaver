import { create } from 'zustand'
import { apiGet, apiPost, apiPut } from '../lib/api'

export const useSessionStore = create((set, get) => ({
  sessions: [],
  currentSession: null,
  loading: false,
  error: null,

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
    return data
  },

  clearCurrent: () => set({ currentSession: null }),
}))
