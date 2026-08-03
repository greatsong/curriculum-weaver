/**
 * 세부절차(Procedure)별 스텝 데이터 — 18 절차, 총 131개 스텝 (prep은 보드 입력 전용으로 스텝 없음)
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
  // T-1-1: 공동 비전 설정 (9 스텝)
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
  // T-1-2: 수업설계 방향 설정 (8 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'T-1-2': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '수업설계 방향 설정 안내',
      description: '수업설계 방향 설정의 의미와 진행 방법을 안내한다.',
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
  // T-2-1: 역할 배분 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'T-2-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '역할 배분 안내',
      description: '역할 배분의 중요성과 진행 방법을 안내한다.',
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
      title: '역할 배분 예시 생성',
      description: 'AI가 팀원 강점을 고려한 역할 배분 예시를 제안한다.',
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
      description: 'AI가 역할 배분 결과를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // T-2-2: 팀 규칙 결정 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'T-2-2': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '팀 규칙 결정 안내',
      description: '팀 규칙 결정의 의미와 진행 방법을 안내한다.',
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
  // T-2-3: 팀 일정 결정 (6 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'T-2-3': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '팀 일정 결정 안내',
      description: '팀 일정 결정의 진행 방법과 고려사항을 안내한다.',
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
  // A-1-1: 주제 선정 기준 논의 및 조정 (6 스텝)
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
  // A-1-2: 비전에 적합한 주제 선정 (8 스텝)
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
  // A-2-1: 주제의 상세 내용 분석 (8 스텝)
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
  // A-2-2: 핵심 아이디어 도출 및 통합 수업목표 진술 (9 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'A-2-2': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '핵심 아이디어 도출 및 통합 수업목표 진술 안내',
      description: '핵심 아이디어·탐구 질문의 의미와 두 가지 목표 진술 방식(귀납적/연역적)을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'share',
      actorColumn: 'team',
      title: '핵심 개념 모으기',
      description: '각 교사가 재구조화 표에서 다른 단원에서도 쓰일 만한 개념을 2~3개씩 골라 동시에 공개하고, 두 교과 이상에서 겹친 개념을 추린다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '핵심 아이디어 문장 후보 생성',
      description: 'AI가 팀이 모은 핵심 개념들의 관계를 엮어, 소재를 바꿔도 적용 가능한 핵심 아이디어 문장 후보를 제안한다.',
      aiCapability: 'generate',
      boardField: 'coreIdea',
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '핵심 아이디어·탐구 질문 확정',
      description: '세 물음(다른 상황에서도 참인가, 소재를 바꿔도 살아남는가, 여러 교과를 아우르는가)에 비추어 핵심 아이디어를 확정하고, 이를 학생의 물음으로 바꾸어 탐구 질문을 고른다.',
      aiCapability: null,
      boardField: 'inquiryQuestions',
    },
    {
      stepNumber: 5,
      actionType: 'adjust',
      actorColumn: 'team',
      title: '통합 수업목표 진술 방식 선택',
      description: '귀납적(개별 교과 목표→통합) 방식과 연역적(통합 목표→개별 교과 구체화) 방식을 확인하고 팀 상황에 맞는 방식을 선택한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 6,
      actionType: 'judge',
      actorColumn: 'individual',
      title: '개인별 교과 수업목표 구상',
      description: '선택한 방식에 따라 각 교사가 자기 교과 수업목표를 구상하고, 쓰는 도중 한 번 멈춰 서로의 방향을 맞춘다.',
      aiCapability: null,
      boardField: 'subObjectives',
    },
    {
      stepNumber: 7,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '교과별 목표 공유 및 통합 수업목표 진술',
      description: '교과별 목표를 공유해 확인한 뒤, 핵심 아이디어로 수렴되는 키워드를 모아 통합 수업목표를 한 문장으로 진술한다.',
      aiCapability: null,
      boardField: 'integratedObjectives',
    },
    {
      stepNumber: 8,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '비전-성취기준-목표 정합성 검토',
      description: 'AI가 비전, 성취기준, 핵심 아이디어, 수업목표 간의 정합성을 종합 검토한다.',
      aiCapability: 'check',
      boardField: 'alignment',
    },
    {
      stepNumber: 9,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 핵심 아이디어와 통합 수업목표를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Ds-1-1: 평가 설계 (8 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'Ds-1-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '평가 설계 안내',
      description: '역방향 설계(Backward Design) 관점에서 평가 설계의 의미와 진행 방법을 안내한다.',
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
      description: '팀이 활동별 평가 설계를 최종 확정한다.',
      aiCapability: null,
      boardField: 'assessments',
    },
    {
      stepNumber: 7,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '수업목표-평가 정합성 검토',
      description: 'AI가 수업목표와 평가 설계의 정합성을 검토한다.',
      aiCapability: 'check',
      boardField: 'objectiveAlignmentCheck',
    },
    {
      stepNumber: 8,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 평가 설계를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Ds-1-2: 문제 상황 설정 (8 스텝)
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
  // Ds-2-1: 도구 연결 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'Ds-2-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '도구 연결 안내',
      description: '활동과 도구를 함께 설계하는 이유, 탐색/개발 도구 구분, Human-AI Agency 점검 관점을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '활동별 필요 도구 나열',
      description: '"이 활동에 무엇이 필요한가"를 기준으로 각 학습활동에 필요한 도구를 자유롭게 나열하고, 활동의 목적에 비추어 적합한지 검토한다.',
      aiCapability: null,
      boardField: 'tools',
    },
    {
      stepNumber: 3,
      actionType: 'adjust',
      actorColumn: 'team',
      title: '탐색 도구와 개발 도구 구분',
      description: '이미 있는 것을 찾아 활용할 탐색 도구와 우리 수업에 맞게 새로 제작할 개발 도구로 구분하고, 생성형 AI로 직접 만들 수 있는 도구도 함께 살핀다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: 'AI 도구 시험 제작',
      description: '새로 만들 도구를 생성형 AI로 시험 제작해(간단한 웹 도구 등), "이 도구가 정말 필요한가, 학생이 쓸 수 있는가"를 팀이 눈으로 확인한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 5,
      actionType: 'check',
      actorColumn: 'team',
      title: 'Human-AI Agency 점검',
      description: 'AI 도구별로 학생이 직접 할 일, AI가 지원할 일, 교사가 확인·개입할 일을 나누어 적고, 도구가 학생의 사고와 판단을 대신하지 않는지 점검한다.',
      aiCapability: null,
      boardField: 'agencyCheck',
    },
    {
      stepNumber: 6,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '도구 준비 일정과 역할 분담 결정',
      description: '도구별 담당자와 준비 시점, 사전 점검 방법을 정한다. 누가 준비할지뿐 아니라 수업 전에 누가 직접 시험해 볼지까지 정한다.',
      aiCapability: null,
      boardField: 'prepPlan',
    },
    {
      stepNumber: 7,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 도구 설계를 보드에 저장하고 요약 리포트를 생성한다.',
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
  // DI-1-1: 자료 탐색·개발 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'DI-1-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '자료 탐색·개발 안내',
      description: '개발/탐색 자료의 구분 방법과 목록 작성 절차를 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'share',
      actorColumn: 'team',
      title: '설계안 확인하고 필요한 자료 점검',
      description: '설계 단계에서 확정한 학습활동과 스캐폴딩을 다시 확인하고, 이를 실행하려면 어떤 자료가 필요한지 점검한다. 설계 단계에서 정한 도구는 새로 고르지 않고 계획대로 준비·점검한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 3,
      actionType: 'record',
      actorColumn: 'individual',
      title: '개인별 필요 자료 나열',
      description: '각 교사가 설계안의 활동별로 자기 교과 수업에 필요한 자료를 자유롭게 나열한다(활동–필요 자료–확보 방법 표, 확보 가능 여부는 나중에).',
      aiCapability: null,
      boardField: 'materials',
    },
    {
      stepNumber: 4,
      actionType: 'adjust',
      actorColumn: 'team',
      title: '자료 목록 조정·역할 분담·일정 공유',
      description: '나열한 자료를 수업목표에 비추어 조정하고 탐색/개발로 나눈다. 개발 자료는 공동·개별로 나누어 담당자와 마감 기한을 정하고, 완료 여부 칸과 함께 공유 문서에 기록한다.',
      aiCapability: null,
      boardField: 'materials',
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '반응형 자료 공동 제작',
      description: 'AI와 함께 학생 응답에 따라 내용이 바뀌는 반응형 학습지나 간단한 시뮬레이션 등 종이로 담기 어려운 자료를 제작해 본다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 6,
      actionType: 'check',
      actorColumn: 'team',
      title: '개발 자료 동료 검토·보완',
      description: '완성한 자료를 동료가 학생 관점에서 처음부터 따라 해 보며 검토한다. 어디서 멈칫하는지, 무엇을 묻고 싶어지는지가 곧 학생이 막힐 지점이다.',
      aiCapability: null,
      boardField: 'peerReview',
    },
    {
      stepNumber: 7,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 개발 자료 목록과 동료 검토 결과를 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DI-2-1: 수업 실행·기록 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'DI-2-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '수업 실행·기록 안내',
      description: '효과적인 수업 기록의 방법과 기록 요소를 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'adjust',
      actorColumn: 'team',
      title: '수업 실행 방식 합의·역할 나누기',
      description: '수업 실행 방식(개별 실행/공동 실행)을 팀이 합의하고 실행·참관·지원 역할을 나눈다. 같은 프로젝트를 누가 언제 하는지 한 장에 모아 둔다.',
      aiCapability: null,
      boardField: 'executionPlan',
    },
    {
      stepNumber: 3,
      actionType: 'share',
      actorColumn: 'team',
      title: '설계안에 근거해 수업 실행',
      description: '합의한 방식에 따라 수업을 운영한다. 참관이 포함되면 실행 전에 협력적 수업 설계의 의미를 학생에게 설명하고, 관찰 교사는 평가자가 아니라 함께 만든 사람으로 참여한다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'record',
      actorColumn: 'individual',
      title: '주요 상황·에피소드 기록',
      description: '수업 중 또는 직후에 예상과 달랐던 학생 반응, 인상적인 발화, 뜻밖의 질문을 구체적 근거에 기반해 기록한다(직후 5~10분, 저부담 형식부터).',
      aiCapability: null,
      boardField: 'episodes',
    },
    {
      stepNumber: 5,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '되짚어 볼 장면 추리기',
      description: 'AI가 녹음 전사 텍스트나 긴 기록에서 팀이 되짚어 볼 장면을 추린다. 어떤 장면이 교육적으로 의미 있는지는 팀이 판단하며, 깊은 분석은 평가 단계에서 한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 6,
      actionType: 'share',
      actorColumn: 'team',
      title: '기록 공유·간단한 인상 나눔',
      description: '기록한 에피소드를 팀 공유 공간에 올리고, 다음 회의에서 가장 기억에 남은 장면 하나씩만 짧게 나눈다.',
      aiCapability: null,
      boardField: null,
    },
    {
      stepNumber: 7,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 수업 실행 방식과 기록을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // E-1-1: 수업 성찰과 공동 개선 (7 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'E-1-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '수업 성찰과 공동 개선 안내',
      description: '증거(학생 결과물·형성평가 자료) 기반 성찰의 의미와 진행 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'share',
      actorColumn: 'team',
      title: '학생의 학습과정과 결과 분석',
      description: '각자 교실에서 나온 학생 결과물·형성평가 응답·성찰일지를 한자리에 모아, 같은 자료를 팀이 함께 검토한다(목표 도달·오개념·창의적 반응 세 갈래 샘플).',
      aiCapability: null,
      boardField: 'learningResults',
    },
    {
      stepNumber: 3,
      actionType: 'generate',
      actorColumn: 'team_ai',
      title: '응답 패턴 정리',
      description: 'AI가 성찰일지·서술형 응답에서 반복되는 흥미·어려움·오개념 패턴을 정리해, 팀이 어디부터 들여다볼지 실마리를 잡는다. 어떤 패턴이 의미 있는지는 팀이 자료를 직접 확인해 판단한다.',
      aiCapability: 'generate',
      boardField: null,
    },
    {
      stepNumber: 4,
      actionType: 'check',
      actorColumn: 'team',
      title: '성취기준 도달 정도 확인',
      description: '미리 합의한 평가 루브릭을 기준으로 성취수준을 판단하고, 교사가 의도한 학습목표와 학생의 실제 배움 사이의 차이를 확인한다.',
      aiCapability: null,
      boardField: 'rubricGapAnalysis',
    },
    {
      stepNumber: 5,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '수업 개선 아이디어 나누기',
      description: '학생이 어려움을 겪은 지점의 원인이 설계의 어디에 있었는지(안내 부족·발문·시간 배분 등) 함께 찾아 개선 아이디어를 나눈다.',
      aiCapability: null,
      boardField: 'improvements',
    },
    {
      stepNumber: 6,
      actionType: 'adjust',
      actorColumn: 'team',
      title: '수업 설계안 수정하고 기록',
      description: '원인 분석과 대안을 바탕으로 지도안·활동지·평가 도구를 그 자리에서 수정하고, 무엇을 왜 바꾸었는지 기록한다.',
      aiCapability: null,
      boardField: 'revisionLog',
    },
    {
      stepNumber: 7,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 수업 성찰과 설계안 수정 기록을 보드에 저장하고 요약 리포트를 생성한다.',
      aiCapability: 'record',
      boardField: null,
    },
  ],

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // E-2-1: 협력 과정 성찰 (5 스텝)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'E-2-1': [
    {
      stepNumber: 1,
      actionType: 'guide',
      actorColumn: 'ai_only',
      title: '협력 과정 성찰 안내',
      description: '준비 단계의 합의 사항(비전·방향·역할·규칙·일정)을 기준으로 협력 과정을 돌아보는 방법을 안내한다.',
      aiCapability: 'guide',
      boardField: null,
    },
    {
      stepNumber: 2,
      actionType: 'share',
      actorColumn: 'team',
      title: '협력 과정 검토',
      description: '초기 합의 사항을 실제 진행과 비교한다. 각자 자기 성찰("나는 역할을 기한 안에 해냈는가")을 먼저 나눈 뒤, 역할 분담의 공평성·규칙의 실효성·일정 운영의 무리 여부를 함께 검토한다.',
      aiCapability: null,
      boardField: 'agreementReview',
    },
    {
      stepNumber: 3,
      actionType: 'check',
      actorColumn: 'team_ai',
      title: '협력 구조 검토',
      description: 'AI가 회의록·일정 기록에서 의사소통·업무 분배·시간 관리 측면의 강점과 보완점을 정리하고, 팀은 문제의 원인을 개인이 아니라 운영 방식(구조)에서 찾는다.',
      aiCapability: 'check',
      boardField: 'structureReview',
    },
    {
      stepNumber: 4,
      actionType: 'discuss',
      actorColumn: 'team',
      title: '다음 협력 운영 원칙 합의',
      description: '앞으로의 협력에서 새로 도입하거나 수정할 운영 원칙을 논의해 합의한다. 바로 실행하고 지켰는지 확인할 수 있는 행동으로 다듬어 공유 문서에 기록한다.',
      aiCapability: null,
      boardField: 'operatingPrinciples',
    },
    {
      stepNumber: 5,
      actionType: 'record',
      actorColumn: 'ai_only',
      title: '저장 및 리포트',
      description: 'AI가 협력 과정 성찰과 운영 원칙을 보드에 저장하고 최종 리포트를 생성한다.',
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
