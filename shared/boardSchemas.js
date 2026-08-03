/**
 * 절차(Procedure)별 보드 스키마 — 19개 구조화 양식 (prep + 18 절차)
 *
 * 각 절차의 보드는 해당 절차의 최종 산출물을 구조화한 JSONB.
 * 절차 ↔ 보드 = 1:1 대응 (BOARD_TYPES 매핑 참조)
 *
 * 필드 타입:
 *   - text: 짧은 텍스트 입력
 *   - textarea: 긴 텍스트 입력 (멀티라인)
 *   - number: 숫자 입력
 *   - list: 문자열 배열 (itemSchema 지정 시 객체 배열)
 *   - tags: 태그 배열 (자유 입력 또는 options 제한)
 *   - table: 행/열 테이블 (columns 정의 필수)
 *   - select: 단일 선택 (options 필수)
 *   - json: 자유 구조 JSON
 */

import { BOARD_TYPES, BOARD_TYPE_LABELS } from './constants.js'

// ──────────────────────────────────────────
// 보드 스키마 정의
// ──────────────────────────────────────────

/** @type {Record<string, {fields: Array<Object>, empty: Object}>} */
export const BOARD_SCHEMAS = {

  // ─── prep: 학습자 맥락 ───
  learner_context: {
    fields: [
      { name: 'grade', label: '학년', type: 'text', required: true,
        description: '대상 학년 (예: 초등 5학년, 중학교 2학년)' },
      { name: 'studentCount', label: '학생 수', type: 'number', required: false,
        description: '학급 인원' },
      { name: 'digitalLiteracy', label: '디지털 리터러시 수준', type: 'select', required: false,
        description: '학생들의 디지털 도구 활용 수준',
        options: ['상', '중상', '중', '중하', '하'] },
      { name: 'genderRatio', label: '성별 구성', type: 'text', required: false,
        description: '남녀 비율 또는 구성 (예: 남 15 / 여 13)' },
      { name: 'multicultural', label: '다문화 학생', type: 'text', required: false,
        description: '다문화 학생 유무 및 특이사항' },
      { name: 'specialNeeds', label: '특수 교육 대상', type: 'text', required: false,
        description: '특수 교육 대상 학생 정보' },
      { name: 'prevContext', label: '선행 학습 맥락', type: 'textarea', required: false,
        description: '관련 단원 선행 학습 여부, 학생 흥미/관심사 등' },
      { name: 'additionalNotes', label: '추가 참고사항', type: 'textarea', required: false,
        description: '수업설계 시 AI가 참고해야 할 기타 정보' },
    ],
    empty: {
      grade: '', studentCount: null, digitalLiteracy: null, genderRatio: '',
      multicultural: '', specialNeeds: '', prevContext: '', additionalNotes: '',
    },
  },

  // ─── T-1-1: 팀 비전 ───
  team_vision: {
    fields: [
      { name: 'individualVisions', label: '개인 비전', type: 'list', required: true,
        description: '각 팀원이 구상한 개인 교육적 비전',
        itemSchema: {
          name: { label: '교사명', type: 'text' },
          vision: { label: '개인 비전', type: 'textarea' },
          refinedVision: { label: 'AI 정교화 비전', type: 'textarea' },
        } },
      { name: 'commonVisionCandidates', label: '공통 비전 후보', type: 'list', required: false,
        description: 'AI가 제안한 공통 비전 후보 목록' },
      { name: 'commonVision', label: '팀 공통 비전', type: 'textarea', required: true,
        description: '팀이 최종 합의한 공통 교육적 비전' },
    ],
    empty: {
      individualVisions: [], commonVisionCandidates: [], commonVision: '',
    },
  },

  // ─── T-1-2: 수업설계 방향 ───
  design_direction: {
    fields: [
      { name: 'keywords', label: '핵심 키워드', type: 'tags', required: true,
        description: '수업설계 방향을 나타내는 핵심 키워드 목록' },
      { name: 'directions', label: '설계 방향', type: 'list', required: true,
        description: '구체적인 수업설계 방향 진술문',
        itemSchema: {
          direction: { label: '방향', type: 'textarea' },
          rationale: { label: '근거', type: 'text' },
        } },
      { name: 'keywordClusters', label: '키워드 군집', type: 'json', required: false,
        description: 'AI가 생성한 키워드 군집화 및 예시' },
      { name: 'visionAlignment', label: '비전-방향 정합성', type: 'textarea', required: false,
        description: 'AI 점검 결과: 비전과 설계 방향의 정합성 평가' },
    ],
    empty: {
      keywords: [], directions: [], keywordClusters: null, visionAlignment: '',
    },
  },

  // ─── T-2-1: 역할 배분 ───
  role_assignment: {
    fields: [
      { name: 'roles', label: '역할 배분', type: 'table', required: true,
        description: '팀원별 역할과 강점',
        columns: [
          { name: 'memberName', label: '교사명' },
          { name: 'subject', label: '담당 교과' },
          { name: 'strengths', label: '강점/전문성' },
          { name: 'role', label: '팀 내 역할' },
          { name: 'responsibilities', label: '담당 업무' },
        ] },
      { name: 'coverageCheck', label: '누락 점검 결과', type: 'textarea', required: false,
        description: 'AI 점검: 역할 누락이나 중복 여부' },
    ],
    empty: {
      roles: [], coverageCheck: '',
    },
  },

  // ─── T-2-2: 팀 규칙 ───
  team_rules: {
    fields: [
      { name: 'allRules', label: '브레인스토밍 규칙', type: 'list', required: false,
        description: '팀원들이 제안한 모든 규칙 아이디어' },
      { name: 'coreRules', label: '핵심 규칙', type: 'list', required: true,
        description: '팀이 최종 결정한 핵심 규칙 (5개 내외)' },
      { name: 'appropriatenessCheck', label: '적절성 점검', type: 'textarea', required: false,
        description: 'AI 점검: 규칙의 실행 가능성 및 적절성 평가' },
    ],
    empty: {
      allRules: [], coreRules: [], appropriatenessCheck: '',
    },
  },

  // ─── T-2-3: 팀 일정 ───
  team_schedule: {
    fields: [
      { name: 'schedule', label: '팀 일정표', type: 'table', required: true,
        description: '모임, 마감, 주요 활동 일정',
        columns: [
          { name: 'date', label: '날짜' },
          { name: 'activity', label: '활동 내용' },
          { name: 'deadline', label: '마감/산출물' },
          { name: 'responsible', label: '담당자' },
          { name: 'note', label: '비고' },
        ] },
    ],
    empty: {
      schedule: [],
    },
  },

  // ─── A-1-1: 주제 선정 기준 ───
  topic_criteria: {
    fields: [
      { name: 'criteria', label: '주제 선정 기준', type: 'table', required: true,
        description: '융합 수업 주제를 선정하기 위한 평가 기준',
        columns: [
          { name: 'criterionName', label: '기준명' },
          { name: 'description', label: '설명' },
          { name: 'weight', label: '가중치' },
        ] },
    ],
    empty: {
      criteria: [],
    },
  },

  // ─── A-1-2: 선정 주제 ───
  topic_selection: {
    fields: [
      { name: 'candidates', label: '주제 후보', type: 'list', required: false,
        description: '브레인스토밍으로 도출된 주제 후보 목록',
        itemSchema: {
          topic: { label: '주제명', type: 'text' },
          subjects: { label: '관련 교과', type: 'text' },
          rationale: { label: '제안 근거', type: 'text' },
        } },
      { name: 'comparisonTable', label: '비교표', type: 'table', required: false,
        description: '주제 후보별 기준 충족도 비교표',
        columns: [
          { name: 'topic', label: '주제' },
          { name: 'criteria_scores', label: '기준별 점수 (JSON)', description: 'A-1-1에서 설정한 기준별 점수 객체' },
          { name: 'totalScore', label: '총점' },
          { name: 'notes', label: '비고' },
        ] },
      { name: 'clusterMap', label: '클러스터맵', type: 'json', required: false,
        description: 'AI 생성: 주제 간 관계 클러스터맵 데이터' },
      { name: 'selectedTopic', label: '최종 선정 주제', type: 'text', required: true,
        description: '팀이 최종 선정한 융합 수업 주제' },
      { name: 'selectionRationale', label: '선정 근거', type: 'textarea', required: false,
        description: '최종 주제 선정의 근거' },
      { name: 'visionCriteriaCheck', label: '비전/기준 부합 점검', type: 'textarea', required: false,
        description: 'AI 점검: 선정 주제가 비전 및 선정 기준에 부합하는지 검토' },
    ],
    empty: {
      candidates: [], comparisonTable: [], clusterMap: null,
      selectedTopic: '', selectionRationale: '', visionCriteriaCheck: '',
    },
  },

  // ─── A-2-1: 성취기준 분석 ───
  standards_analysis: {
    fields: [
      { name: 'standards', label: '성취기준 분석', type: 'table', required: true,
        description: '교과별 성취기준의 세 가지 차원 분석',
        columns: [
          { name: 'subject', label: '교과' },
          { name: 'code', label: '성취기준 코드' },
          { name: 'content', label: '성취기준 내용' },
          { name: 'knowledge', label: '지식·이해' },
          { name: 'process', label: '과정·기능' },
          { name: 'values', label: '가치·태도' },
        ] },
      { name: 'connectionMap', label: '연결맵', type: 'json', required: false,
        description: 'AI 생성: 교과 간 성취기준 연결 시각화 데이터' },
      { name: 'duplicateCheck', label: '중복 정리 검토', type: 'textarea', required: false,
        description: '중복되는 내용 요소 정리 및 AI 점검 결과' },
    ],
    empty: {
      standards: [], connectionMap: null, duplicateCheck: '',
    },
  },

  // ─── A-2-2: 통합 수업목표 ───
  integrated_objectives: {
    fields: [
      { name: 'coreIdea', label: '핵심 아이디어', type: 'textarea', required: false,
        description: '재구조화 표의 교과 간 공통 요소를 아우르는 핵심 아이디어 한 문장 (소재를 바꿔도 성립하는 개념 중심 문장)' },
      { name: 'inquiryQuestions', label: '탐구 질문', type: 'list', required: false,
        description: '핵심 아이디어를 학생의 물음으로 바꾼, 단원을 관통할 탐구 질문' },
      { name: 'subObjectives', label: '교과별 수업목표', type: 'list', required: true,
        description: '교과별 수업목표 (귀납적: 교과 목표→통합 / 연역적: 핵심 아이디어→교과 구체화)',
        itemSchema: {
          subject: { label: '교과', type: 'text' },
          objective: { label: '학습목표', type: 'textarea' },
        } },
      { name: 'integratedObjectives', label: '통합 수업목표', type: 'list', required: true,
        description: '핵심 아이디어로 수렴되는 키워드를 모아 한 문장으로 진술한 통합 수업목표' },
      { name: 'alignment', label: '비전-성취기준-목표 정합성', type: 'textarea', required: false,
        description: 'AI 검토: 비전, 성취기준, 핵심 아이디어, 수업목표 간의 정합성 평가' },
    ],
    empty: {
      coreIdea: '', inquiryQuestions: [], subObjectives: [], integratedObjectives: [], alignment: '',
    },
  },

  // ─── Ds-1-1: 평가 설계 ───
  assessment_plan: {
    fields: [
      { name: 'assessments', label: '평가 항목', type: 'table', required: true,
        description: '활동별 평가 내용, 방법, 루브릭',
        columns: [
          { name: 'activity', label: '대상 활동' },
          { name: 'subject', label: '평가 교과' },
          { name: 'content', label: '평가 내용' },
          { name: 'method', label: '평가 방법' },
          { name: 'rubricSummary', label: '루브릭 요약' },
        ] },
      { name: 'objectiveAlignmentCheck', label: '수업목표-평가 정합성', type: 'textarea', required: false,
        description: 'AI 검토: 수업목표와 평가 설계의 정합성' },
    ],
    empty: {
      assessments: [], objectiveAlignmentCheck: '',
    },
  },

  // ─── Ds-1-2: 문제 상황 ───
  problem_situation: {
    fields: [
      { name: 'candidates', label: '문제 상황 후보', type: 'list', required: false,
        description: 'AI가 실제 데이터 기반으로 제안한 문제 상황 초안 2~3개',
        itemSchema: {
          title: { label: '제목', type: 'text' },
          situation: { label: '문제 상황', type: 'textarea' },
          dataSource: { label: '데이터 출처', type: 'text' },
        } },
      { name: 'selected', label: '선정 문제 상황', type: 'textarea', required: true,
        description: '팀이 최종 결정한 통합 문제 상황' },
      { name: 'realWorldData', label: '실제 데이터', type: 'textarea', required: false,
        description: '문제 상황에 활용된 실제 데이터 출처 및 내용' },
      { name: 'audience', label: '청중', type: 'text', required: false,
        description: '학생 활동의 대상 청중 (예: 지역 주민, 학부모)' },
      { name: 'learningContentCheck', label: '학습내용/산출물/청중 반영 검토', type: 'textarea', required: false,
        description: 'AI 검토: 문제 상황에 학습내용, 산출물, 청중이 적절히 반영되었는지 확인' },
    ],
    empty: {
      candidates: [], selected: '', realWorldData: '', audience: '', learningContentCheck: '',
    },
  },

  // ─── Ds-1-3: 학습 활동 ───
  learning_activities: {
    fields: [
      { name: 'activities', label: '학습 활동', type: 'table', required: true,
        description: '문제 해결 절차에 따른 학습 활동',
        columns: [
          { name: 'order', label: '순서' },
          { name: 'activityName', label: '활동명' },
          { name: 'description', label: '활동 설명' },
          { name: 'subject', label: '담당 교과' },
          { name: 'hours', label: '차시' },
        ] },
      { name: 'objectiveFeasibilityCheck', label: '학습목표/실행 적절성 검토', type: 'textarea', required: false,
        description: 'AI 검토: 학습목표 달성 가능성 및 실행 적절성' },
    ],
    empty: {
      activities: [], objectiveFeasibilityCheck: '',
    },
  },

  // ─── Ds-2-1: 자료와 도구 연결 (보드 필드는 도구 중심 유지 — 자료 컬럼 보강은 후속) ───
  support_tools: {
    fields: [
      { name: 'tools', label: '도구 설계표', type: 'table', required: true,
        description: '각 학습활동에 연결한 도구와 활용 방안 ("이 활동에 무엇이 필요한가" 기준, 개수보다 기능 중심)',
        columns: [
          { name: 'activity', label: '대상 활동' },
          { name: 'toolName', label: '도구명' },
          { name: 'usage', label: '활용 방안' },
          { name: 'sourceType', label: '구분(탐색/개발)' },
        ] },
      { name: 'agencyCheck', label: 'Human-AI Agency 점검', type: 'textarea', required: false,
        description: 'AI 도구별로 학생이 직접 할 일 / AI가 지원할 일 / 교사가 확인·개입할 일을 나누어 기록 — 도구가 학생의 사고를 대신하지 않는지 점검' },
      { name: 'prepPlan', label: '도구 준비표', type: 'table', required: false,
        description: '도구별 담당자와 준비 시점, 사전 점검 방법 (수업 전 직접 시험해 볼 사람까지)',
        columns: [
          { name: 'toolName', label: '도구명' },
          { name: 'owner', label: '담당자' },
          { name: 'prepBy', label: '준비 시점' },
          { name: 'precheck', label: '사전 점검' },
        ] },
      { name: 'environmentCheck', label: '학습환경 적절성 검토', type: 'textarea', required: false,
        description: '학교 인프라·학생 디지털 리터러시 수준에서의 도구 활용 적절성 검토' },
    ],
    empty: {
      tools: [], agencyCheck: '', prepPlan: [], environmentCheck: '',
    },
  },

  // ─── Ds-2-2: 스캐폴딩 설계 ───
  scaffolding_design: {
    fields: [
      { name: 'supportMethods', label: '지원 방안 정리', type: 'list', required: false,
        description: '팀원들의 기존 지원 방안 정리',
        itemSchema: {
          method: { label: '지원 방안', type: 'text' },
          targetActivity: { label: '대상 활동', type: 'text' },
        } },
      { name: 'scaffolds', label: '스캐폴딩 계획', type: 'table', required: true,
        description: '활동별 스캐폴딩 유형과 내용',
        columns: [
          { name: 'activity', label: '대상 활동' },
          { name: 'scaffoldType', label: '스캐폴딩 유형' },
          { name: 'content', label: '구체적 내용' },
          { name: 'targetLevel', label: '대상 수준' },
          { name: 'fadePlan', label: '점진적 제거 계획' },
        ] },
      { name: 'appropriatenessCheck', label: '적절성 검토', type: 'textarea', required: false,
        description: 'AI 검토: 스캐폴딩의 적절성 및 개선 제안' },
    ],
    empty: {
      supportMethods: [], scaffolds: [], appropriatenessCheck: '',
    },
  },

  // ─── DI-1-1: 자료 탐색·개발 ───
  material_list: {
    fields: [
      { name: 'materials', label: '개발 자료 목록', type: 'table', required: true,
        description: '활동–필요 자료–확보 방법(탐색/개발) 목록과 제작 계획 (확보 가능 여부를 처음부터 따지지 말고 이상적으로 필요한 자료를 일단 다 적기)',
        columns: [
          { name: 'activity', label: '대상 활동' },
          { name: 'materialType', label: '자료 유형' },
          { name: 'title', label: '자료명' },
          { name: 'subject', label: '교과' },
          { name: 'category', label: '구분 (탐색/개발)' },
          { name: 'assignee', label: '담당자' },
          { name: 'deadline', label: '마감일' },
          { name: 'status', label: '완료 여부' },
        ] },
      { name: 'peerReview', label: '동료 검토·보완', type: 'list', required: false,
        description: '완성한 자료를 동료가 학생 관점에서 따라 해 보고 남긴 검토 의견과 보완 내용' },
    ],
    empty: {
      materials: [], peerReview: [],
    },
  },

  // ─── DI-2-1: 수업 실행·기록 ───
  class_record: {
    fields: [
      { name: 'executionPlan', label: '실행 방식·역할', type: 'textarea', required: false,
        description: '팀이 합의한 수업 실행 방식(개별/공동)과 실행·참관·지원 역할 분담, 교과별 실행 시점' },
      { name: 'episodes', label: '주요 상황 기록', type: 'table', required: true,
        description: '수업 중·직후에 남긴 에피소드 (예상과 달랐던 반응, 인상적인 발화, 뜻밖의 질문 — 깊은 분석은 평가 단계에서)',
        columns: [
          { name: 'timestamp', label: '시점' },
          { name: 'situation', label: '상황 설명' },
          { name: 'studentResponse', label: '학생 반응' },
          { name: 'insight', label: '메모·단서' },
        ] },
    ],
    empty: {
      executionPlan: '', episodes: [],
    },
  },

  // ─── E-1-1: 수업 성찰 ───
  class_reflection: {
    fields: [
      { name: 'learningResults', label: '학생 자료·학습 결과', type: 'list', required: false,
        description: '팀이 함께 검토한 학생 결과물·형성평가 응답·성찰일지 (목표 도달 사례 / 자주 보인 오개념 / 예상 밖의 창의적 반응 세 갈래 샘플)',
        itemSchema: {
          subject: { label: '교과', type: 'text' },
          processResult: { label: '자료와 발견', type: 'textarea' },
        } },
      { name: 'rubricGapAnalysis', label: '루브릭 기준 도달 확인', type: 'textarea', required: false,
        description: '합의한 평가 루브릭을 기준으로 판단한 성취수준과, 설계 의도와 실제 배움 사이의 간극' },
      { name: 'improvements', label: '원인 분석·개선 아이디어', type: 'list', required: true,
        description: '학생이 막힌 지점의 원인(안내 부족·발문·시간 배분 등)과 팀이 나눈 개선 아이디어' },
      { name: 'revisionLog', label: '설계안 수정 기록', type: 'table', required: false,
        description: '지도안·활동지·평가 도구에서 무엇을 왜 바꾸었는지 기록',
        columns: [
          { name: 'target', label: '수정 대상' },
          { name: 'change', label: '수정 내용' },
          { name: 'reason', label: '수정 이유' },
        ] },
    ],
    empty: {
      learningResults: [], rubricGapAnalysis: '', improvements: [], revisionLog: [],
    },
  },

  // ─── E-2-1: 협력 과정 성찰 ───
  process_reflection: {
    fields: [
      { name: 'agreementReview', label: '초기 합의 사항 대조', type: 'table', required: true,
        description: '준비 과정에서 합의한 비전·수업설계 방향·역할·규칙·일정을 실제 진행과 비교',
        columns: [
          { name: 'item', label: '합의 항목' },
          { name: 'agreed', label: '합의 내용' },
          { name: 'actual', label: '실제 진행' },
          { name: 'assessment', label: '평가' },
        ] },
      { name: 'structureReview', label: '협력 구조 검토', type: 'textarea', required: false,
        description: '역할 분담의 공평성, 갈등 상황에서 규칙의 실효성, 일정 운영의 무리 여부 — 원인은 개인이 아니라 운영 방식(구조)에서 찾기' },
      { name: 'operatingPrinciples', label: '다음 협력 운영 원칙', type: 'list', required: true,
        description: '다음 협력에서 새로 도입하거나 수정할 운영 원칙 (바로 실행하고 지켰는지 확인할 수 있는 행동으로)' },
    ],
    empty: {
      agreementReview: [], structureReview: '', operatingPrinciples: [],
    },
  },

  // ─── [시연 모드] 교수학습과정안 (demo_lesson_plan → lesson_plan) ───
  // 임용 2차 수업 실연 준비용. 단일 교과 한 차시의 도입-전개-정리 흐름 + 발문·판서·형성평가·시간배분을
  // 한 장의 표로 통합한다(교수학습과정안은 원래 한 장). 발문/판서/형성평가는 별도 보드로 쪼개지 않고
  // stages 테이블 컬럼과 boardPlan 필드로 흡수 — 렌더러/AI 제안 경로(table/textarea)가 이미 검증됨.
  // 기존 협력 보드 스키마는 위에서 전부 불변 — 아래는 추가만.
  lesson_plan: {
    fields: [
      { name: 'unit', label: '단원·차시·차시목표', type: 'text', required: true,
        description: '교과·단원명, 본 차시(예: 3/5차시), 차시 학습 주제' },
      { name: 'objectives', label: '본시 학습목표', type: 'list', required: true,
        description: '선택한 성취기준에서 도출한 이 한 차시의 학습목표(1~3개)' },
      { name: 'stages', label: '교수학습 흐름 (도입-전개-정리)', type: 'table', required: true,
        description: '수업 단계별 교사·학생 활동, 핵심 발문, 자료, 형성평가, 시간 배분',
        columns: [
          { name: 'stage', label: '단계' },            // 도입 / 전개 / 정리
          { name: 'minutes', label: '시간(분)' },
          { name: 'teacherActivity', label: '교사 활동' },
          { name: 'studentActivity', label: '학생 활동' },
          { name: 'keyQuestions', label: '핵심 발문' },
          { name: 'materials', label: '자료·매체' },
          { name: 'assessment', label: '형성평가' },
          { name: 'notes', label: '유의점' },
        ] },
      { name: 'boardPlan', label: '판서 계획', type: 'textarea', required: false,
        description: '칠판 구조·배치를 텍스트로 스케치(제목·핵심 개념·학생 산출 위치 등)' },
      { name: 'timeTotalCheck', label: '시간 배분 합계 점검', type: 'textarea', required: false,
        description: 'AI 점검: 도입+전개+정리 합계가 차시 시간(예: 40/45/50분)과 맞는지' },
      { name: 'objectiveAlignmentCheck', label: '목표-활동-평가 정합성', type: 'textarea', required: false,
        description: 'AI 점검: 학습목표 ↔ 학습활동 ↔ 형성평가의 정합성 평가' },
    ],
    empty: {
      unit: '', objectives: [], stages: [], boardPlan: '',
      timeTotalCheck: '', objectiveAlignmentCheck: '',
    },
  },

  // ─── [시연 모드] 실연 대본·타이밍 (demo_script → demo_script) ───
  // 임용 2차 수업 실연은 10~15분 안에 도입-전개-정리를 압축해 보여야 한다. 이 보드는
  // 교수학습과정안(lesson_plan)을 근거로 실제 실연 흐름을 구간별 대사·행동과 분(分) 배분으로
  // 옮긴 대본이다. minutes 컬럼의 합계가 10~15분 범위인지 클라이언트에서 계산·경고한다.
  // 기존 협력 보드 스키마는 위에서 전부 불변 — 아래는 추가만.
  demo_script: {
    fields: [
      { name: 'segments', label: '실연 구간·타이밍', type: 'table', required: true,
        description: '10~15분 실연을 구간(도입/전개/정리 등)으로 나눠 시간(분)·핵심 대사·행동·유의점을 적는다',
        columns: [
          { name: 'segment', label: '구간' },            // 도입 / 전개 / 정리 / 마무리
          { name: 'minutes', label: '시간(분)' },        // 이 구간에 쓸 분(分) — 합계 검증 대상
          { name: 'script', label: '대사·행동' },         // 교사 발화·판서·동선 등 실연 대본
          { name: 'delivery', label: '전달·유의점' },     // 목소리·시선·강조 등 전달 팁
        ] },
      { name: 'totalDurationCheck', label: '총 실연 시간 점검', type: 'textarea', required: false,
        description: 'AI 점검: 구간 시간(분) 합계가 10~15분 범위에 드는지, 배분이 도입-전개-정리에 적절한지' },
    ],
    empty: { segments: [], totalDurationCheck: '' },
  },

  // ─── [시연 모드] 채점 셀프체크 루브릭 (demo_rubric → demo_rubric) ───
  // 임용 2차 수업 실연 후, 예비교사가 채점관 관점으로 자신의 과정안·대본을 스스로 점검하는 루브릭.
  // 교과 무관 공통 관점(성취기준 도달도·학생활동 비중·발문 위계·목표-활동-평가 정렬 등)으로 시작하며,
  // 각 관점마다 자기평가(상/중/하)와 근거·개선점을 적는다. "셀프체크 생성" 버튼이 과정안·대본을 근거로
  // AI가 items 표 초안을 <ai_suggestion>으로 채운다. 렌더러/제안 경로(table/textarea)는 이미 검증됨.
  // 기존 협력 보드 스키마는 위에서 전부 불변 — 아래는 추가만.
  demo_rubric: {
    fields: [
      { name: 'items', label: '채점 셀프체크 항목', type: 'table', required: true,
        description: '임용 채점 관점별로 스스로 평가(상/중/하)하고, 그 근거와 개선점을 적는다',
        columns: [
          { name: 'criterion', label: '채점 관점' },     // 성취기준 도달도 / 학생활동 비중 / 발문 위계 / 목표-활동-평가 정렬 등
          { name: 'selfRating', label: '자기평가' },      // 상 / 중 / 하 (또는 점수)
          { name: 'evidence', label: '근거·개선점' },     // 그렇게 평가한 근거 + 어떻게 개선할지
        ] },
      { name: 'overallComment', label: '종합 코멘트', type: 'textarea', required: false,
        description: '채점관 관점에서 본 이 실연의 강점과 최우선 개선 1~2가지 종합' },
    ],
    empty: { items: [], overallComment: '' },
  },
}

