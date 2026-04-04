/**
 * 절차(Procedure)별 보드 스키마 — 16+1개 구조화 양식
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

  // ─── T-2-1: 역할 분담 ───
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
        description: '팀이 최종 결정한 핵심 Ground Rule' },
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
          { name: 'criterion1', label: '기준1' },
          { name: 'criterion2', label: '기준2' },
          { name: 'criterion3', label: '기준3' },
          { name: 'totalScore', label: '총점' },
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
      { name: 'subObjectives', label: '세부 학습목표', type: 'list', required: true,
        description: '교과별 세부 학습목표',
        itemSchema: {
          subject: { label: '교과', type: 'text' },
          objective: { label: '학습목표', type: 'textarea' },
        } },
      { name: 'integratedObjectives', label: '통합 학습목표', type: 'list', required: true,
        description: '융합 수업의 통합 학습목표 진술문' },
      { name: 'alignment', label: '비전-성취기준-목표 정합성', type: 'textarea', required: false,
        description: 'AI 검토: 비전, 성취기준, 수업목표 간의 정합성 평가' },
    ],
    empty: {
      subObjectives: [], integratedObjectives: [], alignment: '',
    },
  },

  // ─── Ds-1-1: 평가 계획 ───
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
        description: 'AI 검토: 수업목표와 평가 계획의 정합성' },
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

  // ─── Ds-2-1: 지원 도구 ───
  support_tools: {
    fields: [
      { name: 'experiencedTools', label: '경험한 도구 정리', type: 'list', required: false,
        description: '팀원들이 경험한 도구 목록',
        itemSchema: {
          toolName: { label: '도구명', type: 'text' },
          experience: { label: '활용 경험', type: 'text' },
        } },
      { name: 'tools', label: '학습활동-도구 매칭', type: 'table', required: true,
        description: '각 학습 활동에 매칭된 도구와 활용 방안',
        columns: [
          { name: 'activity', label: '대상 활동' },
          { name: 'toolName', label: '도구명' },
          { name: 'usage', label: '활용 방안' },
          { name: 'alternative', label: '대안 도구' },
        ] },
      { name: 'environmentCheck', label: '학습환경 적절성 검토', type: 'textarea', required: false,
        description: '학습 환경에서의 도구 활용 적절성 검토' },
    ],
    empty: {
      experiencedTools: [], tools: [], environmentCheck: '',
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

  // ─── DI-1-1: 개발 자료 목록 ───
  material_list: {
    fields: [
      { name: 'materials', label: '개발 자료 목록', type: 'table', required: true,
        description: '개발/탐색 자료 구분 및 제작 계획',
        columns: [
          { name: 'materialType', label: '자료 유형' },
          { name: 'title', label: '자료명' },
          { name: 'subject', label: '교과' },
          { name: 'category', label: '구분 (개발/탐색)' },
          { name: 'assignee', label: '담당자' },
          { name: 'priority', label: '우선순위' },
          { name: 'deadline', label: '마감일' },
        ] },
    ],
    empty: {
      materials: [],
    },
  },

  // ─── DI-2-1: 수업 기록 ───
  class_record: {
    fields: [
      { name: 'recordingMethod', label: '기록 방안', type: 'textarea', required: false,
        description: '팀이 합의한 수업 기록 방안' },
      { name: 'episodes', label: '주요 상황 기록', type: 'table', required: true,
        description: '수업 중 주요 에피소드와 시사점',
        columns: [
          { name: 'timestamp', label: '시점' },
          { name: 'situation', label: '상황 설명' },
          { name: 'studentResponse', label: '학생 반응' },
          { name: 'insight', label: '시사점' },
        ] },
      { name: 'transcripts', label: '전사/분석', type: 'list', required: false,
        description: 'AI 생성: 수업 전사 및 분석 결과' },
      { name: 'implications', label: '종합 시사점', type: 'textarea', required: false,
        description: '기록 분석에서 도출된 종합 시사점' },
    ],
    empty: {
      recordingMethod: '', episodes: [], transcripts: [], implications: '',
    },
  },

  // ─── E-1-1: 수업 성찰 ───
  class_reflection: {
    fields: [
      { name: 'learningResults', label: '학습 과정/결과 공유', type: 'list', required: false,
        description: '각 교과별 수업 과정과 결과 공유',
        itemSchema: {
          subject: { label: '교과', type: 'text' },
          processResult: { label: '과정 및 결과', type: 'textarea' },
        } },
      { name: 'improvements', label: '개선사항/수정보완', type: 'list', required: true,
        description: '팀 협의를 통해 도출된 개선사항' },
      { name: 'personalReflections', label: '교과별 수업 개선', type: 'list', required: false,
        description: '각 교사가 본인 교과 수업에 대해 개선할 점',
        itemSchema: {
          subject: { label: '교과', type: 'text' },
          whatWorked: { label: '잘된 점', type: 'textarea' },
          improvement: { label: '개선할 점', type: 'textarea' },
        } },
      { name: 'improvementIdeas', label: '수업 개선 아이디어', type: 'list', required: false,
        description: 'AI 생성: 수업 개선을 위한 구체적 아이디어' },
    ],
    empty: {
      learningResults: [], improvements: [], personalReflections: [], improvementIdeas: [],
    },
  },

  // ─── E-2-1: 과정 성찰 ───
  process_reflection: {
    fields: [
      { name: 'processReflections', label: '과정 성찰', type: 'table', required: true,
        description: '단계별 수업설계 과정에 대한 성찰',
        columns: [
          { name: 'phase', label: '단계' },
          { name: 'goal', label: '목표' },
          { name: 'result', label: '결과' },
          { name: 'improvement', label: '개선사항' },
        ] },
      { name: 'sharedReflections', label: '성찰 공유', type: 'list', required: false,
        description: '팀원들이 공유한 개인 성찰' },
      { name: 'finalImprovements', label: '최종 개선사항', type: 'list', required: true,
        description: '팀 협의를 통해 도출된 최종 개선사항 및 수정·보완 계획' },
    ],
    empty: {
      processReflections: [], sharedReflections: [], finalImprovements: [],
    },
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
