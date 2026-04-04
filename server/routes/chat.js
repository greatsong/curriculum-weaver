/**
 * AI 채팅 라우터 — 16절차 기반 리빌드
 *
 * 주요 변경:
 * - stage → procedure 전환
 * - <board_update> → <ai_suggestion> (자동 적용 안 함, 교사 수락/편집/거부)
 * - <stage_advance> → <procedure_advance>
 * - <coherence_check> 파싱 추가
 * - 제안 수락/편집수락/거부 엔드포인트 추가
 * - stage-intro → procedure-intro
 */

import { Router } from 'express'
// import { requireAuth } from '../middleware/auth.js'  // Auth 구현 시 활성화
import { buildAIResponse, buildProcedureIntroResponse } from '../services/aiAgent.js'
import { Sessions, Messages, Boards, Materials } from '../lib/store.js'
import { SSE_EVENTS, BOARD_TYPES, PROCEDURES } from 'curriculum-weaver-shared/constants.js'
import { GENERAL_PRINCIPLES } from '../data/generalPrinciples.js'

// ──────────────────────────────────────────
// XML 파서: AI 응답에서 구조화 블록 추출
// ──────────────────────────────────────────

/**
 * AI 응답에서 <ai_suggestion> 블록 추출
 * — 기존 <board_update>를 대체. 자동 적용하지 않고 제안으로만 저장
 *
 * @param {string} text - AI 전체 응답
 * @returns {{ cleanText: string, suggestions: Object[] }}
 */
function extractAiSuggestions(text) {
  const suggestions = []
  const regex = /<ai_suggestion\s+type="([^"]+)"\s+procedure="([^"]+)"\s+step="([^"]*?)"\s*(?:action="([^"]*?)")?\s*>\s*([\s\S]*?)\s*<\/ai_suggestion>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[5])
      suggestions.push({
        type: match[1],           // 'board_update'
        procedure: match[2],      // 'T-1-1'
        step: match[3],           // '5'
        action: match[4] || '',   // 'generate'
        content: parsed,
        status: 'pending',        // pending → accepted / edited / rejected
      })
    } catch (e) {
      console.warn('AI 제안 JSON 파싱 실패:', e.message)
    }
  }
  const cleanText = text.replace(/<ai_suggestion\s+[^>]*>[\s\S]*?<\/ai_suggestion>/g, '').trim()
  return { cleanText, suggestions }
}

/**
 * AI 응답에서 <coherence_check> 블록 추출
 *
 * @param {string} text - AI 전체 응답
 * @returns {{ cleanText: string, coherenceCheck: Object|null }}
 */
function extractCoherenceCheck(text) {
  const regex = /<coherence_check\s+procedure="([^"]+)"\s+against="([^"]+)">\s*([\s\S]*?)\s*<\/coherence_check>/g
  const match = regex.exec(text)
  if (!match) return { cleanText: text, coherenceCheck: null }

  try {
    const data = JSON.parse(match[3])
    const coherenceCheck = {
      procedure: match[1],
      against: match[2],
      aligned: data.aligned,
      feedback: data.feedback,
      details: data.details || [],
    }
    const cleanText = text.replace(/<coherence_check\s+[^>]*>[\s\S]*?<\/coherence_check>/g, '').trim()
    return { cleanText, coherenceCheck }
  } catch (e) {
    console.warn('정합성 점검 JSON 파싱 실패:', e.message)
    return { cleanText: text, coherenceCheck: null }
  }
}

/**
 * AI 응답에서 <procedure_advance> 블록 추출
 *
 * @param {string} text - AI 전체 응답
 * @returns {{ cleanText: string, procedureAdvance: Object|null }}
 */
function extractProcedureAdvance(text) {
  const regex = /<procedure_advance\s+current="([^"]+)"\s+suggested="([^"]+)"\s+reason="([^"]*?)"\s*\/>/g
  const match = regex.exec(text)
  if (!match) {
    // 대체 형식: 블록 형태
    const blockRegex = /<procedure_advance\s+current="([^"]+)"\s+suggested="([^"]+)"\s+reason="([^"]*?)">\s*<\/procedure_advance>/g
    const blockMatch = blockRegex.exec(text)
    if (!blockMatch) return { cleanText: text, procedureAdvance: null }

    const procedureAdvance = {
      current: blockMatch[1],
      suggested: blockMatch[2],
      reason: blockMatch[3],
    }
    const cleanText = text.replace(/<procedure_advance[^>]*>[\s\S]*?<\/procedure_advance>/g, '').trim()
    return { cleanText, procedureAdvance }
  }

  const procedureAdvance = {
    current: match[1],
    suggested: match[2],
    reason: match[3],
  }
  const cleanText = text.replace(/<procedure_advance\s+[^>]*\/>/g, '').trim()
  return { cleanText, procedureAdvance }
}

