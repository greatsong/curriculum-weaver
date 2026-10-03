import { buildFuturesSearch, FUTURE_MAX } from './futures2'
import { EXPLORE_COPY } from './explorationCopy'

const B = EXPLORE_COPY.board
const P = EXPLORE_COPY.policy
const H = EXPLORE_COPY.handoff

/** 인계 초안의 첫 줄 — 대화로 보낸 메시지가 초안인지 알아보는 표식으로도 쓴다 */
export const HANDOFF_HEADER = H.header

export const A3_PROCEDURE = 'A-2-1'

/** 서버 채팅 라우트의 메시지 길이 제한(server/routes/chat.js, 5,000자)과 같아야 한다 */
export const CHAT_MESSAGE_MAX = 5000

// 보드의 저장 상태는 확인할 수 있지만, AI가 재작성한 탐색 초안의 채택 여부는 추정하지 않는다.
export function a3BoardStatus(design) {
  if (!design) return B.unknown
  if (design.created === false) return B.none
  if (design.save_status === 'locked') return B.locked
  if (design.save_status === 'confirmed') return B.confirmed
  if (design.id || design.updated_at || design.created_at) return B.draft
  return B.unknown
}

export function projectExplorationUrl(projectId) {
  return `/futures-lab?project=${encodeURIComponent(projectId)}`
}

export function explorationSearch(keys, model, projectId) {
  const params = new URLSearchParams(buildFuturesSearch(keys, model))
  if (projectId) params.set('project', projectId)
  return params.size ? `?${params}` : ''
}

export function handoffPolicy(project, design) {
  if (project?.learner_context?.demo) return { blocked: true, note: P.demo }
  if (project?.status === 'generating') return { blocked: true, note: P.generating }
  if (project?.status === 'failed') return { blocked: true, note: P.failed }
  if (project?.status === 'simulation' || project?.title?.startsWith('[시뮬레이션]')) return { blocked: false, note: P.simulation }
  if (project?.my_role === 'viewer') return { blocked: false, note: P.viewer }
  if (project?.skipped_procedures?.some(s => (s.procedure_code || s) === A3_PROCEDURE)) return { blocked: false, note: P.skipped }
  if (design?.save_status === 'locked') return { blocked: false, note: P.locked }
  return { blocked: false, note: P.normal }
}

/**
 * 보내기 확인 창의 정책 — 보내기(초안을 A-3 대화로)와 복사를 구분한다.
 * 차단(시연·생성 중·실패)은 탐색 자체가 막힌다. 읽기 전용(시뮬레이션·열람·A-3 생략)은 복사만 된다.
 */
export function sendPolicy(project, design) {
  const policy = handoffPolicy(project, design)
  if (policy.blocked) return { ...policy, canSend: false, readOnly: false }
  const skippedA3 = !!project?.skipped_procedures?.some(s => (s.procedure_code || s) === A3_PROCEDURE)
  const readOnly = project?.status === 'simulation' || !!project?.title?.startsWith('[시뮬레이션]') || project?.my_role === 'viewer' || skippedA3
  return { ...policy, canSend: !!project && !readOnly, readOnly }
}

/** 프로젝트 등록 기준과 A-3 분석표를 합치되, 동일 코드의 다른 과목을 임의로 고르지 않는다. */
export function resolveProjectStandards(catalog, entries = [], design = {}) {
  const input = [...entries.map(row => row.curriculum_standards || row), ...(design.content?.standards || [])]
  const found = new Map(), missing = new Set()
  for (const item of input) {
    const exact = item.key && catalog.find(s => s.key === item.key)
    const matches = exact ? [exact] : catalog.filter(s => s.code === item.code &&
      (!item.subject || s.subject === item.subject || s.subject.replace(/\(.*\)/, '').trim() === item.subject))
    if (matches.length === 1) found.set(matches[0].key, matches[0])
    else if (item.code) missing.add(`${item.subject || ''} ${item.code}`.trim())
  }
  const standards = [...found.values()]
  return { standards, missing: [...missing], needsChoice: standards.length > FUTURE_MAX }
}

export function buildA3Handoff({ project, standards, bridges, future }) {
  const selected = new Map(standards.map(s => [s.key, s]))
  const lines = [
    H.header,
    H.project(project.title),
    H.instruction,
    `\n${H.standards}`,
    ...standards.map(s => `- ${s.subject} ${s.code}: ${s.content}`),
  ]
  if (bridges?.concepts?.length) lines.push(
    `\n${H.bridges}`,
    ...bridges.concepts.map(c => `- ${c.label}: ${c.ends.map(e => `${selected.get(e.key)?.subject || ''} ${selected.get(e.key)?.code || ''} ‘${e.word}’`).join(' ↔ ')}\n  ${H.bridgeWhy(c.why || '')}`),
  )
  if (future) lines.push(
    `\n${H.idea}`, H.ideaTitle(future.title), H.ideaSituation(future.situation || ''), H.ideaQuestion(future.driving_question || ''),
    `\n${H.roles}`, ...(future.roles || []).map(r => `- ${selected.get(r.key)?.subject || r.subject || ''} ${selected.get(r.key)?.code || r.code || ''}: ${r.role}`),
    `\n${H.activities}`, ...(future.activity_steps || []).map((s, i) => `${i + 1}. ${s}`), H.output(future.student_output || ''),
  )
  return lines.join('\n')
}
