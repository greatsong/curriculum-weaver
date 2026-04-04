/**
 * 데모 라우트 — AI 자동 수업 설계 시뮬레이션
 *
 * 로그인 사용자 전용. 결과는 워크스페이스 프로젝트로 Supabase에 저장.
 * AI 생성을 2분할하여 토큰 초과 방지:
 *   1차: prep ~ A-2-2 (10개 절차)
 *   2차: Ds-1-1 ~ E-2-1 (9개 절차, 1차 요약 컨텍스트)
 * SSE 스트리밍으로 절차별 진행률 실시간 전송.
 */

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/auth.js'
import { createProject, upsertDesign } from '../lib/supabaseService.js'
import { PROCEDURES, BOARD_TYPES, PROCEDURE_LIST } from 'curriculum-weaver-shared/constants.js'
import { getBoardSchemaForPrompt } from 'curriculum-weaver-shared/boardSchemas.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const demoRouter = Router()

// ── 절차 분할 정의 ──
const PHASE1_CODES = ['prep', 'T-1-1', 'T-1-2', 'T-2-1', 'T-2-2', 'T-2-3', 'A-1-1', 'A-1-2', 'A-2-1', 'A-2-2']
const PHASE2_CODES = ['Ds-1-1', 'Ds-1-2', 'Ds-1-3', 'Ds-2-1', 'Ds-2-2', 'DI-1-1', 'DI-2-1', 'E-1-1', 'E-2-1']
const ALL_CODES = [...PHASE1_CODES, ...PHASE2_CODES]
const procedureNameMap = Object.fromEntries(PROCEDURE_LIST.map((p) => [p.code, p.name]))

/**
 * JSON 파싱 (3단계 폴백 + 상세 로깅)
 */
function parseAIResponse(fullText, label) {
  // 1. 마크다운 코드블록 추출
  const jsonMatch = fullText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1].trim()) }
    catch (e) { console.warn(`[demo][${label}] 코드블록 JSON 파싱 실패:`, e.message) }
  }

  // 2. 전체 텍스트 직접 파싱
  try { return JSON.parse(fullText.trim()) }
  catch (e) { console.warn(`[demo][${label}] 전체 텍스트 파싱 실패:`, e.message) }

  // 3. 첫 { ~ 마지막 } 추출
  const start = fullText.indexOf('{')
  const end = fullText.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(fullText.slice(start, end + 1)) }
    catch (e) { console.warn(`[demo][${label}] 부분 파싱 실패:`, e.message) }
  }

  console.error(`[demo][${label}] 모든 파싱 실패. 응답 길이: ${fullText.length}`)
  console.error(`[demo][${label}] 응답 시작: ${fullText.slice(0, 300)}`)
  console.error(`[demo][${label}] 응답 끝: ${fullText.slice(-300)}`)
  return {}
}

/**
 * 보드 스키마 텍스트 생성 (특정 절차 코드 목록용)
 */
function buildSchemaText(codes) {
  return codes
    .map((code) => {
      const boardType = BOARD_TYPES[code]
      const schema = getBoardSchemaForPrompt(code)
      return `[${code}] ${procedureNameMap[code] || code} (보드: ${boardType})\n${schema || '자유 텍스트'}`
    })
    .join('\n\n')
}

/**
 * AI 스트리밍 호출 + 절차 감지 + SSE 전송
 *
 * @param {Object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {string[]} params.codes - 감지할 절차 코드 목록
 * @param {number} params.startIndex - 전체 진행률 기준 시작 인덱스
 * @param {string} params.label - 로그 라벨
 * @param {Function} params.sendEvent - SSE 이벤트 전송 함수
 * @returns {Promise<Object>} 파싱된 보드 데이터
 */
