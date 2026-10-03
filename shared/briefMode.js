/**
 * 약식 기록(연수 모드) — 절차별 입력 분류의 단일 소스
 *
 * 2026-10 교사 연수(10/9~10/10)를 위해 추가. 연수에서는 활동을 오프라인으로 마치고 기록자가
 * 결과를 간단히 옮겨 적는다. 팀 설정(workspaces.workflow_config.briefMode === true)을 켠 팀에만
 * 적용되고, 기존 팀 채팅·1인 기록 팀의 동작은 바꾸지 않는다.
 *
 * 분류
 * - A(필수): 보드의 필수 칸. 비어 있으면 AI가 한 줄로 알리지만 이동은 막지 않는다.
 * - B(한 번 묻기): 다음 절차가 참고하거나 보고서 이해에 필요한 선택 칸. 필수 입력 뒤 한 번만 묻는다.
 * - C(약식에서 생략): 나머지 칸과 안내·저장·오프라인 논의·AI 생성/점검 스텝. 묻지 않는다.
 *   AI 생성/점검 스텝은 [AI 도움] 버튼(BRIEF_HELP_STEPS)으로만 쓴다.
 *
 * 분류를 바꿀 때는 이 파일만 고치면 서버 지시문·절차 안내·화면 막대가 함께 바뀐다.
 * 기능을 없앨 때는 이 파일, aiAgent의 [진행 방식 — 약식 기록] 블록, chat.js의 buildBriefIntro 분기,
 * BriefModeBar와 그 사용처, 설정 화면의 체크 상자만 지우면 된다.
 */
import { PROCEDURES, PHASES, BOARD_TYPES, getProcedureDisplayCode } from './constants.js'
import { BOARD_SCHEMAS } from './boardSchemas.js'
import { PROCEDURE_STEPS } from './procedureSteps.js'

/** 팀 설정에서 약식 기록이 켜져 있는지. 값이 없는 기존 팀은 꺼진 것으로 본다. */
export function resolveBriefMode(workflowConfig) {
  return workflowConfig?.briefMode === true
}

/**
 * 필수 칸(A)을 스키마의 required에서 바꾸는 경우만 적는다.
 * - A-4: 핵심 아이디어는 스키마상 선택 칸이지만 절차 이름에 들어 있는 산출물이라 약식에서도 필수로 둔다.
 * - prep: 학년만 필수(스키마와 같음).
 */
const EXTRA_REQUIRED = {
  'A-2-2': ['coreIdea'],
}

/** B(한 번 묻기) 칸 — 절차 코드 → 필드 이름 목록과 묻는 이유 */
export const BRIEF_ASK_ONCE = {
  prep: { fields: ['studentCount', 'digitalLiteracy'], why: 'Ds-4 도구와 Ds-5 지원 수준을 정할 때 참고합니다' },
  'A-1-2': { fields: ['selectionRationale'], why: '보고서에서 주제를 고른 이유를 설명합니다' },
  'A-2-1': { fields: ['restructuredStandards'], why: 'A-4 수업목표와 Ds-1 평가 기준의 바탕이 됩니다' },
  'A-2-2': { fields: ['inquiryQuestions'], why: 'Ds-2 문제 상황을 만들 때 출발점이 됩니다' },
  'Ds-2-1': { fields: ['agencyCheck'], why: '학생 판단을 AI가 대신하지 않는지 확인합니다' },
  'DI-2-1': { fields: ['executionPlan'], why: '누가 어느 반에서 실행했는지가 에피소드 해석의 맥락이 됩니다' },
  'E-1-1': { fields: ['rubricGapAnalysis'], why: 'Ds-1 평가 설계와 실제 결과를 연결합니다' },
}

/**
 * [AI 도움] 버튼 — 절차 코드 → { 스텝 번호, 버튼 이름 }.
 * 약식에서 C로 둔 AI 생성·점검 스텝을 요청할 때만 쓰게 한다. A-3의 세 차원 분해는 A이지만
 * 오프라인에서 하기 가장 어려운 일이라 도움 버튼을 함께 둔다.
 */
