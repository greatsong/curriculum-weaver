# 시나리오 2: AI와 공존하는 사회 — 윤리적 AI 활용

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **제목** | AI와 공존하는 사회 — 윤리적 AI 활용 |
| **참여 교과** | 정보, 도덕, 국어 (3교과 융합) |
| **대상 학년** | 고등학교 2학년 |
| **총 차시** | 10차시 (정보 4, 도덕 3, 국어 3) |
| **핵심 역량** | 디지털 리터러시, 윤리적 판단력, 비판적 사고, 논증적 표현 |

## 참여 교사

| 교사 | 교과 | 전문 영역 | 역할 |
|------|------|-----------|------|
| 최교사 | 정보 | AI 기술 원리, 머신러닝 기초, AI 서비스 체험 | 팀장 / 기술 전문가 |
| 한교사 | 도덕 | 윤리적 프레임워크, 기술 윤리, 책임의 문제 | 윤리 전문가 |
| 송교사 | 국어 | 논증적 글쓰기, 토론, 미디어 리터러시 | 표현/소통 전문가 |

## 주요 산출물

1. **팀 비전**: AI 기술의 올바른 활용과 윤리적 판단력을 갖춘 디지털 시민 양성
2. **선정 주제**: AI가 만드는 콘텐츠, 누구의 책임인가? (딥페이크, AI 생성 글, 저작권)
3. **문제 상황**: 학교 신문에 AI가 작성한 기사가 실렸다 — 학생의 글인가 AI의 글인가?
4. **학습 활동**: AI 서비스 체험 -> 윤리적 분석 -> 토론 -> 논증문 작성
5. **평가**: 토론 평가 + 논증문 평가 + AI 윤리 가이드라인 제작 평가

## 시뮬레이션 파일 목록

| 파일 | 설명 |
|------|------|
| `workflow.md` | 전체 16+1 절차 워크플로우 (prep ~ E-2-1) |
| `chat-samples.md` | 4개 핵심 절차 AI 대화 샘플 |
| `boards.json` | 전체 절차별 보드 데이터 (JSON) |
| `final-report.md` | 최종 수업설계 리포트 |

## 발견된 이슈

### 1. PROCEDURES에 정의된 절차 수 불일치 (경미)
- `constants.js` 주석에 "16+1 = 17개"라고 명시하지만, 실제로 `PROCEDURES` 객체에는 **19개** 키가 존재한다 (prep + T-1-1 ~ E-2-1 = 19개).
- 원인: prep(1) + T(5) + A(4) + Ds(5) + DI(2) + E(2) = 19개. "16+1"은 prep을 1로 세고 나머지 16개로 세야 하지만, 실제로 나머지가 18개(T:5 + A:4 + Ds:5 + DI:2 + E:2)이다.
- **수정 제안**: 주석을 "18+1 = 19개"로 변경하거나, PROCEDURES 키 수를 재확인할 것.

### 2. PROCEDURE_STEPS에 prep 스텝 미정의 (설계 의도)
- `PROCEDURE_STEPS`에 `'prep'` 키가 없다. 주석에 "별도 스텝 없이 보드 입력으로만 구성"이라고 설명되어 있으므로, `getStepsForProcedure('prep')`는 빈 배열을 반환한다.
- 이것은 설계 의도이나, prep 절차의 스텝이 없으면 워크플로우 UI에서 prep 상태 추적이 다른 절차와 불일치할 수 있다.

### 3. boardSchemas.js의 일부 필드 타입과 PROCEDURE_STEPS boardField 매핑 검증
- 모든 절차의 boardField 값이 해당 보드 스키마의 필드명과 일치하는지 확인 완료. **불일치 없음**.
- `T-1-1`의 boardField: `individualVisions`, `commonVisionCandidates`, `commonVision` -> `team_vision` 스키마에 모두 존재.
- `A-1-2`의 boardField: `candidates`, `comparisonTable`, `selectedTopic`, `visionCriteriaCheck` -> `topic_selection` 스키마에 모두 존재.
- 나머지 절차도 동일하게 검증 완료.

### 4. ACTION_TYPES와 PROCEDURE_STEPS의 actionType 일치 여부
- 모든 스텝의 `actionType` 값이 `ACTION_TYPES` 키에 존재하는지 확인 완료. **불일치 없음**.
- 사용된 actionType: guide, judge, generate, discuss, share, adjust, check, record (8종 모두 사용됨).

### 5. ACTOR_COLUMNS과 PROCEDURE_STEPS의 actorColumn 일치 여부
- 모든 스텝의 `actorColumn` 값이 `ACTOR_COLUMNS` 키에 존재하는지 확인 완료. **불일치 없음**.
- 사용된 actorColumn: individual, individual_ai, team, team_ai, ai_only (5종 모두 사용됨).

### 6. BOARD_TYPES 매핑 수 (19개) vs BOARD_SCHEMAS 수 (19개)
- 1:1 대응 확인 완료. **불일치 없음**.

### 결론
- 심각한 스키마 버그는 발견되지 않았다.
- 이슈 #1(절차 수 주석)은 경미한 문서 오류로, 기능에 영향 없음.
- 이슈 #2(prep 스텝 미정의)는 설계 의도이며, UI 처리에서 별도 분기가 필요할 수 있음.
