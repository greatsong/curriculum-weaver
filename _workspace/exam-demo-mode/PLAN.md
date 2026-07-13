# 시연 모드 — 구현 착수 체크리스트 (PLAN)

> 설계 근거: `DESIGN.md`. 구현은 사용자 승인 후. 모든 분기는 `mode==='demo'` opt-in(협력 모드 기본값 불변).

## Stage 0 — 골격 · 격리
- [ ] `client/src/App.jsx` — `/demo-prep` 라우트 추가
- [ ] `client/src/pages/WorkspacesPage.jsx` — "임용 실연 준비" 진입 버튼(demo/graph/data 버튼군 옆)
- [ ] 서버: `ensurePersonalWorkspace(user)` — owner 단독 워크스페이스 idempotent 생성(auth.js dev유저 패턴 참고), 표식(workflow_config.personal=true)
- [ ] 서버: demo 프로젝트 부트스트랩 — createProject(personalWsId, { learner_context:{ demo:true } })
- [ ] `client/src/pages/ProjectPage.jsx` — `mode` 판별 + 팀 UI 조건부 은닉 스텁(NicknameModal·소켓 join·팀 커서·ProcedureNav)
- [ ] `WorkspacesPage` 목록에서 personal 워크스페이스 숨김/필터
- [ ] 검증: 기존 협력 프로젝트 회귀 없음 + demo 프로젝트 생성·로드

## Stage 1 — 교수학습과정안 보드 (①②)
- [ ] `shared/constants.js` — BOARD_TYPES/BOARD_TYPE_LABELS에 demo_lesson_plan→lesson_plan 추가(기존 엔트리 미변경)
- [ ] `shared/boardSchemas.js` — BOARD_SCHEMAS.lesson_plan 정의(§4.2 stages table + boardPlan + timeTotalCheck + objectiveAlignmentCheck)
- [ ] 프론트: 얕은 스텝 네비(①성취기준 ②과정안 …), 단일교과 선택 안내 화면
- [ ] `server/services/aiAgent.js` buildSystemPrompt — `mode` 인자 + 협력UP(858)·팀비전(893)·융합가드(950)·링크(969)·advance(793) demo 분기
- [ ] `shared/constants.js` — AI_ROLE_PRESETS.coach + PROMPT_TONE_INSTRUCTIONS.coaching
- [ ] `buildProcedureIntroResponse`(aiAgent.js:1040) — tone 인자 + 협력UP 블록 demo 제거
- [ ] 검증: 성취기준→보드작성→ai_suggestion 수락, 융합가드 미발동, demo_ 코드 스크럽 무해

## Stage 2 — 발문 · 판서 (③) ✅ 완료 (2026-07-13)
- [x] lesson_plan keyQuestions/boardPlan 필드(스키마는 Stage 1에서 완비) + "발문 생성"·"판서 스케치" 트리거 버튼(ProcedureCanvas `DemoGenerateToolbar`, chat 프롬프트)
- [x] buildCoherenceContext(aiAgent.js) `mode` 인자 + `buildDemoCoherenceContext`로 목표-활동-형성평가 정합성 demo 매핑
- [x] 헤더 정리: demo에서 "여기부터 시뮬레이션"·"공유" 은닉("보고서" 유지)
- [x] 검증: 발문/판서 생성·정합성 점검 출력(실채팅), 봉인 36/36·서버 180/180, 협력 회귀 없음

## Stage 3 — 대본 · 타이밍 (④)
- [ ] BOARD_TYPES/SCHEMAS demo_script 추가(segments table + totalDurationCheck)
- [ ] 타이밍 합계(10~15분) 검증 UI 로직
- [ ] 검증: 대본 생성, 구간 합계 경고

## Stage 4 — 루브릭 + 보고서 (⑤)
- [ ] BOARD_TYPES/SCHEMAS demo_rubric 추가(items table + overallComment)
- [ ] 교과별 채점 관점 기준 데이터셋
- [ ] 채점관 렌즈 토글(examinerLens) UI + 프롬프트 주입
- [ ] `server/services/reportGenerator.js` — collectReportData/generateExecutiveSummary/generateHTML/generateMarkdown mode='demo' 분기(§6)
- [ ] `server/routes/report.js` — mode 파라미터 전달
- [ ] 검증: 셀프체크→보고서(교수학습과정안·실연 준비 요약) HTML/MD

## 상시 (모든 Stage)
- [ ] 공유 파일(constants/boardSchemas)은 **추가만**, 기존 엔트리 불변
- [ ] 각 Stage 종료 시 협력 모드 회귀 스모크
- [ ] 어휘격리 봉인 테스트 통과 유지(완화 금지)