/**
 * 기존 <board_update> 블록도 호환 파싱 (레거시 지원)
 *
 * @param {string} text
 * @returns {{ cleanText: string, legacyUpdates: Object[] }}
 */
function extractLegacyBoardUpdates(text) {
  const updates = []
  const regex = /<board_update\s+type="([^"]+)">\s*([\s\S]*?)\s*<\/board_update>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[2])
      updates.push({ board_type: match[1], content: parsed })
    } catch (e) {
      console.warn('레거시 보드 업데이트 JSON 파싱 실패:', match[1], e.message)
    }
  }
  const cleanText = text.replace(/<board_update\s+type="[^"]+">[\s\S]*?<\/board_update>/g, '').trim()
  return { cleanText, legacyUpdates: updates }
}

// ──────────────────────────────────────────
// 라우터 정의
// ──────────────────────────────────────────

export const chatRouter = Router()
// chatRouter.use(requireAuth)  // Auth 구현 시 활성화

// ─── 채팅 메시지 목록 조회 ───
chatRouter.get('/:sessionId', async (req, res) => {
  const messages = Messages.list(req.params.sessionId)
  res.json(messages)
})

// ─── 교사 메시지 저장 ───
chatRouter.post('/teacher', async (req, res) => {
  const { session_id, content, procedure, sender_name, sender_subject } = req.body
  if (!session_id || !content?.trim()) {
    return res.status(400).json({ error: '세션 ID와 메시지 내용이 필요합니다.' })
  }

  const msg = Messages.add(session_id, {
    sender_type: 'teacher',
    content: content.trim(),
    // 하위 호환: stage_context에도 procedure 코드 저장
    stage_context: procedure || req.body.stage || null,
    sender_name: sender_name || '교사',
    sender_subject: sender_subject || '',
  })
  res.status(201).json(msg)
})

// ─── 시드 데이터용: 일반 메시지 직접 추가 ───
chatRouter.post('/seed', async (req, res) => {
  const { session_id, sender_type, content, procedure, sender_name, sender_subject, principles_used } = req.body
  if (!session_id || !content?.trim() || !sender_type) {
    return res.status(400).json({ error: '필수 필드: session_id, sender_type, content' })
  }
  const msg = Messages.add(session_id, {
    sender_type,
    content: content.trim(),
    stage_context: procedure || req.body.stage || null,
    principles_used: principles_used || [],
    sender_name: sender_name || null,
    sender_subject: sender_subject || null,
  })
  res.status(201).json(msg)
})

// ─── 절차 진입 인트로 메시지 (SSE 스트리밍) ───
chatRouter.post('/procedure-intro', async (req, res) => {
  const { session_id, procedure } = req.body

  if (!session_id || !procedure) {
    return res.status(400).json({ error: '세션 ID와 절차 코드가 필요합니다.' })
  }

  // 절차 코드 유효성 검사
  if (!PROCEDURES[procedure]) {
    return res.status(400).json({ error: `유효하지 않은 절차 코드: ${procedure}` })
  }

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    const session = Sessions.get(session_id)
    const boards = Boards.listAll ? Boards.listAll(session_id) : []

    let fullResponse = ''
    await buildProcedureIntroResponse(
      { procedure, sessionTitle: session?.title || '', boards },
      {
        onText: (text) => {
          fullResponse += text
          res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.TEXT, content: text })}\n\n`)
        },
        onError: (error) => {
          res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: error })}\n\n`)
        },
      }
    )

    // 인트로 메시지를 스토어에 저장
    if (fullResponse.trim()) {
      Messages.add(session_id, {
        sender_type: 'ai',
        content: fullResponse.trim(),
        stage_context: procedure,
      })
    }

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (error) {
    console.error('절차 인트로 오류:', error)
    res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: '인트로 생성 중 오류가 발생했습니다.' })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

// ─── 하위 호환: stage-intro → procedure-intro 리디렉트 ───
chatRouter.post('/stage-intro', async (req, res) => {
  // stage 번호를 procedure 코드로 변환하는 것은 클라이언트에서 처리
  // 여기서는 호환성을 위해 procedure 필드가 있으면 사용
  req.body.procedure = req.body.procedure || req.body.stage
  // procedure-intro 핸들러로 포워딩
  const { session_id, procedure } = req.body
  if (!session_id || !procedure) {
    return res.status(400).json({ error: '세션 ID와 절차(또는 단계)가 필요합니다.' })
  }

  // 숫자(기존 stage)가 들어온 경우 처리 불가 → 에러
  if (typeof procedure === 'number') {
    return res.status(400).json({ error: 'stage-intro는 deprecated입니다. procedure-intro를 사용하세요.' })
  }

  // procedure-intro와 동일하게 처리
  if (!PROCEDURES[procedure]) {
    return res.status(400).json({ error: `유효하지 않은 절차 코드: ${procedure}` })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    const session = Sessions.get(session_id)
    const boards = Boards.listAll ? Boards.listAll(session_id) : []

    let fullResponse = ''
    await buildProcedureIntroResponse(
      { procedure, sessionTitle: session?.title || '', boards },
      {
        onText: (text) => {
          fullResponse += text
          res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.TEXT, content: text })}\n\n`)
        },
        onError: (error) => {
          res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: error })}\n\n`)
        },
      }
    )

    if (fullResponse.trim()) {
      Messages.add(session_id, {
        sender_type: 'ai',
        content: fullResponse.trim(),
        stage_context: procedure,
      })
    }

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (error) {
    console.error('단계 인트로 오류 (레거시):', error)
    res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: '인트로 생성 중 오류가 발생했습니다.' })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

