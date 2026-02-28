// TADDs-DIE 협력적 수업 설계 모형 — 5단계 10하위단계
export const PHASES = [
  { id: 'T',  name: '팀 준비하기',       icon: 'Users',      color: '#8b5cf6' },
  { id: 'A',  name: '분석하기',          icon: 'Search',     color: '#3b82f6' },
  { id: 'Ds', name: '설계하기',          icon: 'Compass',    color: '#22c55e' },
  { id: 'DI', name: '개발·실행하기',     icon: 'Rocket',     color: '#f59e0b' },
  { id: 'E',  name: '성찰·평가하기',     icon: 'RefreshCw',  color: '#ef4444' },
]

export const STAGES = [
  // ─── T: 팀 준비하기 ───
  { id: 1, code: 'T-1', phase: 'T',
    name: '팀 비전, 설계 방향, 협력 방식 설정',
    shortName: '비전·방향',
    icon: 'Target',
    description: '팀의 비전과 설계 방향을 공유하고, 협력 방식을 합의하는 단계' },
  { id: 2, code: 'T-2', phase: 'T',
    name: '역할, 필요 자원, 규칙, 일정 등 팀 활동 환경 조성',
    shortName: '환경 조성',
    icon: 'Settings',
    description: '역할 분담, 필요 자원, 규칙, 일정 등 팀 활동 환경을 조성하는 단계' },

  // ─── A: 분석하기 ───
  { id: 3, code: 'A-1', phase: 'A',
    name: '주제 목록 작성과 최종 주제 선정을 위한 기준 선정',
    shortName: '주제 선정',
    icon: 'Search',
    description: '주제 후보를 탐색하고, 선정 기준을 세워 최종 주제를 결정하는 단계' },
  { id: 4, code: 'A-2', phase: 'A',
    name: '주제 관련 내용과 역량 분석을 통한 목표 설정',
    shortName: '내용·목표 분석',
    icon: 'Map',
    description: '주제에 관련된 교과별 내용과 역량을 분석하고 학습 목표를 설정하는 단계' },

  // ─── Ds: 설계하기 ───
  { id: 5, code: 'Ds-1', phase: 'Ds',
    name: '평가 계획에 따른 교수학습 활동 설계',
    shortName: '활동 설계',
    icon: 'Building2',
    description: '평가 계획을 먼저 수립하고, 이에 맞는 교수학습 활동을 설계하는 단계' },
  { id: 6, code: 'Ds-2', phase: 'Ds',
    name: '수업 활동에 필요한 자원과 스캐폴딩 설계',
    shortName: '지원 설계',
    icon: 'BarChart3',
    description: '수업 활동을 지원하는 자원, 교사 역할, 스캐폴딩을 설계하는 단계' },

  // ─── DI: 개발·실행하기 ───
  { id: 7, code: 'DI-1', phase: 'DI',
    name: '수업에 활용할 자료 수집 및 개발',
    shortName: '자료 개발',
    icon: 'Package',
    description: '활동지, 교구, 디지털 도구 등 수업 자료를 수집·개발하는 단계' },
  { id: 8, code: 'DI-2', phase: 'DI',
    name: '수업 실행 후 자료 수집',
    shortName: '수업 실행',
    icon: 'Play',
    description: '설계한 수업을 실행하고 학생 반응·산출물 등 자료를 수집하는 단계' },

  // ─── E: 성찰·평가하기 ───
  { id: 9, code: 'E-1', phase: 'E',
    name: '단계별 활동에 대한 수시 평가 및 환류',
    shortName: '수시 평가',
    icon: 'RotateCcw',
    description: '각 단계 활동에 대해 수시로 평가하고 결과를 환류하는 단계' },
  { id: 10, code: 'E-2', phase: 'E',
    name: '수업 목표와 팀 비전에 근거한 종합평가',
    shortName: '종합평가',
    icon: 'Award',
    description: '수업 목표와 팀 비전에 비추어 전체 과정을 종합적으로 평가하는 단계' },
]

// 단계별 설계 보드 유형
export const BOARD_TYPES = {
  1: ['team_vision', 'collaboration_agreement'],
  2: ['team_roles', 'team_schedule'],
  3: ['topic_exploration', 'inquiry_questions'],
  4: ['standard_mapping', 'cross_subject_links'],
  5: ['assessment_plan', 'lesson_flow', 'core_activities'],
  6: ['teacher_roles', 'rubric', 'scaffolding'],
  7: ['student_worksheets', 'resource_list', 'digital_tools'],
  8: ['execution_timeline', 'checklist', 'observation_log'],
  9: ['formative_feedback', 'stage_reflection'],
  10: ['reflection_notes', 'improvements'],
}

// 보드 유형 레이블
export const BOARD_TYPE_LABELS = {
  // T단계
  team_vision: '팀 비전·설계 방향',
  collaboration_agreement: '협력 방식 합의',
  team_roles: '역할 분담',
  team_schedule: '팀 활동 일정',
  // A단계
  topic_exploration: '주제 탐색',
  inquiry_questions: '탐구 질문',
  standard_mapping: '성취기준 매핑표',
  cross_subject_links: '교과 간 연계',
  // Ds단계
  assessment_plan: '평가 계획',
  lesson_flow: '차시 구성표',
  core_activities: '핵심 활동',
  teacher_roles: '교사 역할 분담',
  rubric: '루브릭',
  scaffolding: '스캐폴딩 계획',
  // DI단계
  student_worksheets: '학생 활동지',
  resource_list: '필요 자원 목록',
  digital_tools: '디지털 도구 안내',
  execution_timeline: '실행 일정표',
  checklist: '사전 점검 체크리스트',
  observation_log: '수업 관찰 기록',
  // E단계
  formative_feedback: '수시 평가·환류',
  stage_reflection: '단계별 성찰',
  reflection_notes: '종합 성찰 기록',
  improvements: '개선 사항',
}

// 성취기준 연결 유형
export const LINK_TYPES = {
  prerequisite: '선수 학습',
  cross_subject: '교과 간 융합',
  same_concept: '동일 개념',
  extension: '심화/확장',
  application: '적용/활용',
}

// SSE 이벤트 타입
export const SSE_EVENTS = {
  TEXT: 'text',
  PROGRESS: 'progress',
  PRINCIPLES: 'principles',
  BOARD_SUGGESTIONS: 'board_suggestions',
  ERROR: 'error',
  DONE: 'done',
}

// 허용 파일 타입
export const ACCEPTED_FILE_TYPES = {
  pdf: '.pdf',
  docx: '.docx,.doc',
  hwp: '.hwp',
  image: '.png,.jpg,.jpeg,.gif,.webp',
  spreadsheet: '.xlsx,.xls,.csv',
}

// 파일 크기 제한 (50MB)
export const MAX_FILE_SIZE = 50 * 1024 * 1024

// 세션 상태
export const SESSION_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
}

// 자료 처리 상태
export const PROCESSING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
}
