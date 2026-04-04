# 워크플로우 매핑: xlsx → 코드 구조

## 목차
1. [Phase-Procedure 매핑](#1-phase-procedure-매핑)
2. [액션 스텝 구조](#2-액션-스텝-구조)
3. [행위자 모델](#3-행위자-모델)
4. [constants.js 재설계안](#4-constantsjs-재설계안)
5. [보드 스키마 재설계안](#5-보드-스키마-재설계안)

---

## 1. Phase-Procedure 매핑

### 현재 → 목표 변환

```
현재: 5 Phases × 2 Stages = 10 Stages
목표: 5 Phases × 2~5 Procedures = 16 Procedures + 준비 단계
```

| Phase | 현재 Stage | 목표 Procedure | 변경 사항 |
|-------|-----------|---------------|----------|
| 준비 | (없음) | prep | **신규** — 학습자/맥락 정보 제공 |
| T | T-1 | T-1-1, T-1-2 | T-1을 비전설정 + 방향수립으로 분리 |
| T | T-2 | T-2-1, T-2-2, T-2-3 | T-2를 역할분담 + 팀규칙 + 팀일정으로 분리 |
| A | A-1 | A-1-1, A-1-2 | A-1을 기준설정 + 주제선정으로 분리 |
| A | A-2 | A-2-1, A-2-2 | A-2를 성취기준분석 + 통합목표로 분리 |
| Ds | Ds-1 | Ds-1-1, Ds-1-2, Ds-1-3 | Ds-1을 평가계획 + 문제상황 + 활동설계로 분리 |
| Ds | Ds-2 | Ds-2-1, Ds-2-2 | 동일 (도구설계 + 스캐폴딩) |
| DI | DI-1 | DI-1-1 | 동일 (개발자료목록) |
| DI | DI-2 | DI-2-1 | 동일 (수업기록) |
| E | E-1 | E-1-1 | 동일 (수업성찰) |
| E | E-2 | E-2-1 | 동일 (과정성찰) |

**DI 단계 특수사항**: DI-1-1과 DI-2-1 사이에 "AI 자료 프로토타이핑"과 "수업 시뮬레이션" 참고 활동이 있음 (연수에서 반영, MVP에서는 가이드 텍스트로만)

---

## 2. 액션 스텝 구조

각 세부절차는 5~9개의 번호 액션 스텝으로 구성된다.

### 스텝 데이터 모델

```javascript
{
  stepNumber: 1,              // 01~09
  actionType: 'guide',        // 8가지 중 하나
  actorColumn: 'team_ai',     // 5개 행위자 열 중 하나
  description: '비전 설정의 의미와 방법을 안내한다',
  aiCapability: 'generate',   // AI가 할 수 있는 역할 (없으면 null)
}
```

### 액션 타입 매핑

| xlsx 표기 | 코드 | 설명 | AI 역할 |
|-----------|------|------|---------|
| 안내 | guide | 단계별 활동 방법 설명 | AI가 단계 소개 |
| 판단 | judge | 개인 의견 구상/결정 | AI가 판단 근거 제시 |
| 생성 | generate | 초안/예시/후보 생성 | **AI 핵심 역할** |
| 협의 | discuss | 팀 논의/브레인스토밍 | AI가 논점 정리 |
| 공유 | share | 개인 결과물 팀 공유 | AI가 공유 내용 요약 |
| 조정 | adjust | 의견 통합/우선순위 조정 | AI가 조정안 제시 |
| 점검/검토 | check | 정합성/적절성 검토 | **AI 핵심 역할** |
| 기록 | record | 확정 내용 저장/리포트 | **AI 핵심 역할** |

### 행위자 열 매핑

| xlsx 열 | 코드 | 설명 | UI 표현 |
|---------|------|------|---------|
| 개인교사 단독 | individual | 교사 혼자 수행 | 개인 입력 영역 |
| 개인교사+AI | individual_ai | 교사가 AI 도움 받아 수행 | 개인 + AI 패널 |
| 교사팀 협의 | team | 팀원들이 함께 논의 | 공유 캔버스 |
| 교사팀+AI | team_ai | 팀이 AI 도움 받아 수행 | 공유 캔버스 + AI |
| AI 단독 | ai_only | AI가 자동 수행 | AI 자동 생성 표시 |

---

## 3. 행위자 모델

### 5개 행위자 열과 UI/UX

```
┌─────────────────────────────────────────┐
│ 세부절차: T-1-1 비전설정                    │
├─────────────────────────────────────────┤
│ Step 01 [안내] AI가 비전 설정 방법 안내      │
│   → AI 단독: 자동 표시                     │
│                                         │
│ Step 02 [안내] 에이전트 소개                │
│   → AI 단독: 자동 표시                     │
│                                         │
│ Step 03 [안내] 비전 설정 안내               │
│   → AI 단독: 자동 표시                     │
│                                         │
│ Step 04 [판단] 개인 비전 구상               │
│   → 개인교사: 개인 입력란                   │
│                                         │
│ Step 05 [생성] 비전 정교화                  │
│   → 개인+AI: AI가 비전 초안 정교화 제안      │
│   → 수락/편집/거부 버튼                     │
│                                         │
│ Step 06 [협의] 교육목적 논의                │
│   → 교사팀: 공유 토론 영역                  │
│                                         │
│ Step 07 [생성] 공통 비전 후보               │
│   → 팀+AI: AI가 공통 비전 후보 3개 제시      │
│   → 수락/편집/거부 버튼                     │
│                                         │
│ Step 08 [협의] 팀 공통 비전 설정            │
│   → 교사팀: 최종 결정                      │
│                                         │
│ Step 09 [기록] 저장 및 리포트               │
│   → AI 단독: 확정 내용 자동 저장            │
└─────────────────────────────────────────┘
```

---

## 4. constants.js 재설계안

```javascript
// shared/constants.js 재설계 — 핵심 구조만

export const PHASES = {
  PREP: { id: 'prep', name: '준비', order: 0 },
  T: { id: 'T', name: '팀준비', order: 1 },
  A: { id: 'A', name: '분석', order: 2 },
  Ds: { id: 'Ds', name: '설계', order: 3 },
  DI: { id: 'DI', name: '개발/실행', order: 4 },
  E: { id: 'E', name: '평가', order: 5 },
};

export const PROCEDURES = {
  'prep':   { phase: 'prep', name: '학습자/맥락 정보 제공', order: 0 },
  'T-1-1':  { phase: 'T', name: '비전설정', order: 1 },
  'T-1-2':  { phase: 'T', name: '수업설계 방향 수립', order: 2 },
  'T-2-1':  { phase: 'T', name: '역할 분담', order: 3 },
  'T-2-2':  { phase: 'T', name: '팀 규칙', order: 4 },
  'T-2-3':  { phase: 'T', name: '팀 일정', order: 5 },
  'A-1-1':  { phase: 'A', name: '주제 선정 기준', order: 6 },
  'A-1-2':  { phase: 'A', name: '주제 선정', order: 7 },
  'A-2-1':  { phase: 'A', name: '핵심 아이디어 및 성취기준 분석', order: 8 },
  'A-2-2':  { phase: 'A', name: '통합된 수업 목표', order: 9 },
  'Ds-1-1': { phase: 'Ds', name: '평가 계획', order: 10 },
  'Ds-1-2': { phase: 'Ds', name: '문제 상황', order: 11 },
  'Ds-1-3': { phase: 'Ds', name: '학습 활동 설계', order: 12 },
  'Ds-2-1': { phase: 'Ds', name: '지원 도구 설계', order: 13 },
  'Ds-2-2': { phase: 'Ds', name: '스캐폴딩 설계', order: 14 },
  'DI-1-1': { phase: 'DI', name: '개발 자료 목록', order: 15 },
  'DI-2-1': { phase: 'DI', name: '수업 기록', order: 16 },
  'E-1-1':  { phase: 'E', name: '수업 성찰', order: 17 },
  'E-2-1':  { phase: 'E', name: '수업설계 과정 성찰', order: 18 },
};

export const ACTION_TYPES = {
  guide:    { name: '안내', icon: 'BookOpen', color: 'blue' },
  judge:    { name: '판단', icon: 'Brain', color: 'purple' },
  generate: { name: '생성', icon: 'Sparkles', color: 'amber' },
  discuss:  { name: '협의', icon: 'MessageCircle', color: 'green' },
  share:    { name: '공유', icon: 'Share2', color: 'cyan' },
  adjust:   { name: '조정', icon: 'Sliders', color: 'orange' },
  check:    { name: '점검', icon: 'CheckCircle', color: 'emerald' },
  record:   { name: '기록', icon: 'Save', color: 'gray' },
};

export const ACTOR_COLUMNS = {
  individual:    { name: '개인교사', hasAI: false, isTeam: false },
  individual_ai: { name: '개인교사+AI', hasAI: true, isTeam: false },
  team:          { name: '교사팀', hasAI: false, isTeam: true },
  team_ai:       { name: '교사팀+AI', hasAI: true, isTeam: true },
  ai_only:       { name: 'AI 단독', hasAI: true, isTeam: false },
};
```

---

## 5. 보드 스키마 재설계안

현재 24개 보드타입 → 16개 절차별 구조화 양식으로 재설계.

각 절차의 보드는 **해당 절차의 최종 산출물**을 구조화한 JSONB:

| 절차 | 보드 산출물 | 핵심 필드 |
|------|-----------|----------|
| prep | 학습자 맥락 | grade, digitalLiteracy, gender, multicultural, prevContext |
| T-1-1 | 팀 비전 | individualVisions[], commonVision |
| T-1-2 | 수업설계 방향 | keywords[], directions[], visionAlignment |
| T-2-1 | 역할 분담 | roles[{name, assignee, strengths}] |
| T-2-2 | 팀 규칙 | rules[], coreRules[] |
| T-2-3 | 팀 일정 | schedule[{date, activity, deadline}] |
| A-1-1 | 주제선정 기준 | criteria[{name, description, weight}] |
| A-1-2 | 선정 주제 | candidates[], selectedTopic, comparisonTable, clusterMap |
| A-2-1 | 성취기준 분석 | standards[{code, knowledge, process, values}], connectionMap |
| A-2-2 | 통합 수업목표 | subObjectives[], integratedObjectives[], alignment |
| Ds-1-1 | 평가 계획 | assessments[{type, content, method, rubric}] |
| Ds-1-2 | 문제 상황 | candidates[], selected, realWorldData, audience |
| Ds-1-3 | 학습 활동 | activities[{order, description, subject, hours}] |
| Ds-2-1 | 지원 도구 | tools[{activity, toolName, usage}] |
| Ds-2-2 | 스캐폴딩 | scaffolds[{activity, type, content}] |
| DI-1-1 | 개발 자료 | materials[{type, subject, assignee, priority, deadline}] |
| DI-2-1 | 수업 기록 | episodes[{timestamp, situation, insight}], transcripts[] |
| E-1-1 | 수업 성찰 | reflections[{subject, whatWorked, improvements}] |
| E-2-1 | 과정 성찰 | processReflections[{phase, goal, result, improvement}] |
