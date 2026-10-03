import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import { BOARD_TYPES, describeProjectGrade } from 'curriculum-weaver-shared/constants.js'

/**
 * 성취기준 "AI 융합 추천"에 넘길 근거 모으기 (2026-10-03, 비전 기반 추천 최소 연결)
 *
 * 서버 /api/standards/recommend-ai는 원래부터 boardContext { prep, vision, selectedTopic }를
 * 받지만 화면이 보내지 않았다. 여기서는 이미 있는 보드 목록 응답에서 값을 골라낼 뿐,
 * 데이터는 바꾸지 않는다. 값이 없거나 모양이 달라도 빈 맥락으로 돌아가 예전처럼 추천한다.
 */

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/** 보드 칸 값 — 스키마 키가 없으면 같은 칸의 한글 라벨 키로도 찾는다(AI가 라벨 키로 저장한 사례 대비) */
function fieldText(content, procedureCode, fieldName, max) {
  if (!isPlainObject(content)) return ''
  let v = content[fieldName]
  if (v == null) {
    const field = (BOARD_SCHEMAS[BOARD_TYPES[procedureCode]]?.fields || []).find((f) => f.name === fieldName)
    if (field?.label) v = content[field.label]
  }
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * @param {object[]} designs - GET /api/projects/:id/designs 의 designs
 * @returns {{ vision?: string, selectedTopic?: string, prep?: object }}
 */
export function buildRecommendBoardContext(designs) {
  const byCode = {}
  for (const d of Array.isArray(designs) ? designs : []) {
    if (d?.procedure_code && isPlainObject(d.content)) byCode[d.procedure_code] = d.content
  }
  const ctx = {}
  const vision = fieldText(byCode['T-1-1'], 'T-1-1', 'commonVision', 1000)
  if (vision) ctx.vision = vision
  const selectedTopic = fieldText(byCode['A-1-2'], 'A-1-2', 'selectedTopic', 500)
  if (selectedTopic) ctx.selectedTopic = selectedTopic
  const prep = byCode.prep
  if (isPlainObject(prep) && Object.values(prep).some((v) => v != null && v !== '')) ctx.prep = prep
  return ctx
}

/**
 * 추천 범위(교과·학년). 교과는 프로젝트 교과와 이미 담은 성취기준의 교과를 합치고,
 * 학년은 교사가 프로젝트에 정한 값을 우선, 없으면 담은 성취기준에서 가장 많은 학년군을 쓴다.
 * @param {{ project?: object, sessionStandards?: object[] }} args
 * @returns {{ subjects: string[], grade: string }}
 */
export function resolveRecommendScope({ project, sessionStandards }) {
  const stds = (Array.isArray(sessionStandards) ? sessionStandards : []).map((s) => s?.curriculum_standards || s).filter(Boolean)
  const fromProject = Array.isArray(project?.subjects) ? project.subjects.filter((v) => typeof v === 'string' && v.trim()) : []
  const fromStandards = stds.map((s) => s.subject_group || s.subject).filter(Boolean)
  const subjects = [...new Set([...fromProject, ...fromStandards])]

  const projectGrade = describeProjectGrade(project?.grade)?.text || ''
  let grade = projectGrade
  if (!grade) {
    const grades = stds.map((s) => s.grade_group).filter(Boolean)
    if (grades.length) {
      const count = (g) => grades.filter((x) => x === g).length
      grade = [...grades].sort((a, b) => count(b) - count(a))[0]
    }
  }
  return { subjects, grade }
}

/** 추천 결과 머리말 — 어떤 근거로 골랐는지 교사에게 알린다 */
export function recommendBasisText(ctx) {
  const vision = !!ctx?.vision
  const topic = !!ctx?.selectedTopic
  if (vision && topic) return '팀 공통 비전과 최종 선정 주제를 바탕으로 고른 성취기준입니다.'
  if (vision) return '팀 공통 비전을 바탕으로 고른 성취기준입니다.'
  if (topic) return '최종 선정 주제를 바탕으로 고른 성취기준입니다.'
  return '프로젝트 교과와 융합 가능한 성취기준입니다.'
}
