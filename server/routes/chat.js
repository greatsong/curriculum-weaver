import { Router } from 'express'
// import { requireAuth } from '../middleware/auth.js'  // 나중에 다시 활성화
import { buildAIResponse } from '../services/aiAgent.js'
import { Sessions, Messages, Boards, Materials, Principles } from '../lib/store.js'
import { SSE_EVENTS } from 'curriculum-weaver-shared/constants.js'

/**
 * AI 응답에서 <board_update> 블록을 추출하고 클린 텍스트를 분리
 */
function extractBoardUpdates(text) {
  const updates = []
  const regex = /<board_update\s+type="([^"]+)">\s*([\s\S]*?)\s*<\/board_update>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[2])
      updates.push({ board_type: match[1], content: parsed })
    } catch (e) {
      console.warn('보드 업데이트 JSON 파싱 실패:', match[1], e.message)
    }
  }
  const cleanText = text.replace(/<board_update\s+type="[^"]+">[\s\S]*?<\/board_update>/g, '').trim()
  return { cleanText, updates }
}

export const chatRouter = Router()
// chatRouter.use(requireAuth)

// 채팅 메시지 목록 조회
chatRouter.get('/:sessionId', async (req, res) => {
  const messages = Messages.list(req.params.sessionId)
  res.json(messages)
})

// 교사 메시지 저장
chatRouter.post('/teacher', async (req, res) => {
  const { session_id, content, stage, sender_name, sender_subject } = req.body
  if (!session_id || !content?.trim()) {
    return res.status(400).json({ error: '세션 ID와 메시지 내용이 필요합니다.' })
  }

  const msg = Messages.add(session_id, {
    sender_type: 'teacher',
    content: content.trim(),
    stage_context: stage,
    sender_name: sender_name || '교사',
    sender_subject: sender_subject || '',
  })
  res.status(201).json(msg)
})

// AI 채팅 메시지 전송 (SSE 스트리밍)
chatRouter.post('/message', async (req, res) => {
  const { session_id, content, stage } = req.body

  if (!session_id || !content?.trim()) {
    return res.status(400).json({ error: '세션 ID와 메시지 내용이 필요합니다.' })
  }

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    // 인메모리 스토어에서 컨텍스트 로드
    const session = Sessions.get(session_id)
    const principles = Principles.list(stage)
    const boards = Boards.listByStage(session_id, stage)
    const materials = Materials.list(session_id)
    const recentMessages = Messages.list(session_id).slice(-20)

    const context = {
      session,
      principles,
      standards: [],
      materials,
      boards,
      recentMessages,
      userMessage: content,
      stage,
    }

    // 사용된 원칙 ID 추적
    const principlesUsed = principles.map((p) => p.id)

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

    // 보드 업데이트 추출 및 자동 반영
    const { cleanText, updates } = extractBoardUpdates(fullResponse)

    if (updates.length > 0) {
      // 보드에 자동 저장 (upsert)
      const appliedBoards = updates.map((u) =>
        Boards.upsert(session_id, stage, u.board_type, u.content)
      )
      // 적용된 보드 데이터를 클라이언트에 전송
      res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.BOARD_SUGGESTIONS, suggestions: updates, appliedBoards })}\n\n`)
    }

    // 클린 텍스트만 스토어에 저장
    if (cleanText) {
      Messages.add(session_id, {
        sender_type: 'ai',
        content: cleanText,
        stage_context: stage,
        principles_used: principlesUsed,
      })
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