export const BRIEF_HELP_STEPS = {
  'T-1-1': [{ step: 5, label: '비전 다듬기' }, { step: 7, label: '공통 비전 후보' }],
  'T-1-2': [{ step: 3, label: '키워드 후보' }, { step: 5, label: '키워드 묶기' }, { step: 7, label: '비전과 맞는지 점검' }],
  'T-2-1': [{ step: 4, label: '역할 예시' }, { step: 6, label: '누락 점검' }],
  'T-2-2': [{ step: 4, label: '규칙 예시' }, { step: 6, label: '적절성 점검' }],
  'T-2-3': [{ step: 5, label: '일정표 초안' }],
  'A-1-1': [{ step: 3, label: '기준 예시' }],
  'A-1-2': [{ step: 3, label: '주제 아이디어' }, { step: 5, label: '동료 교과 이해' }, { step: 7, label: '비전·기준 부합 점검' }],
  'A-2-1': [{ step: 3, label: '세 차원 분해' }, { step: 5, label: '공통·중복·누락 정리' }],
  'A-2-2': [{ step: 3, label: '핵심 아이디어 후보' }, { step: 8, label: '정합성 검토' }],
  'Ds-1-1': [{ step: 4, label: '행동 문장으로 바꾸기' }, { step: 6, label: '정합성 검토' }],
  'Ds-1-2': [{ step: 5, label: '학생용 제시문' }, { step: 6, label: '평가 정합성 검토' }],
  'Ds-1-3': [{ step: 4, label: '적절성 검토' }],
  'Ds-2-1': [{ step: 4, label: 'AI 도구 시험 제작' }],
  'Ds-2-2': [{ step: 5, label: '표현 수준 검토' }],
  'DI-1-1': [{ step: 5, label: '반응형 자료 제작' }],
  'DI-2-1': [{ step: 5, label: '되짚어 볼 장면 추리기' }],
  'E-1-1': [{ step: 3, label: '응답 패턴 정리' }],
  'E-2-1': [{ step: 3, label: '협력 구조 검토' }],
}

/** 이 절차를 AI와 단계별로 진행하자는 요청(약식 기본 동작을 이 절차에서만 끈다) */
export const BRIEF_GUIDED_LABEL = '단계별로 함께 진행'

/** 도움 요청 메시지의 머리말. 서버 지시문이 이 형식을 알아본다. */
export function buildHelpRequestText(label, typedText = '') {
  const body = String(typedText || '').trim()
  return body ? `[AI 도움: ${label}]\n${body}` : `[AI 도움: ${label}]`
}

/**
 * 앞 절차가 생략됐을 때 약식에서 한 번만 물을 최소 정보.
 * 절차 코드 → [{ dep: 앞 절차 코드, ask: 물을 내용(없으면 묻지 않고 그 항목만 빼고 진행) }]
 * 정합성 점검 대상(procedureGuide coherenceCheck)과 스텝 설명에 적힌 내용 의존을 합쳤다.
 */
export const BRIEF_DEPENDENCIES = {
  'A-1-2': [{ dep: 'A-1-1', ask: '주제를 고른 기준 한두 가지' }],
  'Ds-1-2': [{ dep: 'Ds-1-1', ask: '학생이 만들 산출물의 형태' }],
  'Ds-1-3': [{ dep: 'Ds-1-1', ask: '평가할 산출물이나 수행 장면' }, { dep: 'Ds-1-2', ask: '학생이 해결할 과제 한 문장' }],
  'Ds-2-1': [{ dep: 'Ds-1-3', ask: '도구를 사용할 활동 이름' }],
  'Ds-2-2': [{ dep: 'Ds-1-3', ask: '지원이 필요한 활동 이름' }],
  'DI-1-1': [{ dep: 'Ds-1-3', ask: '자료가 필요한 활동 이름' }, { dep: 'Ds-2-1', ask: '준비할 도구' }, { dep: 'Ds-2-2', ask: '' }],
  'DI-2-1': [{ dep: 'Ds-1-3', ask: '실행한 활동' }],
  'E-1-1': [{ dep: 'Ds-1-1', ask: '성취를 판단한 기준' }, { dep: 'DI-2-1', ask: '되짚어 볼 수업 장면' }],
  'E-2-1': [{ dep: 'T-2-1', ask: '' }, { dep: 'T-2-2', ask: '' }, { dep: 'T-2-3', ask: '' }],
}

