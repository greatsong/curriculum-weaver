/**
 * TADDs-DIE 협력적 수업 설계 모형 — 6 Phase, 19 Procedure
 *
 * 구조: Phase → Procedure → Step (procedureSteps.js)
 * - 6개 Phase (prep, T, A, Ds, DI, E)
 * - 19개 Procedure (prep + 18개 세부절차)
 * - 각 Procedure는 5~9개 Step으로 구성 (prep 제외, 총 128스텝)
 */

// ──────────────────────────────────────────
// Phase 정의 (6개)
// ──────────────────────────────────────────

/** @type {Record<string, {id: string, name: string, icon: string, color: string, order: number}>} */
export const PHASES = {
  PREP: { id: 'prep', name: '준비',         icon: 'ClipboardList', color: '#64748b', order: 0 },
  T:    { id: 'T',    name: '팀준비',       icon: 'Users',         color: '#8b5cf6', order: 1 },
  A:    { id: 'A',    name: '분석',         icon: 'Search',        color: '#3b82f6', order: 2 },
  Ds:   { id: 'Ds',   name: '설계',         icon: 'Compass',       color: '#22c55e', order: 3 },
  DI:   { id: 'DI',   name: '개발/실행',    icon: 'Rocket',        color: '#f59e0b', order: 4 },
  E:    { id: 'E',    name: '평가',         icon: 'RefreshCw',     color: '#ef4444', order: 5 },
}

/**
 * Phase를 order 순으로 정렬한 배열 (UI 렌더링용)
 * @type {Array<{id: string, name: string, icon: string, color: string, order: number}>}
 */
export const PHASE_LIST = Object.values(PHASES).sort((a, b) => a.order - b.order)

// ──────────────────────────────────────────
// Procedure 정의 (19개: prep + 18 세부절차)
// ──────────────────────────────────────────

/**
 * 세부절차(Procedure) 정의
 *
 * 키: 절차 코드 (예: 'T-1-1')
 * 값: { phase, name, description, order }
 *
 * @type {Record<string, {phase: string, name: string, description: string, order: number}>}
 */
export const PROCEDURES = {
  'prep': {
    phase: 'prep',
    name: '학습자/맥락 정보 제공',
    description: '학년, 디지털 리터러시, 학급 구성 등 학습자 맥락 정보를 입력하는 준비 단계',
    order: 0,
  },
  'T-1-1': {
    phase: 'T',
    name: '비전설정',
    description: '팀원들이 협력적 수업설계를 통해 실현하고자 하는 궁극적인 교육목적(비전)을 설정한다',
    order: 1,
  },
  'T-1-2': {
    phase: 'T',
    name: '수업설계 방향 수립',
    description: '비전을 기반으로 수업설계의 구체적 방향과 핵심 키워드를 도출한다',
    order: 2,
  },
  'T-2-1': {
    phase: 'T',
    name: '역할 분담',
    description: '팀원별 강점을 파악하고, 수업설계 과정에서의 역할을 배분한다',
    order: 3,
  },
  'T-2-2': {
    phase: 'T',
    name: '팀 규칙',
    description: '팀 활동의 Ground Rule을 브레인스토밍하고 핵심 규칙을 확정한다',
    order: 4,
  },
  'T-2-3': {
    phase: 'T',
    name: '팀 일정',
    description: '개인 일정을 공유하고, 모임·마감 일정을 조정하여 팀 일정표를 수립한다',
    order: 5,
  },
  'A-1-1': {
    phase: 'A',
    name: '주제 선정 기준',
    description: '융합 수업 주제를 선정하기 위한 기준을 논의하고 확정한다',
    order: 6,
  },
  'A-1-2': {
    phase: 'A',
    name: '주제 선정',
    description: '교과 연계 주제를 구상하고, 비교·평가를 거쳐 최종 주제를 선정한다',
    order: 7,
  },
  'A-2-1': {
    phase: 'A',
    name: '핵심 아이디어 및 성취기준 분석',
    description: '교과별 성취기준의 지식·이해, 과정·기능, 가치·태도를 분석하고 연결맵을 작성한다',
    order: 8,
  },
  'A-2-2': {
    phase: 'A',
    name: '통합된 수업 목표',
    description: '교과별 세부학습목표를 통합하여 융합 수업의 통합학습목표를 수립한다',
    order: 9,
  },
  'Ds-1-1': {
    phase: 'Ds',
    name: '평가 계획',
    description: '교과별 평가 내용과 방법을 구상하고, 수업목표-평가 정합성을 검토한다',
    order: 10,
  },
  'Ds-1-2': {
    phase: 'Ds',
    name: '문제 상황',
    description: '실제 데이터 기반의 문제 상황 초안을 생성하고, 통합 문제 상황을 결정한다',
    order: 11,
  },
  'Ds-1-3': {
    phase: 'Ds',
    name: '학습 활동 설계',
    description: '문제 해결 절차에 따른 학습 활동을 설계하고, 교과·시간 배분을 결정한다',
    order: 12,
  },
  'Ds-2-1': {
    phase: 'Ds',
    name: '지원 도구 설계',
    description: '학습 활동에 필요한 도구를 선정하고 활용 방안을 매칭한다',
    order: 13,
  },
  'Ds-2-2': {
    phase: 'Ds',
    name: '스캐폴딩 설계',
    description: '학습자 관점에서 스캐폴딩 방안을 설계하고 적절성을 검토한다',
    order: 14,
  },
  'DI-1-1': {
    phase: 'DI',
    name: '개발 자료 목록',
    description: '교과별 개발·탐색 자료를 구분하고, 제작 역할·일정·우선순위를 조정한다',
    order: 15,
  },
  'DI-2-1': {
    phase: 'DI',
    name: '수업 기록',
    description: '수업 실행 중 주요 상황을 기록하고, 전사·분석을 통해 시사점을 도출한다',
    order: 16,
  },
  'E-1-1': {
    phase: 'E',
    name: '수업 성찰',
    description: '수업 과정과 결과를 공유하고, 개선사항을 도출하여 수업 개선 아이디어를 생성한다',
    order: 17,
  },
  'E-2-1': {
    phase: 'E',
    name: '수업설계 과정 성찰',
    description: '협력적 수업설계 전체 과정을 성찰하고, 개선사항을 도출·수정·보완한다',
    order: 18,
  },
}

