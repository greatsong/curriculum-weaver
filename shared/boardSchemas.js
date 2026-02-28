import { BOARD_TYPES, BOARD_TYPE_LABELS } from './constants.js'

// 보드 타입별 콘텐츠 스키마 — TADDs-DIE 모형
export const BOARD_SCHEMAS = {
  // ─── T-1: 팀 비전, 설계 방향, 협력 방식 설정 ───
  team_vision: {
    fields: [
      { key: 'vision', label: '팀 비전', type: 'textarea' },
      { key: 'design_direction', label: '설계 방향', type: 'textarea' },
      { key: 'target_students', label: '대상 학생', type: 'text' },
      { key: 'subjects_involved', label: '참여 교과', type: 'tags' },
    ],
    empty: { vision: '', design_direction: '', target_students: '', subjects_involved: [] },
  },

  collaboration_agreement: {
    fields: [
      { key: 'communication_method', label: '소통 방법', type: 'text' },
      { key: 'meeting_frequency', label: '회의 빈도', type: 'text' },
      { key: 'decision_method', label: '의사결정 방식', type: 'text' },
      { key: 'agreements', label: '협력 약속', type: 'list' },
    ],
    empty: { communication_method: '', meeting_frequency: '', decision_method: '', agreements: [] },
  },

  // ─── T-2: 역할, 필요 자원, 규칙, 일정 등 팀 활동 환경 조성 ───
  team_roles: {
    fields: [
      { key: 'members', label: '팀원 역할', type: 'table',
        columns: [
          { key: 'name', label: '교사명' },
          { key: 'subject', label: '담당 교과' },
          { key: 'role', label: '팀 내 역할' },
          { key: 'strength', label: '전문성/강점' },
        ],
      },
    ],
    empty: { members: [] },
  },

  team_schedule: {
    fields: [
      { key: 'milestones', label: '팀 활동 일정', type: 'table',
        columns: [
          { key: 'phase', label: '단계' },
          { key: 'task', label: '활동 내용' },
          { key: 'deadline', label: '완료 기한' },
          { key: 'responsible', label: '담당자' },
        ],
      },
      { key: 'ground_rules', label: '팀 규칙', type: 'list' },
    ],
    empty: { milestones: [], ground_rules: [] },
  },

  // ─── A-1: 주제 목록 작성과 최종 주제 선정 기준 ───
  topic_exploration: {
    fields: [
      { key: 'main_topic', label: '핵심 주제', type: 'text' },
      { key: 'sub_topics', label: '세부 주제 후보', type: 'list' },
      { key: 'selection_criteria', label: '선정 기준', type: 'list' },
      { key: 'life_connection', label: '삶과의 연결', type: 'textarea' },
      { key: 'rationale', label: '선정 근거', type: 'textarea' },
    ],
    empty: { main_topic: '', sub_topics: [], selection_criteria: [], life_connection: '', rationale: '' },
  },

  inquiry_questions: {
    fields: [
      { key: 'essential_question', label: '핵심 질문 (Big Question)', type: 'text' },
      { key: 'sub_questions', label: '하위 탐구 질문', type: 'list' },
      { key: 'student_perspective', label: '학생 관점에서의 의미', type: 'textarea' },
    ],
    empty: { essential_question: '', sub_questions: [], student_perspective: '' },
  },

  // ─── A-2: 주제 관련 내용과 역량 분석을 통한 목표 설정 ───
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
      { key: 'learning_objectives', label: '학습 목표', type: 'list' },
    ],
    empty: { mappings: [], learning_objectives: [] },
  },

  cross_subject_links: {
    fields: [
      { key: 'big_idea', label: '핵심 개념 (Big Idea)', type: 'text' },
      { key: 'competencies', label: '공통 역량', type: 'tags' },
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
    empty: { big_idea: '', competencies: [], links: [] },
  },

  // ─── Ds-1: 평가 계획에 따른 교수학습 활동 설계 ───
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

  // ─── Ds-2: 수업 활동에 필요한 자원과 스캐폴딩 설계 ───
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

  scaffolding: {
    fields: [
      { key: 'strategies', label: '스캐폴딩 전략', type: 'table',
        columns: [
          { key: 'activity', label: '대상 활동' },
          { key: 'student_level', label: '학생 수준' },
          { key: 'scaffold_type', label: '지원 유형' },
          { key: 'description', label: '구체적 지원' },
          { key: 'fade_plan', label: '점진적 제거 계획' },
        ],
      },
    ],
    empty: { strategies: [] },
  },

  // ─── DI-1: 수업에 활용할 자료 수집 및 개발 ───
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

  // ─── DI-2: 수업 실행 후 자료 수집 ───
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

  observation_log: {
    fields: [
      { key: 'observations', label: '수업 관찰 기록', type: 'table',
        columns: [
          { key: 'lesson_num', label: '차시' },
          { key: 'observer', label: '관찰자' },
          { key: 'focus', label: '관찰 초점' },
          { key: 'findings', label: '관찰 내용' },
          { key: 'suggestions', label: '제안 사항' },
        ],
      },
    ],
    empty: { observations: [] },
  },

  // ─── E-1: 단계별 활동에 대한 수시 평가 및 환류 ───
  formative_feedback: {
    fields: [
      { key: 'feedback_items', label: '수시 평가 기록', type: 'table',
        columns: [
          { key: 'phase', label: '해당 단계' },
          { key: 'what_observed', label: '관찰 사항' },
          { key: 'feedback', label: '피드백 내용' },
          { key: 'action_taken', label: '조치 사항' },
        ],
      },
    ],
    empty: { feedback_items: [] },
  },

  stage_reflection: {
    fields: [
      { key: 'reflections', label: '단계별 성찰', type: 'table',
        columns: [
          { key: 'phase', label: '단계' },
          { key: 'what_worked', label: '잘된 점' },
          { key: 'what_didnt', label: '아쉬운 점' },
          { key: 'lesson_learned', label: '배운 점' },
        ],
      },
    ],
    empty: { reflections: [] },
  },

  // ─── E-2: 수업 목표와 팀 비전에 근거한 종합평가 ───
  reflection_notes: {
    fields: [
      { key: 'goal_achievement', label: '목표 달성도', type: 'textarea' },
      { key: 'vision_alignment', label: '팀 비전 부합도', type: 'textarea' },
      { key: 'student_growth', label: '학생 성장 분석', type: 'textarea' },
      { key: 'what_worked', label: '잘된 점', type: 'list' },
      { key: 'what_didnt', label: '아쉬운 점', type: 'list' },
    ],
    empty: { goal_achievement: '', vision_alignment: '', student_growth: '', what_worked: [], what_didnt: [] },
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
