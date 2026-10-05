import { create } from 'zustand'
import { apiGet, apiPost, apiStreamPost } from '../lib/api'
import { socket } from '../lib/socket'
import { useProcedureStore } from './procedureStore'
import { useProjectStore } from './projectStore'
import { useWorkspaceStore } from './workspaceStore'
import { pushToast } from './toastStore'
import { PROCEDURES, BOARD_TYPES, BOARD_TYPE_LABELS, normalizeProcedureCode, getProcedureLabel } from 'curriculum-weaver-shared/constants.js'
import { HANDOFF_HEADER } from '../lib/futuresProjectHandoff'
import { applyDraftEvent, safeLocalStorage } from '../lib/explorationDraft'
import { sameJson } from '../lib/sameJson'
import { isBriefProcedure, stripEmptyBoardFields } from 'curriculum-weaver-shared/briefMode.js'
import { workflowConfigForProject } from '../lib/projectWorkspace'
import { isMoveNote } from 'curriculum-weaver-shared/procedureMove.js'

/**
 * 이 절차를 약식으로 진행하는지 — 지금 연 프로젝트의 워크스페이스 설정 기준(핵심 절차 정식 진행 반영).
 * 기존 팀·핵심 절차(정식)는 false
 * @param {string} procedureCode
 */
export function isBriefProcedureNow(procedureCode) {
  return isBriefProcedure(currentWorkflowConfig(), procedureCode)
}

/** 지금 연 프로젝트의 작업 공간 설정(다른 작업 공간의 설정이 남아 있으면 null) */
function currentWorkflowConfig() {
  return workflowConfigForProject(useProjectStore.getState().currentProject, useWorkspaceStore.getState().currentWorkspace)
}

/** 제안이 반영되는 보드의 화면 이름 (예: '팀 일정') */
function boardLabelOf(suggestion) {
  const boardType = BOARD_TYPES[suggestion?.procedureCode]
  return (boardType && BOARD_TYPE_LABELS[boardType]) || '설계'
}

function isReadOnlyProject(project) {
  return project?.status === 'simulation' ||
    project?.status === 'generating' ||
    project?.status === 'failed' ||
    project?.title?.startsWith('[시뮬레이션]')
}

// ── XML 파서 유틸 ────────────────────────────

/**
 * AI 응답에서 <ai_suggestion> XML을 파싱한다
 * @returns {Array<{procedureCode: string, field: string, value: any, rationale: string}>}
 */
function parseAISuggestions(text) {
  const suggestions = []
  // 서버 extractAiSuggestions(chat.js) 및 AI 생성 형식과 동일하게 파싱한다.
  // <ai_suggestion type="board_update" procedure=".." step=".." action="..">{JSON}</ai_suggestion>
  // (SSE board_suggestions 경로가 주력이며, 이 텍스트 파싱은 SSE 누락 시의 백업이다.)
  const regex = /<ai_suggestion\s+type="([^"]+)"\s+procedure="([^"]+)"\s+step="([^"]*?)"\s*(?:action="([^"]*?)")?\s*>\s*([\s\S]*?)\s*<\/ai_suggestion>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    // AI는 표시 코드(T-2)로 쓰도록 지시받음 — 내부 코드로 정규화 (수락 API는 내부 코드 기준)
    const [, type, rawProcedure, , , inner] = match
    const procedureCode = normalizeProcedureCode(rawProcedure)
    let value = inner.trim()
    try {
      value = JSON.parse(value)
    } catch {
      // 문자열 그대로 사용
    }
    // onBoardSuggestions(SSE) 콜백과 동일한 형태로 맞춘다(field 없는 board_update).
    suggestions.push({ procedureCode, type: type || 'board_update', field: null, value, rationale: '' })
  }
  return suggestions
}

/**
 * AI 응답에서 <coherence_check> XML을 파싱한다.
 * 서버 extractCoherenceCheck 및 AI 생성 형식과 동일:
 * <coherence_check procedure=".." against="..">{"aligned":..,"feedback":..,"details":[..]}</coherence_check>
 * 반환 형태는 onCoherenceCheck(SSE) 콜백과 동일(status/issues/suggestions).
 */
function parseCoherenceCheck(text) {
  const match = text.match(/<coherence_check\b[^>]*>([\s\S]*?)<\/coherence_check>/)
  if (!match) return null
  let data
  try {
    data = JSON.parse(match[1].trim())
  } catch {
    return null
  }
  return {
    status: data.aligned ? 'pass' : 'warning',
    issues: data.feedback || '',
    suggestions: Array.isArray(data.details)
      ? data.details.map((d) => d.suggestion || d.item || '').filter(Boolean).join(', ')
      : (data.details || ''),
  }
}

/**
 * AI 응답에서 <procedure_advance> XML을 파싱한다
 */
function parseProcedureAdvance(text) {
  // 다음 절차 코드를 확정하고, 실제 존재하는 절차일 때만 전환 제안을 반환한다.
  // (빈 코드/존재하지 않는 코드(AI 환각)는 null → 코드·이름이 빈 "제목 없는 이동 버튼" 방지)
  // 속성 형식 (AI가 실제로 생성하는 형식, aiAgent.js 시스템 프롬프트 기준):
  // <procedure_advance current="A-1-1" suggested="A-2-1" reason="..."/>
  const selfClosing = text.match(/<procedure_advance\b([^>]*?)\/?>/)
  if (selfClosing && /suggested=/.test(selfClosing[1])) {
    const attrs = selfClosing[1]
    const suggested = normalizeProcedureCode(attrs.match(/suggested="([^"]*)"/)?.[1]?.trim()) || null
    const current = normalizeProcedureCode(attrs.match(/current="([^"]*)"/)?.[1]?.trim()) || null
    const reason = attrs.match(/reason="([^"]*)"/)?.[1]?.trim() || ''
    if (suggested && PROCEDURES[suggested]) {
      return {
        next_procedure: suggested,
        next_name: PROCEDURES[suggested].name,
        summary: reason,
        current,
      }
    }
    return null
  }
  // 레거시 자식 태그 형식: <procedure_advance><next_procedure>...</next_procedure></procedure_advance>
  const match = text.match(/<procedure_advance>([\s\S]*?)<\/procedure_advance>/)
  if (!match) return null
  const inner = match[1]
  const nextCode = normalizeProcedureCode(inner.match(/<next_procedure>([\s\S]*?)<\/next_procedure>/)?.[1]?.trim()) || null
  const summary = inner.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() || ''
  if (!nextCode || !PROCEDURES[nextCode]) return null
  return {
    next_procedure: nextCode,
    next_name: PROCEDURES[nextCode].name,
    summary,
  }
}