/**
 * Procedure를 order 순으로 정렬한 배열 (UI 렌더링용)
 * @type {Array<{code: string, phase: string, name: string, description: string, order: number}>}
 */
export const PROCEDURE_LIST = Object.entries(PROCEDURES)
  .map(([code, proc]) => ({ code, ...proc }))
  .sort((a, b) => a.order - b.order)

// ──────────────────────────────────────────
// 액션 타입 (8종)
// ──────────────────────────────────────────

/**
 * 각 스텝의 행위 유형
 * @type {Record<string, {name: string, icon: string, color: string, description: string}>}
 */
export const ACTION_TYPES = {
  guide:    { name: '안내', icon: 'BookOpen',      color: 'blue',    description: '단계별 활동 방법 설명' },
  judge:    { name: '판단', icon: 'Brain',         color: 'purple',  description: '개인 의견 구상/결정' },
  generate: { name: '생성', icon: 'Sparkles',      color: 'amber',   description: '초안/예시/후보 생성' },
  discuss:  { name: '협의', icon: 'MessageCircle', color: 'green',   description: '팀 논의/브레인스토밍' },
  share:    { name: '공유', icon: 'Share2',        color: 'cyan',    description: '개인 결과물 팀 공유' },
  adjust:   { name: '조정', icon: 'Sliders',       color: 'orange',  description: '의견 통합/우선순위 조정' },
  check:    { name: '점검', icon: 'CheckCircle',   color: 'emerald', description: '정합성/적절성 검토' },
  record:   { name: '기록', icon: 'Save',          color: 'gray',    description: '확정 내용 저장/리포트' },
}

// ──────────────────────────────────────────
// 행위자 열 (5종)
// ──────────────────────────────────────────

/**
 * 각 스텝의 행위 주체
 * @type {Record<string, {name: string, hasAI: boolean, isTeam: boolean, description: string}>}
 */
export const ACTOR_COLUMNS = {
  individual:    { name: '개인교사',     hasAI: false, isTeam: false, description: '교사 혼자 수행' },
  individual_ai: { name: '개인교사+AI',  hasAI: true,  isTeam: false, description: '교사가 AI 도움 받아 수행' },
  team:          { name: '교사팀',       hasAI: false, isTeam: true,  description: '팀원들이 함께 논의' },
  team_ai:       { name: '교사팀+AI',    hasAI: true,  isTeam: true,  description: '팀이 AI 도움 받아 수행' },
  ai_only:       { name: 'AI 단독',      hasAI: true,  isTeam: false, description: 'AI가 자동 수행' },
}

