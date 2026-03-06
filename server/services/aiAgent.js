import Anthropic from '@anthropic-ai/sdk'
import { STAGES, PHASES, BOARD_TYPES } from 'curriculum-weaver-shared/constants.js'
import { getBoardSchemaForPrompt } from 'curriculum-weaver-shared/boardSchemas.js'
import { STAGE_GUIDE, SUBSTEPS_BY_STAGE, COMMON_RULES } from '../data/stageGuide.js'
import { GeneralPrinciples } from '../lib/store.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * 현재 단계의 서브스텝 가이드 텍스트 생성
 */
function buildSubstepGuideText(stage) {
  const codes = SUBSTEPS_BY_STAGE[stage] || []
  const substeps = codes.map((code) => STAGE_GUIDE[code]).filter(Boolean)
  if (substeps.length === 0) return ''

  const substepBlocks = substeps
    .map((ss) => {
      const methodsText = ss.methods.map((m) => `  - ${m}`).join('\n')
      const notesText = Array.isArray(ss.notes) ? ss.notes.map((n) => `  - ${n}`).join('\n') : ss.notes
      const reflText = ss.reflection_questions.map((q) => `  - ${q}`).join('\n')
      const aiRec = ss.ai_recommendation ? `\nAI 추천: 교사가 아이디어를 내기 어려워하면 → ${ss.ai_recommendation}` : ''
      const outputsText = ss.outputs ? `\n예상 산출물: ${ss.outputs.join(', ')}` : ''

      return `### ${ss.code}: ${ss.name}
핵심 질문: ${ss.core_question}

개념: ${ss.concept}

방법/절차:
${methodsText}

유의사항:
${notesText}

예시: ${ss.examples}

성찰 질문:
${reflText}
${aiRec}${outputsText}
대상 보드: ${ss.target_boards.join(', ')}`
    })
    .join('\n\n---\n\n')

  return `[이 단계의 세부 활동 가이드 — 순서대로 진행하세요]

이 단계는 ${substeps.length}개 세부 활동으로 구성됩니다.

${substepBlocks}

★ 세부 활동 진행 규칙:
1. 한 턴에 하나의 세부 활동만 다루세요. 모든 세부 활동을 한꺼번에 진행하지 마세요.
2. 각 세부 활동에서 "대화 루프"를 따르세요 (아래 [공통 운영 규칙] 참조).
3. 세부 활동이 충분히 논의되었으면 다음 세부 활동으로 자연스럽게 전환하세요.
4. 모든 세부 활동이 완료되면 <stage_advance>를 출력하세요.`
}

/**
 * 공통 운영 규칙 텍스트 생성
 */
function buildCommonRulesText() {
  return `[공통 운영 규칙 — 모든 대화에 적용]

1. 대화 루프 (각 세부 활동마다 반복):
   ① 핵심 질문을 교사에게 제시합니다.
   ② 동시 제시판(표)을 함께 제공합니다:
      | 항목 | 내용 |
      |------|------|
      | 개념 | (해당 세부활동의 개념 설명) |
      | 방법/절차 | (절차 요약) |
      | 유의사항 | (핵심 유의점) |
      | 예시 | (구체적 예시) |
   ③ 교사의 응답을 2줄 이내로 요약하고, 누락 요소가 있으면 3개 이내로 보정 질문합니다.
   ④ 보정 답변을 반영할지 교사에게 확인합니다 ("반영할까요?").
   ⑤ 성찰 질문을 1~2개 던집니다.
   ⑥ 합의된 내용을 <board_update>로 출력합니다.

2. 예시 제공 규칙:
   ${COMMON_RULES.example_provision.map((r) => `- ${r}`).join('\n   ')}

3. 파일 근거 규칙:
   ${COMMON_RULES.file_evidence.map((r) => `- ${r}`).join('\n   ')}

4. 응답 형식: ${COMMON_RULES.response_format}

5. 가드레일:
   ${COMMON_RULES.guardrails.map((r) => `- ${r}`).join('\n   ')}`
}

/**
 * 총괄 원리 프롬프트 텍스트 생성
 */
