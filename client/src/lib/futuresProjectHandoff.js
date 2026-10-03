import { buildFuturesSearch, FUTURE_MAX } from './futures2'

export const A3_PROCEDURE = 'A-2-1'

// 보드의 저장 상태는 확인할 수 있지만, AI가 재작성한 탐색 초안의 채택 여부는 추정하지 않는다.
export function a3BoardStatus(design) {
  if (!design) return '저장 상태 확인 필요'
  if (design.created === false) return '아직 저장된 보드 없음'
  if (design.save_status === 'locked') return '저장된 보드 · 잠김'
  if (design.save_status === 'confirmed') return '저장된 보드 · 확정됨'
  if (design.id || design.updated_at || design.created_at) return '저장된 보드 · 초안'
  return '저장 상태 확인 필요'
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
  if (project?.learner_context?.demo) return { blocked: true, note: '시연 모드는 A-3 대신 성취기준·단원 선택 화면을 사용합니다. 원래 프로젝트에서 이어서 진행해 주세요.' }
  if (project?.status === 'generating') return { blocked: true, note: '시뮬레이션 생성 중입니다. 완료된 뒤 연결 아이디어를 탐색해 주세요.' }
  if (project?.status === 'failed') return { blocked: true, note: '생성이 중단된 프로젝트입니다. 복구 상태를 확인한 뒤 탐색해 주세요.' }
  if (project?.status === 'simulation' || project?.title?.startsWith('[시뮬레이션]')) return { blocked: false, note: '시뮬레이션 결과는 읽기 전용입니다. 탐색 결과는 비교·참고용으로 복사할 수 있으며 원본에 저장되지 않습니다.' }
  if (project?.my_role === 'viewer') return { blocked: false, note: '열람 권한으로 탐색 중입니다. 복사한 결과는 편집 권한이 있는 팀원과 검토해 주세요.' }
  if (project?.skipped_procedures?.some(s => (s.procedure_code || s) === A3_PROCEDURE)) return { blocked: false, note: 'A-3가 생략된 상태입니다. 탐색은 참고용이며, 반영하려면 프로젝트에서 단계 상태를 먼저 확인해 주세요.' }
  if (design?.save_status === 'locked') return { blocked: false, note: 'A-3 보드가 잠겨 있습니다. 탐색 결과를 검토하고, 반영할 때 프로젝트에서 잠금 상태를 확인해 주세요.' }
  return { blocked: false, note: '결과를 복사한 뒤 원래 프로젝트의 A-3 대화창에 붙여넣으세요. 기존 분석과 비교해 반영할 초안을 요청합니다.' }
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
    '[A-3 성취기준 분석 · 연결 아이디어 탐색 결과]',
    `참고 프로젝트: ${project.title}`,
    '아래 내용은 검토용 탐색 초안입니다. 기존 주제와 성취기준 분석에 비추어 적합성을 검토하고, ‘핵심 요소 통합·조정’에 반영할 초안을 제안해 주세요. 기존 내용을 바로 덮어쓰거나 단계를 완료·이동하지 말고 먼저 비교해 주세요. 재구조화 성취기준은 검토 후 별도로 제안해 주세요.',
    '\n선택한 성취기준',
    ...standards.map(s => `- ${s.subject} ${s.code}: ${s.content}`),
    '\n연결 키워드와 근거',
    ...(bridges?.concepts || []).map(c => `- ${c.label}: ${c.ends.map(e => `${selected.get(e.key)?.subject || ''} ${selected.get(e.key)?.code || ''} ‘${e.word}’`).join(' ↔ ')}\n  근거: ${c.why || ''}`),
  ]
  if (future) lines.push(
    '\n참고할 수업 아이디어', `제목: ${future.title}`, `상황: ${future.situation || ''}`, `탐구 질문: ${future.driving_question || ''}`,
    '\n과목별 역할', ...(future.roles || []).map(r => `- ${selected.get(r.key)?.subject || r.subject || ''} ${selected.get(r.key)?.code || r.code || ''}: ${r.role}`),
    '\n활동과 결과물 (후속 설계 참고)', ...(future.activity_steps || []).map((s, i) => `${i + 1}. ${s}`), `결과물: ${future.student_output || ''}`,
  )
  return lines.join('\n')
}