// ──────────────────────────────────────────
// 보드 타입 (절차별 보드 매핑)
// ──────────────────────────────────────────

/**
 * 각 절차(Procedure)에 대응하는 보드 타입
 * 절차 코드 → 보드 타입 코드 (1:1 매핑)
 *
 * @type {Record<string, string>}
 */
export const BOARD_TYPES = {
  'prep':   'learner_context',
  'T-1-1':  'team_vision',
  'T-1-2':  'design_direction',
  'T-2-1':  'role_assignment',
  'T-2-2':  'team_rules',
  'T-2-3':  'team_schedule',
  'A-1-1':  'topic_criteria',
  'A-1-2':  'topic_selection',
  'A-2-1':  'standards_analysis',
  'A-2-2':  'integrated_objectives',
  'Ds-1-1': 'assessment_plan',
  'Ds-1-2': 'problem_situation',
  'Ds-1-3': 'learning_activities',
  'Ds-2-1': 'support_tools',
  'Ds-2-2': 'scaffolding_design',
  'DI-1-1': 'material_list',
  'DI-2-1': 'class_record',
  'E-1-1':  'class_reflection',
  'E-2-1':  'process_reflection',
}

/**
 * 보드 타입 레이블 (한국어)
 * @type {Record<string, string>}
 */
export const BOARD_TYPE_LABELS = {
  learner_context:      '학습자 맥락',
  team_vision:          '팀 비전',
  design_direction:     '수업설계 방향',
  role_assignment:      '역할 분담',
  team_rules:           '팀 규칙',
  team_schedule:        '팀 일정',
  topic_criteria:       '주제 선정 기준',
  topic_selection:      '선정 주제',
  standards_analysis:   '성취기준 분석',
  integrated_objectives:'통합 수업목표',
  assessment_plan:      '평가 계획',
  problem_situation:    '문제 상황',
  learning_activities:  '학습 활동',
  support_tools:        '지원 도구',
  scaffolding_design:   '스캐폴딩 설계',
  material_list:        '개발 자료 목록',
  class_record:         '수업 기록',
  class_reflection:     '수업 성찰',
  process_reflection:   '과정 성찰',
}

// ──────────────────────────────────────────
// 절차별 활동 설명 (UI 배너용)
// ──────────────────────────────────────────

/**
 * 절차 코드 → 활동 요약 및 설명 (DesignBoard 상단 배너)
 * @type {Record<string, {activity: string, description: string}>}
 */
