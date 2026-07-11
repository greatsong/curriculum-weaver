import { create } from 'zustand'
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  apiUploadFile,
  apiGetMaterialAnalysis,
  apiReanalyzeMaterial,
  apiDeleteMaterial,
} from '../lib/api'
import { socket } from '../lib/socket'
import { pushToast } from './toastStore'
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
const _pollingStartedAt = new Map() // materialId → epoch ms (무한 폴링 방지용)
const MATERIAL_POLL_INTERVAL_MS = 3_000
// 서버 분석 타임아웃(60초) + 파싱·재시도 여유를 넉넉히 잡은 상한.
// 폴러가 컴포넌트가 아닌 스토어 수명으로 돌기 때문에 반드시 자체 종료 조건이 필요하다.
const MATERIAL_POLL_MAX_AGE_MS = 10 * 60 * 1_000

function _stopMaterialPolling(materialId) {
  const timer = _pollingTimers.get(materialId)
  if (timer) {
    clearInterval(timer)
    _pollingTimers.delete(materialId)
  }
  _pollingMaterialIds.delete(materialId)
  _pollingStartedAt.delete(materialId)
}

/**
 * 보드 content 병합 유틸. 중첩 plain object는 깊은 병합으로 기존 하위 키를 보존하고,
 * 배열·스칼라는 incoming 값으로 교체한다(applyBoardContent 주석 참고).
 */
function deepMergeBoardContent(base, incoming) {
  const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)
  if (!isPlainObject(base)) return incoming
  const out = { ...base }
  for (const [key, value] of Object.entries(incoming)) {
    const current = out[key]
    if (isPlainObject(value) && isPlainObject(current)) {
      out[key] = deepMergeBoardContent(current, value)
    } else {
      out[key] = value
    }
  }
  return out
}

