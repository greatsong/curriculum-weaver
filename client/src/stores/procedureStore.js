import { create } from 'zustand'
import {
  apiGet,
  apiPost,
  apiPut,
  apiUploadFile,
  apiGetMaterialAnalysis,
  apiReanalyzeMaterial,
  apiDeleteMaterial,
} from '../lib/api'
import { socket } from '../lib/socket'
import {
  PROCEDURES,
  BOARD_TYPES,
  MATERIAL_PROCESSING_STATUSES,
  DEFAULT_MATERIAL_INTENT,
} from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import { createEmptyBoard } from 'curriculum-weaver-shared/boardSchemas.js'

// ── 자료 폴링 관리 (모듈 스코프) ────
// 동일 materialId에 대한 중복 폴링을 막기 위한 Set + 타이머 맵.
const _pollingMaterialIds = new Set()
const _pollingTimers = new Map() // materialId → intervalId
const MATERIAL_POLL_INTERVAL_MS = 3_000

function _stopMaterialPolling(materialId) {
  const timer = _pollingTimers.get(materialId)
  if (timer) {
    clearInterval(timer)
    _pollingTimers.delete(materialId)
  }
  _pollingMaterialIds.delete(materialId)
}

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

  /**
   * 모든 절차의 보드를 한번에 로드 (시뮬레이션 프로젝트용)
   */
  loadAllBoards: async (projectId) => {
    set({ loading: true })
    try {
      const data = await apiGet(`/api/projects/${projectId}/designs`)
      const designs = Array.isArray(data) ? data : (data?.designs ?? [])
      const boards = {}
      for (const design of designs) {
        const boardType = BOARD_TYPES[design.procedure_code] || design.procedure_code
        if (design.content && Object.keys(design.content).length > 0) {
          boards[boardType] = { ...design, board_type: boardType, content: design.content }
        }
      }
      set({ boards, loading: false })
      return true
    } catch {
      set((state) => ({ boards: state.boards, loading: false }))
      return false
    }
  },

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
        return true
      }
      // 새 API: 단일 design 객체 → boards에 BOARD_TYPES 키로 저장 (ProcedureCanvas 호환)
      const boards = {}
      const boardType = BOARD_TYPES[code] || code
      if (design && design.content && Object.keys(design.content).length > 0) {
        boards[boardType] = { ...design, board_type: boardType, content: design.content }
      }
      set({ boards, loading: false })
      return true
    } catch {
      set((state) => ({ boards: state.boards, loading: false }))
      return false
    }
  },

  subscribeBoardUpdates: () => {
    // 레거시 보드 변경 이벤트
    const boardHandler = (board) => {
      set((state) => ({
        boards: { ...state.boards, [board.board_type]: board },
      }))
    }
    // 신규 설계 변경 이벤트 (designs API 연동)
    const designHandler = ({ procedureCode, design }) => {
      const boardType = BOARD_TYPES[procedureCode]
      if (boardType && design) {
        set((state) => ({
          boards: {
            ...state.boards,
            [boardType]: { ...design, board_type: boardType, content: design.content },
          },
        }))
      }
    }
    socket.on('board_changed', boardHandler)
    socket.on('design_changed', designHandler)
    socket.on('design_updated', designHandler)
    set({ _boardHandler: boardHandler, _designHandler: designHandler })
  },

  unsubscribeBoardUpdates: () => {
    const boardHandler = get()._boardHandler
    const designHandler = get()._designHandler
    if (boardHandler) socket.off('board_changed', boardHandler)
    if (designHandler) {
      socket.off('design_changed', designHandler)
      socket.off('design_updated', designHandler)
    }
    set({ _boardHandler: null, _designHandler: null })
  },

  updateBoard: async (projectId, procedureCode, content) => {
    const boardType = BOARD_TYPES[procedureCode]
    if (!boardType) return

    // designs API upsert (Supabase 영속 저장)
    const data = await apiPut(`/api/projects/${projectId}/designs/${procedureCode}`, { content })
    set((state) => ({
      boards: {
        ...state.boards,
        [boardType]: { ...data, board_type: boardType, content: data.content || content },
      },
    }))
    socket.emit('design_updated', { projectId, procedureCode, design: data })
    return data
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
      const data = await apiGet(`/api/standards/project/${projectId}`)
      set({ standards: Array.isArray(data) ? data : (data?.standards ?? []) })
    } catch {
      set((state) => ({ standards: state.standards }))
    }
  },

  // ── 자료 ────

  /**
   * 프로젝트의 자료 목록 로드.
   * 서버 응답: { materials: [...] } 또는 레거시 배열 형식 모두 허용.
   */
  loadMaterials: async (projectId) => {
    if (!projectId) return
    try {
      // 신규 규약: GET /api/materials?project_id=... 응답은 { materials: [] }
      // 레거시: GET /api/materials/:sessionId 가 배열이나 { materials } 를 반환
      // 양쪽을 모두 시도한다 (신규 우선).
      let data
      try {
        data = await apiGet('/api/materials', { project_id: projectId })
      } catch {
        data = await apiGet(`/api/materials/${projectId}`)
      }
      const list = Array.isArray(data) ? data : (data?.materials ?? [])
      set({ materials: list })
      // 미완료 상태 자료는 자동으로 폴링 재개
      for (const m of list) {
        if (
          m?.id &&
          m.processing_status &&
          m.processing_status !== MATERIAL_PROCESSING_STATUSES.COMPLETED &&
          m.processing_status !== MATERIAL_PROCESSING_STATUSES.FAILED
        ) {
          get().startMaterialPolling(m.id)
        }
      }
    } catch {
      set((state) => ({ materials: state.materials }))
    }
  },

  /**
   * 단일 파일 업로드 (낙관적 업데이트 + 진행률).
   * 성공 시 서버 material 객체로 교체하고 폴링 시작.
   * 실패 시 목록에서 tempId 항목 제거 후 에러를 throw.
   *
   * @param {string} projectId
   * @param {File} file
   * @param {string | {category?: string, intent?: string, intentNote?: string}} [options]
   *        — 레거시 호환: 문자열이면 category로 해석
   */
  uploadMaterial: async (projectId, file, options) => {
    if (!projectId) throw new Error('projectId가 필요합니다.')
    // 레거시: uploadMaterial(projectId, file, 'reference') 형태 호환
    const opts = typeof options === 'string' ? { category: options } : (options || {})
    const category = opts.category || 'reference'
    const intent = opts.intent || DEFAULT_MATERIAL_INTENT
    const intentNote = opts.intentNote || null
    // source: 'chat' 이면 서버가 첨부 시스템 메시지를 자동 생성. 기본은 'bar'.
    const source = opts.source || 'bar'

    const tempId = `temp-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`
    const optimistic = {
      id: tempId,
      project_id: projectId,
      file_name: file.name,
      file_size: file.size,
      file_type: (file.name.split('.').pop() || '').toLowerCase(),
      mime_type: file.type || null,
      category,
      intent,
      intent_note: intentNote,
      processing_status: MATERIAL_PROCESSING_STATUSES.PENDING,
      created_at: new Date().toISOString(),
      _uploading: true,
      _progress: 0,
      _tempId: tempId,
    }
    set((state) => ({ materials: [optimistic, ...state.materials] }))

    try {
      const data = await apiUploadFile(
        '/api/materials/upload',
        file,
        {
          project_id: projectId,
          // 레거시 서버 호환 (곧 제거 예정)
          session_id: projectId,
          category,
          intent,
          // 서버는 intent_note(snake_case)로 받음
          ...(intentNote ? { intent_note: intentNote } : {}),
          // 채팅 드롭 업로드 구분 — 서버가 시스템 메시지까지 원자적 삽입
          source,
        },
        {
          onProgress: ({ percent }) => {
            set((state) => ({
              materials: state.materials.map((m) =>
                m.id === tempId ? { ...m, _progress: percent } : m,
              ),
            }))
          },
        },
      )

      // 백엔드 응답 포맷: { material, systemMessage? } 또는 레거시 (객체 자체)
      const material = data?.material ?? data
      if (!material || !material.id) {
        throw new Error('서버 응답이 올바르지 않습니다.')
      }

      set((state) => ({
        materials: state.materials.map((m) => (m.id === tempId ? material : m)),
      }))

      // 채팅 업로드 — 서버가 반환한 시스템 메시지를 chatStore에 삽입 (Realtime 누락 대비)
      if (source === 'chat' && data?.systemMessage?.id) {
        try {
          const mod = await import('./chatStore')
          const useChatStore = mod.useChatStore
          const sys = data.systemMessage
          useChatStore.setState((state) => {
            if (state.messages.some((m) => m.id === sys.id)) return state
            return { messages: [...state.messages, sys] }
          })
        } catch {
          // chatStore 로드 실패 시 무시 (Realtime이 보충)
        }
      }

      // 완료/실패가 아니면 폴링 시작
      if (
        material.processing_status !== MATERIAL_PROCESSING_STATUSES.COMPLETED &&
        material.processing_status !== MATERIAL_PROCESSING_STATUSES.FAILED
      ) {
        get().startMaterialPolling(material.id)
      }
      return material
    } catch (err) {
      // 낙관적 항목 제거 후 에러 재throw (컴포넌트가 토스트로 처리)
      set((state) => ({
        materials: state.materials.filter((m) => m.id !== tempId),
      }))
      throw err
    }
  },

  /**
   * 다중 파일 업로드. 각 파일을 병렬(Promise.allSettled)로 업로드한다.
   *
   * @param {string} projectId
   * @param {Array<File | {file: File, intent?: string, intentNote?: string, category?: string}>} files
   * @param {string} [defaultCategory] — 레거시 호환용. 3번째 인자가 문자열이면 category로 해석.
   *        신규 호출부는 files 배열 항목에 category를 직접 넣는 것을 권장.
   * @returns {Promise<Array<{status:'fulfilled'|'rejected', value?:any, reason?:any, file:File}>>}
   */
  uploadMaterials: async (projectId, files, defaultCategory) => {
    if (!projectId) throw new Error('projectId가 필요합니다.')
    const list = Array.from(files || [])
    if (list.length === 0) return []

    // 각 항목을 { file, intent, intentNote, category } 형태로 정규화
    const normalized = list.map((item) => {
      if (item instanceof File) {
        return { file: item, category: defaultCategory }
      }
      return {
        file: item.file,
        intent: item.intent,
        intentNote: item.intentNote,
        category: item.category || defaultCategory,
      }
    })

    const results = await Promise.allSettled(
      normalized.map((n) =>
        get().uploadMaterial(projectId, n.file, {
          category: n.category,
          intent: n.intent,
          intentNote: n.intentNote,
        }),
      ),
    )
    return results.map((r, idx) => ({ ...r, file: normalized[idx].file }))
  },

  addUrlMaterial: async (projectId, url, category, title) => {
    const data = await apiPost('/api/materials/url', {
      project_id: projectId,
      session_id: projectId, // 레거시 호환
      url,
      category: category || 'website',
      title: title || '',
    })
    const material = data?.material ?? data
    set((state) => ({ materials: [material, ...state.materials] }))
    return material
  },

  /**
   * 자료 재분석. 상태를 analyzing으로 낙관적 업데이트 후 서버 트리거.
   */
  reanalyzeMaterial: async (materialId) => {
    if (!materialId) return
    set((state) => ({
      materials: state.materials.map((m) =>
        m.id === materialId
          ? { ...m, processing_status: MATERIAL_PROCESSING_STATUSES.PARSING, _error: null }
          : m,
      ),
    }))
    try {
      const data = await apiReanalyzeMaterial(materialId)
      const material = data?.material ?? data
      if (material?.id) {
        set((state) => ({
          materials: state.materials.map((m) => (m.id === materialId ? { ...m, ...material } : m)),
        }))
      }
      get().startMaterialPolling(materialId)
    } catch (err) {
      set((state) => ({
        materials: state.materials.map((m) =>
          m.id === materialId
            ? { ...m, processing_status: MATERIAL_PROCESSING_STATUSES.FAILED, _error: err?.message || '재분석 실패' }
            : m,
        ),
      }))
      throw err
    }
  },

  /**
   * 자료 삭제 (낙관적).
   */
  deleteMaterial: async (materialId) => {
    if (!materialId) return
    const prev = get().materials
    set((state) => ({ materials: state.materials.filter((m) => m.id !== materialId) }))
    _stopMaterialPolling(materialId)
    try {
      await apiDeleteMaterial(materialId)
    } catch (err) {
      // 롤백
      set({ materials: prev })
      throw err
    }
  },

  /**
   * 자료 분석 상태 폴링 시작. 3초 간격으로 completed/failed까지 폴링.
   * 동일 materialId에 대해 이미 폴링 중이면 무시.
   */
  startMaterialPolling: (materialId) => {
    if (!materialId) return
    if (_pollingMaterialIds.has(materialId)) return
    _pollingMaterialIds.add(materialId)

    const tick = async () => {
      try {
        const res = await apiGetMaterialAnalysis(materialId)
        const material = res?.material
        const analysis = res?.analysis ?? null
        if (!material) {
          _stopMaterialPolling(materialId)
          return
        }
        set((state) => ({
          materials: state.materials.map((m) =>
            m.id === materialId
              ? {
                  ...m,
                  ...material,
                  ai_analysis: analysis ?? m.ai_analysis ?? null,
                }
              : m,
          ),
        }))
        if (
          material.processing_status === MATERIAL_PROCESSING_STATUSES.COMPLETED ||
          material.processing_status === MATERIAL_PROCESSING_STATUSES.FAILED
        ) {
          _stopMaterialPolling(materialId)
        }
      } catch {
        // 간헐적 실패는 무시하고 다음 주기까지 대기
      }
    }

    // 즉시 1회 + 이후 인터벌
    tick()
    const timer = setInterval(tick, MATERIAL_POLL_INTERVAL_MS)
    _pollingTimers.set(materialId, timer)
  },

  /**
   * 특정 materialId 폴링 중단 (컴포넌트 unmount 등에서 호출).
   */
  stopMaterialPolling: (materialId) => {
    _stopMaterialPolling(materialId)
  },

  /**
   * 전체 폴링 중단 (페이지 전환 시 cleanup).
   */
  stopAllMaterialPolling: () => {
    for (const id of Array.from(_pollingMaterialIds)) {
      _stopMaterialPolling(id)
    }
  },

  // ── 원칙 ────

  loadPrinciples: async (procedureCode) => {
    try {
      const data = await apiGet('/api/principles', { stage: procedureCode || get().currentProcedure })
      set({ principles: Array.isArray(data) ? data : (data?.principles ?? []) })
    } catch {
      set((state) => ({ principles: state.principles }))
    }
  },

  loadGeneralPrinciples: async (retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await apiGet('/api/principles/general')
        const result = Array.isArray(data) ? data : (data?.principles ?? [])
        if (result.length > 0) {
          set({ generalPrinciples: result })
          return
        }
      } catch {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
    }
    // 최종 실패 시에도 빈 배열이 아닌 기존 값 유지
    if (get().generalPrinciples.length === 0) {
      set({ generalPrinciples: [] })
    }
  },

  // ── 정리 ────

  reset: () => {
    const handler = get()._boardHandler
    if (handler) socket.off('board_changed', handler)
    // 모든 폴링 타이머 정리
    for (const id of Array.from(_pollingMaterialIds)) {
      _stopMaterialPolling(id)
    }
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
