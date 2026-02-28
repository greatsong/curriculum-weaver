// 7단계 융합 수업 설계 워크플로
export const STAGES = [
  { id: 1, name: '주제 탐색 및 선정', shortName: '주제 탐색', icon: 'Search', description: '융합 수업의 핵심 주제와 탐구 질문을 정하는 단계' },
  { id: 2, name: '교육과정 분석 및 성취기준 매핑', shortName: '교육과정 분석', icon: 'Map', description: '관련 교과의 성취기준을 탐색하고 연결하는 단계' },
  { id: 3, name: '수업 구조 설계', shortName: '수업 구조', icon: 'Building2', description: '차시 구성, 활동 흐름, 교사 역할을 설계하는 단계' },
  { id: 4, name: '평가 설계', shortName: '평가 설계', icon: 'BarChart3', description: '성취기준 기반 평가 계획과 루브릭을 만드는 단계' },
  { id: 5, name: '자료 및 환경 준비', shortName: '자료 준비', icon: 'Package', description: '학생 활동지, 교구, 디지털 도구 등을 준비하는 단계' },
  { id: 6, name: '실행 계획 및 점검', shortName: '실행 점검', icon: 'Rocket', description: '일정, 공간, 사전 준비 등 실행 계획을 확정하는 단계' },
  { id: 7, name: '성찰 및 개선', shortName: '성찰', icon: 'RefreshCw', description: '수업 실행 후 성찰하고 다음 설계에 반영하는 단계' },
]

// 단계별 설계 보드 유형
export const BOARD_TYPES = {
  1: ['topic_exploration', 'inquiry_questions'],
  2: ['standard_mapping', 'cross_subject_links'],
  3: ['lesson_flow', 'teacher_roles', 'core_activities'],
  4: ['assessment_plan', 'rubric', 'assessment_mapping'],
  5: ['student_worksheets', 'resource_list', 'digital_tools'],
  6: ['execution_timeline', 'checklist', 'growth_simulation'],
  7: ['reflection_notes', 'improvements'],
}

// 보드 유형 레이블
export const BOARD_TYPE_LABELS = {
  topic_exploration: '주제 탐색',
  inquiry_questions: '탐구 질문',
  standard_mapping: '성취기준 매핑표',
  cross_subject_links: '교과 간 연계',
  lesson_flow: '차시 구성표',
  teacher_roles: '교사 역할 분담',
  core_activities: '핵심 활동',
  assessment_plan: '평가 계획',
  rubric: '루브릭',
  assessment_mapping: '평가-성취기준 매핑',
  student_worksheets: '학생 활동지',
  resource_list: '필요 자원 목록',
  digital_tools: '디지털 도구 안내',
  execution_timeline: '실행 일정표',
  checklist: '사전 점검 체크리스트',
  growth_simulation: '학생 성장 시뮬레이션',
  reflection_notes: '수업 성찰 기록',
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