export const useProcedureStore = create((set, get) => ({
  currentProcedure: 'T-1-1',
  currentStep: 1,
  // 절차별 마지막 진행 단계 기억 (절차를 오갈 때 1단계로 리셋되는 문제 방지).
  // projectId별로 localStorage에도 미러링하여 새로고침/탭 복귀에도 단계가 유지된다.
  stepMemory: {},     // { [procedureCode]: stepNumber }
  _stepProjectId: null,
  // 전 절차의 보드 진행 요약 (진행률 표시 + 후행 절차 stale 감지용).
  boardSummaries: {}, // { [procedureCode]: { hasContent, updatedAt, saveStatus } }
  // 팀 결정으로 생략(스킵)된 절차 — 진행률 분모·네비 표시·AI 카드 가드의 원천.
  // 프로젝트 GET 응답의 skipped_procedures로 초기화, 소켓으로 실시간 동기화.
  skippedProcedures: [], // [{ procedure_code, reason, skipped_by, created_at }]
  boards: {},         // boardType → board data
  standards: [],
  materials: [],
  // 컨텍스트에서 제외할 자료 ID 집합. 기본은 빈 Set(모두 포함).
  // 체크박스를 끈 자료만 여기에 들어간다 → 새 자료가 업로드되어도 자동으로 포함됨.
  excludedMaterialIds: new Set(),
  principles: [],
  generalPrinciples: [],
  // 현재 절차의 활동흐름(가이드북 3장)이 특히 강조하는 총괄 원리(GP) id 목록 — PrinciplePanel 강조용
  relevantGeneralPrincipleIds: [],
  loading: false,

  // ── 절차/스텝 네비게이션 ────

  setProcedure: (code) => {
    if (PROCEDURES[code]) {
      const steps = PROCEDURE_STEPS[code]
      const maxStep = steps && steps.length > 0 ? steps.length : 0
      // 절차를 떠났다 돌아오면 마지막으로 보던 단계를 복원한다(없으면 1단계).
      const remembered = get().stepMemory[code]
      const restoredStep =
        remembered && remembered >= 1 && remembered <= maxStep
          ? remembered
          : (maxStep > 0 ? 1 : 0)
      const changingProcedure = get().currentProcedure !== code
      set({
        currentProcedure: code,
        currentStep: restoredStep,
        // 이전 절차의 협력UP 강조가 새 절차에 잘못 남지 않도록 초기화.
        // 다음 채팅 메시지의 SSE 응답으로 새 절차 기준 값이 다시 채워진다.
        ...(changingProcedure ? { relevantGeneralPrincipleIds: [] } : {}),
      })
    }
  },

  setStep: (num) => {
    const { currentProcedure, _stepProjectId } = get()
    const steps = PROCEDURE_STEPS[currentProcedure]
    if (steps && num >= 1 && num <= steps.length) {
      const stepMemory = { ...get().stepMemory, [currentProcedure]: num }
      set({ currentStep: num, stepMemory })
      // 새로고침/탭 복귀에도 단계 유지 — projectId별 localStorage 미러
      if (_stepProjectId) {
        try {
          localStorage.setItem(`cw_steps_${_stepProjectId}`, JSON.stringify(stepMemory))
        } catch { /* localStorage 불가 시 무시 */ }
      }
    }
  },

  /**
   * 프로젝트 진입 시 저장된 단계 기억을 localStorage에서 복원한다.
   */
  loadStepMemory: (projectId) => {
    if (!projectId) return
    let stepMemory = {}
    try {
      const raw = localStorage.getItem(`cw_steps_${projectId}`)
      if (raw) stepMemory = JSON.parse(raw) || {}
    } catch { /* 파싱 실패 시 빈 객체 */ }
    set({ stepMemory, _stepProjectId: projectId })
  },

  /**
   * 전 절차의 보드 진행 요약을 로드한다(진행률 표시 + stale 감지용).
   * 보드 본문 전체가 아니라 hasContent/updatedAt/saveStatus만 추린다.
   */
  loadBoardSummaries: async (projectId) => {
    if (!projectId) return
    try {
      const data = await apiGet(`/api/projects/${projectId}/designs`)
      const designs = Array.isArray(data) ? data : (data?.designs ?? [])
      const summaries = {}
      for (const d of designs) {
        const code = d.procedure_code
        if (!code) continue
        summaries[code] = {
          hasContent: !!(d.content && Object.keys(d.content).length > 0),
          updatedAt: d.updated_at || d.created_at || null,
          saveStatus: d.save_status || null,
        }
      }
      set({ boardSummaries: summaries })
    } catch { /* 진행 표시는 부가 기능 — 실패해도 무시 */ }
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
          // 협업자(B)의 진행률/네비게이션도 함께 갱신 — design_updated만 받고
          // boardSummaries를 안 고치면 B의 완료 표시가 stale해진다.
          boardSummaries: {
            ...state.boardSummaries,
            [procedureCode]: {
              hasContent: !!(design.content && Object.keys(design.content).length > 0),
              updatedAt: design.updated_at || new Date().toISOString(),
              saveStatus: design.save_status || state.boardSummaries[procedureCode]?.saveStatus || null,
            },
          },
        }))
      }
    }
    // 다른 멤버의 스킵/해제를 실시간 반영 — 없으면 새로고침 전까지
    // 팀원마다 다른 워크플로우를 보는 상태 발산이 생긴다.
    // 주의: 내 화면(로컬 뷰)은 강제 이동시키지 않는다. 스킵 절차는 열람이 허용되고,
    // 편집 중이던 멤버를 다른 절차로 튕기면 미저장 초안이 유실된다.
    // 화면에는 생략 배너·읽기전용 전환만 일어나고, 이동은 사용자의 선택.
    const skipsHandler = ({ skips }) => {
      set({ skippedProcedures: skips || [] })
    }
    // 자료 분석 상태 실시간 반영 — 서버가 parsing/analyzing/completed/failed 전이마다
    // material_updated를 쏜다. 폴링(3초 주기)의 감지 지연 없이 즉시 반영하고,
    // 종결 상태면 폴링을 조기 종료한다 (폴링은 소켓 유실 대비 안전망으로 유지).
    const materialHandler = (patch) => {
      if (!patch?.id) return
      get().applyMaterialUpdate(patch)
    }
    socket.on('board_changed', boardHandler)
    socket.on('design_changed', designHandler)
    socket.on('design_updated', designHandler)
    socket.on('procedure_skips_changed', skipsHandler)
    socket.on('material_updated', materialHandler)
    set({ _boardHandler: boardHandler, _designHandler: designHandler, _skipsHandler: skipsHandler, _materialHandler: materialHandler })
  },

  unsubscribeBoardUpdates: () => {
    const boardHandler = get()._boardHandler
    const designHandler = get()._designHandler
    const skipsHandler = get()._skipsHandler
    const materialHandler = get()._materialHandler
    if (boardHandler) socket.off('board_changed', boardHandler)
    if (designHandler) {
      socket.off('design_changed', designHandler)
      socket.off('design_updated', designHandler)
    }
    if (skipsHandler) socket.off('procedure_skips_changed', skipsHandler)
    if (materialHandler) socket.off('material_updated', materialHandler)
    set({ _boardHandler: null, _designHandler: null, _skipsHandler: null, _materialHandler: null })
  },

  // ── 절차 스킵 (건너뛰기) ────

  /** 프로젝트 GET 응답의 skipped_procedures로 초기화 */
  setSkips: (skips) => set({ skippedProcedures: Array.isArray(skips) ? skips : [] }),

  /** 스킵 여부 조회 헬퍼 */
  isSkipped: (code) => get().skippedProcedures.some((s) => s.procedure_code === code),

  /**
   * 절차 건너뛰기 (host/owner 전용 — 서버가 검증).
   * 서버가 커서를 보정했으면 로컬 뷰도 따라간다.
   */
  skipProcedure: async (projectId, procedureCode, reason) => {
    const data = await apiPost(
      `/api/projects/${projectId}/procedures/${procedureCode}/skip`,
      reason ? { reason } : {}
    )
    set({ skippedProcedures: data.skips || [] })
    if (data.current_procedure && get().currentProcedure === procedureCode) {
      get().setProcedure(data.current_procedure)
    }
    return data
  },

  /**
   * 건너뛰기 해제. 커서는 건드리지 않는다.
   * 스킵 전에 캐시된 옛 맥락 인트로가 재생되지 않도록 introCache를 무효화한다.
   */
  unskipProcedure: async (projectId, procedureCode) => {
    const data = await apiDelete(`/api/projects/${projectId}/procedures/${procedureCode}/skip`)
    set({ skippedProcedures: data.skips || [] })
    try {
      const mod = await import('./chatStore')
      mod.useChatStore.setState((state) => {
        if (!state.introCache[procedureCode]) return state
        const { [procedureCode]: _removed, ...rest } = state.introCache
        return { introCache: rest }
      })
    } catch { /* chatStore 로드 실패 시 무시 */ }
    return data
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

  /**
   * board_update 제안을 보드에 반영 (전체 보드 content 병합).
   * AI는 ai_suggestion type="board_update"로 보드 전체 데이터를 제안하므로,
   * field 단위가 아니라 content 객체 전체를 기존 내용에 병합해야 한다.
   *
   * 병합 규칙(데이터 유실 방지):
   * - 중첩 객체 필드: 깊은 병합(기존 하위 키 보존). 얕은 병합 시 제안에 빠진
   *   하위 키가 통째로 날아가던 문제를 막는다.
   * - 배열/스칼라 필드: 제안값으로 교체. board_update는 보통 해당 절차 보드
   *   '전체'를 의도하므로 배열 교체가 정상 동작이다(append 시 중복 행 발생).
   * - 제안에 없는 최상위 필드: 기존값 그대로 보존.
   */
  applyBoardContent: (procedureCode, content) => {
    const boardType = BOARD_TYPES[procedureCode]
    if (!boardType || !content || typeof content !== 'object') return

    set((state) => {
      const existing = state.boards[boardType]
      const currentContent = existing?.content || createEmptyBoard(procedureCode)
      return {
        boards: {
          ...state.boards,
          [boardType]: {
            ...(existing || {}),
            board_type: boardType,
            content: deepMergeBoardContent(currentContent, content),
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
    // URL도 파일과 동일하게 fetch→AI 분석을 거치므로 완료/실패가 아니면 폴링 시작
    if (
      material?.id &&
      material.processing_status !== MATERIAL_PROCESSING_STATUSES.COMPLETED &&
      material.processing_status !== MATERIAL_PROCESSING_STATUSES.FAILED
    ) {
      get().startMaterialPolling(material.id)
    }
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
    const prevExcluded = get().excludedMaterialIds
    set((state) => {
      const nextExcluded = new Set(state.excludedMaterialIds)
      nextExcluded.delete(materialId)
      return {
        materials: state.materials.filter((m) => m.id !== materialId),
        excludedMaterialIds: nextExcluded,
      }
    })
    _stopMaterialPolling(materialId)
    try {
      await apiDeleteMaterial(materialId)
    } catch (err) {
      // 롤백
      set({ materials: prev, excludedMaterialIds: prevExcluded })
      throw err
    }
  },

  /**
   * 자료의 컨텍스트 포함 여부 토글.
   * included=true → 포함(excluded에서 제거), false → 제외(excluded에 추가).
   */
  setMaterialContextIncluded: (materialId, included) => {
    if (!materialId) return
    set((state) => {
      const next = new Set(state.excludedMaterialIds)
      if (included) next.delete(materialId)
      else next.add(materialId)
      return { excludedMaterialIds: next }
    })
  },

  /**
   * 모든 자료를 컨텍스트에 포함시킨다.
   */
  selectAllMaterials: () => {
    set({ excludedMaterialIds: new Set() })
  },

  /**
   * 모든 자료를 컨텍스트에서 제외한다.
   */
  deselectAllMaterials: () => {
    const ids = get().materials.map((m) => m.id)
    set({ excludedMaterialIds: new Set(ids) })
  },

  /**
   * 컨텍스트에 포함된 자료 ID 목록을 반환.
   * 채팅 전송 직전에 호출한다.
   */
  getSelectedMaterialIds: () => {
    const { materials, excludedMaterialIds } = get()
    return materials
      .filter((m) => !excludedMaterialIds.has(m.id))
      .map((m) => m.id)
  },

  /**
   * 자료 분석 상태 폴링 시작. 3초 간격으로 completed/failed까지 폴링.
   * 동일 materialId에 대해 이미 폴링 중이면 무시.
   * 폴러는 컴포넌트가 아닌 스토어 수명으로 동작 — 다른 화면으로 이동해도
   * 완료/실패 시점에 전역 토스트로 알려준다.
   */
  startMaterialPolling: (materialId) => {
    if (!materialId) return
    if (_pollingMaterialIds.has(materialId)) return
    _pollingMaterialIds.add(materialId)
    _pollingStartedAt.set(materialId, Date.now())

    const tick = async () => {
      // 안전장치: 상한 초과 시 폴링 중단 (서버 행 등으로 종료 상태가 안 오는 경우)
      const startedAt = _pollingStartedAt.get(materialId)
      if (startedAt && Date.now() - startedAt > MATERIAL_POLL_MAX_AGE_MS) {
        _stopMaterialPolling(materialId)
        return
      }
      try {
        const res = await apiGetMaterialAnalysis(materialId)
        const material = res?.material
        const analysis = res?.analysis ?? null
        if (!material) {
          _stopMaterialPolling(materialId)
          return
        }
        const prevStatus = get().materials.find((m) => m.id === materialId)?.processing_status
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
        const status = material.processing_status
        if (
          status === MATERIAL_PROCESSING_STATUSES.COMPLETED ||
          status === MATERIAL_PROCESSING_STATUSES.FAILED
        ) {
          _stopMaterialPolling(materialId)
          // 상태가 실제로 '전이'된 경우에만 전역 토스트 (이미 완료였던 자료 재폴링 시 중복 방지)
          if (prevStatus !== status) {
            const name = material.file_name || material.title || '자료'
            if (status === MATERIAL_PROCESSING_STATUSES.COMPLETED) {
              pushToast({ kind: 'success', message: `'${name}' 분석이 완료됐어요. 자료 목록에서 요약을 확인할 수 있어요.` })
            } else {
              pushToast({ kind: 'error', message: `'${name}' 분석에 실패했어요. 자료 목록에서 재분석해 보세요.`, duration: 8_000 })
            }
          }
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

  setRelevantGeneralPrincipleIds: (ids) => {
    set({ relevantGeneralPrincipleIds: Array.isArray(ids) ? ids : [] })
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
    // 자료 분석 폴링은 여기서 정리하지 않는다 — 프로젝트 화면을 벗어나도(ProjectPage
    // unmount cleanup이 reset을 호출) 분석 완료/실패를 전역 토스트로 알리기 위함.
    // 폴러는 completed/failed 또는 MATERIAL_POLL_MAX_AGE_MS(10분) 상한에서 자체 종료한다.
    // 명시적으로 전부 멈춰야 하면 stopAllMaterialPolling()을 별도로 호출할 것.
    // currentProcedure/currentStep은 리셋하지 않는다.
    // 탭 복귀 시 reset()이 불려 절차가 'T-1-1'로 돌아가면, 복원 effect는
    // currentProject.current_procedure 값이 안 바뀌어 재실행되지 않아 복원에 실패한다
    // (상단 메뉴는 분석인데 하단은 팀준비로 어긋나는 버그). 절차는 프로젝트 진입/전환 시
    // 복원 effect가 DB 값으로 세팅하므로 여기서 건드리지 않는다.
    set({
      boards: {},
      standards: [],
      materials: [],
      excludedMaterialIds: new Set(),
      principles: [],
      generalPrinciples: [],
      relevantGeneralPrincipleIds: [],
      // 프로젝트 전환 시 이전 프로젝트의 스킵이 남지 않게 초기화
      // (진입 시 프로젝트 GET 응답의 skipped_procedures로 다시 채워짐)
      skippedProcedures: [],
      _boardHandler: null,
    })
  },
}))