export const PROCEDURE_ACTIVITIES = {
  'prep': {
    activity: '학습자/맥락 정보 제공',
    description: '학년, 디지털 리터러시, 학급 구성 등 AI가 수업설계를 지원하는 데 필요한 기초 정보를 입력합니다.',
  },
  'T-1-1': {
    activity: '비전설정',
    description: '개인의 교육적 비전을 구상하고, 팀 논의를 거쳐 공통 비전을 확정합니다.',
  },
  'T-1-2': {
    activity: '수업설계 방향 수립',
    description: '비전을 기반으로 핵심 키워드를 도출하고, 수업설계의 구체적 방향을 합의합니다.',
  },
  'T-2-1': {
    activity: '역할 분담',
    description: '팀원별 강점과 전문성을 파악하고, 수업설계 과정에서의 역할을 배분합니다.',
  },
  'T-2-2': {
    activity: '팀 규칙',
    description: '팀 활동의 Ground Rule을 브레인스토밍하고 핵심 규칙을 결정합니다.',
  },
  'T-2-3': {
    activity: '팀 일정',
    description: '개인 일정을 공유하고, 모임/마감 일정을 조정하여 팀 일정표를 수립합니다.',
  },
  'A-1-1': {
    activity: '주제 선정 기준',
    description: '융합 수업 주제를 선정하기 위한 기준을 구상하고 논의하여 확정합니다.',
  },
  'A-1-2': {
    activity: '주제 선정',
    description: '교과 연계 주제를 구상하고, 비교 평가를 거쳐 최종 주제를 선정합니다.',
  },
  'A-2-1': {
    activity: '핵심 아이디어 및 성취기준 분석',
    description: '교과별 성취기준의 지식·이해, 과정·기능, 가치·태도를 분석하고 연결맵을 작성합니다.',
  },
  'A-2-2': {
    activity: '통합된 수업 목표',
    description: '교과별 세부학습목표를 통합하여 융합 수업의 통합학습목표를 수립합니다.',
  },
  'Ds-1-1': {
    activity: '평가 계획',
    description: '교과별 평가 내용과 방법을 구상하고, 수업목표-평가 정합성을 검토합니다.',
  },
  'Ds-1-2': {
    activity: '문제 상황',
    description: '실제 데이터 기반의 문제 상황을 생성하고, 통합 문제 상황을 결정합니다.',
  },
  'Ds-1-3': {
    activity: '학습 활동 설계',
    description: '문제 해결 절차에 따른 학습 활동을 설계하고, 교과/시간 배분을 결정합니다.',
  },
  'Ds-2-1': {
    activity: '지원 도구 설계',
    description: '학습 활동에 필요한 도구를 선정하고 활용 방안을 매칭합니다.',
  },
  'Ds-2-2': {
    activity: '스캐폴딩 설계',
    description: '학습자 관점에서 스캐폴딩 방안을 설계하고 적절성을 검토합니다.',
  },
  'DI-1-1': {
    activity: '개발 자료 목록',
    description: '교과별 개발/탐색 자료를 구분하고, 제작 역할·일정·우선순위를 조정합니다.',
  },
  'DI-2-1': {
    activity: '수업 기록',
    description: '수업 실행 중 주요 상황을 기록하고, 전사/분석을 통해 시사점을 도출합니다.',
  },
  'E-1-1': {
    activity: '수업 성찰',
    description: '수업 과정과 결과를 공유하고, 개선사항을 도출하여 수업 개선 아이디어를 생성합니다.',
  },
  'E-2-1': {
    activity: '수업설계 과정 성찰',
    description: '협력적 수업설계 전체 과정을 성찰하고, 개선사항을 도출·수정·보완합니다.',
  },
}

// ──────────────────────────────────────────
// AI 역할 프리셋 (4종)
// ──────────────────────────────────────────

/**
 * AI 역할 프리셋 정의
 *
 * 각 프리셋은 AI의 개입 수준과 대화 톤을 결정합니다.
 * enabledActions: guide/generate/check/record 각각의 활성화 여부
 * promptTone: 시스템 프롬프트에서 참조하는 톤 키워드
 *
 * @type {Record<string, {id: string, name: string, icon: string, description: string, detail: string, enabledActions: {guide: boolean, generate: boolean, check: boolean, record: boolean}, promptTone: string, order: number}>}
 */
export const AI_ROLE_PRESETS = {
  recorder: {
    id: 'recorder',
    name: '기록자',
    icon: '📝',
    description: '대화에 개입하지 않고 안내와 정리만 합니다',
    detail: '경험 많은 교사팀에 적합합니다. AI는 절차 안내와 결과 정리에만 집중합니다.',
    enabledActions: { guide: true, generate: false, check: false, record: true },
    promptTone: 'minimal',
    order: 0,
  },
  advisor: {
    id: 'advisor',
    name: '조언자',
    icon: '🔍',
    description: '꼭 필요할 때만 개입하여 조언합니다',
    detail: '어느 정도 경험이 있는 교사팀에 적합합니다. AI는 정합성 문제가 있을 때만 의견을 제시합니다.',
    enabledActions: { guide: true, generate: false, check: true, record: true },
    promptTone: 'reserved',
    order: 1,
  },
  facilitator: {
    id: 'facilitator',
    name: '사회자',
    icon: '🎯',
    description: '논의를 촉진하고 균형 잡힌 의견을 제시합니다',
    detail: '처음 융합수업을 설계하는 팀, 대부분의 팀에 적합합니다.',
    enabledActions: { guide: true, generate: true, check: true, record: true },
    promptTone: 'balanced',
    order: 2,
  },
  codesigner: {
    id: 'codesigner',
    name: '공동설계자',
    icon: '💡',
    description: '팀원처럼 적극적으로 의견을 내고 제안합니다',
    detail: 'AI 협력에 익숙한 팀, 빠른 설계가 필요한 팀에 적합합니다.',
    enabledActions: { guide: true, generate: true, check: true, record: true },
    promptTone: 'proactive',
    order: 3,
  },
}

