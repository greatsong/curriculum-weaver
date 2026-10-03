/**
 * 약식 기록(연수 모드) AI 지시문 — buildSystemPrompt가 briefMode일 때만 붙인다.
 *
 * 분류(A·B·C)와 도움 버튼, 생략된 앞 절차 의존은 shared/briefMode.js 단일 소스에서 읽는다.
 * 팀 채팅·1인 기록(briefMode가 아닌 팀)의 지시문에는 아무것도 더하지 않는다.
 */
import {
  getBriefStatus,
  getBriefHelpActions,
  BRIEF_ASK_ONCE,
  BRIEF_DEPENDENCIES,
  BRIEF_GUIDED_LABEL,
  briefProcedureLabel,
} from 'curriculum-weaver-shared/briefMode.js'

function fieldList(items) {
  return items.map((x) => `${x.label}(${x.name})`).join(', ')
}

/**
 * @param {object} params
 * @param {string} params.procedure - 현재 절차 내부 코드
 * @param {Array<{procedure_code: string, content: object}>} [params.boards] - 프로젝트 보드
 * @param {string[]} [params.skippedCodes] - 팀이 생략한 절차
 * @returns {string|null} 지시문 블록. 분류할 수 없는 절차면 null
 */
export function buildBriefModeBlock({ procedure, boards = [], skippedCodes = [] }) {
  const board = (boards || []).find((b) => b?.procedure_code === procedure)
  const status = getBriefStatus(procedure, board?.content || {})
  if (!status) return null

  const filledA = status.a.filter((x) => x.filled)
  const emptyA = status.a.filter((x) => !x.filled)
  const emptyB = status.b.filter((x) => !x.filled)
  const askWhy = BRIEF_ASK_ONCE[procedure]?.why || ''
  const help = getBriefHelpActions(procedure)
  const skipped = new Set(skippedCodes || [])
  const missingDeps = (BRIEF_DEPENDENCIES[procedure] || []).filter((d) => skipped.has(d.dep))

  const lines = []
  lines.push(`[진행 방식 — 약식 기록(연수) · 위 [대화 스타일]의 '질문 먼저', [절차 진행 규칙]의 스텝 순서, [보드 업데이트] 3번 "모든 필드를 채우세요"보다 우선]`)
  lines.push('이 팀은 활동을 오프라인으로 마친 뒤 결과를 간단히 입력합니다. 당신의 일은 입력을 보드로 옮기고, 필수 내용이 채워지면 더 묻지 않고 다음 절차로 넘어가게 돕는 것입니다.')
  lines.push('')
  lines.push('이 절차의 칸 구분')
  lines.push(`- 필수: ${fieldList(status.a) || '없음'}`)
  lines.push(`- 한 번 묻기: ${status.b.length ? `${fieldList(status.b)}${askWhy ? ` — ${askWhy}` : ''}` : '없음'}`)
  lines.push('- 나머지 칸: 교사가 적으면 옮기고, 먼저 묻지 않습니다.')
  lines.push(`- 지금 보드: 채워진 필수 ${filledA.length ? fieldList(filledA) : '없음'} / 비어 있는 필수 ${emptyA.length ? fieldList(emptyA) : '없음'}${status.b.length ? ` / 비어 있는 한 번 묻기 ${emptyB.length ? fieldList(emptyB) : '없음'}` : ''}`)
  lines.push('')
  lines.push('기본 동작')
  lines.push('1. 교사가 적은 내용을 해당 칸에 나눠 <ai_suggestion>으로 제안합니다. 교사가 쓴 문장을 그대로 옮기고, 다듬거나 내용을 보태지 않습니다. 형식이 틀이 아니어도(한 문장, 메모) 칸에 맞게 나눕니다.')
  lines.push('2. 교사가 적지 않은 칸은 JSON에 넣지 않습니다. 빈 값을 넣으면 보드에 있던 내용이 지워집니다. 적지 않은 내용을 지어내지 않습니다.')
  lines.push('3. 응답 본문은 세 문장 이내로 씁니다. 보드에 넣는 내용을 본문에 다시 나열하지 않습니다.')
  lines.push('4. 스텝을 하나씩 밟지 않습니다. 안내·논의·점검·기록 스텝을 먼저 꺼내지 않고, 정합성 점검도 요청이 있을 때만 합니다.')
  lines.push('5. 필수 칸이 모두 채워지면(이번 제안 포함) 더 묻지 않습니다. 비어 있는 한 번 묻기 칸이 있으면 응답 끝에 한 문장으로 한 번만 묻습니다. 이 절차 대화에서 이미 물었거나 교사가 넘어가겠다고 했으면 다시 묻지 않습니다. 다음 절차로는 화면의 [다음 절차] 버튼으로 이동할 수 있다고만 알립니다.')
  lines.push('6. 필수 칸이 비어 있으면 무엇이 비었는지 한 줄로 알리고 입력을 기다립니다. 질문을 여러 개 하지 않습니다.')
  lines.push('7. 수업 전이라 실제 결과가 없다는 이유로 거절하지 않습니다. 교사가 적은 대로 옮깁니다.')
  lines.push('')
  lines.push('교사의 분명한 지시는 기본 동작보다 우선합니다')
  lines.push('- "그대로 넣어 주세요", "개입하지 마세요", "묻지 마세요", "정리만 해 주세요" 같은 말: 적은 내용만 그대로 옮기고 의견·평가·추가 질문·한 번 묻기를 모두 생략합니다. 본문은 한 문장으로 끝냅니다. 교사가 다르게 말하기 전까지 이 절차에서 그대로 유지합니다.')
  lines.push('- "알아서 채워 주세요", "예시로", "가상으로" 같은 말: 앞 절차 보드를 근거로 필수 칸 초안을 제안하고, AI가 만든 초안이라는 점을 본문에 한 문장으로 밝힙니다.')
  lines.push(`- "[AI 도움: ${BRIEF_GUIDED_LABEL}]"이나 "같이 해 주세요", "단계별로 도와주세요" 같은 말: 이 절차에 한해 약식 규칙을 끄고 원래 방식(스텝 순서, 질문으로 이끌기)으로 진행합니다. 교사가 "직접 적을게요"라고 하면 다시 약식으로 돌아옵니다.`)
  lines.push('- "[AI 도움: ○○]"로 시작하는 메시지: 아래 도움 목록에서 그 일만 하고 끝냅니다. 다음 스텝으로 이어 가지 않습니다. 머리말 아래에 교사가 적은 내용이 있으면 그것을 바탕으로 합니다.')
  lines.push('- "다음", "넘어가요", "다음 절차로" 같은 말: 필수 칸이 비어 있어도 막지 않고 <procedure_advance>를 넣습니다. 비어 있는 필수 칸은 한 줄로만 알립니다.')
  if (help.length) {
    lines.push('')
    lines.push('도움 목록')
    for (const h of help) lines.push(`- ${h.label}: ${h.description}`)
  }
  if (missingDeps.length) {
    lines.push('')
    lines.push('생략된 앞 절차')
    for (const d of missingDeps) {
      const label = briefProcedureLabel(d.dep)
      lines.push(d.ask
        ? `- ${label}이(가) 생략되었습니다. 필요할 때만 "${d.ask}"을(를) 한 번 물으세요. 짐작해서 채우지 마세요.`
        : `- ${label}이(가) 생략되었습니다. 관련 항목은 빼고 진행하며 묻지 않습니다.`)
    }
  }
  return lines.join('\n')
}
