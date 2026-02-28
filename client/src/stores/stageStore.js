import { create } from 'zustand'
import { apiGet, apiPut } from '../lib/api'

export const useStageStore = create((set, get) => ({
  boards: {},
  standards: [],
  materials: [],
  principles: [],
  loading: false,

  // 단계별 보드 로드
  loadBoards: async (sessionId, stage) => {
    set({ loading: true })
    try {
      const data = await apiGet(`/api/boards/${sessionId}/${stage}`)
      const boards = {}
      for (const board of data) {
        boards[board.board_type] = board
      }
      set({ boards, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  // 테스트 모드: Supabase Realtime 대신 no-op
  subscribeBoardUpdates: () => {},
  unsubscribeBoardUpdates: () => {},

  // 보드 업데이트
  updateBoard: async (boardId, content) => {
    const data = await apiPut(`/api/boards/${boardId}`, { content })
    set((state) => ({
      boards: { ...state.boards, [data.board_type]: data },
    }))
  },

  // 성취기준 로드
  loadStandards: async (sessionId) => {
    try {
      const data = await apiGet(`/api/sessions/${sessionId}/standards`)
      set({ standards: data })
    } catch {
      set({ standards: [] })
    }
  },

  // 자료 로드
  loadMaterials: async (sessionId) => {
    try {
      const data = await apiGet(`/api/materials/${sessionId}`)
      set({ materials: data })
    } catch {
      set({ materials: [] })
    }
  },

  // 원칙 로드
  loadPrinciples: async (stage) => {
    try {
      const data = await apiGet('/api/principles', { stage })
      set({ principles: data })
    } catch {
      set({ principles: [] })
    }
  },

  reset: () => {
    set({ boards: {}, standards: [], materials: [], principles: [] })
  },
}))