/**
 * 스트리밍 텍스트에서 모든 XML 마커를 제거
 */
function stripXmlMarkers(text) {
  return text
    .replace(/<ai_suggestion[\s\S]*?<\/ai_suggestion>/g, '')
    .replace(/<coherence_check>[\s\S]*?<\/coherence_check>/g, '')
    .replace(/<procedure_advance>[\s\S]*?<\/procedure_advance>/g, '')
    .replace(/<procedure_advance\b[^>]*\/?>/g, '') // 속성/self-closing 형식
    .replace(/<board_update\s+type="[^"]*">[\s\S]*?<\/board_update>/g, '')
    .replace(/<stage_advance>[\s\S]*?<\/stage_advance>/g, '')
    // 미완성 태그도 제거
    .replace(/<ai_suggestion[\s\S]*$/g, '')
    .replace(/<coherence_check[\s\S]*$/g, '')
    .replace(/<procedure_advance[\s\S]*$/g, '')
    .replace(/<board_update[\s\S]*$/g, '')
    .replace(/<stage_advance[\s\S]*$/g, '')
    // 짝 없는 닫는 태그(두 응답이 섞이거나 앞부분이 잘린 경우)도 지운다
    .replace(/<\/(ai_suggestion|coherence_check|procedure_advance|board_update|stage_advance)>/g, '')
    .trim()
}

// ── Store ────────────────────────────────────

/**
 * SSE 스트림 호출을 감싸, 어떤 경로로 끝나든(정상·오류·예외) streaming 플래그가 남지 않게 한다.
 * 플래그가 남으면 입력창이 잠기고 탭 복귀 새로고침(loadMessages)까지 막혀, 페이지를 통째로
 * 새로고침하기 전까지 복구되지 않는다.
 *
 * isCurrent: 이 스트림이 지금 요청(_streamSeq)인지. 늦게 끝난 이전 요청이 지금 요청의 잠금과
 * 글자를 지우지 않게, 지금 요청일 때만 초기화한다. 잠금을 거는 두 함수(sendMessage·requestProcedureIntro)가
 * 잠글 때마다 번호를 올리므로, 마지막으로 잠근 요청이 항상 지금 요청이고 그 finally가 반드시 잠금을 푼다.
 */
async function guardStreaming(set, get, streamPromise, isCurrent = () => true) {
  try {
    await streamPromise
  } catch (err) {
    console.error('AI 스트림 처리 오류:', err)
  } finally {
    if (isCurrent() && get().streaming) set({ streaming: false, streamingText: '' })
  }
}

/** 이 탭의 소켓 id. 연결 전이면 undefined → 본문에서 빠지고 서버는 방송하지 않는다 */
function requesterSocketId() {
  const id = socket?.id
  return typeof id === 'string' && id ? id : undefined
}

/**
 * AI 메시지를 붙이되 같은 id가 이미 있으면 그대로 둔다. 서버가 저장 번호(message_saved)를 알려 주면
 * 그 번호로 붙이는데, 소켓 재연결로 이 탭의 id가 바뀌면 서버 방송(message_added)이 이 탭에도 와서
 * 먼저 붙어 있을 수 있다. 그때는 서버 원문을 남긴다.
 */
function appendUnlessPresent(messages, message) {
  return messages.some((m) => m.id === message.id) ? messages : [...messages, message]
}

/**
 * 탐색 초안에서 나온 제안을 수락한 결과를 초안 상태에 남긴다(이 브라우저에만).
 * 저장 응답을 받았으면 '보드에 반영됨', 받지 못했으면 '저장 확인 필요' — 실패를 성공으로 표시하지 않는다.
 */
function noteExplorationOutcome(projectId, suggestion, persisted) {
  if (!suggestion?.fromExploration) return
  applyDraftEvent(safeLocalStorage(), projectId, {
    type: 'accepted', draftId: suggestion.fromExploration, persisted, at: Date.now(),
    label: suggestion.procedureCode ? getProcedureLabel(suggestion.procedureCode) : '',
  })
}

