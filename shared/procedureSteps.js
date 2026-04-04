/**
 * 세부절차(Procedure)별 스텝 데이터 — 18 절차, 총 128개 스텝 (prep은 보드 입력 전용으로 스텝 없음)
 *
 * 각 Procedure는 5~9개의 순차적 스텝으로 구성된다.
 * 스텝은 액션 타입(actionType)과 행위 주체(actorColumn)를 가진다.
 *
 * aiCapability 값:
 *   - 'guide': AI가 단계를 소개하고 방법을 안내
 *   - 'generate': AI가 초안/예시/후보를 생성
 *   - 'check': AI가 정합성/적절성을 검토
 *   - 'record': AI가 확정 내용을 저장/리포트 생성
 *   - 'summarize': AI가 공유/논의 내용을 요약 정리
 *   - null: AI 개입 없음 (교사 단독 수행)
 *
 * boardField: 해당 스텝이 채우는 보드 필드 (null이면 보드에 직접 기록하지 않음)
 */

// ──────────────────────────────────────────
// 스텝 데이터 타입 정의
// ──────────────────────────────────────────

/**
 * @typedef {Object} ProcedureStep
 * @property {number} stepNumber - 스텝 번호 (1부터 시작)
 * @property {string} actionType - 액션 타입 (ACTION_TYPES 키)
 * @property {string} actorColumn - 행위자 열 (ACTOR_COLUMNS 키)
 * @property {string} title - 스텝 제목 (한국어)
 * @property {string} description - 스텝 설명 (한국어)
 * @property {string|null} aiCapability - AI 역할 ('guide'|'generate'|'check'|'record'|'summarize'|null)
 * @property {string|null} boardField - 이 스텝이 채우는 보드 필드명 (null이면 직접 기록 안 함)
 */

// ──────────────────────────────────────────
// 절차별 스텝 데이터
// ──────────────────────────────────────────

