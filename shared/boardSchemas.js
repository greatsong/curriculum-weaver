import { BOARD_TYPES, BOARD_TYPE_LABELS } from './constants.js'

// 17개 보드 타입별 콘텐츠 스키마
export const BOARD_SCHEMAS = {
  // ─── 1단계: 주제 탐색 및 선정 ───
  topic_exploration: {
    fields: [
      { key: 'main_topic', label: '핵심 주제', type: 'text' },
      { key: 'sub_topics', label: '세부 주제 후보', type: 'list' },
      { key: 'life_connection', label: '삶과의 연결', type: 'textarea' },
      { key: 'subjects_involved', label: '관련 교과', type: 'tags' },
      { key: 'rationale', label: '선정 근거', type: 'textarea' },
    ],
    empty: { main_topic: '', sub_topics: [], life_connection: '', subjects_involved: [], rationale: '' },
  },

  inquiry_questions: {
    fields: [
      { key: 'essential_question', label: '핵심 질문 (Big Question)', type: 'text' },
      { key: 'sub_questions', label: '하위 탐구 질문', type: 'list' },
      { key: 'student_perspective', label: '학생 관점에서의 의미', type: 'textarea' },
    ],
    empty: { essential_question: '', sub_questions: [], student_perspective: '' },
  },

  // ─── 2단계: 교육과정 분석 및 성취기준 매핑 ───
  standard_mapping: {
    fields: [
      { key: 'mappings', label: '교과-성취기준 매핑', type: 'table',
        columns: [
          { key: 'subject', label: '교과' },
          { key: 'code', label: '성취기준 코드' },
          { key: 'content', label: '성취기준 내용' },
          { key: 'connection', label: '주제와의 연결' },
        ],
      },
    ],
    empty: { mappings: [] },
  },

  cross_subject_links: {
    fields: [
      { key: 'big_idea', label: '핵심 개념 (Big Idea)', type: 'text' },
      { key: 'links', label: '교과 간 연계', type: 'table',
        columns: [
          { key: 'from_subject', label: '교과 A' },
          { key: 'from_standard', label: '성취기준 A' },
          { key: 'to_subject', label: '교과 B' },
          { key: 'to_standard', label: '성취기준 B' },
          { key: 'rationale', label: '연계 근거' },
        ],
      },
    ],
    empty: { big_idea: '', links: [] },
  },

  // ─── 3단계: 수업 구조 설계 ───
  lesson_flow: {
    fields: [
      { key: 'total_hours', label: '총 차시', type: 'number' },
      { key: 'lessons', label: '차시별 계획', type: 'table',
        columns: [
          { key: 'lesson_num', label: '차시' },
          { key: 'title', label: '차시 제목' },
          { key: 'objective', label: '학습 목표' },
          { key: 'activities', label: '주요 활동' },
          { key: 'standards', label: '관련 성취기준' },
        ],
      },
    ],
    empty: { total_hours: 0, lessons: [] },
  },

  teacher_roles: {
    fields: [
      { key: 'roles', label: '교사 역할 분담', type: 'table',
        columns: [
          { key: 'lesson_num', label: '차시' },
          { key: 'lead_teacher', label: '주 수업 교사' },
          { key: 'lead_role', label: '주 교사 역할' },
          { key: 'support_teacher', label: '보조 교사' },
          { key: 'support_role', label: '보조 역할' },
        ],
      },
    ],
    empty: { roles: [] },
  },

  core_activities: {
    fields: [
      { key: 'activities', label: '핵심 활동 목록', type: 'table',
        columns: [
          { key: 'name', label: '활동명' },
          { key: 'description', label: '활동 설명' },
          { key: 'type', label: '활동 유형' },
          { key: 'materials_needed', label: '필요 자료' },
          { key: 'expected_outcome', label: '기대 산출물' },
        ],
      },
    ],
    empty: { activities: [] },
  },

  // ─── 4단계: 평가 설계 ───
  assessment_plan: {
    fields: [
      { key: 'assessments', label: '평가 항목', type: 'table',
        columns: [
          { key: 'name', label: '평가명' },
          { key: 'type', label: '평가 유형' },
          { key: 'timing', label: '평가 시기' },
          { key: 'target_standards', label: '대상 성취기준' },
          { key: 'method', label: '평가 방법' },
        ],
      },
    ],
    empty: { assessments: [] },
  },

  rubric: {
    fields: [
      { key: 'criteria', label: '평가 기준표', type: 'table',
        columns: [
          { key: 'criterion', label: '평가 기준' },
          { key: 'excellent', label: '매우 잘함' },
          { key: 'good', label: '잘함' },
          { key: 'adequate', label: '보통' },
          { key: 'needs_work', label: '노력 필요' },
        ],
      },
    ],
    empty: { criteria: [] },
  },

  assessment_mapping: {
    fields: [
      { key: 'mappings', label: '평가-성취기준 매핑', type: 'table',
        columns: [
          { key: 'assessment_name', label: '평가 항목' },
          { key: 'standard_code', label: '성취기준 코드' },
          { key: 'subject', label: '교과' },
          { key: 'evaluation_focus', label: '평가 초점' },
        ],
      },
    ],
    empty: { mappings: [] },
  },

  // ─── 5단계: 자료 및 환경 준비 ───
  student_worksheets: {
    fields: [
      { key: 'worksheets', label: '활동지 목록', type: 'table',
        columns: [
          { key: 'title', label: '활동지 제목' },
          { key: 'lesson_num', label: '사용 차시' },
          { key: 'purpose', label: '목적' },
          { key: 'instructions', label: '핵심 지시문' },
          { key: 'format', label: '형태' },
        ],
      },
    ],
    empty: { worksheets: [] },
  },

  resource_list: {
    fields: [
      { key: 'resources', label: '필요 자원 목록', type: 'table',
        columns: [
          { key: 'name', label: '자원명' },
          { key: 'category', label: '분류' },
          { key: 'quantity', label: '수량' },
          { key: 'availability', label: '확보 상태' },
          { key: 'alternative', label: '대안' },
        ],
      },
    ],
    empty: { resources: [] },
  },

  digital_tools: {
    fields: [
      { key: 'tools', label: '디지털 도구', type: 'table',
        columns: [
          { key: 'name', label: '도구명' },
          { key: 'purpose', label: '사용 목적' },
          { key: 'url', label: '접속 URL' },
          { key: 'account_needed', label: '계정 필요' },
          { key: 'alternative', label: '대안 도구' },
        ],
      },
    ],
    empty: { tools: [] },
  },

  // ─── 6단계: 실행 계획 및 점검 ───
  execution_timeline: {
    fields: [
      { key: 'timeline', label: '실행 일정', type: 'table',
        columns: [
          { key: 'date', label: '날짜' },
          { key: 'period', label: '교시' },
          { key: 'lesson_num', label: '차시' },
          { key: 'content', label: '수업 내용' },
          { key: 'room', label: '장소' },
        ],
      },
    ],
    empty: { timeline: [] },
  },

  checklist: {
    fields: [
      { key: 'items', label: '점검 항목', type: 'table',
        columns: [
          { key: 'category', label: '분류' },
          { key: 'item', label: '점검 항목' },
          { key: 'responsible', label: '담당자' },
          { key: 'deadline', label: '완료 기한' },
          { key: 'checked', label: '완료' },
        ],
      },
    ],
    empty: { items: [] },
  },

  growth_simulation: {
    fields: [
      { key: 'profiles', label: '학생 유형별 예상 성장', type: 'table',
        columns: [
          { key: 'student_type', label: '학생 유형' },
          { key: 'starting_point', label: '출발점' },
          { key: 'expected_growth', label: '기대 성장' },
          { key: 'support_strategy', label: '지원 전략' },
        ],
      },
    ],
    empty: { profiles: [] },
  },

  // ─── 7단계: 성찰 및 개선 ───
  reflection_notes: {
    fields: [
      { key: 'what_worked', label: '잘된 점', type: 'list' },
      { key: 'what_didnt', label: '아쉬운 점', type: 'list' },
      { key: 'student_responses', label: '학생 반응', type: 'textarea' },
      { key: 'principle_review', label: '원칙별 적용 평가', type: 'textarea' },
    ],
    empty: { what_worked: [], what_didnt: [], student_responses: '', principle_review: '' },
  },

  improvements: {
    fields: [
      { key: 'items', label: '개선 항목', type: 'table',
        columns: [
          { key: 'area', label: '영역' },
          { key: 'current_issue', label: '현재 문제' },
          { key: 'improvement', label: '개선 방안' },
          { key: 'priority', label: '우선순위' },
        ],
      },
    ],
    empty: { items: [] },
  },
}

/**
 * 특정 단계의 보드 스키마를 AI 프롬프트용 텍스트로 변환
 */
export function getBoardSchemaForPrompt(stage) {
  const boardTypes = BOARD_TYPES[stage] || []
  return boardTypes.map((bt) => {
    const schema = BOARD_SCHEMAS[bt]
    const label = BOARD_TYPE_LABELS[bt] || bt
    if (!schema) return ''
    return `  - ${bt} (${label}): ${JSON.stringify(schema.empty)}`
  }).filter(Boolean).join('\n')
}
