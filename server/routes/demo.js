/**
 * 데모 라우트 — AI 자동 수업 설계 시뮬레이션
 *
 * 로그인 없이 기초 정보만으로 19개 절차 보드 데이터를 자동 생성.
 * 임시 워크스페이스/프로젝트를 인메모리 스토어에 생성하고 AI를 호출.
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
 * POST /api/demo/generate
 * 데모 수업 설계 생성
 *
 * @body {{ grade: string, subjects: string[], topic: string, description?: string }}
 * @returns {{ workspaceId: string, projectId: string }}
 */
demoRouter.post('/generate', async (req, res) => {
  const { grade, subjects, topic, description } = req.body

  if (!grade || !subjects?.length || subjects.length < 2 || !topic?.trim()) {
    return res.status(400).json({
      error: '학년, 교과(2개 이상), 주제 키워드는 필수입니다.',
    })
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

    // 2. 보드 스키마 텍스트 생성 (주요 절차만)
    const schemaDescriptions = PROCEDURE_LIST
      .map((proc) => {
        const boardType = BOARD_TYPES[proc.code]
        const schema = getBoardSchemaForPrompt(proc.code)
        return `[${proc.code}] ${proc.name} (보드: ${boardType})\n${schema || '자유 텍스트'}`
      })
      .join('\n\n')

    // 3. AI 호출
    const systemPrompt = `당신은 한국 교육과정 기반 융합수업 설계 전문가입니다.
TADDs-DIE 협력적 수업설계 모형에 따라 전체 19개 절차의 설계 결과물을 JSON으로 생성하세요.

중요 지침:
- 각 절차의 보드 데이터를 해당 스키마에 맞는 JSON으로 생성하세요.
- 현실적이고 교육적으로 의미 있는 내용을 작성하세요.
- 한국 2022 개정 교육과정의 성취기준을 참조하세요.
- 응답은 반드시 유효한 JSON 객체여야 합니다.

보드 스키마:
${schemaDescriptions}`

    const userPrompt = `다음 조건으로 융합수업 설계 시뮬레이션을 실행하세요:

대상: ${grade}
교과: ${subjects.join(', ')}
주제: ${topic}
${description ? `설명: ${description}` : ''}

다음 JSON 형식으로 모든 19개 절차의 보드 데이터를 생성하세요:
{
  "prep": { ... learner_context 보드 데이터 ... },
  "T-1-1": { ... team_vision 보드 데이터 ... },
  "T-1-2": { ... design_direction 보드 데이터 ... },
  ...
  "E-2-1": { ... process_reflection 보드 데이터 ... }
}

각 절차의 보드 데이터는 해당 스키마의 필드를 포함해야 합니다.
반드시 유효한 JSON만 응답하세요. 설명 텍스트 없이 JSON만 반환하세요.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    // 4. AI 응답 파싱
    const aiText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    // JSON 추출 (코드 블록이나 순수 JSON)
    let boardsData = {}
    try {
      // 코드 블록에서 JSON 추출 시도
      const jsonMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : aiText.trim()
      boardsData = JSON.parse(jsonStr)
    } catch (parseErr) {
      // 부분 파싱 시도: 각 절차별로 개별 추출
      console.warn('[demo] JSON 전체 파싱 실패, 부분 파싱 시도:', parseErr.message)
      try {
        // { 로 시작하는 가장 큰 JSON 블록 찾기
        const startIdx = aiText.indexOf('{')
        const endIdx = aiText.lastIndexOf('}')
        if (startIdx !== -1 && endIdx > startIdx) {
          boardsData = JSON.parse(aiText.slice(startIdx, endIdx + 1))
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

    // 6. 결과 반환
    res.json({
      workspaceId,
      projectId,
      savedBoards: savedCount,
      totalProcedures: PROCEDURE_LIST.length,
    })
  } catch (error) {
    console.error('[demo] 생성 오류:', error)
    res.status(500).json({
      error: '데모 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    })
  }
})