async function streamAndParse({ systemPrompt, userPrompt, codes, startIndex, label, sendEvent }) {
  let fullText = ''
  let tokenCount = 0
  let lastTokenEvent = 0
  const detectedProcedures = new Set()

  console.log(`[demo][${label}] AI 스트리밍 시작 — ${codes.length}개 절차`)

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 64000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }, {
    headers: { 'anthropic-beta': 'output-128k-2025-02-19' },
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      fullText += event.delta.text
      tokenCount++

      // 300토큰마다 heartbeat
      if (tokenCount - lastTokenEvent >= 300) {
        lastTokenEvent = tokenCount
        sendEvent({ type: 'heartbeat', tokens: tokenCount, phase: label })
      }

      // 절차 코드 감지
      for (const code of codes) {
        if (!detectedProcedures.has(code) && fullText.includes(`"${code}"`)) {
          detectedProcedures.add(code)
          const globalIndex = startIndex + detectedProcedures.size
          const nextIdx = codes.indexOf(code) + 1
          const nextCode = nextIdx < codes.length ? codes[nextIdx] : (label === '1차' ? PHASE2_CODES[0] : null)
          sendEvent({
            type: 'progress',
            procedure: code,
            name: procedureNameMap[code] || code,
            index: globalIndex,
            total: ALL_CODES.length,
            nextProcedure: nextCode || null,
            nextName: nextCode ? (procedureNameMap[nextCode] || nextCode) : null,
          })
        }
      }
    }
  }

  console.log(`[demo][${label}] AI 스트리밍 완료 — ${tokenCount}토큰, ${detectedProcedures.size}/${codes.length}개 절차 감지`)
  const result = parseAIResponse(fullText, label)
  console.log(`[demo][${label}] 파싱 결과: ${Object.keys(result).length}개 키 — [${Object.keys(result).join(', ')}]`)
  return result
}

/**
 * 1차 요약 생성 (2차 호출 컨텍스트용)
 */
function buildPhase1Summary(phase1Data) {
  const parts = []
  if (phase1Data['T-1-1']) parts.push(`- 팀 비전: ${JSON.stringify(phase1Data['T-1-1']).slice(0, 300)}`)
  if (phase1Data['T-1-2']) parts.push(`- 수업설계 방향: ${JSON.stringify(phase1Data['T-1-2']).slice(0, 300)}`)
  if (phase1Data['A-1-2']) parts.push(`- 선정 주제: ${JSON.stringify(phase1Data['A-1-2']).slice(0, 300)}`)
  if (phase1Data['A-2-1']) parts.push(`- 성취기준 분석: ${JSON.stringify(phase1Data['A-2-1']).slice(0, 300)}`)
  if (phase1Data['A-2-2']) parts.push(`- 통합 수업목표: ${JSON.stringify(phase1Data['A-2-2']).slice(0, 300)}`)
  return parts.length > 0 ? parts.join('\n') : '(1차 결과 없음)'
}

/**
 * POST /api/demo/generate
 * 데모 수업 설계 생성 (SSE 스트리밍)
 *
 * @body {{ workspaceId: string, grade: string, subjects: string[], topic: string, description?: string }}
 */
