# reference/02 — 절차 체계·보드 스키마·관문 함수 (constants.js / boardSchemas.js)

## 절차 체계 (shared/constants.js)
- 6 Phase (`PHASES`, 15행): prep, T(팀준비), A(분석), Ds(설계), DI(개발/실행), E(평가)
- 19 Procedure (`PROCEDURES`, 47행): prep + 18 세부절차. 각 엔트리 `{phase, name, description, order, displayCode?}`
- 128 Step (procedureSteps.js, 미열람 — 절차별 5~9 스텝)
- **displayCode 규칙**: 내부코드(T-1-1)는 절대 사용자 노출 금지. 화면·저장본은 displayCode(T-1). `replaceInternalProcedureCodes`(251행) 정규식 `/\b(?:T|A|Ds|DI|E)-\d+-\d+\b/g`가 최종 관문.

### 관문 함수 (스킵 인식 단일 경로)
- `UNSKIPPABLE_PROCEDURES` (196행): 코어 5 = T-1-1·T-2-1·A-1-2·A-2-1·A-2-2 (보고서·AI 하드코딩 참조)
- `isProcedureSkippable`, `getActiveProcedures`, `getNextActiveProcedure` — **PROCEDURE_LIST 직접 순회 금지, 반드시 경유** (grep 감사)
- 어휘 격리: `getProcedureDisplayCode`, `getProcedureLabel`, `normalizeProcedureCode`(관용 파서 T-2↔T-1-2), `DISPLAY_TO_INTERNAL`(전단사 봉인 테스트)

## 보드 스키마 (shared/boardSchemas.js, 513줄)
- `BOARD_TYPES`(constants 380행): 절차코드 → 보드타입 1:1 (19개)
- `BOARD_SCHEMAS`(boardSchemas 25행): 보드타입 → `{fields[], empty}`. field type = text/textarea/number/list/tags/table/select/json
- 헬퍼: `getBoardSchemaForProcedure`, `getBoardSchemaForPrompt`(AI 프롬프트 텍스트화), `createEmptyBoard`
- **기존 보드는 융합 협력 설계용**: standards_analysis(교과별 3차원), integrated_objectives(통합목표), problem_situation(실데이터 문제), scaffolding_design 등. **임용식 교수학습과정안(도입-전개-정리·발문·판서·형성평가·시간배분)은 없음.**

## 보드 타입 추가가 자연스러운가? → **예, 매우 자연스럽다**
새 교수학습과정안 보드는 다음 4곳만 추가하면 파이프라인이 자동 인식:
1. `BOARD_TYPES['<proc>'] = 'lesson_plan'` (매핑)
2. `BOARD_TYPE_LABELS['lesson_plan'] = '교수학습과정안'` (라벨)
3. `BOARD_SCHEMAS['lesson_plan'] = {fields, empty}` (스키마) — table/list로 도입·전개·정리 단계, 발문/판서/형성평가 컬럼 표현 가능
4. (선택) `PROCEDURE_ACTIVITIES`, procedureGuide.js 가이드
→ 그러면 `getBoardSchemaForPrompt`가 AI 프롬프트에 자동 주입, DesignBoard/ProcedureCanvas 렌더러가 field type 기반으로 자동 렌더(범용 필드 렌더러).
- **단, 절차코드가 반드시 있어야 보드가 붙음** (BOARD_TYPES 키). 절차 없는 자유 편집 모드면 보드-절차 결합을 우회하는 별도 렌더 필요.

## AI 역할 프리셋 (constants 528행)
- 4종: recorder/advisor/facilitator/codesigner → promptTone(minimal/reserved/balanced/proactive) → `PROMPT_TONE_INSTRUCTIONS`(586행)가 시스템 프롬프트에 주입.
- **시연 모드 톤은 여기 프리셋 1종 추가가 가장 싼 경로** (예: `examiner` promptTone). 단 인트로(buildProcedureIntroResponse)는 프리셋 미반영 — 별도 처리.

## hiddenProcedures 선례 (주의)
- workspaces.workflow_config = `{ hiddenProcedures, procedureOrder }` (00010 migration 63행 COMMENT).
- **그러나 CLAUDE.md 명시: hiddenProcedures 설정 UI는 "소비처 없는 유령 설정"** (WorkspaceDetailPage·HostSetupWizard에 UI만 있고 실제 절차 필터링 안 함). 시연 모드가 이걸 재활용하려 하면 안 됨 — 실동작하는 것은 `project_procedure_skips` 테이블(00023) 기반 스킵 시스템뿐.