/** @type {Record<string, ProcedureStep[]>} */
export const PROCEDURE_STEPS = {

  // ─── prep: 학습자/맥락 정보 제공 ───
  // (별도 스텝 없이 보드 입력으로만 구성)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // T-1-1: 비전설정 (9 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'T-1-1': [
    {
      stepNumber: 1,
      actionType: 'share',
      actorColumn: 'team',
      title: '학습자 정보 공유',
      description: '팀원들이 각자의 학습자 정보(학년, 학급 특성 등)를 공유한다.',
      aiCapability: 'summarize',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: 'AI 에이전트 소개',
      description: 'AI 공동설계자가 자신의 역할과 지원 방식을 소개한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '비전 설정 안내',
      description: '비전 설정의 의미와 방법, 좋은 비전의 요건을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '개인 비전 구상',
      description: '각 팀원이 협력적 수업설계를 통해 실현하고자 하는 개인 교육적 비전을 구상한다.',
      aiCapability: null,
      boardField: 'individualVisions',
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'individual_ai',
      title: '비전 정교화',
      description: 'AI가 각 팀원의 개인 비전을 정교화하여 제안한다. 수락/편집/거부 가능.',
      aiCapability: 'generate',
      boardField: 'individualVisions',
    },
    {
      stepNumber: 6,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '교육목적 논의',
      description: '팀원들이 각자의 비전을 공유하고, 공통 교육목적에 대해 논의한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 7,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '공통 비전 후보 생성',
      description: 'AI가 팀 논의 내용을 바탕으로 공통 비전 후보 3개를 생성한다.',
      aiCapability: 'generate',
      boardField: 'commonVisionCandidates',
    },
    {
      stepNumber: 8,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '팀 공통 비전 설정',
      description: '팀원들이 후보 중에서 선택하거나 수정하여 팀 공통 비전을 최종 확정한다.',
      aiCapability: null,
      boardField: 'commonVision',
    },
    {
      stepNumber: 9,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 확정된 비전 내용을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // T-1-2: 수업설계 방향 수립 (8 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'T-1-2': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '수업설계 방향 수립 안내',
      description: '수업설계 방향 수립의 의미와 진행 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '방향 구상',
      description: '각 팀원이 비전을 기반으로 수업설계 방향 키워드와 아이디어를 구상한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '키워드 후보 생성',
      description: 'AI가 팀원들의 아이디어를 분석하여 핵심 키워드 후보를 제안한다.',
      aiCapability: 'generate',
      boardField: 'keywords',
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '방향 논의',
      description: '팀원들이 키워드 후보를 바탕으로 수업설계 방향을 논의한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '군집화 및 예시 생성',
      description: 'AI가 키워드를 군집화하고, 각 방향의 구체적 예시를 제안한다.',
      aiCapability: 'generate',
      boardField: 'keywordClusters',
    },
    {
      stepNumber: 6,
      actionType: 'judge',
      actorColumn: 'team',
      title: '최종 방향 합의',
      description: '팀이 최종 수업설계 방향을 합의하고 확정한다.',
      aiCapability: null,
      boardField: 'directions',
    },
    {
      stepNumber: 7,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '비전-방향 정합성 점검',
      description: 'AI가 확정된 방향이 팀 비전과 정합하는지 점검한다.',
      aiCapability: 'check',
      boardField: 'visionAlignment',
    },
    {
      stepNumber: 8,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 수업설계 방향을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // T-2-1: 역할 분담 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'T-2-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '역할 분담 안내',
      description: '역할 분담의 중요성과 진행 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '역할 및 강점 정리',
      description: '각 팀원이 자신의 강점, 전문성, 희망 역할을 정리한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '역할 도출 논의',
      description: '팀원들이 필요한 역할을 도출하고 서로의 강점을 논의한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '역할 분담 예시 생성',
      description: 'AI가 팀원 강점을 고려한 역할 분담 예시를 제안한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'adjust',
      actorColumn: 'team_ai',
      title: '역할 배분 조정',
      description: '팀이 AI 제안을 참고하여 최종 역할 배분을 조정한다.',
      aiCapability: 'generate',
      boardField: 'roles',
    },
    {
      stepNumber: 6,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '누락 점검',
      description: 'AI가 역할 누락이나 중복이 없는지 점검한다.',
      aiCapability: 'check',
      boardField: 'coverageCheck',
    },
    {
      stepNumber: 7,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 역할 분담 결과를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // T-2-2: 팀 규칙 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'T-2-2': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '팀 규칙 설정 안내',
      description: 'Ground Rule 설정의 의미와 진행 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '의견 제시',
      description: '각 팀원이 팀 활동에 필요하다고 생각하는 규칙을 제시한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '브레인스토밍',
      description: '팀원들이 자유롭게 팀 규칙 아이디어를 브레인스토밍한다.',
      aiCapability: null,
      boardField: 'allRules',
    },
    {
      stepNumber: 4,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '규칙 예시 생성',
      description: 'AI가 효과적인 팀 규칙 예시를 제안한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'judge',
      actorColumn: 'team',
      title: '핵심 규칙 결정',
      description: '팀이 브레인스토밍과 AI 예시를 참고하여 핵심 규칙을 결정한다.',
      aiCapability: null,
      boardField: 'coreRules',
    },
    {
      stepNumber: 6,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '적절성 점검',
      description: 'AI가 규칙의 실행 가능성과 적절성을 점검한다.',
      aiCapability: 'check',
      boardField: 'appropriatenessCheck',
    },
    {
      stepNumber: 7,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 팀 규칙을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // T-2-3: 팀 일정 (6 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'T-2-3': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '팀 일정 수립 안내',
      description: '팀 일정 수립의 진행 방법과 고려사항을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '개인 일정 검토',
      description: '각 팀원이 자신의 가용 시간과 일정을 검토한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '일정 공유',
      description: '팀원들이 각자의 가용 일정을 공유하고 겹치는 시간을 확인한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'adjust',
      actorColumn: 'team_ai',
      title: '모임/마감 확정',
      description: '팀이 모임 일시와 마감일을 조정하여 확정한다. AI가 조정안을 제시한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '일정표 초안 생성',
      description: 'AI가 합의된 내용을 바탕으로 팀 일정표 초안을 생성한다.',
      aiCapability: 'generate',
      boardField: 'schedule',
    },
    {
      stepNumber: 6,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 팀 일정을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // A-1-1: 주제 선정 기준 (6 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'A-1-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '주제 선정 기준 안내',
      description: '주제 선정 기준의 의미와 도출 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '기준 구상',
      description: '각 팀원이 융합 수업 주제 선정에 필요한 기준을 구상한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '기준 예시 생성',
      description: 'AI가 교육과정 연구 기반 주제 선정 기준 예시를 제안한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '기준 논의',
      description: '팀원들이 제안된 기준을 논의하고, 우선순위를 결정한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '기준 정리',
      description: 'AI가 논의 결과를 바탕으로 최종 기준을 정리하여 제안한다.',
      aiCapability: 'generate',
      boardField: 'criteria',
    },
    {
      stepNumber: 6,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 주제 선정 기준을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // A-1-2: 주제 선정 (8 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'A-1-2': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '주제 선정 안내',
      description: '주제 선정의 진행 방법과 교과 연계 고려사항을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'generate',
      actorColumn: 'individual_ai',
      title: '교과 연계 주제 구상',
      description: '각 팀원이 AI의 도움을 받아 담당 교과에서 연계 가능한 주제를 구상한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '주제 추천',
      description: 'AI가 교육과정 데이터를 분석하여 교과 간 융합 가능한 주제를 추천한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '후보 나열 및 묶기',
      description: '팀원들이 주제 후보를 나열하고, 유사한 것끼리 묶어 정리한다.',
      aiCapability: null,
      boardField: 'candidates',
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '비교표/클러스터맵 생성',
      description: 'AI가 주제 후보별 기준 충족도 비교표와 클러스터맵을 생성한다.',
      aiCapability: 'generate',
      boardField: 'comparisonTable',
    },
    {
      stepNumber: 6,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '최종 주제 선정',
      description: '팀이 비교표를 참고하여 최종 주제를 선정한다.',
      aiCapability: null,
      boardField: 'selectedTopic',
    },
    {
      stepNumber: 7,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '비전/기준 부합 점검',
      description: 'AI가 선정된 주제가 팀 비전과 선정 기준에 부합하는지 점검한다.',
      aiCapability: 'check',
      boardField: 'visionCriteriaCheck',
    },
    {
      stepNumber: 8,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 선정 주제와 근거를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // A-2-1: 핵심 아이디어 및 성취기준 분석 (8 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'A-2-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '성취기준 분석 안내',
      description: '성취기준 분석의 세 가지 차원(지식·이해, 과정·기능, 가치·태도)과 진행 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'judge',
      actorColumn: 'individual_ai',
      title: '교과별 성취기준 분석',
      description: '각 팀원이 AI의 도움을 받아 담당 교과의 관련 성취기준을 분석한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'individual_ai',
      title: '지식·이해/과정·기능/가치·태도 분석',
      description: 'AI가 각 성취기준의 세 가지 차원을 분석하여 제안한다.',
      aiCapability: 'generate',
      boardField: 'standards',
    },
    {
      stepNumber: 4,
      actionType: 'share',
      actorColumn: 'team',
      title: '성취기준 통합 공유',
      description: '팀원들이 각 교과의 분석 결과를 통합하여 공유한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '연결맵 시각화',
      description: 'AI가 교과 간 성취기준 연결 관계를 시각화한 연결맵을 생성한다.',
      aiCapability: 'generate',
      boardField: 'connectionMap',
    },
    {
      stepNumber: 6,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '중복 정리',
      description: '팀원들이 교과 간 중복되는 내용 요소를 정리하고 통합 방안을 논의한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 7,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '중복 정리 검토',
      description: 'AI가 중복 정리 결과를 검토하고, 누락된 연결이 없는지 확인한다.',
      aiCapability: 'check',
      boardField: 'duplicateCheck',
    },
    {
      stepNumber: 8,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 성취기준 분석 결과를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // A-2-2: 통합된 수업 목표 (8 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'A-2-2': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '통합 수업목표 수립 안내',
      description: '세부학습목표와 통합학습목표의 차이, 목표 진술 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'generate',
      actorColumn: 'individual_ai',
      title: '세부 학습목표 초안',
      description: 'AI가 각 교과별 성취기준 분석을 바탕으로 세부 학습목표 초안을 생성한다.',
      aiCapability: 'generate',
      boardField: 'subObjectives',
    },
    {
      stepNumber: 3,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '적절성 검토',
      description: 'AI가 세부 학습목표의 적절성(성취기준 반영도, 수준 적합성)을 검토한다.',
      aiCapability: 'check',
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '세부 학습목표 공유',
      description: '팀원들이 각 교과의 세부 학습목표를 공유하고 피드백한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '통합 학습목표 제안',
      description: 'AI가 세부 학습목표를 통합한 통합 학습목표를 제안한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 6,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '통합 학습목표 수립',
      description: '팀이 AI 제안을 참고하여 최종 통합 학습목표를 수립한다.',
      aiCapability: null,
      boardField: 'integratedObjectives',
    },
    {
      stepNumber: 7,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '비전-성취기준-목표 정합성 검토',
      description: 'AI가 비전, 성취기준, 수업목표 간의 정합성을 종합 검토한다.',
      aiCapability: 'check',
      boardField: 'alignment',
    },
    {
      stepNumber: 8,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 통합 수업목표를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Ds-1-1: 평가 계획 (8 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'Ds-1-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '평가 계획 안내',
      description: '역방향 설계(Backward Design) 관점에서 평가 계획의 의미와 진행 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '교과별 평가 구상',
      description: '각 팀원이 담당 교과에서 평가할 내용과 방법을 구상한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '평가 내용/방법 추천',
      description: 'AI가 수업목표에 기반한 평가 내용과 방법을 추천한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '평가 내용/방법 논의',
      description: '팀원들이 교과별 평가 내용과 방법을 논의하고 조율한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '활동별 평가 추천',
      description: 'AI가 각 학습활동에 적합한 평가 방법과 루브릭 요소를 추천한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 6,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '활동별 평가 확정',
      description: '팀이 활동별 평가 계획을 최종 확정한다.',
      aiCapability: null,
      boardField: 'assessments',
    },
    {
      stepNumber: 7,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '수업목표-평가 정합성 검토',
      description: 'AI가 수업목표와 평가 계획의 정합성을 검토한다.',
      aiCapability: 'check',
      boardField: 'objectiveAlignmentCheck',
    },
    {
      stepNumber: 8,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 평가 계획을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Ds-1-2: 문제 상황 (8 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'Ds-1-2': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '문제 상황 설정 안내',
      description: '실세계 기반 문제 상황의 요건과 설정 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '흥미/실제성/수준 고려',
      description: '각 팀원이 학생의 흥미, 실제성, 수준을 고려하여 문제 상황 방향을 구상한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '실제 데이터 기반 초안 생성',
      description: 'AI가 실제 데이터를 활용하여 문제 상황 초안 2~3개를 생성한다.',
      aiCapability: 'generate',
      boardField: 'candidates',
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '통합 문제 상황 결정',
      description: '팀이 후보 중에서 통합 문제 상황을 결정하거나 조합한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '우선순위 추천',
      description: 'AI가 문제 상황 후보의 교육적 가치와 실현 가능성을 기준으로 우선순위를 추천한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 6,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '문제 상황 제작/수정',
      description: 'AI가 팀의 결정에 따라 최종 문제 상황을 제작하거나 수정한다.',
      aiCapability: 'generate',
      boardField: 'selected',
    },
    {
      stepNumber: 7,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '학습내용/산출물/청중 반영 검토',
      description: 'AI가 문제 상황에 학습내용, 산출물, 청중이 적절히 반영되었는지 검토한다.',
      aiCapability: 'check',
      boardField: 'learningContentCheck',
    },
    {
      stepNumber: 8,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 문제 상황을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Ds-1-3: 학습 활동 설계 (6 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'Ds-1-3': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '학습 활동 설계 안내',
      description: '문제 해결 절차에 따른 학습 활동 설계 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '활동 아이디어 나열',
      description: '팀원들이 문제 해결에 필요한 학습 활동 아이디어를 자유롭게 나열한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '문제 해결 절차 재조정',
      description: '팀이 활동 아이디어를 문제 해결 절차에 맞게 재배치하고 조정한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '학습목표/실행 적절성 검토',
      description: 'AI가 설계된 활동이 학습목표를 달성할 수 있는지, 실행 가능한지 검토한다.',
      aiCapability: 'check',
      boardField: 'objectiveFeasibilityCheck',
    },
    {
      stepNumber: 5,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '교과/시간 배분',
      description: '팀이 각 활동의 담당 교과와 차시를 배분하여 최종 확정한다.',
      aiCapability: null,
      boardField: 'activities',
    },
    {
      stepNumber: 6,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 학습 활동 설계를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Ds-2-1: 지원 도구 설계 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'Ds-2-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '지원 도구 설계 안내',
      description: '학습 활동에 필요한 도구 선정과 활용 방안 설계 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'record',
      actorColumn: 'individual',
      title: '경험한 도구 정리',
      description: '각 팀원이 수업에서 경험한 도구를 정리하여 기록한다.',
      aiCapability: null,
      boardField: 'experiencedTools',
    },
    {
      stepNumber: 3,
      actionType: 'share',
      actorColumn: 'team',
      title: '도구 소개',
      description: '팀원들이 각자 경험한 도구를 팀에게 소개한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '도구/활용 방안 생성',
      description: 'AI가 학습 활동에 적합한 도구와 구체적 활용 방안을 제안한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '학습활동-도구 매칭',
      description: '팀이 각 학습 활동에 적합한 도구를 매칭한다.',
      aiCapability: null,
      boardField: 'tools',
    },
    {
      stepNumber: 6,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '학습환경 적절성 검토',
      description: '팀이 학습 환경에서 도구 활용의 적절성을 검토한다.',
      aiCapability: null,
      boardField: 'environmentCheck',
    },
    {
      stepNumber: 7,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 지원 도구 설계를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Ds-2-2: 스캐폴딩 설계 (8 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'Ds-2-2': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '스캐폴딩 설계 안내',
      description: '스캐폴딩의 유형과 설계 방법, 점진적 제거 전략을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'record',
      actorColumn: 'individual',
      title: '지원 방안 정리',
      description: '각 팀원이 기존에 활용한 학습 지원 방안을 정리하여 기록한다.',
      aiCapability: null,
      boardField: 'supportMethods',
    },
    {
      stepNumber: 3,
      actionType: 'share',
      actorColumn: 'team',
      title: '스캐폴딩 방안 설명',
      description: '팀원들이 각자의 스캐폴딩 경험과 방안을 팀에게 설명한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '학습자 관점 스캐폴딩 논의',
      description: '팀이 학습자 관점에서 필요한 스캐폴딩을 논의한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '스캐폴딩 추천',
      description: 'AI가 각 학습 활동에 적합한 스캐폴딩 유형과 내용을 추천한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 6,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '최종 결정',
      description: '팀이 스캐폴딩 계획을 최종 결정한다.',
      aiCapability: null,
      boardField: 'scaffolds',
    },
    {
      stepNumber: 7,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '적절성 검토',
      description: 'AI가 스캐폴딩의 적절성과 점진적 제거 계획을 검토한다.',
      aiCapability: 'check',
      boardField: 'appropriatenessCheck',
    },
    {
      stepNumber: 8,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 스캐폴딩 설계를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DI-1-1: 개발 자료 목록 (6 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'DI-1-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '개발 자료 목록 안내',
      description: '개발/탐색 자료의 구분 방법과 목록 작성 절차를 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '교과별 개발/탐색 자료 구분',
      description: '각 팀원이 담당 교과에서 개발할 자료와 탐색(수집)할 자료를 구분한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '활동지/평가문항 추천',
      description: 'AI가 학습 활동에 필요한 활동지, 평가문항 등을 추천한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '자료 목록/역할/일정 조정',
      description: '팀이 자료 목록을 정리하고, 제작 역할과 일정을 논의하여 조정한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'adjust',
      actorColumn: 'team_ai',
      title: '제작 우선순위 조정',
      description: '팀이 AI의 제안을 참고하여 자료 제작 우선순위를 최종 조정한다.',
      aiCapability: 'generate',
      boardField: 'materials',
    },
    {
      stepNumber: 6,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 개발 자료 목록을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DI-2-1: 수업 기록 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'DI-2-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '수업 기록 안내',
      description: '효과적인 수업 기록의 방법과 기록 요소를 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '기록 방안 논의',
      description: '팀원들이 수업 중 기록할 내용과 방법을 논의한다.',
      aiCapability: null,
      boardField: 'recordingMethod',
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '기록 예시 생성',
      description: 'AI가 효과적인 수업 기록 양식과 예시를 생성한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'record',
      actorColumn: 'individual',
      title: '주요 상황 메모',
      description: '각 팀원이 수업 중 주요 상황, 학생 반응, 에피소드를 메모한다.',
      aiCapability: null,
      boardField: 'episodes',
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '전사/분석',
      description: 'AI가 기록된 내용을 전사하고 패턴을 분석한다.',
      aiCapability: 'generate',
      boardField: 'transcripts',
    },
    {
      stepNumber: 6,
      actionType: 'judge',
      actorColumn: 'individual_ai',
      title: '시사점 정리',
      description: '각 팀원이 AI 분석 결과를 참고하여 핵심 시사점을 정리한다.',
      aiCapability: 'generate',
      boardField: 'implications',
    },
    {
      stepNumber: 7,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '리포트 생성',
      description: 'AI가 수업 기록을 종합하여 리포트를 생성하고 보드에 저장한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // E-1-1: 수업 성찰 (6 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'E-1-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '수업 성찰 안내',
      description: '수업 성찰의 의미, 관점, 진행 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'share',
      actorColumn: 'team',
      title: '학습 과정/결과 공유',
      description: '팀원들이 각 교과의 수업 과정과 결과를 공유한다.',
      aiCapability: null,
      boardField: 'learningResults',
    },
    {
      stepNumber: 3,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '개선사항/수정보완 논의',
      description: '팀이 수업의 개선사항과 수정·보완이 필요한 부분을 논의한다.',
      aiCapability: null,
      boardField: 'improvements',
    },
    {
      stepNumber: 4,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '본인 교과 수업 개선 판단',
      description: '각 팀원이 본인 교과 수업에 대해 잘된 점과 개선할 점을 판단한다.',
      aiCapability: null,
      boardField: 'personalReflections',
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '수업 개선 아이디어 생성',
      description: 'AI가 성찰 내용을 바탕으로 구체적인 수업 개선 아이디어를 생성한다.',
      aiCapability: 'generate',
      boardField: 'improvementIdeas',
    },
    {
      stepNumber: 6,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 수업 성찰 결과를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // E-2-1: 수업설계 과정 성찰 (5 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'E-2-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '과정 성찰 안내',
      description: '수업설계 전체 과정에 대한 성찰의 의미와 진행 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'record',
      actorColumn: 'individual',
      title: '과정 성찰 기록',
      description: '각 팀원이 수업설계 과정 전반에 대한 성찰을 기록한다.',
      aiCapability: null,
      boardField: 'processReflections',
    },
    {
      stepNumber: 3,
      actionType: 'share',
      actorColumn: 'team',
      title: '성찰 공유',
      description: '팀원들이 각자의 과정 성찰을 공유한다.',
      aiCapability: null,
      boardField: 'sharedReflections',
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '개선사항 도출/수정보완',
      description: '팀이 전체 과정의 개선사항을 도출하고, 수정·보완 계획을 수립한다.',
      aiCapability: null,
      boardField: 'finalImprovements',
    },
    {
      stepNumber: 5,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 과정 성찰 결과를 보드에 저장하고 최종 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],
}

// ──────────────────────────────────────────
// 헬퍼 함수
// ──────────────────────────────────────────

/**
 * 특정 절차의 스텝 목록을 반환
 *
 * @param {string} procedureCode - 절차 코드 (예: 'T-1-1')
 * @returns {ProcedureStep[]} 스텝 배열 (없으면 빈 배열)
 */
export function getStepsForProcedure(procedureCode) {
  return PROCEDURE_STEPS[procedureCode] || []
}

/**
 * 특정 절차의 총 스텝 수를 반환
 *
 * @param {string} procedureCode - 절차 코드
 * @returns {number}
 */
export function getStepCount(procedureCode) {
  return (PROCEDURE_STEPS[procedureCode] || []).length
}

/**
 * 특정 절차의 특정 스텝을 반환
 *
 * @param {string} procedureCode - 절차 코드
 * @param {number} stepNumber - 스텝 번호 (1부터 시작)
 * @returns {ProcedureStep | undefined}
 */
export function getStep(procedureCode, stepNumber) {
  const steps = PROCEDURE_STEPS[procedureCode]
  if (!steps) return undefined
  return steps.find(s => s.stepNumber === stepNumber)
}

/**
 * 특정 절차에서 AI가 개입하는 스텝만 필터링하여 반환
 *
 * @param {string} procedureCode - 절차 코드
 * @returns {ProcedureStep[]} AI 개입 스텝 배열
 */
export function getAISteps(procedureCode) {
  const steps = PROCEDURE_STEPS[procedureCode]
  if (!steps) return []
  return steps.filter(s => s.aiCapability !== null)
}

/**
 * 특정 절차에서 보드 필드를 채우는 스텝만 필터링하여 반환
 *
 * @param {string} procedureCode - 절차 코드
 * @returns {ProcedureStep[]} 보드 기록 스텝 배열
 */
export function getBoardFieldSteps(procedureCode) {
  const steps = PROCEDURE_STEPS[procedureCode]
  if (!steps) return []
  return steps.filter(s => s.boardField !== null)
}

/**
 * 전체 스텝 통계를 반환
 *
 * @returns {{totalProcedures: number, totalSteps: number, byActionType: Record<string, number>, byActorColumn: Record<string, number>}}
 */
export function getStepStatistics() {
  const allSteps = Object.values(PROCEDURE_STEPS).flat()
  const byActionType = {}
  const byActorColumn = {}

  for (const step of allSteps) {
    byActionType[step.actionType] = (byActionType[step.actionType] || 0) + 1
    byActorColumn[step.actorColumn] = (byActorColumn[step.actorColumn] || 0) + 1
  }

  return {
    totalProcedures: Object.keys(PROCEDURE_STEPS).length,
    totalSteps: allSteps.length,
    byActionType,
    byActorColumn,
  }
}

/**
 * 특정 절차의 스텝을 AI 프롬프트용 텍스트로 변환
 *
 * @param {string} procedureCode - 절차 코드
 * @returns {string}
 */
export function getStepsForPrompt(procedureCode) {
  const steps = PROCEDURE_STEPS[procedureCode]
  if (!steps) return ''

  return steps.map(s => {
    const aiTag = s.aiCapability ? ` [AI:${s.aiCapability}]` : ''
    const boardTag = s.boardField ? ` → ${s.boardField}` : ''
    return `  ${String(s.stepNumber).padStart(2, '0')}. [${s.actionType}] ${s.title} (${s.actorColumn})${aiTag}${boardTag}\n      ${s.description}`
  }).join('\n')
}