function buildGeneralPrinciplesText() {
  const gps = GeneralPrinciples.list()
  if (gps.length === 0) return ''

  const gpBlocks = gps.map(gp => {
    const guidelinesText = gp.guidelines
      .map(g => `    - ${g.content}`)
      .join('\n')
    return `  ${gp.id} ${gp.name}: ${gp.description}\n    지침:\n${guidelinesText}`
  }).join('\n\n')

  return `[협력적 수업설계 총괄 원리 — 모든 단계에 공통 적용]
다음 5가지 총괄 원리와 지침은 모든 설계 단계에서 일관되게 적용되어야 합니다.
대화 중 이 원리들이 자연스럽게 반영되도록 하고, 교사의 활동이 총괄 원리에 부합하면 구체적으로 강화하세요.

${gpBlocks}

총괄 원리 활용 방법:
- 총괄 원리는 특정 단계가 아니라 설계 전 과정에 걸쳐 적용됩니다.
- "상호 의존의 원리"에 따라 팀 비전 공유와 신뢰 형성을 수시로 점검하세요.
- "인지 분산의 원리"에 따라 적절한 역할 부여와 인공물 활용을 안내하세요.
- "활성화의 원리"에 따라 자유로운 발언과 충분한 시간·공간을 보장하세요.
- "외현화의 원리"에 따라 생각을 외부적으로 표현하고 불명확한 부분을 질문하도록 이끄세요.
- "조정의 원리"에 따라 다양한 의견을 통합하고 주기적으로 피드백하도록 안내하세요.`
}

/**
 * 단계별 시스템 프롬프트 동적 구성
 */
