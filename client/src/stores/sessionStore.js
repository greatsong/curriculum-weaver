import { create } from 'zustand'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api'
import { socket } from '../lib/socket'

export const useSessionStore = create((set, get) => ({
  sessions: [],
  currentSession: null,
  loading: false,
  error: null,
  members: [],
  statusFilter: 'active', // 'active' | 'archived' | 'all'

  setStatusFilter: (filter) => set({ statusFilter: filter }),

  fetchSessions: async () => {
    set({ loading: true, error: null })
    try {
      const { statusFilter } = get()
      const params = statusFilter !== 'all' ? { status: statusFilter } : {}
      const data = await apiGet('/api/sessions', params)
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

  archiveSession: async (sessionId) => {
    const data = await apiPut(`/api/sessions/${sessionId}`, { status: 'archived' })
    set((state) => ({ sessions: state.sessions.filter((s) => s.id !== sessionId) }))
    return data
  },

  restoreSession: async (sessionId) => {
    const data = await apiPut(`/api/sessions/${sessionId}`, { status: 'active' })
    set((state) => ({ sessions: state.sessions.filter((s) => s.id !== sessionId) }))
    return data
  },

  deleteSession: async (sessionId) => {
    await apiDelete(`/api/sessions/${sessionId}`)
    set((state) => ({ sessions: state.sessions.filter((s) => s.id !== sessionId) }))
  },

  setMembers: (members) => set({ members }),

  clearCurrent: () => set({ currentSession: null, members: [] }),
}))