// ─── AI 채팅 메시지 전송 (SSE 스트리밍) ───
chatRouter.post('/message', async (req, res) => {
  const { session_id, content, procedure, currentStep } = req.body
  // 하위 호환: stage → procedure
  const activeProcedure = procedure || req.body.stage

  if (!session_id || !content?.trim()) {
    return res.status(400).json({ error: '세션 ID와 메시지 내용이 필요합니다.' })
  }

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    // 인메모리 스토어에서 컨텍스트 로드
    const session = Sessions.get(session_id)
    const boards = Boards.listAll ? Boards.listAll(session_id) : []
    const materials = Materials.list(session_id)
    const recentMessages = Messages.list(session_id).slice(-20)

    // 성취기준 (세션에 연결된 성취기준이 있으면 로드)
    const standards = [] // TODO: supabaseService에서 로드

    const context = {
      session,
      standards,
      materials,
      boards,
      recentMessages,
      userMessage: content,
      procedure: activeProcedure,
      currentStep: currentStep ? Number(currentStep) : null,
    }

    // 사용된 원칙 ID 추적
    const generalPrinciples = GENERAL_PRINCIPLES || []
    const principlesUsed = generalPrinciples.map((gp) => gp.id)

    // 적용된 원칙 전송
    if (principlesUsed.length > 0) {
      res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.PRINCIPLES, principles: principlesUsed })}\n\n`)
    }

    // Claude API 스트리밍 응답
    let fullResponse = ''
    await buildAIResponse(context, {
      onText: (text) => {
        fullResponse += text
        res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.TEXT, content: text })}\n\n`)
      },
      onError: (error) => {
        res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: error })}\n\n`)
      },
    })

    // ─── AI 응답 파싱 ───
    let processedText = fullResponse

    // 1. <ai_suggestion> 추출 (새 형식)
    const { cleanText: afterSuggestions, suggestions } = extractAiSuggestions(processedText)
    processedText = afterSuggestions

    // 2. 레거시 <board_update> 추출 (하위 호환)
    const { cleanText: afterLegacy, legacyUpdates } = extractLegacyBoardUpdates(processedText)
    processedText = afterLegacy

    // 레거시 업데이트를 새 형식으로 변환
    for (const lu of legacyUpdates) {
      suggestions.push({
        type: 'board_update',
        procedure: activeProcedure,
        step: '',
        action: '',
        content: lu.content,
        status: 'pending',
        _legacyBoardType: lu.board_type,
      })
    }

    // 3. <coherence_check> 추출
    const { cleanText: afterCoherence, coherenceCheck } = extractCoherenceCheck(processedText)
    processedText = afterCoherence

    // 4. <procedure_advance> 추출
    const { cleanText: finalCleanText, procedureAdvance } = extractProcedureAdvance(processedText)

    // ─── SSE 이벤트 전송 ───

    // AI 제안 전송 (자동 적용하지 않음 — 교사 수락 대기)
    if (suggestions.length > 0) {
      res.write(`data: ${JSON.stringify({
        type: SSE_EVENTS.BOARD_SUGGESTIONS,
        suggestions,
      })}\n\n`)
    }

    // 정합성 점검 결과 전송
    if (coherenceCheck) {
      res.write(`data: ${JSON.stringify({
        type: 'coherence_check',
        ...coherenceCheck,
      })}\n\n`)
    }

    // 절차 전환 제안 전송
    if (procedureAdvance) {
      res.write(`data: ${JSON.stringify({
        type: SSE_EVENTS.PROCEDURE_ADVANCE,
        ...procedureAdvance,
      })}\n\n`)
    }

    // 클린 텍스트를 스토어에 저장 (AI 제안은 별도 필드로 저장)
    if (finalCleanText) {
      const savedMsg = Messages.add(session_id, {
        sender_type: 'ai',
        content: finalCleanText,
        stage_context: activeProcedure,
        principles_used: principlesUsed,
        // AI 제안은 메시지에 메타데이터로 첨부
        ai_suggestions: suggestions.length > 0 ? suggestions : undefined,
        coherence_check: coherenceCheck || undefined,
      })

      // 저장된 메시지 ID를 클라이언트에 전송 (제안 수락/거부 시 참조)
      if (suggestions.length > 0 && savedMsg?.id) {
        res.write(`data: ${JSON.stringify({
          type: 'message_saved',
          messageId: savedMsg.id,
          suggestionCount: suggestions.length,
        })}\n\n`)
      }
    }

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (error) {
    console.error('AI 채팅 오류:', error)
    res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: '응답 생성 중 오류가 발생했습니다.' })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

// ──────────────────────────────────────────
// AI 제안 수락/편집수락/거부 엔드포인트
// ──────────────────────────────────────────

/**
 * POST /api/chat/suggestion/:messageId/accept
 * — AI 제안을 수락하여 보드에 적용
 */
chatRouter.post('/suggestion/:messageId/accept', async (req, res) => {
  const { messageId } = req.params
  const { session_id, procedure, suggestionIndex = 0 } = req.body

  if (!session_id || !procedure) {
    return res.status(400).json({ error: '세션 ID와 절차 코드가 필요합니다.' })
  }

  try {
    // 메시지에서 제안 데이터 조회
    const message = Messages.get ? Messages.get(messageId) : null
    const suggestions = message?.ai_suggestions || req.body.suggestions || []
    const suggestion = suggestions[suggestionIndex]

    if (!suggestion) {
      return res.status(404).json({ error: '해당 제안을 찾을 수 없습니다.' })
    }

    // 보드에 적용
    const boardType = suggestion._legacyBoardType || BOARD_TYPES[procedure]
    if (!boardType) {
      return res.status(400).json({ error: `절차 ${procedure}에 대응하는 보드 타입이 없습니다.` })
    }

    // 보드 upsert (인메모리 스토어 사용)
    const updatedBoard = Boards.upsert
      ? Boards.upsert(session_id, procedure, boardType, suggestion.content)
      : null

    // 제안 상태 업데이트
    suggestion.status = 'accepted'

    // 활동 로그 (나중에 Supabase activity_log 테이블에 저장)
    console.log(`[활동] 제안 수락 — 세션: ${session_id}, 절차: ${procedure}, 보드: ${boardType}`)

    res.json({
      success: true,
      boardType,
      content: suggestion.content,
      board: updatedBoard,
    })
  } catch (error) {
    console.error('제안 수락 오류:', error)
    res.status(500).json({ error: '제안 수락 중 오류가 발생했습니다.' })
  }
})

/**
 * POST /api/chat/suggestion/:messageId/edit-accept
 * — AI 제안을 교사가 수정한 후 수락
 */
chatRouter.post('/suggestion/:messageId/edit-accept', async (req, res) => {
  const { messageId } = req.params
  const { session_id, procedure, suggestionIndex = 0, editedContent } = req.body

  if (!session_id || !procedure || !editedContent) {
    return res.status(400).json({ error: '세션 ID, 절차 코드, 수정된 내용이 필요합니다.' })
  }

  try {
    // 보드에 수정된 내용 적용
    const boardType = BOARD_TYPES[procedure]
    if (!boardType) {
      return res.status(400).json({ error: `절차 ${procedure}에 대응하는 보드 타입이 없습니다.` })
    }

    const updatedBoard = Boards.upsert
      ? Boards.upsert(session_id, procedure, boardType, editedContent)
      : null

    // 활동 로그
    console.log(`[활동] 제안 편집수락 — 세션: ${session_id}, 절차: ${procedure}, 보드: ${boardType}`)

    res.json({
      success: true,
      boardType,
      content: editedContent,
      board: updatedBoard,
    })
  } catch (error) {
    console.error('제안 편집수락 오류:', error)
    res.status(500).json({ error: '제안 편집수락 중 오류가 발생했습니다.' })
  }
})

/**
 * POST /api/chat/suggestion/:messageId/reject
 * — AI 제안을 거부
 */
chatRouter.post('/suggestion/:messageId/reject', async (req, res) => {
  const { messageId } = req.params
  const { session_id, procedure, suggestionIndex = 0, reason = '' } = req.body

  if (!session_id) {
    return res.status(400).json({ error: '세션 ID가 필요합니다.' })
  }

  try {
    // 활동 로그
    console.log(`[활동] 제안 거부 — 세션: ${session_id}, 절차: ${procedure || '?'}, 사유: ${reason || '없음'}`)

    res.json({
      success: true,
      status: 'rejected',
      reason,
    })
  } catch (error) {
    console.error('제안 거부 오류:', error)
    res.status(500).json({ error: '제안 거부 중 오류가 발생했습니다.' })
  }
})