/** 기본 AI 역할 프리셋 */
export const DEFAULT_AI_ROLE = 'facilitator'

/**
 * AI 역할 프리셋을 order 순으로 정렬한 배열 (UI 렌더링용)
 * @type {Array<{id: string, name: string, icon: string, description: string, detail: string, enabledActions: Object, promptTone: string, order: number}>}
 */
export const AI_ROLE_PRESET_LIST = Object.values(AI_ROLE_PRESETS).sort((a, b) => a.order - b.order)

/**
 * promptTone에 따른 시스템 프롬프트 톤 지시문
 * — aiAgent.js의 buildSystemPrompt에서 참조
 *
 * @type {Record<string, string>}
 */
export const PROMPT_TONE_INSTRUCTIONS = {
  minimal: `[AI 역할 톤: 기록자 (최소 개입)]
- 교사 팀의 논의를 존중하고, 안내와 정리에 집중하세요.
- 스스로 의견을 제시하지 마세요. 교사가 물어볼 때만 간결하게 답하세요.
- 초안이나 예시를 먼저 생성하지 마세요. 교사가 요청할 때만 제공하세요.
- 절차 안내는 간결하게, 결과 정리는 충실하게 수행하세요.
- "교사 팀이 논의를 주도합니다. 저는 기록하고 정리하겠습니다."라는 자세를 유지하세요.`,

  reserved: `[AI 역할 톤: 조언자 (선택적 개입)]
- 꼭 필요한 경우에만 조언하세요. 교사의 의견을 우선합니다.
- 정합성 문제가 있을 때만 지적하세요. 사소한 개선점은 언급하지 마세요.
- 교사가 묻지 않은 대안을 먼저 제시하지 마세요.
- "이 부분은 검토가 필요할 수 있습니다"처럼 부드러운 톤을 사용하세요.
- 교사의 결정을 존중하고, 반복적으로 수정을 권하지 마세요.`,

  balanced: `[AI 역할 톤: 사회자 (균형 잡힌 개입)]
- 균형 잡힌 의견을 제시하고, 대안을 제안하세요.
- 교사의 판단을 존중하되 적극적으로 논의를 촉진하세요.
- 다양한 관점을 제시하여 교사의 사고를 확장시키세요.
- 정합성 검토와 피드백을 적극적으로 수행하세요.
- 질문과 제안의 균형을 맞추세요.`,

  proactive: `[AI 역할 톤: 공동설계자 (적극적 참여)]
- 팀원처럼 적극적으로 의견을 내세요. 먼저 아이디어를 제안하세요.
- 구체적인 예시를 많이 들고, 교사와 동등한 입장에서 토론에 참여하세요.
- "저는 이런 방향도 좋다고 생각합니다"처럼 자신의 관점을 명확히 밝히세요.
- 여러 대안을 동시에 제시하고, 각각의 장단점을 분석하세요.
- 빠른 설계 진행을 위해 적극적으로 초안을 생성하세요.`,
}

// ──────────────────────────────────────────
// SSE 이벤트 타입
// ──────────────────────────────────────────

/** @type {Record<string, string>} */
export const SSE_EVENTS = {
  TEXT: 'text',
  PROGRESS: 'progress',
  PRINCIPLES: 'principles',
  BOARD_SUGGESTIONS: 'board_suggestions',
  STEP_ADVANCE: 'step_advance',
  PROCEDURE_ADVANCE: 'procedure_advance',
  ERROR: 'error',
  DONE: 'done',
}

// ──────────────────────────────────────────
// 자료 관련 상수 (기존 유지)
// ──────────────────────────────────────────

/** 자료 카테고리 (파일 업로드용) */
export const MATERIAL_CATEGORIES = [
  { id: 'standard', label: '성취기준' },
  { id: 'textbook', label: '교과서' },
  { id: 'guide', label: '지도서' },
  { id: 'reference', label: '참고자료' },
  { id: 'website', label: '참고사이트' },
]

/** 성취기준 연결 유형 */
export const LINK_TYPES = {
  prerequisite: '선수 학습',
  cross_subject: '교과 간 융합',
  same_concept: '동일 개념',
  extension: '심화/확장',
  application: '적용/활용',
}

/** 링크 상태 (3계층 그래프) */
export const LINK_STATUSES = {
  CANDIDATE: 'candidate',   // AI 제안 후보
  REVIEWED: 'reviewed',     // 검토 완료
  PUBLISHED: 'published',   // 게시 (사용자 노출)
}

