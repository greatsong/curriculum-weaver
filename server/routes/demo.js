/**
 * 데모 라우트 — AI 자동 수업 설계 시뮬레이션
 *
 * 로그인 없이 기초 정보만으로 19개 절차 보드 데이터를 자동 생성.
 * 임시 워크스페이스/프로젝트를 인메모리 스토어에 생성하고 AI를 호출.
 * SSE 스트리밍으로 절차별 진행률을 실시간 전송.
 */

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { Sessions, Boards } from '../lib/store.js'
import { PROCEDURES, BOARD_TYPES, PROCEDURE_LIST } from 'curriculum-weaver-shared/constants.js'
import { getBoardSchemaForPrompt } from 'curriculum-weaver-shared/boardSchemas.js'
import crypto from 'crypto'
const uuid = () => crypto.randomUUID()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const demoRouter = Router()

/**
 * GET /api/demo/:projectId/result
 * 데모 결과 조회 (인메모리 store에서 보드 데이터 조회)
 */
demoRouter.get('/:projectId/result', (req, res) => {
  const { projectId } = req.params
  const session = Sessions.get(projectId)
  if (!session) {
    return res.status(404).json({ error: '데모 세션을 찾을 수 없습니다.' })
  }

  // 모든 절차의 보드 데이터 수집
  const boards = {}
  for (const [code, boardType] of Object.entries(BOARD_TYPES)) {
    const boardList = Boards.listByStage(projectId, code)
    const board = boardList.find((b) => b.board_type === boardType)
    if (board) boards[code] = board
  }

  res.json({
    session,
    boards,
    totalProcedures: PROCEDURE_LIST.length,
    savedBoards: Object.keys(boards).length,
  })
})

/**
 * POST /api/demo/generate
 * 데모 수업 설계 생성 (SSE 스트리밍)
 *
 * 절차별 진행률을 SSE로 실시간 전송:
 * - data: {"type":"progress","procedure":"T-1-1","name":"팀 비전 공유","index":2,"total":19}
 * - data: {"type":"complete","projectId":"...","savedBoards":19,"totalProcedures":19}
 * - data: {"type":"error","message":"..."}
 *
 * @body {{ grade: string, subjects: string[], topic: string, description?: string }}
 */
