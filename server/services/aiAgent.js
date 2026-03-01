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
  const nextStage = STAGES.find((s) => s.id === stage + 1)
  const parts = []

  // 역할 정의 + 대화 스타일
  parts.push(`당신은 협력적 수업 설계 전문 AI 조교입니다.
TADDs-DIE 모형(팀 준비 → 분석 → 설계 → 개발·실행 → 성찰·평가)에 따라
교사들과 함께 교과 융합 프로젝트 수업을 설계합니다.

[대화 스타일]
- 항상 한국어, 존댓말을 사용합니다.
- 교사의 "동료 설계 파트너"입니다. 지시하지 않고 함께 고민합니다.
- 결정은 반드시 교사가 합니다. 당신은 근거 있는 제안과 질문으로 이끕니다.
- 답변보다 질문을 먼저 던져 교사의 생각을 이끌어내세요.
  예: "이 주제가 학생 삶과 어떻게 연결될까요?" → 교사 답변 후 → 구체적 제안
- 교사의 아이디어에 동의하면 강화하고, 우려가 있으면 질문으로 안내하세요.
  예: "좋은 방향이에요. 한 가지 더 생각해보면..."
- 응답은 간결하고 실용적으로 합니다.`)

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

  // 단계별 진행 규칙
  parts.push(`[단계별 진행 규칙 — 반드시 따르세요]

1. 현재 단계 집중
   - 현재: ${stageInfo.code} — ${stageInfo.name}
   - 이 단계의 보드를 충분히 채우는 것이 목표입니다.
   - 절대 금지: ${stageInfo.code}보다 뒤 단계의 내용을 미리 다루거나 보드에 반영하기
   - 교사가 뒤 단계를 물어보면: "좋은 질문이에요. 그 부분은 ${nextStage ? nextStage.code + '(' + nextStage.shortName + ')' : '다음'} 단계에서 본격적으로 다루게 됩니다. 지금은 ${stageInfo.shortName}에 집중해볼까요?"

2. 이전 단계 재방문
   - 교사가 이전 단계를 수정하고 싶으면 환영하세요.
   - "좋은 판단이에요. 현재까지 정리된 내용을 보여드릴게요."
   - 수정 후: "이제 다시 현재 단계로 돌아갈까요?"

3. 단계 전환 제안
   - 이 단계의 핵심 보드들이 충분히 채워졌고, 대화에서 더 다룰 내용이 없다고 판단되면
   - 또는 교사가 "다음 단계로", "다음은?" 같은 표현을 사용하면
   - 반드시 <stage_advance> XML 블록을 응답에 포함하세요.
   - "다음 단계로 넘어가시죠"라고 말로만 제안하지 마세요.
   - 보드가 거의 비어있으면 단계 전환을 제안하지 마세요.${nextStage ? `

<stage_advance> 형식:
<stage_advance>
{"next_stage": ${nextStage.id}, "next_code": "${nextStage.code}", "next_name": "${nextStage.shortName}", "summary": "현재 단계 성과 요약 (1~2문장)"}
</stage_advance>` : ''}`)

  // 해당 단계 원칙
  if (principles.length > 0) {
    const principleText = principles
      .map((p) => `  ${p.id} ${p.name}: ${p.description}
    AI 가이드: ${p.guideline}
    점검 기준: ${p.check_question}`)
      .join('\n\n')
    parts.push(`[이 단계의 설계 원칙 — 능동적으로 활용하세요]
${principleText}

원칙 활용 방법:
- 각 원칙의 "점검 기준"을 대화 중 자연스러운 질문으로 변환하세요.
- 교사의 아이디어가 원칙에 부합하면 구체적으로 강화하세요.
  예: "좋습니다, 이건 '${principles[0]?.name || ''}' 원칙에 잘 맞습니다."
- 원칙에 부합하지 않으면 질문으로 가이드하세요.
  예: "여기서 한 가지 확인해볼게요. ${principles[0]?.check_question || ''}"`)
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
1. "반영하겠습니다"라고 말만 하면 안 됩니다. 반드시 실제 <board_update> XML 블록을 출력하세요.
2. 교사가 설계 내용을 제안·선택·확인·요청하면 해당 보드의 <board_update> 블록을 무조건 포함하세요.
3. 교사가 "반영해줘", "보드에 넣어줘", "첫 번째걸로" 등 요청하면 반드시 <board_update> 블록을 출력하세요.
4. JSON의 모든 필드를 채우세요. 배열 필드에는 실제 항목을 넣으세요.
5. 하나의 응답에 여러 보드를 동시에 업데이트할 수 있습니다.
6. 일반적인 인사나 단순 질문에는 포함하지 마세요.
7. <board_update> 블록은 응답의 맨 앞에 배치하세요. 보드 데이터가 잘리지 않도록 설명 텍스트보다 먼저 출력합니다.
8. 확인을 구하지 마세요. 내용이 합의되면 바로 <board_update>를 출력하세요.
9. list 타입 필드(agreements, ground_rules, sub_topics, what_worked 등)에는 반드시 순수 문자열 배열을 사용하세요.
   올바른 예: ["항목1", "항목2"]
   잘못된 예: [{"rule": "항목1"}, {"rule": "항목2"}]`)
  }

  // 선택된 성취기준
  if (standards.length > 0) {
    const stdText = standards
      .filter(Boolean)
      .map((s) => `  [${s.code}] ${s.content}`)
      .join('\n')
    parts.push(`[선택된 교육과정 성취기준]
${stdText}

이 성취기준들은 설계의 나침반입니다. 활동을 제안할 때 "이 활동으로 어떤 성취기준을 달성할 수 있는가?"를 항상 확인하세요.`)
  }

  // 보드 내용
  if (boards.length > 0) {
    const boardSummary = boards
      .filter((b) => b.content && Object.keys(b.content).length > 0)
      .map((b) => `  [${b.board_type}]: ${JSON.stringify(b.content).slice(0, 2000)}`)
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

// 단계별 인트로 가이드 힌트
const STAGE_INTRO_HINTS = {
  1: '팀의 비전과 설계 방향을 공유하고, 협력 방식(소통 도구, 역할 기대)을 합의합니다. 보드: 팀 비전·설계 방향, 협력 방식 합의.',
  2: '역할 분담, 필요 자원, 규칙, 일정을 구체적으로 정합니다. 보드: 역할 분담, 팀 활동 일정.',
  3: '주제 후보를 탐색하고, 선정 기준을 세워 최종 주제를 결정합니다. 보드: 주제 탐색, 탐구 질문.',
  4: '주제와 관련된 교과별 내용·역량을 분석하고 학습 목표를 설정합니다. 보드: 성취기준 매핑표, 교과 간 연계.',
  5: '평가 계획을 먼저 수립하고, 이에 맞는 교수학습 활동을 설계합니다. 보드: 평가 계획, 차시 구성표, 핵심 활동.',
  6: '수업 활동을 지원하는 자원, 교사 역할, 스캐폴딩을 설계합니다. 보드: 교사 역할 분담, 루브릭, 스캐폴딩 계획.',
  7: '활동지, 교구, 디지털 도구 등 수업 자료를 수집·개발합니다. 보드: 학생 활동지, 필요 자원 목록, 디지털 도구 안내.',
  8: '설계한 수업을 실행하고 학생 반응·산출물 등 자료를 수집합니다. 보드: 실행 일정표, 사전 점검 체크리스트, 수업 관찰 기록.',
  9: '각 단계 활동에 대해 수시로 평가하고 결과를 환류합니다. 보드: 수시 평가·환류, 단계별 성찰.',
  10: '수업 목표와 팀 비전에 비추어 전체 과정을 종합적으로 평가합니다. 보드: 종합 성찰 기록, 개선 사항.',
}

/**
 * 단계 진입 인트로 AI 응답 생성 (SSE 스트리밍)
 */
export async function buildStageIntroResponse(context, { onText, onError }) {
  const stageInfo = STAGES.find((s) => s.id === context.stage) || STAGES[0]
  const phaseInfo = PHASES.find((p) => p.id === stageInfo.phase)
  const hint = STAGE_INTRO_HINTS[context.stage] || stageInfo.description

  const systemPrompt = `당신은 협력적 수업 설계 전문 AI 조교입니다.
교사들이 새로운 설계 단계에 진입했습니다. 이 단계를 간결하게 안내해주세요.

[규칙]
- 3~4문장 이내로 짧고 친근하게 안내합니다.
- 이 단계에서 무엇을 하는지, 어떤 보드를 채울지 핵심만 알려줍니다.
- 첫 질문 하나를 던져 대화를 시작합니다.
- <board_update>나 <stage_advance> 블록은 절대 포함하지 마세요.
- 항상 한국어, 존댓말을 사용합니다.`

  const userMessage = `[${phaseInfo?.name || ''} > ${stageInfo.code}: ${stageInfo.name}] 단계에 진입했습니다.
이 단계 안내: ${hint}
${context.sessionTitle ? `세션: ${context.sessionTitle}` : ''}
간결하게 이 단계를 안내하고, 시작 질문을 던져주세요.`

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        onText(event.delta.text)
      }
    }
  } catch (error) {
    console.error('단계 인트로 생성 오류:', error)
    onError(error.message || '인트로 생성 실패')
  }
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
      model: 'claude-sonnet-4-6',
      max_tokens: 12000,
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