// ──────────────────────────────────────────
// 헬퍼 함수
// ──────────────────────────────────────────

/**
 * 특정 절차의 보드 스키마를 반환
 *
 * @param {string} procedureCode - 절차 코드 (예: 'T-1-1')
 * @returns {{fields: Array<Object>, empty: Object} | undefined}
 */
export function getBoardSchemaForProcedure(procedureCode) {
  const boardType = BOARD_TYPES[procedureCode]
  if (!boardType) return undefined
  return BOARD_SCHEMAS[boardType]
}

/**
 * 특정 절차의 보드 스키마를 AI 프롬프트용 텍스트로 변환
 *
 * @param {string} procedureCode - 절차 코드 (예: 'T-1-1')
 * @returns {string} 프롬프트에 삽입할 스키마 텍스트
 */
export function getBoardSchemaForPrompt(procedureCode) {
  const boardType = BOARD_TYPES[procedureCode]
  if (!boardType) return ''
  const schema = BOARD_SCHEMAS[boardType]
  const label = BOARD_TYPE_LABELS[boardType] || boardType
  if (!schema) return ''

  const fieldDescriptions = schema.fields.map(f => {
    let desc = `    - ${f.name} (${f.label}, ${f.type}${f.required ? ', 필수' : ''}): ${f.description || ''}`
    if (f.columns) {
      desc += '\n      열: ' + f.columns.map(c => c.label).join(', ')
    }
    if (f.itemSchema) {
      desc += '\n      항목: ' + Object.entries(f.itemSchema).map(([k, v]) => v.label).join(', ')
    }
    if (f.options) {
      desc += '\n      선택지: ' + f.options.join(', ')
    }
    return desc
  }).join('\n')

  return `  [${boardType}] ${label}\n${fieldDescriptions}\n  기본값: ${JSON.stringify(schema.empty)}`
}

/**
 * 모든 절차의 보드 스키마를 AI 프롬프트용 텍스트로 변환
 *
 * @returns {string}
 */
export function getAllBoardSchemasForPrompt() {
  return Object.keys(BOARD_TYPES)
    .map(code => getBoardSchemaForPrompt(code))
    .filter(Boolean)
    .join('\n\n')
}

/**
 * 특정 절차의 빈 보드 데이터를 생성
 *
 * @param {string} procedureCode - 절차 코드
 * @returns {Object} 빈 보드 데이터 (deep copy)
 */
export function createEmptyBoard(procedureCode) {
  const schema = getBoardSchemaForProcedure(procedureCode)
  if (!schema) return {}
  return JSON.parse(JSON.stringify(schema.empty))
}