function buildSystemPrompt({ session, principles, standards, materials, boards, stage }) {
  const stageInfo = STAGES.find((s) => s.id === stage) || STAGES[0]
  const phaseInfo = PHASES.find((p) => p.id === stageInfo.phase)
  const nextStage = STAGES.find((s) => s.id === stage + 1)
  const parts = []

  // 역할 정의 + 대화 스타일
  parts.push(`당신은 협력적 수업 설계를 지원하기 위해 개발된 AI 에이전트입니다.
TADDs-DIE 모형(팀 준비 → 분석 → 설계 → 개발·실행 → 성찰·평가)에 따라
교사들의 협력적 수업설계에서 퍼실리테이터로서 팀 활동을 이끌고,
다양한 예시 자료와 질문을 던져 교사의 협력적 수업설계 역량 개발을 촉진합니다.

[대화 스타일]
- 항상 한국어, 존댓말을 사용합니다.
- 교사의 "동료 설계 파트너"입니다. 지시하지 않고 함께 고민합니다.
- 결정은 반드시 교사가 합니다. 당신은 근거 있는 제안과 질문으로 이끕니다.
- 답변보다 질문을 먼저 던져 교사의 생각을 이끌어내세요.
  예: "이 주제가 학생 삶과 어떻게 연결될까요?" → 교사 답변 후 → 구체적 제안
- 교사의 아이디어에 동의하면 강화하고, 우려가 있으면 질문으로 안내하세요.
  예: "좋은 방향이에요. 한 가지 더 생각해보면..."
- 응답은 간결하고 실용적으로 합니다.
- 사용자가 관련 내용에 대해 질문을 할 경우, 협력적 수업설계 원리를 참고하여 퍼실리테이터로 지원합니다.`)

  // 공통 운영 규칙
  parts.push(buildCommonRulesText())

  // 총괄 원리 (모든 단계 공통)
  const generalPrinciplesText = buildGeneralPrinciplesText()
  if (generalPrinciplesText) {
    parts.push(generalPrinciplesText)
  }

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

  // 세부 활동 가이드 (서브스텝)
  const substepGuide = buildSubstepGuideText(stage)
  if (substepGuide) {
    parts.push(substepGuide)
  }

  // 해당 단계 원칙 (유의사항 기반)
  if (principles.length > 0) {
    // 서브스텝별로 그룹화
    const bySubstep = {}
    for (const p of principles) {
      if (!bySubstep[p.substep]) bySubstep[p.substep] = []
      bySubstep[p.substep].push(p)
    }

    const principleText = Object.entries(bySubstep)
      .map(([substep, items]) => {
        const itemsText = items.map((p) => `  - ${p.id} ${p.name}: ${p.description}`).join('\n')
        return `  [${substep}]\n${itemsText}`
      })
      .join('\n\n')

    parts.push(`[이 단계의 설계 원칙 — 유의사항으로 능동 활용하세요]
이 단계에는 ${principles.length}개의 유의사항 기반 설계 원칙이 있습니다.

${principleText}

원칙 활용 방법:
- 교사의 활동이 원칙에 부합하면 구체적으로 강화하세요.
- 원칙에 부합하지 않으면 관련 유의사항을 질문으로 변환하여 안내하세요.
- 유의사항은 세부 활동 가이드의 흐름 속에서 자연스럽게 적용하세요.`)
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
7. <board_update> 블록은 응답 텍스트 뒤에 배치하세요. 보드 데이터가 잘리지 않도록 텍스트 설명은 간결하게 작성하세요.
   특히 table 타입 데이터(차시, 활동 등)가 많을 때는 텍스트에서 전체를 나열하지 말고 핵심만 요약한 뒤 <board_update> 블록에 상세 데이터를 넣으세요.
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

/**
 * 단계 진입 인트로 AI 응답 생성 (SSE 스트리밍)
 * — 서브스텝 가이드 기반으로 첫 세부활동의 핵심질문 + 동시 제시판 포함
 */
export async function buildStageIntroResponse(context, { onText, onError }) {
  const stageInfo = STAGES.find((s) => s.id === context.stage) || STAGES[0]
  const phaseInfo = PHASES.find((p) => p.id === stageInfo.phase)

  // 서브스텝 정보 가져오기
  const substepCodes = SUBSTEPS_BY_STAGE[context.stage] || []
  const substeps = substepCodes.map((code) => STAGE_GUIDE[code]).filter(Boolean)

  const isFirstStage = context.stage === 1

  // 서브스텝 기반 안내 구성
  let substepOverview = stageInfo.description
  let firstSubstepGuide = ''
  if (substeps.length > 0) {
    substepOverview = `이 단계의 세부 활동:\n${substeps.map((ss, i) => `${i + 1}. ${ss.code} ${ss.name}: ${ss.core_question}`).join('\n')}`

    const first = substeps[0]
    firstSubstepGuide = `
첫 번째 세부 활동 정보:
- 코드: ${first.code}
- 이름: ${first.name}
- 핵심 질문: ${first.core_question}
- 개념: ${first.concept}
- 방법/절차: ${first.methods.join(' → ')}
- 유의사항: ${Array.isArray(first.notes) ? first.notes[0] : first.notes}
- 예시: ${first.examples}`
  }

  const systemPrompt = `당신은 협력적 수업 설계를 지원하기 위해 개발된 AI 에이전트입니다.
교사들이 새로운 설계 단계에 진입했습니다. 이 단계를 안내해주세요.

[총괄 원리 — 모든 단계에서 일관되게 반영하세요]
1. 상호 의존: 비전 공유, 신뢰 형성, 인적 특성 파악
2. 인지 분산: 역할 부여, 인공물 활용
3. 활성화: 자유 발언, 시간·공간 확보
4. 외현화: 생각 표현, 불명확한 부분 질문
5. 조정: 의견 통합, 주기적 피드백, 설계활동 자기조정

[규칙]
- 5~6문장 이내로 친근하게 안내합니다.
- 이 단계에서 다룰 세부 활동(${substeps.length}개)을 간략히 소개합니다.
- 첫 번째 세부 활동의 핵심 질문을 던져 대화를 시작합니다.
- 동시에 첫 번째 세부 활동의 개념/방법절차/유의사항/예시를 아래 형식의 표로 제시합니다:
  | 항목 | 내용 |
  |------|------|
  | 개념 | ... |
  | 방법/절차 | ... |
  | 유의사항 | ... |
  | 예시 | ... |
- <board_update>나 <stage_advance> 블록은 절대 포함하지 마세요.
- 항상 한국어, 존댓말을 사용합니다.
${isFirstStage ? `- 첫 번째 단계이므로 다음 초기 인사를 자연스럽게 포함하세요:\n  "${COMMON_RULES.initial_message}"` : ''}`

  const userMessage = `[${phaseInfo?.name || ''} > ${stageInfo.code}: ${stageInfo.name}] 단계에 진입했습니다.
${substepOverview}
${firstSubstepGuide}
${context.sessionTitle ? `세션: ${context.sessionTitle}` : ''}
이 단계를 안내하고, 첫 번째 세부 활동부터 시작해주세요.`

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
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

    // 응답 잘림 감지
    const finalMessage = await stream.finalMessage()
    if (finalMessage.stop_reason === 'max_tokens') {
      console.warn('⚠️ AI 응답이 max_tokens에 도달하여 잘렸습니다. board_update가 누락되었을 수 있습니다.')
    }
  } catch (error) {
    console.error('Claude API 오류:', error)
    onError(error.message || 'AI 응답 생성 실패')
  }
}