/** 칸 값이 채워졌는지 — 빈 문자열·빈 배열·빈 객체·null은 비어 있는 것으로 본다. */
export function isBriefValueFilled(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(isBriefValueFilled)
  if (typeof value === 'object') return Object.values(value).some(isBriefValueFilled)
  return false
}

function schemaFor(procedureCode) {
  const boardType = BOARD_TYPES[procedureCode]
  return boardType ? BOARD_SCHEMAS[boardType] : null
}

/** 칸 값 읽기 — AI가 한글 라벨을 키로 쓴 예전 보드도 읽는다. */
function readField(content, field) {
  if (!content || typeof content !== 'object') return undefined
  if (content[field.name] !== undefined) return content[field.name]
  return content[field.label]
}

/**
 * 절차의 칸 분류. 스키마에 없는 절차(시연 보드 등)는 null.
 * @returns {{ a: object[], b: object[], c: object[] } | null} 각 원소는 스키마 필드 객체
 */
export function getBriefFieldClasses(procedureCode) {
  const schema = schemaFor(procedureCode)
  if (!schema) return null
  const extra = new Set(EXTRA_REQUIRED[procedureCode] || [])
  const askOnce = new Set(BRIEF_ASK_ONCE[procedureCode]?.fields || [])
  const a = []
  const b = []
  const c = []
  for (const field of schema.fields) {
    if (field.required || extra.has(field.name)) a.push(field)
    else if (askOnce.has(field.name)) b.push(field)
    else c.push(field)
  }
  return { a, b, c }
}

/**
 * 현재 보드 내용으로 본 약식 진행 상태.
 * @returns {{ a: {name,label,filled}[], b: {name,label,filled}[], allAFilled: boolean } | null}
 */
export function getBriefStatus(procedureCode, content) {
  const classes = getBriefFieldClasses(procedureCode)
  if (!classes) return null
  const toItem = (field) => ({ name: field.name, label: field.label, filled: isBriefValueFilled(readField(content, field)) })
  const a = classes.a.map(toItem)
  const b = classes.b.map(toItem)
  return { a, b, allAFilled: a.every((x) => x.filled) }
}

/** 칸 하나의 입력 안내 — 표·목록은 열 이름을 함께 보여 준다(절차 안내에서 사용). */
function fieldHint(field) {
  if (Array.isArray(field.columns) && field.columns.length) {
    return field.columns.map((col) => col.label).join(' / ')
  }
  if (field.itemSchema && typeof field.itemSchema === 'object') {
    return Object.values(field.itemSchema)
      .map((col) => col?.label)
      .filter((label) => label && !/AI/.test(label))
      .join(' / ')
  }
  return ''
}


/** 도움 버튼 목록 — 스텝 설명을 함께 돌려준다(서버 지시문에서 사용). */
export function getBriefHelpActions(procedureCode) {
  const steps = PROCEDURE_STEPS[procedureCode] || []
  return (BRIEF_HELP_STEPS[procedureCode] || [])
    .map(({ step, label }) => {
      const data = steps.find((s) => s.stepNumber === step)
      return data ? { step, label, title: data.title, description: data.description } : null
    })
    .filter(Boolean)
}

/** 다음 절차 표시용 라벨(표시 코드 + 이름). 표시 코드가 없으면 이름만. */
function procLabel(code) {
  const display = getProcedureDisplayCode(code)
  const name = PROCEDURES[code]?.name || ''
  return display ? `${display} ${name}` : name
}

/**
 * 약식 절차 안내(정적, AI 호출 없음). 기존 정적 안내 대신 쓴다.
 * @returns {string|null}
 */