demoRouter.post('/generate', async (req, res) => {
  const { grade, subjects, topic, description } = req.body

  if (!grade || !subjects?.length || subjects.length < 2 || !topic?.trim()) {
    return res.status(400).json({
      error: '학년, 교과(2개 이상), 주제 키워드는 필수입니다.',
    })
  }

  // SSE 헤더 설정 (writeHead 대신 setHeader로 CORS 헤더 보존)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    // 1. 임시 워크스페이스/프로젝트 ID 생성
    const workspaceId = `demo-ws-${uuid().slice(0, 8)}`

    // 인메모리 세션 생성 (세션 ID = 프로젝트 ID)
    const session = Sessions.create({
      title: `[데모] ${topic}`,
      description: description || '',
    })
    const projectId = session.id

    sendEvent({ type: 'started', projectId, workspaceId })

    // 2. 보드 스키마 텍스트 생성
    const schemaDescriptions = PROCEDURE_LIST
      .map((proc) => {
        const boardType = BOARD_TYPES[proc.code]
        const schema = getBoardSchemaForPrompt(proc.code)
        return `[${proc.code}] ${proc.name} (보드: ${boardType})\n${schema || '자유 텍스트'}`
      })
      .join('\n\n')

    // 3. AI 스트리밍 호출
    const teacherContext = description
      ? `\n\n## 교사의 설계 의도 (최우선 반영 사항)
교사가 아래와 같이 수업의 방향을 설정했습니다. 이 내용이 모든 절차의 설계를 관통해야 합니다:

"${description}"

위 교사 의도를 반영하여:
- prep(학습자 맥락)에서 이 의도와 연결되는 학습자 상황을 구체적으로 서술하세요
- T 단계(팀 비전, 설계 방향)에서 이 의도가 팀의 핵심 가치로 드러나야 합니다
- A 단계(탐색, 연결)에서 이 의도와 관련된 교과 연결점을 중심으로 설계하세요
- D 단계(설계, 개발, 실행)에서 이 의도를 구현하는 구체적 활동과 산출물을 만드세요
- E 단계(평가, 성찰)에서 이 의도가 얼마나 달성되었는지 평가 기준에 반영하세요`
      : ''

    const systemPrompt = `당신은 한국 교육과정 기반 융합수업 설계 전문가입니다.
TADDs-DIE 협력적 수업설계 모형에 따라 전체 19개 절차의 설계 결과물을 JSON으로 생성하세요.

## 핵심 원칙
1. 교사가 제공한 학년, 교과, 주제, 설계 의도가 설계의 최상위 기준입니다.
2. 특히 교사의 설명/의도는 단순 참고가 아니라, 모든 절차를 관통하는 설계 철학으로 반영하세요.
3. 교과 간 융합은 주제를 중심으로 유기적으로 연결되어야 합니다.

## 형식 지침
- 각 절차의 보드 데이터를 해당 스키마에 맞는 JSON으로 생성하세요.
- 현실적이고 교육적으로 의미 있는 내용을 작성하세요.
- 한국 2022 개정 교육과정의 성취기준을 참조하세요.
- 응답은 반드시 유효한 JSON 객체여야 합니다.
${teacherContext}

## 보드 스키마
${schemaDescriptions}`

    const userPrompt = `다음 조건으로 융합수업 설계 시뮬레이션을 실행하세요:

대상: ${grade}
교과: ${subjects.join(', ')}
주제: ${topic}
${description ? `교사 의도: ${description}` : ''}

위 조건, 특히 교사의 의도를 모든 절차에 깊이 반영하여 19개 절차의 보드 데이터를 생성하세요.

JSON 형식:
{
  "prep": { ... },
  "T-1-1": { ... },
  ...
  "E-2-1": { ... }
}

반드시 유효한 JSON만 응답하세요. 설명 텍스트 없이 JSON만 반환하세요.`

    // 스트리밍으로 AI 응답 수신 + 절차 감지
    let fullText = ''
    const detectedProcedures = new Set()

    // 절차 코드 목록 (감지용)
    const procedureCodes = PROCEDURE_LIST.map((p) => p.code)
    const procedureNameMap = Object.fromEntries(PROCEDURE_LIST.map((p) => [p.code, p.name]))

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullText += event.delta.text

        // 절차 코드 감지: "prep": 또는 "T-1-1": 패턴
        for (const code of procedureCodes) {
          if (!detectedProcedures.has(code)) {
            // JSON 키로 등장하는지 확인
            const pattern = `"${code}"`
            if (fullText.includes(pattern)) {
              detectedProcedures.add(code)
              const index = detectedProcedures.size
              // 다음 절차 정보
              const nextCode = procedureCodes[procedureCodes.indexOf(code) + 1]
              sendEvent({
                type: 'progress',
                procedure: code,
                name: procedureNameMap[code] || code,
                index,
                total: procedureCodes.length,
                nextProcedure: nextCode || null,
                nextName: nextCode ? (procedureNameMap[nextCode] || nextCode) : null,
              })
            }
          }
        }
      }
    }

    // 4. AI 응답 파싱
    let boardsData = {}
    try {
      const jsonMatch = fullText.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : fullText.trim()
      boardsData = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.warn('[demo] JSON 전체 파싱 실패, 부분 파싱 시도:', parseErr.message)
      try {
        const startIdx = fullText.indexOf('{')
        const endIdx = fullText.lastIndexOf('}')
        if (startIdx !== -1 && endIdx > startIdx) {
          boardsData = JSON.parse(fullText.slice(startIdx, endIdx + 1))
        }
      } catch {
        console.error('[demo] 부분 파싱도 실패')
      }
    }

    // 5. 보드에 데이터 저장
    let savedCount = 0
    for (const [procedureCode, content] of Object.entries(boardsData)) {
      const boardType = BOARD_TYPES[procedureCode]
      if (!boardType || !content) continue

      try {
        if (Boards.upsert) {
          Boards.upsert(projectId, procedureCode, boardType, content)
          savedCount++
        }
      } catch (err) {
        console.warn(`[demo] 보드 저장 실패 (${procedureCode}):`, err.message)
      }
    }

    console.log(`[demo] 생성 완료 — ${savedCount}/${PROCEDURE_LIST.length}개 보드 저장`)

    // 6. 완료 이벤트 전송
    sendEvent({
      type: 'complete',
      projectId,
      workspaceId,
      savedBoards: savedCount,
      totalProcedures: PROCEDURE_LIST.length,
    })
    res.end()
  } catch (error) {
    console.error('[demo] 생성 오류:', error)
    sendEvent({ type: 'error', message: '데모 생성 중 오류가 발생했습니다.' })
    res.end()
  }
})
