import Anthropic from '@anthropic-ai/sdk'
import { STAGES } from 'curriculum-weaver-shared/constants.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * 단계별 시스템 프롬프트 동적 구성
 */
function buildSystemPrompt({ session, principles, standards, materials, boards, stage }) {
  const stageInfo = STAGES.find((s) => s.id === stage) || STAGES[0]
  const parts = []

  // 역할 정의
  parts.push(`당신은 융합 수업 설계 전문 AI 공동설계자(Co-Designer)입니다.
교사들과 함께 수업을 설계하며, 설계 원칙에 기반하여 안내합니다.
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
${stageInfo.id}단계: ${stageInfo.name}
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