demoRouter.post('/generate', requireAuth, async (req, res) => {
  const { workspaceId, grade, subjects, topic, description } = req.body
  const userId = req.user.id

  if (!workspaceId) {
    return res.status(400).json({ error: '워크스페이스 ID가 필요합니다.' })
  }
  if (!grade || !subjects?.length || subjects.length < 2 || !topic?.trim()) {
    return res.status(400).json({
      error: '학년, 교과(2개 이상), 주제 키워드는 필수입니다.',
    })
  }

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    // 1. Supabase에 실제 프로젝트 생성
    const projectTitle = `[시뮬레이션] ${topic}`
    console.log(`[demo] 프로젝트 생성 시작 — workspace: ${workspaceId}, 주제: ${topic}`)

    const project = await createProject(workspaceId, {
      title: projectTitle,
      description: description || `AI 시뮬레이션으로 자동 생성된 ${grade} ${subjects.join('+')} 융합수업 설계`,
      current_procedure: 'prep',
      status: 'active',
    })
    const projectId = project.id
    console.log(`[demo] 프로젝트 생성 완료 — id: ${projectId}`)

    sendEvent({ type: 'started', projectId, workspaceId })

    // 2. 교사 컨텍스트 + 시스템 프롬프트 빌드
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

    const baseSystemPrompt = `당신은 한국 교육과정 기반 융합수업 설계 전문가입니다.
TADDs-DIE 협력적 수업설계 모형에 따라 설계 결과물을 JSON으로 생성하세요.

## 핵심 원칙
1. 교사가 제공한 학년, 교과, 주제, 설계 의도가 설계의 최상위 기준입니다.
2. 특히 교사의 설명/의도는 단순 참고가 아니라, 모든 절차를 관통하는 설계 철학으로 반영하세요.
3. 교과 간 융합은 주제를 중심으로 유기적으로 연결되어야 합니다.

## 형식 지침
- 각 절차의 보드 데이터를 해당 스키마에 맞는 JSON으로 생성하세요.
- 현실적이고 교육적으로 의미 있는 내용을 작성하세요.
- 한국 2022 개정 교육과정의 성취기준을 참조하세요.
- 응답은 반드시 유효한 JSON 객체여야 합니다. 마크다운 코드블록(\\"\`\`\`\\")으로 감싸지 마세요.
${teacherContext}`

    const userPromptBase = `대상: ${grade}
교과: ${subjects.join(', ')}
주제: ${topic}
${description ? `교사 의도: ${description}` : ''}`

    // ── 3. 1차 호출: prep ~ A-2-2 (10개) ──
    console.log('[demo] === 1차 호출 시작 (prep ~ A-2-2) ===')
    const phase1Schema = buildSchemaText(PHASE1_CODES)
    const phase1System = `${baseSystemPrompt}\n\n## 보드 스키마\n${phase1Schema}`
    const phase1User = `다음 조건으로 융합수업 설계의 전반부(준비~분석)를 생성하세요:

${userPromptBase}

생성할 절차: ${PHASE1_CODES.join(', ')}

JSON 형식:
{
  "prep": { ... },
  "T-1-1": { ... },
  ...
  "A-2-2": { ... }
}

반드시 유효한 JSON만 응답하세요. 설명 텍스트나 마크다운 코드블록 없이 순수 JSON만 반환하세요.`

    const phase1Data = await streamAndParse({
      systemPrompt: phase1System,
      userPrompt: phase1User,
      codes: PHASE1_CODES,
      startIndex: 0,
      label: '1차',
      sendEvent,
    })

    // 1차 결과 DB 저장
    let phase1Saved = 0
    for (const [code, content] of Object.entries(phase1Data)) {
      if (!BOARD_TYPES[code] || !content) continue
      try {
        await upsertDesign(projectId, code, content, userId)
        phase1Saved++
        console.log(`[demo][1차] 저장 완료: ${code}`)
      } catch (err) {
        console.warn(`[demo][1차] 저장 실패 (${code}):`, err.message)
      }
    }
    console.log(`[demo] 1차 저장 완료: ${phase1Saved}/${PHASE1_CODES.length}개`)

    sendEvent({ type: 'phase_complete', phase: 1, saved: phase1Saved, total: PHASE1_CODES.length })

    // ── 4. 2차 호출: Ds-1-1 ~ E-2-1 (9개) ──
    console.log('[demo] === 2차 호출 시작 (Ds-1-1 ~ E-2-1) ===')
    const phase1Summary = buildPhase1Summary(phase1Data)
    const phase2Schema = buildSchemaText(PHASE2_CODES)
    const phase2System = `${baseSystemPrompt}

## 앞 단계 설계 결과 (반드시 이어서 설계할 것)
아래는 준비~분석 단계의 설계 결과 요약입니다. 후반부 설계는 이 내용을 기반으로 일관성 있게 이어가야 합니다:
${phase1Summary}

## 보드 스키마
${phase2Schema}`

    const phase2User = `다음 조건으로 융합수업 설계의 후반부(설계~평가)를 생성하세요:

${userPromptBase}

생성할 절차: ${PHASE2_CODES.join(', ')}

앞 단계(준비~분석)의 설계 결과를 반영하여, 일관된 흐름으로 후반부를 생성하세요.

JSON 형식:
{
  "Ds-1-1": { ... },
  ...
  "E-2-1": { ... }
}

반드시 유효한 JSON만 응답하세요. 설명 텍스트나 마크다운 코드블록 없이 순수 JSON만 반환하세요.`

    const phase2Data = await streamAndParse({
      systemPrompt: phase2System,
      userPrompt: phase2User,
      codes: PHASE2_CODES,
      startIndex: PHASE1_CODES.length,
      label: '2차',
      sendEvent,
    })

    // 2차 결과 DB 저장
    let phase2Saved = 0
    for (const [code, content] of Object.entries(phase2Data)) {
      if (!BOARD_TYPES[code] || !content) continue
      try {
        await upsertDesign(projectId, code, content, userId)
        phase2Saved++
        console.log(`[demo][2차] 저장 완료: ${code}`)
      } catch (err) {
        console.warn(`[demo][2차] 저장 실패 (${code}):`, err.message)
      }
    }
    console.log(`[demo] 2차 저장 완료: ${phase2Saved}/${PHASE2_CODES.length}개`)

    const totalSaved = phase1Saved + phase2Saved
    console.log(`[demo] === 전체 완료: ${totalSaved}/${ALL_CODES.length}개 보드 저장 ===`)

    // 5. 완료 이벤트
    sendEvent({
      type: 'complete',
      projectId,
      workspaceId,
      savedBoards: totalSaved,
      totalProcedures: ALL_CODES.length,
    })
    res.end()
  } catch (error) {
    console.error('[demo] 생성 오류:', error)
    sendEvent({ type: 'error', message: '데모 생성 중 오류가 발생했습니다.' })
    res.end()
  }
})