/** 링크 생성 방법 */
export const LINK_GENERATION_METHODS = {
  TFIDF: 'tfidf',
  AI: 'ai',
  MANUAL: 'manual',
}

/** 허용 파일 타입 */
export const ACCEPTED_FILE_TYPES = {
  pdf: '.pdf',
  docx: '.docx,.doc',
  hwp: '.hwp,.hwpx',
  ppt: '.ppt,.pptx',
  image: '.png,.jpg,.jpeg,.webp',
  spreadsheet: '.xlsx,.xls,.csv',
  text: '.txt',
}

/** 파일 크기 제한 (10MB — 기존 호환용. 신규 코드는 MAX_MATERIAL_SIZE_BYTES 사용) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024

/** 자료 파일 크기 상한 (20MB — file-upload-redesign.md §4.2) */
export const MAX_MATERIAL_SIZE_BYTES = 20 * 1024 * 1024

/**
 * 파싱 가능한 자료 확장자 (실제 text 추출이 동작하는 것만)
 * - hwp/hwpx: 파서 신뢰도가 낮아 현재 unsupported로 분류
 * - doc/ppt/xls: OLE 레거시 형식 — 거부
 * - 이미지: Vision 연동 전까지 플레이스홀더
 */
export const SUPPORTED_MATERIAL_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'csv', 'pptx', 'xlsx']

/** 세션 상태 */
export const SESSION_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
}

/** 자료 처리 상태 (재설계 — 5단계) */
export const MATERIAL_PROCESSING_STATUSES = {
  PENDING: 'pending',
  PARSING: 'parsing',
  ANALYZING: 'analyzing',
  COMPLETED: 'completed',
  FAILED: 'failed',
}

// ──────────────────────────────────────────
// 자료 업로드 의도 (intent) — 6종
// analyzer 프롬프트 분기 + 채팅 컨텍스트 주입 기준
// 관련 문서: _workspace/design/material-context-enhancement.md §7
// ──────────────────────────────────────────

/**
 * 교사 업로드 의도 코드 상수
 * @type {Record<string, string>}
 */
export const MATERIAL_INTENTS = {
  GENERAL: 'general',
  LEARNER_CONTEXT: 'learner_context',
  CURRICULUM_DOC: 'curriculum_doc',
  RESEARCH: 'research',
  ASSESSMENT: 'assessment',
  CUSTOM: 'custom',
}

/**
 * intent별 UI 레이블 (드롭다운/배지 렌더용)
 * — 이모지는 상수에만 허용, UI 렌더는 lucide 아이콘을 우선
 * @type {Record<string, {label: string, icon: string, description: string}>}
 */
export const MATERIAL_INTENT_LABELS = {
  general:         { label: '수업 참고자료',     icon: '📘', description: '범용 요약' },
  learner_context: { label: '학습자·맥락 정보',  icon: '📋', description: '학생 수준·사전지식 추출' },
  curriculum_doc:  { label: '교육과정 문서',     icon: '📑', description: '성취기준 매칭 우선' },
  research:        { label: '선행 연구·이론',    icon: '🔬', description: '핵심 개념 중심' },
  assessment:      { label: '평가·활동지',       icon: '✏️', description: '문제 유형·수준 분석' },
  custom:          { label: '기타 — 메모 입력',  icon: '💬', description: '자유 입력' },
}

/** custom intent 메모의 최대 길이 */
export const MAX_INTENT_NOTE_LENGTH = 120

/** 기본 intent */
export const DEFAULT_MATERIAL_INTENT = MATERIAL_INTENTS.GENERAL

/** 자료 업로드/분석 에러 코드 (클라이언트 메시지 매핑 용) */
export const MATERIAL_ERROR_CODES = {
  FILE_REQUIRED: 'FILE_REQUIRED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  MAGIC_BYTE_MISMATCH: 'MAGIC_BYTE_MISMATCH',
  PROJECT_ID_REQUIRED: 'PROJECT_ID_REQUIRED',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  STORAGE_UPLOAD_FAILED: 'STORAGE_UPLOAD_FAILED',
  STORAGE_UPLOAD_WARNING: 'STORAGE_UPLOAD_WARNING', // 경고 — Storage 실패했지만 메모리 분석 계속
  STORAGE_NOT_AVAILABLE: 'STORAGE_NOT_AVAILABLE',   // 재분석 시 storage_path 부재
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  MATERIAL_NOT_FOUND: 'MATERIAL_NOT_FOUND',
  AI_TIMEOUT: 'AI_TIMEOUT',
  PARSE_FAILED: 'PARSE_FAILED',
  AI_SCHEMA_INVALID: 'AI_SCHEMA_INVALID',
  INVALID_INTENT: 'INVALID_INTENT',
  INTENT_NOTE_REQUIRED: 'INTENT_NOTE_REQUIRED',
  INTERNAL: 'INTERNAL',
}

