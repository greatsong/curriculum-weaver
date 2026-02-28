import { create } from 'zustand'
import { apiGet, apiPost, apiPut } from '../lib/api'
import { socket } from '../lib/socket'

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

  // Socket.IO 보드 업데이트 리스너
  subscribeBoardUpdates: () => {
    const handler = (board) => {
      set((state) => ({
        boards: { ...state.boards, [board.board_type]: board },
      }))
    }
    socket.on('board_changed', handler)
    set({ _boardHandler: handler })
  },

  unsubscribeBoardUpdates: () => {
    const handler = get()._boardHandler
    if (handler) socket.off('board_changed', handler)
    set({ _boardHandler: null })
  },

  // 보드 업데이트
  updateBoard: async (boardId, content) => {
    const data = await apiPut(`/api/boards/${boardId}`, { content })
    set((state) => ({
      boards: { ...state.boards, [data.board_type]: data },
    }))
    // 다른 사용자에게 보드 변경 브로드캐스트
    const sessionId = data.session_id
    socket.emit('board_updated', { sessionId, board: data })
  },

  // AI 제안 보드 반영 (upsert)
  applyBoardSuggestion: async (sessionId, stage, boardType, content) => {
    const data = await apiPost('/api/boards', {
      session_id: sessionId,
      stage,
      board_type: boardType,
      content,
    })
    set((state) => ({
      boards: { ...state.boards, [data.board_type]: data },
    }))
    // 다른 사용자에게 보드 변경 브로드캐스트
    socket.emit('board_updated', { sessionId, board: data })
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
    const handler = get()._boardHandler
    if (handler) socket.off('board_changed', handler)
    set({ boards: {}, standards: [], materials: [], principles: [], _boardHandler: null })
  },
}))
