import { create } from 'zustand'
import { apiGet, apiPost, apiPut, apiUploadFile } from '../lib/api'
import { socket } from '../lib/socket'
import { PROCEDURES, BOARD_TYPES } from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import { createEmptyBoard } from 'curriculum-weaver-shared/boardSchemas.js'

export const useProcedureStore = create((set, get) => ({
  currentProcedure: 'T-1-1',
  currentStep: 1,
  boards: {},         // boardType → board data
  standards: [],
  materials: [],
  principles: [],
  generalPrinciples: [],
  loading: false,

  // ── 절차/스텝 네비게이션 ────

  setProcedure: (code) => {
    if (PROCEDURES[code]) {
      const steps = PROCEDURE_STEPS[code]
      set({
        currentProcedure: code,
        currentStep: steps && steps.length > 0 ? 1 : 0,
      })
    }
  },

  setStep: (num) => {
    const { currentProcedure } = get()
    const steps = PROCEDURE_STEPS[currentProcedure]
    if (steps && num >= 1 && num <= steps.length) {
      set({ currentStep: num })
    }
  },

  /**
   * 현재 절차의 스텝 목록 반환
   */
  getCurrentSteps: () => {
    const { currentProcedure } = get()
    return PROCEDURE_STEPS[currentProcedure] || []
  },

  /**
   * 현재 스텝 정보 반환
   */
  getCurrentStep: () => {
    const { currentProcedure, currentStep } = get()
    const steps = PROCEDURE_STEPS[currentProcedure]
    if (!steps || currentStep < 1 || currentStep > steps.length) return null
    return steps[currentStep - 1]
  },

  // ── 보드 로드/업데이트 ────

  loadBoards: async (projectId, procedureCode) => {
    set({ loading: true })
    const code = procedureCode || get().currentProcedure
    try {
      // 새 API 우선, 실패 시 레거시 폴백
      let design = null
      try {
        design = await apiGet(`/api/projects/${projectId}/designs/${code}`)
      } catch {
        // 레거시 폴백
        const data = await apiGet(`/api/boards/${projectId}/${code}`)
        const boardList = Array.isArray(data) ? data : (data?.boards ?? [])
        const boards = {}
        for (const board of boardList) {
          boards[board.board_type || board.procedure_code] = board
        }
        set({ boards, loading: false })
        return
      }
      // 새 API: 단일 design 객체 → boards에 BOARD_TYPES 키로 저장 (ProcedureCanvas 호환)
      const boards = {}
      const boardType = BOARD_TYPES[code] || code
      if (design && design.content && Object.keys(design.content).length > 0) {
        boards[boardType] = { ...design, board_type: boardType, content: design.content }
      }
      set({ boards, loading: false })
    } catch {
      set({ boards: {}, loading: false })
    }
  },

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

  updateBoard: async (projectId, procedureCode, content) => {
    const boardType = BOARD_TYPES[procedureCode]
    if (!boardType) return

    const board = get().boards[boardType]
    if (board?.id) {
      // 기존 보드 업데이트
      const data = await apiPut(`/api/boards/${board.id}`, { content })
      set((state) => ({
        boards: { ...state.boards, [data.board_type]: data },
      }))
      socket.emit('board_updated', { sessionId: projectId, board: data })
      return data
    } else {
      // 새 보드 생성 (upsert)
      const data = await apiPost('/api/boards', {
        session_id: projectId,
        stage: procedureCode,
        board_type: boardType,
        content,
      })
      set((state) => ({
        boards: { ...state.boards, [data.board_type]: data },
      }))
      socket.emit('board_updated', { sessionId: projectId, board: data })
      return data
    }
  },

  /**
   * AI 제안을 보드에 반영 (field 단위 부분 업데이트)
   */
  applyAISuggestion: (procedureCode, suggestion) => {
    const boardType = BOARD_TYPES[procedureCode]
    if (!boardType) return

    set((state) => {
      const existing = state.boards[boardType]
      const currentContent = existing?.content || createEmptyBoard(procedureCode)
      const updatedContent = {
        ...currentContent,
        [suggestion.field]: suggestion.value,
      }
      return {
        boards: {
          ...state.boards,
          [boardType]: {
            ...(existing || {}),
            board_type: boardType,
            content: updatedContent,
          },
        },
      }
    })
  },

  // ── 성취기준 ────

  loadStandards: async (projectId) => {
    try {
      const data = await apiGet(`/api/sessions/${projectId}/standards`)
      set({ standards: Array.isArray(data) ? data : (data?.standards ?? []) })
    } catch {
      set({ standards: [] })
    }
  },

  // ── 자료 ────

  loadMaterials: async (projectId) => {
    try {
      const data = await apiGet(`/api/materials/${projectId}`)
      set({ materials: Array.isArray(data) ? data : (data?.materials ?? []) })
    } catch {
      set({ materials: [] })
    }
  },

  uploadMaterial: async (projectId, file, category) => {
    const data = await apiUploadFile('/api/materials/upload', file, {
      session_id: projectId,
      category: category || 'reference',
    })
    set((state) => ({ materials: [...state.materials, data] }))
    return data
  },

  addUrlMaterial: async (projectId, url, category, title) => {
    const data = await apiPost('/api/materials/url', {
      session_id: projectId,
      url,
      category: category || 'website',
      title: title || '',
    })
    set((state) => ({ materials: [...state.materials, data] }))
    return data
  },

  // ── 원칙 ────

  loadPrinciples: async (procedureCode) => {
    try {
      const data = await apiGet('/api/principles', { stage: procedureCode || get().currentProcedure })
      set({ principles: Array.isArray(data) ? data : (data?.principles ?? []) })
    } catch {
      set({ principles: [] })
    }
  },

  loadGeneralPrinciples: async () => {
    try {
      const data = await apiGet('/api/principles/general')
      set({ generalPrinciples: Array.isArray(data) ? data : (data?.principles ?? []) })
    } catch {
      set({ generalPrinciples: [] })
    }
  },

  // ── 정리 ────

  reset: () => {
    const handler = get()._boardHandler
    if (handler) socket.off('board_changed', handler)
    set({
      boards: {},
      standards: [],
      materials: [],
      principles: [],
      generalPrinciples: [],
      currentProcedure: 'T-1-1',
      currentStep: 1,
      _boardHandler: null,
    })
  },
}))