export const useChatStore = create((set, get) => ({
  messages: [],
  loadingMessages: false,
  streaming: false,
  streamingText: '',

  // AI 제안 관련 상태
  pendingSuggestions: [],        // 수락/편집/거부 대기 중인 AI 제안
  coherenceCheckResult: null,   // 정합성 점검 결과
  procedureAdvanceSuggestion: null, // 절차 전환 제안
  _acceptedBoardsInBatch: [],      // 한 번의 AI 응답에서 나온 제안 중 수락된 보드 라벨(마지막 처리 때 한 번만 AI에 알림)
  _lastAiMessageId: null,       // 마지막 AI 메시지 ID (제안 수락 시 사용)

  // 인트로 캐시 (절차별 인트로를 1회만 생성)
  introCache: {},               // { [procedureCode]: introContent }
  showIntroModal: false,
  introModalContent: '',
  introModalProcedure: '',

  // 레거시 호환
  boardSuggestions: [],
  stageAdvanceSuggestion: null,

  // ── 미래보기 탐색 초안 → 대화 입력창 ──
  // composerDraft: ChatPanel이 한 번 읽어 입력창에 넣고 비운다. 자동 전송하지 않는다.
  // explorationDraftLink: 입력창에 넣은 초안 — 교사가 그 내용을 보내면 초안 상태를 '대화에 보냄'으로 바꾸고,
  //   그 응답에서 나온 제안에 fromExploration(초안 id)을 붙여 수락·거부 결과를 초안에 기록한다.
  composerDraft: null,
  explorationDraftLink: null,
  setComposerDraft: ({ text, projectId, draftId }) => set({
    composerDraft: { text, projectId, draftId, at: Date.now() },
    explorationDraftLink: { projectId, draftId },
  }),
  consumeComposerDraft: () => set({ composerDraft: null }),

  // 시연 모드 채점관 렌즈(코치↔채점관 강도 토글). true면 채팅 요청에 examiner_lens=true를 실어
  // 서버(시연 모드)에서 채점관 관점 피드백 강도를 높인다. 협력 모드에서는 서버가 무시한다.
  examinerLens: false,
  setExaminerLens: (on) => set({ examinerLens: !!on }),

  // ── Socket.IO 이벤트 리스너 ────

  subscribe: (sessionId) => {
    // 메시지 upsert — 동일 id 있으면 덮어쓰기, 없으면 append
    // 시스템 메시지의 processing_status가 parsing → completed로 바뀔 때 필요.
    // AI 답은 서버가 저장한 원문을 서버 id로 보낸다(routes/chat.js). 옛 탭의 ai_response_done(임시 id)과
    // 서버 방송은 한 응답에 둘 중 하나만 오므로(옛 탭은 socket_id를 싣지 않아 서버가 방송하지 않는다)
    // 같은 답이 임시 id와 서버 id로 두 번 붙지 않는다. 요청한 탭 자신은 message_saved 번호로 붙여 id로 거른다.
    const upsertHandler = (message) => {
      if (!message || !message.id) return
      set((state) => {
        const idx = state.messages.findIndex((m) => m.id === message.id)
        if (idx >= 0) {
          const next = state.messages.slice()
          next[idx] = { ...next[idx], ...message }
          return { messages: next }
        }
        return { messages: [...state.messages, message] }
      })
    }
    // 절차 이동 기록 정리: 지나쳐 간 이동의 기록·안내가 지워졌다
    const removeHandler = (removed) => {
      if (removed?.id) get()._removeMessages([removed])
    }
    socket.on('message_added', upsertHandler)
    socket.on('message_updated', upsertHandler)
    socket.on('message_removed', removeHandler)
    set({ _messageHandler: upsertHandler, _removeHandler: removeHandler })
  },

  unsubscribe: () => {
    const handler = get()._messageHandler
    if (handler) {
      socket.off('message_added', handler)
      socket.off('message_updated', handler)
    }
    const removeHandler = get()._removeHandler
    if (removeHandler) socket.off('message_removed', removeHandler)
    set({
      messages: [],
      boardSuggestions: [],
      stageAdvanceSuggestion: null,
      pendingSuggestions: [],
      composerDraft: null,
      explorationDraftLink: null,
      _acceptedBoardsInBatch: [],
      coherenceCheckResult: null,
      procedureAdvanceSuggestion: null,
      _messageHandler: null,
      _removeHandler: null,
      introCache: {},
      showIntroModal: false,
      introModalContent: '',
      introModalProcedure: '',
    })
  },

  // ── 메시지 로드 ────

  loadMessages: async (projectId) => {
    // 스트리밍 중에는 서버 스냅샷으로 덮어쓰지 않는다.
    // (탭 복귀/포커스/재연결로 loadMessages가 불려도 진행 중인 대화가 유실되지 않게)
    if (get().streaming) return false
    set({ loadingMessages: true })
    try {
      const data = await apiGet(`/api/chat/${projectId}`)
      // AI 답이 길이 한도에서 끊겨 닫히지 않은 제안 원문이 저장된 경우가 있어, 보여 줄 때 지운다
      const msgs = (Array.isArray(data) ? data : (data?.messages ?? [])).map((m) =>
        m?.sender_type === 'ai' && typeof m.content === 'string' && /<\/?(ai_suggestion|coherence_check|procedure_advance|board_update|stage_advance)\b/.test(m.content)
          ? { ...m, content: stripXmlMarkers(m.content) }
          : m)
      // 서버 스냅샷이 로컬보다 메시지 수가 적으면(방금 보낸/응답받은 메시지가
      // 아직 서버에 반영되기 전) 덮어쓰지 않는다 — '대화가 이전으로 되돌아가는' 현상 방지.
      // 로컬 AI 메시지는 임시 id라 id 머지는 중복을 만들 수 있어 개수 기준으로 판단한다.
      const local = get().messages
      if (local.length > 0 && msgs.length < local.length) {
        return true
      }
      // 메시지에서 절차별 첫 AI 인트로를 캐시에 복원 (메시지가 같아도 항상 수행 —
      // 소켓으로만 받은 팀원의 인트로가 캐시에 없으면 같은 인트로를 다시 생성 요청한다)
      const introsByProcedure = {}
      msgs.forEach(m => {
        const proc = m.stage_context || m.procedure_context
        if (m.sender_type === 'ai' && !isMoveNote(m) && proc && !introsByProcedure[proc]) {
          introsByProcedure[proc] = m.content
        }
      })
      const nextIntroCache = { ...get().introCache, ...introsByProcedure }
      // 서버 스냅샷이 지금 화면과 같으면 메시지 배열은 그대로 둔다 — 새 배열로 바꾸면 채팅이
      // 다시 그려지고 자동 스크롤 effect가 읽던 위치를 맨 아래로 끌어내린다(탭 복귀 때마다, 2026-10-03).
      const sameMessages = sameJson(msgs, local)
      const sameIntros = sameJson(nextIntroCache, get().introCache)
      if (sameMessages && sameIntros) return true
      set({
        ...(sameMessages ? {} : { messages: msgs }),
        ...(sameIntros ? {} : { introCache: nextIntroCache }),
      })
      return true
    } catch {
      return false
    } finally {
      set({ loadingMessages: false })
    }
  },

  // ── 메시지 전송 + AI 응답 ────

  /**
   * 교사 메시지 전송 + AI 응답 스트리밍.
   *
   * 하위 호환:
   *   sendMessage(projectId, content, 'T-1-1')          // 레거시 — procedureCode 문자열
   *   sendMessage(projectId, content, { procedureCode, mentionedIds, currentStep })
   */
  sendMessage: async (projectId, content, optsOrCode) => {
    const project = useProjectStore.getState().currentProject
    if (isReadOnlyProject(project)) return false
    // 보내는 순간 바로 잠근다. 예전에는 교사 메시지 저장이 끝난 뒤에 streaming을 켜서, 그 사이에
    // 들어온 두 번째 전송(엔터·수락 후 자동 안내)이 함께 통과했다. 두 AI 응답이 같은 streamingText에
    // 섞여 제안 원문(</ai_suggestion>)이 보이고 답이 중간부터 보였다(2026-10-03 운영 제보).
    // 거절되면 false를 돌려준다(입력창은 글을 되살린다).
    if (get().streaming) return false
    const seq = (get()._streamSeq || 0) + 1
    set({ streaming: true, streamingText: '', _streamSeq: seq })
    const isCurrent = () => get()._streamSeq === seq

    // 옵션 정규화
    const opts = typeof optsOrCode === 'string' || optsOrCode == null
      ? { procedureCode: optsOrCode }
      : optsOrCode
    const procedureCode = opts.procedureCode
    const mentionedIds = Array.isArray(opts.mentionedIds)
      ? opts.mentionedIds
      : (opts.mentionedIds instanceof Set ? Array.from(opts.mentionedIds) : [])
    // selectedIds: 교사가 체크박스로 선택한 자료 ID. 미지정이면 undefined → 서버는 전체 포함(하위 호환).
    const selectedIds = Array.isArray(opts.selectedIds)
      ? opts.selectedIds
      : (opts.selectedIds instanceof Set ? Array.from(opts.selectedIds) : undefined)
    const materialSelectionExplicit = opts.materialSelectionExplicit === true
    const currentStep = opts.currentStep
    // 입력창에 넣은 탐색 초안을 (머리글을 남긴 채) 보내는 경우 — 이 응답의 제안을 초안과 잇는다
    const draftLink = get().explorationDraftLink
    const fromExploration = draftLink && draftLink.projectId === projectId &&
      typeof content === 'string' && content.includes(HANDOFF_HEADER) ? draftLink.draftId : null

    // 로그인 사용자 정보 우선 사용
    let senderName = localStorage.getItem('cw_nickname') || '교사'
    let senderSubject = localStorage.getItem('cw_subject') || ''
    try {
      const { useAuthStore } = await import('./authStore')
      const user = useAuthStore.getState().user
      if (user) {
        const meta = user.user_metadata || {}
        senderName = meta.display_name || meta.full_name || meta.name || senderName
        // 소속/과목 정보: 프로필 우선, localStorage 폴백
        if (meta.subject || meta.school_name) {
          const parts = [meta.school_name, meta.subject].filter(Boolean)
          senderSubject = parts.join(' ') || senderSubject
        }
      }
    } catch { /* 무시 */ }

    // 1) 교사 메시지 저장 (실패하면 잠금을 풀고 오류를 그대로 올린다)
    let teacherMsg
    try {
      teacherMsg = await apiPost('/api/chat/teacher', {
        session_id: projectId,
        content,
        stage: procedureCode,
        sender_name: senderName,
        sender_subject: senderSubject,
        // 멘션된 자료 — 서버에서 기본값('{}')으로 처리하므로 하위 호환
        mentioned_material_ids: mentionedIds,
      })
    } catch (err) {
      if (isCurrent()) set({ streaming: false, streamingText: '' })
      throw err
    }

    set((state) => ({ messages: [...state.messages, teacherMsg] }))
    socket.emit('new_message', { projectId, message: teacherMsg })
    if (fromExploration) {
      applyDraftEvent(safeLocalStorage(), projectId, { type: 'sent', draftId: fromExploration, at: Date.now() })
      set({ explorationDraftLink: null })
    }

    // 2) AI 응답 (SSE)
    // 잠금은 1)에서 이미 걸었다. 그 사이 다른 요청이 지금 요청이 됐으면 그 상태를 건드리지 않는다.
    if (isCurrent()) {
      set({
        streaming: true,
        streamingText: '',
        pendingSuggestions: [],
        _acceptedBoardsInBatch: [],
        coherenceCheckResult: null,
        procedureAdvanceSuggestion: null,
        boardSuggestions: [],
        stageAdvanceSuggestion: null,
      })
    }

    // AI 역할 프리셋을 워크스페이스 설정에서 가져옴
    // 다른 작업 공간의 설정이 남아 있으면 쓰지 않는다(서버가 기본 역할로 처리)
    const wsAiRole = currentWorkflowConfig()?.aiRole

    const aiModel = localStorage.getItem('cw_ai_model') || 'fast'
    // 서버가 저장한 이 답의 번호(message_saved). 화면 메시지를 이 번호로 붙인다.
    let savedMessageId = null

    await guardStreaming(set, get, apiStreamPost('/api/chat/message', {
      session_id: projectId,
      // 이 탭의 소켓 id — 서버가 저장한 원문을 이 탭만 빼고 팀원에게 보낸다(화면 글을 중계하지 않는다)
      socket_id: requesterSocketId(),
      content,
      // 방금 저장한 이 메시지의 번호 — 서버가 AI 대화 기록에서 빼 같은 말이 두 번 들어가지 않게 한다
      teacher_message_id: teacherMsg?.id,
      stage: procedureCode,
      aiRole: wsAiRole || undefined,
      aiModel,
      mentioned_material_ids: mentionedIds,
      selected_material_ids: selectedIds,
      material_selection_explicit: materialSelectionExplicit,
      current_step: currentStep,
      // 채점관 렌즈 강도 토글 — 서버는 시연 모드에서만 반영(협력 모드는 무시)
      examiner_lens: get().examinerLens === true,
    }, {
      onText: (text) => {
        if (!isCurrent()) return // 늦게 끝난 이전 요청의 글자는 섞지 않는다
        set((state) => ({ streamingText: state.streamingText + text }))
      },
      onPrinciples: (_principles, relevantGeneralPrincipleIds) => {
        if (!isCurrent()) return
        useProcedureStore.getState().setRelevantGeneralPrincipleIds(relevantGeneralPrincipleIds)
      },
      onBoardSuggestions: (suggestions) => {
        if (!isCurrent()) return // 이전 요청의 제안 카드가 지금 답에 붙지 않게
        // 보드 반영은 교사가 인라인 제안 카드에서 '수락'해야만 일어난다(자동 저장 없음).
        // 서버는 status:'pending' 제안만 전송하며, 자동 반영(appliedBoards) 경로는 없다.
        set({ boardSuggestions: suggestions || [] })
        // 서버 형식 suggestions → pendingSuggestions로 변환
        if (suggestions?.length > 0) {
          set({
            pendingSuggestions: suggestions.map((s, i) => ({
              id: `suggestion-${Date.now()}-${i}`,
              procedureCode: s.procedure || procedureCode,
              // board_update는 보드 전체 content 제안(field 단위 아님). step/action을
              // field로 쓰면 content["1"]처럼 잘못 중첩되어 보드에 안 뜬다.
              type: s.type || 'board_update',
              field: s.field || null,
              value: s.content,
              rationale: '',
              status: 'pending',
              _serverIndex: i,
              ...(fromExploration ? { fromExploration } : {}),
            })),
          })
        }
      },
      onStageAdvance: (data) => {
        if (!isCurrent()) return
        // 서버 shape (current/suggested/reason) → 클라이언트 shape (next_procedure/summary/next_name)
        const nextCode = normalizeProcedureCode(data.suggested || data.next_procedure || data.next_stage)
        // 존재하지 않는 절차 코드(AI 환각)는 무시 — 코드·이름이 빈 "제목 없는 이동 버튼" 방지
        if (!nextCode || !PROCEDURES[nextCode]) return
        const advance = {
          next_procedure: nextCode,
          summary: data.reason || data.summary || '',
          next_name: PROCEDURES[nextCode].name,
          current: data.current,
        }
        set({
          stageAdvanceSuggestion: advance,
          procedureAdvanceSuggestion: advance,
        })
      },
      onCoherenceCheck: (data) => {
        if (!isCurrent()) return
        // 서버 shape (aligned/feedback/details) → 클라이언트 shape (status/issues/suggestions)
        set({
          coherenceCheckResult: {
            status: data.aligned ? 'pass' : 'warning',
            issues: data.feedback || '',
            suggestions: Array.isArray(data.details) ? data.details.join(', ') : (data.details || ''),
          },
        })
      },
      onMessageSaved: (data) => {
        if (!data?.messageId) return
        savedMessageId = data.messageId
        if (isCurrent()) set({ _lastAiMessageId: data.messageId })
      },
      onDone: () => {
        if (!isCurrent()) return
        const streamedText = get().streamingText
        const cleanText = stripXmlMarkers(streamedText)

        // XML 파싱: AI 제안, 정합성 점검, 절차 전환
        const suggestions = parseAISuggestions(streamedText)
        const coherence = parseCoherenceCheck(streamedText)
        const advance = parseProcedureAdvance(streamedText)

        const newState = {
          streaming: false,
          streamingText: '',
        }

        if (suggestions.length > 0) {
          newState.pendingSuggestions = suggestions.map((s, i) => ({
            ...s,
            id: `suggestion-${Date.now()}-${i}`,
            status: 'pending', // pending | accepted | rejected
            ...(fromExploration ? { fromExploration } : {}),
          }))
        }
        if (coherence) {
          newState.coherenceCheckResult = coherence
        }
        if (advance) {
          newState.procedureAdvanceSuggestion = advance
        }

        if (cleanText) {
          // 팀원에게는 서버가 저장한 원문을 서버가 직접 보낸다(routes/chat.js). 이 화면의 글은 중계하지
          // 않는다 — 예전 ai_response_done 중계는 이 탭에서 섞인 글을 팀원 화면에도 퍼뜨렸다(2026-10-05).
          // 서버 저장 번호를 받았으면 그 번호로 붙인다(옛 서버라 못 받았으면 임시 id).
          const aiMsg = {
            id: savedMessageId || `ai-${Date.now()}`,
            sender_type: 'ai',
            content: cleanText,
            stage_context: procedureCode,
            created_at: new Date().toISOString(),
          }
          newState.messages = appendUnlessPresent(get().messages, aiMsg)
        } else {
          newState.messages = get().messages
        }

        set(newState)
      },
      onError: (error) => {
        console.error('AI 응답 오류:', error)
        // 늦게 실패한 이전 요청은 지금 요청의 잠금·글자를 지우지 않는다(알림도 띄우지 않는다)
        if (!isCurrent()) return
        set({ streaming: false, streamingText: '' })
        // 조용히 실패하면 "AI가 무시했다"로 오해한다 — 원인을 바로 알린다
        pushToast({ kind: 'error', message: `AI 응답을 받지 못했습니다. ${error || ''}`.trim(), duration: 8_000 })
      },
    }), isCurrent)
  },

  // ── 절차 인트로 요청 ────

  requestProcedureIntro: async (projectId, procedureCode) => {
    if (get().streaming) return
    if (get().introCache[procedureCode]) return // 이미 인트로 완료 → 스킵
    // 캐시가 비어 있어도 받은 대화에 이 절차의 AI 메시지가 이미 있으면 인트로를 다시 만들지 않는다
    // (loadMessages가 캐시를 복원하는 기준과 같다 — 절차별 첫 AI 메시지). 캐시가 어떤 이유로든
    // 비면 같은 인트로가 대화에 중복 저장되던 문제의 마지막 방어선.
    const existing = get().messages.find((m) =>
      m?.sender_type === 'ai' && !isMoveNote(m) && (m.stage_context || m.procedure_context) === procedureCode)
    if (existing) {
      set((state) => ({ introCache: { ...state.introCache, [procedureCode]: existing.content } }))
      return
    }
    const project = useProjectStore.getState().currentProject
    if (isReadOnlyProject(project)) return

    // sendMessage와 같은 요청 번호를 쓴다. 예전에는 번호 없이 잠가, 늦게 끝난 이전 요청이나 다른 요청의
    // 글자가 인트로에 붙거나 인트로의 마무리가 다른 요청의 상태를 지울 수 있었다.
    const seq = (get()._streamSeq || 0) + 1
    set({ streaming: true, streamingText: '', _streamSeq: seq })
    const isCurrent = () => get()._streamSeq === seq

    const aiModel = localStorage.getItem('cw_ai_model') || 'fast'
    let savedMessageId = null

    await guardStreaming(set, get, apiStreamPost('/api/chat/stage-intro', {
      session_id: projectId,
      // 이 탭의 소켓 id — 서버가 저장한 안내를 이 탭만 빼고 팀원에게 보낸다
      socket_id: requesterSocketId(),
      stage: procedureCode,
      aiModel,
    }, {
      onText: (text) => {
        if (!isCurrent()) return
        set((state) => ({ streamingText: state.streamingText + text }))
      },
      onPrinciples: () => {},
      onBoardSuggestions: () => {},
      onStageAdvance: () => {},
      onMessageSaved: (data) => {
        if (data?.messageId) savedMessageId = data.messageId
      },
      onDone: () => {
        if (!isCurrent()) return
        const streamedText = get().streamingText
        if (streamedText.trim()) {
          const cleanContent = stripXmlMarkers(streamedText)
          // 팀원에게는 서버가 저장한 안내를 서버가 보낸다. 화면 글은 중계하지 않는다(sendMessage와 같은 이유).
          const aiMsg = {
            id: savedMessageId || `intro-${Date.now()}`,
            sender_type: 'ai',
            content: cleanContent,
            stage_context: procedureCode,
            created_at: new Date().toISOString(),
          }
          set((state) => {
            const messages = appendUnlessPresent(state.messages, aiMsg)
            const shown = messages.find((m) => m.id === aiMsg.id) || aiMsg
            return {
              messages,
              streaming: false,
              streamingText: '',
              introCache: { ...state.introCache, [procedureCode]: shown.content },
            }
          })
        } else {
          set({ streaming: false, streamingText: '' })
        }
      },
      onError: (error) => {
        console.error('절차 인트로 오류:', error)
        if (isCurrent()) set({ streaming: false, streamingText: '' })
      },
    }), isCurrent)
  },

  /**
   * 절차 이동 기록 — 팀 커서를 옮긴 쪽에서 한 번 부른다. 실패해도 이동 자체는 막지 않는다.
   * 서버가 지나쳐 간 이동의 기록·안내를 지웠으면 화면에서도 지운다(팀원은 소켓으로 받는다).
   */
  recordProcedureMove: async (projectId, from, to, { visited = false } = {}) => {
    try {
      const res = await apiPost('/api/chat/procedure-move', { session_id: projectId, from, to, visited })
      get()._removeMessages(res?.removedMessages || [])
      const message = res?.message
      if (message?.id) {
        set((state) => (state.messages.some((m) => m.id === message.id)
          ? {}
          : { messages: [...state.messages, message] }))
      }
    } catch (err) {
      console.warn('절차 이동 기록 실패:', err?.message || err)
    }
  },

  /**
   * 서버에서 지운 메시지를 화면에서도 지운다. 절차 안내는 이 화면에서 임시 id로 붙인 경우가 있어
   * id가 달라도 같은 절차의 같은 안내 문구면 같은 메시지로 본다. 지운 안내는 캐시에서도 빼서
   * 다음에 그 절차에 제대로 들어오면 안내가 다시 만들어지게 한다.
   */
  _removeMessages: (removedList) => {
    if (!Array.isArray(removedList) || removedList.length === 0) return
    set((state) => {
      const matches = (m) => removedList.some((r) => r.id === m.id || (
        m.sender_type === 'ai' && !isMoveNote(m) && r.procedure_context
        && (m.stage_context || m.procedure_context) === r.procedure_context && m.content === r.content))
      const removed = state.messages.filter(matches)
      if (removed.length === 0) return {}
      const introCache = { ...state.introCache }
      for (const r of removedList) {
        if (r.procedure_context && introCache[r.procedure_context] === r.content) delete introCache[r.procedure_context]
      }
      return { messages: state.messages.filter((m) => !matches(m)), introCache }
    })
  },

  // ── 인트로 모달 ────

  openIntroModal: (procedureCode) => {
    const content = get().introCache[procedureCode]
    if (content) set({ showIntroModal: true, introModalContent: content, introModalProcedure: procedureCode })
  },
  closeIntroModal: () => set({ showIntroModal: false, introModalContent: '', introModalProcedure: '' }),

  // ── AI 제안 수락/편집/거부 ────

  acceptSuggestion: async (suggestionId, projectId) => {
    const state = get()
    const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId)
    // 이미 처리된 제안은 무시 — 빠른 연타/이중 렌더(채팅+캔버스)로 인한 중복 실행 방지
    if (!suggestion || suggestion.status !== 'pending') return

    // 1) procedureStore에 보드 반영 (로컬)
    const procStore = useProcedureStore.getState()
    if (suggestion.procedureCode) {
      if (suggestion.field) {
        // 레거시 field 단위 부분 업데이트
        procStore.applyAISuggestion(suggestion.procedureCode, {
          field: suggestion.field,
          value: suggestion.value,
        })
      } else if (suggestion.value && typeof suggestion.value === 'object') {
        // board_update: 보드 전체 content 병합
        // 약식 기록 팀은 빈 칸을 빼고 얹는다 — 적어 둔 칸이 AI 제안의 빈 값으로 지워지지 않게
        const value = isBriefProcedureNow(suggestion.procedureCode) ? stripEmptyBoardFields(suggestion.value) : suggestion.value
        procStore.applyBoardContent(suggestion.procedureCode, value)
      }
    }

    // 2) 낙관적 상태 업데이트 — 보드 반영은 이미 끝났으므로 UI는 즉시 '수락됨'으로 전환.
    //    서버 영속을 기다리게 하면 수락 버튼이 라운드트립만큼 늦게 반응한다.
    set({
      pendingSuggestions: state.pendingSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'accepted' } : s
      ),
    })
    // 클릭 즉시 눈에 보이는 확인 — 카드가 사라지는 것만으로는 반영 여부를 놓치기 쉽다
    pushToast({ kind: 'success', message: 'AI 제안을 보드에 반영했어요.', duration: 3_000 })

    // 3) 서버 영속 — 병합된 '전체' 보드 content를 권위본으로 저장
    // 서버 accept 라우트는 제안 원본(suggestion.content)만 replace 저장해, AI가 일부
    // 필드만 담은 제안을 수락하면 기존 필드가 DB에서 유실되던 문제가 있었다. 클라가
    // deep-merge한 전체 content를 updateBoard로 저장(권위본)해 유실을 막고, updateBoard가
    // design_updated를 emit하므로 협업자 보드도 함께 갱신된다.
    // ※ 과거에 있던 /suggestion/:id/accept 사전 호출은 제거 — 서버가 제안 상태를 영속하지
    //    않으면서 suggestion.content를 그대로 upsert해, updateBoard와 중복 저장·경합만
    //    일으키는 순수 지연이었다.
    const boardType = BOARD_TYPES[suggestion.procedureCode]
    const mergedContent = boardType
      ? useProcedureStore.getState().boards[boardType]?.content
      : null
    let persisted = true
    if (mergedContent && suggestion.procedureCode) {
      try {
        await useProcedureStore.getState().updateBoard(projectId, suggestion.procedureCode, mergedContent)
      } catch (err) {
        persisted = false
        console.error('보드 영속 실패:', err)
        // 생략된 절차(403)·잠금(423)·네트워크 등으로 저장이 거부되면 사실대로 알린다
        pushToast({ kind: 'error', message: err?.message || '보드 저장에 실패했어요. 잠시 후 다시 시도해 주세요.', duration: 6_000 })
      }
    }

    // 진행률/네비게이션 갱신
    useProcedureStore.getState().loadBoardSummaries(projectId)
    noteExplorationOutcome(projectId, suggestion, persisted)

    // AI에게 수락 사실을 알리고 이어서 안내받는다 (보드 저장 뒤라 AI가 반영된 보드를 본다).
    // 저장에 실패했으면 "반영했어요"라고 알리지 않는다.
    get()._afterSuggestionResolved(projectId, persisted ? boardLabelOf(suggestion) : null, false)
  },

  editAcceptSuggestion: async (suggestionId, editedValue, projectId) => {
    const state = get()
    const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId)
    // 이미 처리된 제안은 무시 (acceptSuggestion과 동일한 중복 실행 가드)
    if (!suggestion || suggestion.status !== 'pending') return

    // 1) 편집된 값으로 보드 반영
    // board_update 편집은 editedValue가 JSON 문자열일 수 있으므로 파싱한다.
    const procStore = useProcedureStore.getState()
    let parsedEdited = editedValue
    if (typeof editedValue === 'string') {
      try { parsedEdited = JSON.parse(editedValue) } catch { /* 문자열 그대로 사용 */ }
    }
    // 보드 정리(board_update) 편집은 객체여야 보드에 얹을 수 있다. 예전에는 읽지 못한 편집 값을
    // 조용히 버리고 "반영했어요"라고 알려, 고쳤는데 보드가 그대로인 문제가 있었다.
    // 제안은 대기 상태로 두어 교사가 다시 편집하거나 그대로 수락할 수 있게 한다.
    if (suggestion.procedureCode && !suggestion.field &&
        !(parsedEdited && typeof parsedEdited === 'object' && !Array.isArray(parsedEdited))) {
      pushToast({ kind: 'error', message: '편집한 내용을 보드 형식으로 읽지 못했어요. 다시 편집해 주세요.', duration: 5_000 })
      return
    }
    if (suggestion.procedureCode) {
      if (suggestion.field) {
        procStore.applyAISuggestion(suggestion.procedureCode, {
          field: suggestion.field,
          value: parsedEdited,
        })
      } else if (parsedEdited && typeof parsedEdited === 'object') {
        procStore.applyBoardContent(suggestion.procedureCode, parsedEdited)
      }
    }

    // 2) 낙관적 상태 업데이트 — acceptSuggestion과 동일하게 UI를 먼저 전환
    set({
      pendingSuggestions: state.pendingSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'accepted', value: editedValue } : s
      ),
    })
    pushToast({ kind: 'success', message: '편집한 내용으로 보드에 반영했어요.', duration: 3_000 })

    // 3) 서버 영속 — 병합된 '전체' 보드 content를 권위본으로 저장 (acceptSuggestion과 동일 원칙)
    // ※ /suggestion/:id/edit-accept 사전 호출도 accept와 같은 이유(중복 upsert·경합)로 제거.
    const boardType = BOARD_TYPES[suggestion.procedureCode]
    const mergedContent = boardType
      ? useProcedureStore.getState().boards[boardType]?.content
      : null
    let persisted = true
    if (mergedContent && suggestion.procedureCode) {
      try {
        await useProcedureStore.getState().updateBoard(projectId, suggestion.procedureCode, mergedContent)
      } catch (err) {
        persisted = false
        console.error('보드 영속 실패:', err)
        pushToast({ kind: 'error', message: err?.message || '보드 저장에 실패했어요. 잠시 후 다시 시도해 주세요.', duration: 6_000 })
      }
    }

    // 진행률/네비게이션 갱신
    useProcedureStore.getState().loadBoardSummaries(projectId)
    noteExplorationOutcome(projectId, suggestion, persisted)

    get()._afterSuggestionResolved(projectId, persisted ? boardLabelOf(suggestion) : null, true)
  },

  /**
   * 제안 하나를 처리(수락·편집 수락·거부)한 뒤 호출한다. 2026-10-03 제보: 수락은 보드 저장과
   * 알림만 하고 AI를 부르지 않아, AI가 수락 사실을 전혀 몰랐고 아무 반응이 없었다.
   * - 같은 AI 응답에서 나온 제안이 아직 남아 있으면 기다렸다가, 마지막 처리 때 한 번만 알린다
   *   (sendMessage는 남은 제안 카드를 비우므로 중간에 보내면 안 된다)
   * - 하나라도 수락했으면 채팅에 "✓ AI 제안을 '…' 보드에 반영했어요" 메시지를 남기고 AI가 이어서 답한다.
   *   이미 검증된 sendMessage 경로를 그대로 써서, 팀원 화면·대화 기록·AI 맥락에 모두 남는다
   * - 모두 거부했거나, 다른 AI 응답이 진행 중이면 보내지 않는다(보드 반영은 이미 끝났다)
   * @param {string|null} acceptedLabel - 수락한 보드 라벨(거부면 null)
   */
  _afterSuggestionResolved: (projectId, acceptedLabel, edited) => {
    const batch = [...get()._acceptedBoardsInBatch]
    if (acceptedLabel) batch.push({ label: acceptedLabel, edited: !!edited })
    if (get().pendingSuggestions.some((s) => s.status === 'pending')) {
      set({ _acceptedBoardsInBatch: batch })
      return
    }
    set({ _acceptedBoardsInBatch: [] })
    if (batch.length === 0 || get().streaming || !projectId) return
    // 약식 기록 팀은 수락 뒤 AI를 다시 부르지 않는다. 필수 입력 상태와 [다음 절차] 버튼은
    // 채팅 입력창 위 막대(BriefModeBar)가 보드 내용으로 바로 보여 준다.
    if (isBriefProcedureNow(useProcedureStore.getState().currentProcedure)) return
    const labels = [...new Set(batch.map((b) => b.label))].map((l) => `'${l}'`).join(', ')
    const verb = batch.some((b) => b.edited) ? '고쳐서 ' : ''
    const note = `✓ AI 제안을 ${verb}${labels} 보드에 반영했어요. 반영된 내용을 한두 문장으로 확인하고, 이어서 할 일을 하나만 안내해 주세요.`
    const procedureCode = useProcedureStore.getState().currentProcedure
    Promise.resolve(get().sendMessage(projectId, note, procedureCode)).catch((err) => {
      console.warn('수락 후 AI 안내 요청 실패:', err?.message || err)
    })
  },

  rejectSuggestion: async (suggestionId, projectId) => {
    const state = get()
    const idx = state.pendingSuggestions.findIndex((s) => s.id === suggestionId)
    // 이미 처리된 제안은 무시 (accept와 동일한 중복 실행 가드)
    if (idx < 0 || state.pendingSuggestions[idx]?.status !== 'pending') return

    // 낙관적 상태 업데이트 — 거부 버튼도 클릭 즉시 카드가 사라져야 한다
    set({
      pendingSuggestions: state.pendingSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'rejected' } : s
      ),
    })
    // 탐색 초안에서 나온 제안이면 초안 상태에 '반영하지 않음'을 남긴다(같은 응답에서 이미 반영됐으면 유지)
    const rejected = state.pendingSuggestions[idx]
    if (rejected?.fromExploration) {
      applyDraftEvent(safeLocalStorage(), projectId, { type: 'rejected', draftId: rejected.fromExploration, at: Date.now() })
    }
    // 앞서 같은 응답의 다른 제안을 수락했다면, 마지막 처리인 이 거부 뒤에 한 번만 AI에 알린다
    get()._afterSuggestionResolved(projectId, null, false)

    // 서버 기록은 fire-and-forget — 라우트는 활동 로그만 남기므로 응답을 기다릴 이유가 없다
    const messageId = state._lastAiMessageId
    if (messageId) {
      apiPost(`/api/chat/suggestion/${messageId}/reject`, {
        session_id: projectId,
        procedure: state.pendingSuggestions[idx]?.procedureCode,
        suggestionIndex: idx >= 0 ? idx : 0,
      }).catch((err) => {
        console.error('제안 거부 서버 저장 실패:', err)
      })
    }
  },

  // ── 정리 ────

  clearPendingSuggestions: () => set({ pendingSuggestions: [] }),
  clearCoherenceCheck: () => set({ coherenceCheckResult: null }),
  clearProcedureAdvance: () => set({ procedureAdvanceSuggestion: null }),
  clearBoardSuggestions: () => set({ boardSuggestions: [] }),
  clearStageAdvance: () => set({ stageAdvanceSuggestion: null }),
}))