export function buildBriefIntro(procedureCode, coreQuestion = '') {
  const proc = PROCEDURES[procedureCode]
  const classes = getBriefFieldClasses(procedureCode)
  if (!proc || !classes) return null
  const phase = Object.values(PHASES).find((p) => p.id === proc.phase)
  const display = getProcedureDisplayCode(procedureCode)
  const header = display ? `${phase?.name || ''} > ${display}: ${proc.name}` : `${phase?.name || ''}: ${proc.name}`
  const describe = (fields) => fields
    .map((f) => {
      const hint = fieldHint(f)
      return hint ? `${f.label}(${hint.split(' / ').join(' · ')})` : f.label
    })
    .join(', ')

  const lines = []
  lines.push(`**[${header}]** 약식 기록`)
  lines.push('')
  if (coreQuestion) {
    lines.push(`> **핵심 질문**: ${coreQuestion}`)
    lines.push('')
  }
  lines.push(`- **필수 입력**: ${describe(classes.a) || '없음'}`)
  const ask = BRIEF_ASK_ONCE[procedureCode]
  lines.push(`- **선택 입력**: ${classes.b.length ? `${describe(classes.b)}. ${ask?.why || ''}`.trim() : '없음'}`)
  lines.push('')
  lines.push('오프라인 활동 결과를 보드 양식의 빈 칸에 적고 [저장]을 누르세요. 적은 문장이 그대로 보드에 저장됩니다. 표가 길면 채팅에 붙여 넣어도 AI가 칸에 나눠 드립니다.')
  const help = getBriefHelpActions(procedureCode)
  if (help.length) {
    lines.push(`도움이 필요하면 [AI 도움] 버튼(${help.map((h) => h.label).join(', ')})을 누르세요.`)
  }
  return lines.join('\n')
}

export { procLabel as briefProcedureLabel }

/**
 * 약식 기록에서 AI 제안을 보드에 얹기 전에 빈 칸을 뺀다. 보드 병합은 배열·문자열을 통째로 바꾸므로,
 * AI가 지시를 어기고 빈 값을 넣어도 이미 적어 둔 칸이 지워지지 않게 한다(약식 팀에만 적용).
 * @param {object} value - board_update 제안 content
 * @returns {object}
 */
export function stripEmptyBoardFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const out = {}
  for (const [key, v] of Object.entries(value)) {
    if (isBriefValueFilled(v)) out[key] = v
  }
  return out
}

/** 보드 양식 저장 알림의 머리말. 서버 지시문이 이 형식을 알아보고 짧은 조언만 한다. */
export const BRIEF_SAVED_MARK = '[보드 저장]'

/** 양식 저장 뒤 AI에게 짧은 조언을 청하는 메시지 */
export function buildBoardSavedText() {
  return `${BRIEF_SAVED_MARK} 양식에 적은 내용을 보드에 저장했어요.`
}

/**
 * 양식을 저장하기 전에 목록·표 칸의 완전히 빈 항목(행)을 뺀다. 빈 행을 하나 펼쳐 둔 채
 * 저장해도 보드에 빈 줄이 남지 않게 한다. 글자 칸은 손대지 않는다.
 * @param {object} content
 * @param {object} schema - BOARD_SCHEMAS 항목
 */
export function dropEmptyRows(content, schema) {
  if (!content || typeof content !== 'object') return content
  const out = { ...content }
  for (const field of schema?.fields || []) {
    const v = out[field.name]
    if ((field.type === 'list' || field.type === 'table' || field.type === 'tags') && Array.isArray(v)) {
      out[field.name] = v.filter(isBriefValueFilled)
    }
  }
  return out
}

/**
 * 양식을 처음 열 때 비어 있는 필수 목록·표 칸에 빈 행 하나를 펼쳐 둔다(설문지처럼 바로 적을 수 있게).
 * @param {object} content - 현재 보드 내용
 * @param {string} procedureCode
 */
export function seedBriefForm(content, procedureCode) {
  const classes = getBriefFieldClasses(procedureCode)
  const base = { ...(content || {}) }
  if (!classes) return base
  for (const field of [...classes.a, ...classes.b]) {
    if (isBriefValueFilled(readField(base, field))) continue
    if (field.type === 'table' && Array.isArray(field.columns)) {
      base[field.name] = [Object.fromEntries(field.columns.map((c) => [c.name, '']))]
    } else if (field.type === 'list') {
      const item = field.itemSchema && Object.keys(field.itemSchema).length
        ? Object.fromEntries(Object.keys(field.itemSchema).map((k) => [k, '']))
        : ''
      base[field.name] = [item]
    }
  }
  return base
}