/**
 * @deprecated MATERIAL_PROCESSING_STATUSES 사용 권장. 기존 호출부 호환을 위해 유지.
 * 새 값(parsing, analyzing)은 포함하지 않는다.
 */
export const PROCESSING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
}

// ──────────────────────────────────────────
// 산업수요 전문교과 (데이터 관리 UI에서 숨김)
// ──────────────────────────────────────────

/**
 * 산업수요 전문교과 목록 — 융합 수업 설계 대상이 아닌 교과
 * DataManage 페이지의 교과 태그에서 필터링할 때 사용
 * @type {Set<string>}
 */
export const VOCATIONAL_SUBJECTS = new Set([
  '매장 판매',
  '수출입 관리',
  '물류 관리',
  '세무 실무',
  '유통 관리',
  '사무 행정',
  '전자 상거래 실무',
  '원산지 관리',
  '금융 일반',
  '창구 사무',
  '무역 일반',
  '무역 영어',
  '총무',
  '유통 일반',
  '기업 자원 통합 관리',
  '전자 상거래 일반',
  '품질 관리',
  '세무 일반',
  '마케팅과 광고',
  '비즈니스 커뮤니케이션',
  '상업 경제',
  '창업 일반',
  '보험 일반',
  '기업과 경영',
  '예산･자금',
  '공정 관리',
  '회계 정보 처리 시스템',
  '노동 인권과 산업 안전 보건',
  '디지털과 직업 생활',
  '성공적인 직업 생활',
])

// ──────────────────────────────────────────
// 헬퍼 함수
// ──────────────────────────────────────────

/**
 * 특정 Phase에 속하는 Procedure 목록을 order 순으로 반환
 *
 * @param {string} phaseId - Phase ID (예: 'T', 'A', 'Ds')
 * @returns {Array<{code: string, phase: string, name: string, description: string, order: number}>}
 */
export function getProceduresByPhase(phaseId) {
  return PROCEDURE_LIST.filter(p => p.phase === phaseId)
}

/**
 * Procedure 코드로 해당 Phase 정보를 반환
 *
 * @param {string} procedureCode - Procedure 코드 (예: 'T-1-1')
 * @returns {{id: string, name: string, icon: string, color: string, order: number} | undefined}
 */
export function getPhaseForProcedure(procedureCode) {
  const proc = PROCEDURES[procedureCode]
  if (!proc) return undefined
  return PHASE_LIST.find(p => p.id === proc.phase)
}

/**
 * Procedure 코드로 보드 타입 코드를 반환
 *
 * @param {string} procedureCode - Procedure 코드 (예: 'T-1-1')
 * @returns {string | undefined}
 */
export function getBoardTypeForProcedure(procedureCode) {
  return BOARD_TYPES[procedureCode]
}

// ──────────────────────────────────────────
// 하위 호환성: 기존 STAGES 배열 (deprecated)
// ──────────────────────────────────────────

/**
 * @deprecated PROCEDURES를 사용하세요. 이 배열은 하위 호환성을 위해 유지됩니다.
 * 기존 10-Stage → 새 Procedure 코드 매핑
 */
export const LEGACY_STAGE_TO_PROCEDURES = {
  'T-1': ['T-1-1', 'T-1-2'],
  'T-2': ['T-2-1', 'T-2-2', 'T-2-3'],
  'A-1': ['A-1-1', 'A-1-2'],
  'A-2': ['A-2-1', 'A-2-2'],
  'Ds-1': ['Ds-1-1', 'Ds-1-2', 'Ds-1-3'],
  'Ds-2': ['Ds-2-1', 'Ds-2-2'],
  'DI-1': ['DI-1-1'],
  'DI-2': ['DI-2-1'],
  'E-1': ['E-1-1'],
  'E-2': ['E-2-1'],
}
