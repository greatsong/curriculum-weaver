// LEGACY: procedureStore.js로 대체됨. 어디서도 import되지 않음. 정리 시 삭제 가능.
import { create } from 'zustand'
import { apiGet, apiPost, apiPut, apiUploadFile } from '../lib/api'
import { socket } from '../lib/socket'

export const useStageStore = create((set, get) => ({
  boards: {},
  standards: [],
  materials: [],
  principles: [],
  generalPrinciples: [],
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

  // 파일 업로드
  uploadMaterial: async (sessionId, file, category) => {
    const data = await apiUploadFile('/api/materials/upload', file, {
      session_id: sessionId,
      category: category || 'reference',
    })
    set((state) => ({ materials: [...state.materials, data] }))
    return data
  },

  // URL 자료 추가
  addUrlMaterial: async (sessionId, url, category, title) => {
    const data = await apiPost('/api/materials/url', {
      session_id: sessionId,
      url,
      category: category || 'website',
      title: title || '',
    })
    set((state) => ({ materials: [...state.materials, data] }))
    return data
  },

  // 단계별 원칙 로드
  loadPrinciples: async (stage) => {
    try {
      const data = await apiGet('/api/principles', { stage })
      set({ principles: data })
    } catch {
      set({ principles: [] })
    }
  },

  // 총괄 원리 로드 (세션 진입 시 1회)
  loadGeneralPrinciples: async () => {
    try {
      const data = await apiGet('/api/principles/general')
      set({ generalPrinciples: data })
    } catch {
      set({ generalPrinciples: [] })
    }
  },

  reset: () => {
    const handler = get()._boardHandler
    if (handler) socket.off('board_changed', handler)
    set({ boards: {}, standards: [], materials: [], principles: [], generalPrinciples: [], _boardHandler: null })
  },
}))
