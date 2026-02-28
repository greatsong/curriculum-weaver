import Anthropic from '@anthropic-ai/sdk'
import { STAGES, PHASES, BOARD_TYPES } from 'curriculum-weaver-shared/constants.js'
import { getBoardSchemaForPrompt } from 'curriculum-weaver-shared/boardSchemas.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * 단계별 시스템 프롬프트 동적 구성
 */
function buildSystemPrompt({ session, principles, standards, materials, boards, stage }) {
  const stageInfo = STAGES.find((s) => s.id === stage) || STAGES[0]
  const phaseInfo = PHASES.find((p) => p.id === stageInfo.phase)
  const parts = []

  // 역할 정의
  parts.push(`당신은 협력적 수업 설계 전문 AI 공동설계자(Co-Designer)입니다.
TADDs-DIE 모형(팀 준비 → 분석 → 설계 → 개발·실행 → 성찰·평가)에 따라
교사들과 함께 교과 융합 프로젝트 수업을 설계합니다.
항상 한국어로 응답하며, 존댓말을 사용합니다.
응답은 간결하고 실용적으로 합니다.
결정은 반드시 교사가 하고, 당신은 근거 있는 제안을 합니다.`)

  // 세션 정보
  if (session) {
    parts.push(`[설계 세션]
제목: ${session.title}
${session.description ? `설명: ${session.description}` : ''}`)
  }

  // 현재 단계
  parts.push(`[현재 설계 단계]
${phaseInfo?.name || ''} > ${stageInfo.code}: ${stageInfo.name}
${stageInfo.description}`)

  // 해당 단계 원칙
  if (principles.length > 0) {
    const principleText = principles
      .map((p) => `  ${p.id} ${p.name}: ${p.description}\n    AI 가이드: ${p.guideline}`)
      .join('\n')
    parts.push(`[이 단계의 설계 원칙 — 반드시 참고하여 안내하세요]
${principleText}

위 원칙들은 단순 참고가 아니라, 당신의 모든 제안과 피드백의 기준입니다.
교사의 설계가 원칙에 부합하는지 항상 점검하되, 자연스러운 질문이나 제안으로 가이드하세요.`)
  }

  // 보드 업데이트 지침
  const stageBoardTypes = BOARD_TYPES[stage] || []
  if (stageBoardTypes.length > 0) {
    const schemaText = getBoardSchemaForPrompt(stage)
    parts.push(`[설계 보드 자동 업데이트 — 최우선 규칙]
대화에서 설계 내용이 구체화되면, 반드시 아래 XML 블록을 응답에 포함하세요.
이 블록은 시스템이 자동 파싱하여 보드에 즉시 반영합니다.

형식:
<board_update type="보드타입">
{JSON 데이터}
</board_update>

이 단계의 보드 타입과 JSON 구조:
${schemaText}

★ 절대 규칙:
1. "반영하겠습니다", "반영되었습니다"라고 말만 하면 안 됩니다. 반드시 실제 <board_update> XML 블록을 출력해야 합니다.
2. 교사가 설계 내용을 제안·선택·확인·요청하면 해당 보드의 <board_update> 블록을 무조건 포함하세요.
3. 교사가 "반영해줘", "보드에 넣어줘", "첫 번째걸로" 등 요청하면 반드시 <board_update> 블록을 출력하세요.
4. JSON의 모든 필드를 채우세요. 배열 필드에는 실제 항목을 넣으세요.
5. 하나의 응답에 여러 보드를 동시에 업데이트할 수 있습니다.
6. 일반적인 인사나 단순 질문에는 포함하지 마세요.
7. <board_update> 블록은 자연스러운 설명 텍스트 뒤, 응답 끝부분에 배치하세요.
8. 확인을 구하지 마세요. 내용이 합의되면 바로 <board_update>를 출력하세요.`)
  }

  // 선택된 성취기준
  if (standards.length > 0) {
    const stdText = standards
      .filter(Boolean)
      .map((s) => `  ${s.code}: ${s.content}`)
      .join('\n')
    parts.push(`[선택된 성취기준]
${stdText}`)
  }

  // 보드 내용
  if (boards.length > 0) {
    const boardSummary = boards
      .filter((b) => b.content && Object.keys(b.content).length > 0)
      .map((b) => `  [${b.board_type}]: ${JSON.stringify(b.content).slice(0, 500)}`)
      .join('\n')
    if (boardSummary) {
      parts.push(`[현재 설계 보드 내용]
${boardSummary}`)
    }
  }

  // 업로드 자료
  if (materials.length > 0) {
    const matText = materials
      .filter((m) => m.ai_summary)
      .map((m) => `  ${m.file_name}: ${m.ai_summary}`)
      .join('\n')
    if (matText) {
      parts.push(`[업로드된 자료 분석 결과]
${matText}`)
    }
  }

  return parts.join('\n\n')
}

/**
 * 대화 이력을 Claude 메시지 형식으로 변환
 */
function buildMessages(recentMessages, userMessage) {
  const messages = []

  for (const msg of recentMessages) {
    messages.push({
      role: msg.sender_type === 'teacher' ? 'user' : 'assistant',
      content: msg.content,
    })
  }

  // 현재 사용자 메시지 추가
  messages.push({ role: 'user', content: userMessage })

  return messages
}

/**
 * AI 응답 생성 (SSE 스트리밍)
 */
export async function buildAIResponse(context, { onText, onError }) {
  const systemPrompt = buildSystemPrompt(context)
  const messages = buildMessages(context.recentMessages, context.userMessage)

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        onText(event.delta.text)
      }
    }
  } catch (error) {
    console.error('Claude API 오류:', error)
    onError(error.message || 'AI 응답 생성 실패')
  }
}
