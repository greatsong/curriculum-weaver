# 시연 모드(임용 2차 수업 실연 준비) — 설계 문서

> 상태: 설계(3단계). 구현 전. 현재 브랜치 `fix/procedure-code-isolation` 유지, 코드 무수정.
> 전제: 코디네이터가 확정한 4개 결정(코치형 AI · Supabase+개인 워크스페이스 · 절차 없는 자유편집+교수학습과정안 보드 · 신규기능 5개 전부).
> 원자료: `_workspace/exam-demo-mode/reference/01~03*.md`

---

## 1. 개요 · 목표 · 비목표

### 무엇인가
임용고시 2차 "수업 실연"을 준비하는 **예비교사 1인**이, 단일 교과 한 차시를 10~15분 모의수업으로 실연하기 위한 준비를 돕는 모드. 기존 커리큘럼 위버(교사팀 융합 협력 설계 플랫폼) **안에 얹는 별도 진입 모드**이며 새 앱이 아니다. 성취기준 검색·AI 공동설계자·정합성 점검·자료 분석·보고서 출력 파이프라인을 그대로 재사용하되, 팀·융합 전제를 은닉/재해석한다.

### 목표
- 1인이 로그인 후 **워크스페이스/초대/닉네임 계층 없이** 즉시 시연 준비 프로젝트를 시작.
- 성취기준·단원 선택 → **교수학습과정안(도입-전개-정리 + 발문 + 판서 + 형성평가 + 시간배분)** 작성 → 발문/판서 다듬기 → 실연 대본·타이밍 → 채점 관점 셀프체크 → 보고서 출력.
- AI는 **코치형**: 격려 기반 스파링 + 요청 시 채점관 관점 피드백(강도 토글).

### 비목표
- 팀 협업·실시간 공동편집·초대·역할배분·융합 주제 탐색·3D 교과 연결(시연 모드에서 전부 비노출).
- 실연 자체의 실시간 판정(발화 인식/영상 채점)은 범위 밖. 텍스트 기반 준비물까지만.
- **기존 협력 설계 모드의 어떤 동작도 변경하지 않는다**(격리 보장 — §9).
- 신규 절차 코드 도입 금지(어휘격리·코어절차 하드코딩 위험 회피 — §9).

---

## 2. 전체 아키텍처 — 기존 위에 얹는 방식

### 2.1 `mode='demo'` 플래그가 흐르는 경로
```
[진입] /demo-prep (신규 라우트)
  └─ ensurePersonalWorkspace(user)  ← owner 단독 워크스페이스 idempotent 생성
       └─ createProject(personalWsId, { mode:'demo', ... })  ← projects에 시연 표식
            └─ designs (procedure_code = 'demo_lesson_plan' 등 시연 보드)
                 └─ POST /api/chat/message { mode:'demo' } → buildSystemPrompt({mode:'demo'})
                      └─ GET /api/report/:id?mode=demo → collectReportData → generateHTML(demo 분기)
```

### 2.2 시연 표식의 저장 위치 (신규 테이블 불필요)
- **`projects` 테이블에 표식을 얹는다.** 두 가지 방식 중 택1:
  - (권장) `projects.learner_context` JSONB에 `{ demo: true, examSubject, unit }` 저장 — **migration 불필요**. 이미 jsonb 자유 필드(00010 schema 104행).
  - (대안) `projects.mode TEXT DEFAULT 'collab'` 컬럼 신규 — 명시적이나 migration 1건 필요(00022가 project_source 추가한 선례 있음). **MVP는 jsonb 방식으로 시작, 안정화 후 컬럼 승격 검토.**
- **개인 워크스페이스**: 기존 `workspaces`(owner_id)+`members`(role='owner') 그대로. 신규 스키마 0건. `ensurePersonalWorkspace`는 `auth.js`의 dev 유저 idempotent 생성 패턴(캐시+upsert)과 동일 기법 재사용.

### 2.3 재사용/은닉/신설 요약
| 레이어 | 재사용(그대로) | 재해석(분기) | 신설 |
|--------|--------------|-------------|------|
| DB | workspaces·members·projects·designs·messages·project_standards·curriculum_standards | projects.learner_context.demo 표식 | BOARD_TYPES/BOARD_SCHEMAS 엔트리(코드 파일, DB 아님) |
| 서버 | standards 검색·project_standards·materials 분석·chat SSE·report | buildSystemPrompt(mode)·collectReportData(mode)·buildProcedureIntroResponse(tone) | ensurePersonalWorkspace·demo 프로젝트 부트스트랩·발문/판서/대본/루브릭 생성 엔드포인트(또는 기존 chat 재사용) |
| 프론트 | 성취기준 탐색기·ChatPanel·자료패널·보고서 뷰·범용 보드 필드 렌더러 | ProjectPage(팀 UI 은닉)·ProcedureCanvas(readOnly/skip 무관) | DemoPrepPage(얕은 스텝 네비)·교수학습과정안 보드 뷰·대본/타이밍 UI·루브릭 체크 UI |

---

## 3. 화면 흐름 (UX)

진입점: `/demo-prep` (App.jsx `client/src/App.jsx:192~` 라우트 추가). WorkspacesPage(`client/src/pages/WorkspacesPage.jsx`)의 버튼 그룹(demo/graph/data 옆)에 "임용 실연 준비" 진입 버튼 추가.

| # | 화면 | 재사용 | 은닉 | 신설 |
|---|------|--------|------|------|
| 0 | **진입/부트스트랩** | auth 세션 | 워크스페이스 목록·초대·닉네임 모달 | ensurePersonalWorkspace + demo 프로젝트 자동 생성 → 바로 §1 화면으로 |
| 1 | **성취기준·단원 선택** | 성취기준 탐색기(`StandardSearch`, `/api/standards/search` 공개), project_standards 담기 | 융합 그래프·"다른 교과 추가" 유도 | 단일교과 선택 안내 카피, 단원/차시 입력 필드 |
| 2 | **교수학습과정안 작성** | ProcedureCanvas 범용 필드 렌더러, `<ai_suggestion>` 자동 채움, ChatPanel | ProcedureNav(19절차 트리)·팀 커서·스킵 버튼 | 얕은 스텝 네비(①②③), `lesson_plan` 보드 뷰(도입-전개-정리 table) |
| 3 | **발문·판서 다듬기** | 동일 ChatPanel/보드(같은 보드의 필드 or 하위 보드) | — | 발문 생성/판서 스케치 필드 + AI "발문 생성" 프롬프트 |
| 4 | **실연 대본·타이밍** | ChatPanel(대본 생성) | — | `demo_script` 보드(대본 텍스트 + 구간별 분(分) 배분 + 합계 검증) |
| 5 | **채점 관점 셀프체크** | ChatPanel(채점관 톤) | — | `demo_rubric` 보드(루브릭 항목 체크 + AI 자가진단 코멘트) |
| 6 | **보고서 출력** | `/api/report/:id/{html,md,preview}`, 보고서 뷰어 | 융합 주제·통합목표 요약 | collectReportData(mode='demo') 교수학습과정안·실연 준비 요약 |

- 화면 2~5는 **하나의 프로젝트 안에서 얕은 탭/스텝**으로 전환(ProjectPage 2단 레이아웃 재사용: 좌측 보드 + 우측 ChatPanel). ProcedureNav 대신 3~5스텝 가로 스텝바를 신설.
- ProjectPage(`client/src/pages/ProjectPage.jsx:156`)는 `mode==='demo'`일 때: NicknameModal(47행)·소켓 join(382행)·팀 커서 PATCH(459행 주변)·ProcedureNav(728행)를 조건부 미마운트. ProcedureCanvas는 `readOnly=false, memberRole='owner'`로 그대로.

---

## 4. 데이터 모델

### 4.1 신규 BOARD_TYPES · BOARD_SCHEMAS (코드 파일; DB migration 아님)
`shared/constants.js`의 `BOARD_TYPES`(380행)와 `shared/boardSchemas.js`의 `BOARD_SCHEMAS`(25행)에 시연 전용 엔트리 추가. **주의: 여기 키는 절차코드**다. 시연은 신규 절차코드를 PROCEDURES에 안 넣으므로, 시연 보드는 `PROCEDURES` 밖의 **자립 코드**(예: `demo_lesson_plan`)를 쓴다.

- 검증된 안전성: `designs.procedure_code`는 free-form TEXT(00010 schema 121행). 서버 `upsertDesign`(supabaseService.js:361)·클라 `procedureStore.js:190`(`BOARD_TYPES[code] || code`)가 코드를 board_type으로 직접 폴백하므로 PROCEDURES 미등록 코드도 저장/로드된다. 또한 `demo_lesson_plan`은 어휘격리 정규식 `/\b(?:T|A|Ds|DI|E)-\d+-\d+\b/`(constants.js:253)에 **매칭되지 않아** 스크럽 안전.
- 단, 필드 렌더/프롬프트화를 위해 `BOARD_TYPES[code]`와 `BOARD_SCHEMAS[boardType]`는 반드시 채워야 `getBoardSchemaForProcedure`(boardSchemas.js:455)·`getBoardSchemaForPrompt`(467행)가 동작.

제안 매핑:
```
BOARD_TYPES: { 'demo_lesson_plan':'lesson_plan', 'demo_script':'demo_script', 'demo_rubric':'demo_rubric' }
BOARD_TYPE_LABELS: { lesson_plan:'교수학습과정안', demo_script:'실연 대본·타이밍', demo_rubric:'채점 셀프체크 루브릭' }
```

### 4.2 `lesson_plan` 보드 스키마 (도입-전개-정리 + 발문 + 판서 + 형성평가 + 시간배분)
발문·판서·형성평가는 **별도 보드로 쪼개지 않고 lesson_plan 보드의 필드/컬럼으로 통합**한다(교수학습과정안이 원래 한 장의 표이기 때문. 재사용·정합성 점검에도 유리).
```
fields:
  - unit/lesson (text)         단원·차시·차시목표
  - objectives (list)          본시 학습목표 (성취기준 파생)
  - stages (table, 필수)       ─ 교수학습 흐름
      columns: [ stage(도입/전개/정리 select), minutes(number), teacherActivity(교사활동),
                 studentActivity(학생활동), keyQuestions(핵심 발문), materials(자료·매체),
                 assessment(형성평가), notes(유의점) ]
  - boardPlan (textarea)       판서 계획(구조/배치) — 텍스트 스케치
  - timeTotalCheck (textarea)  시간배분 합계 검증(도입+전개+정리 = 차시 시간)
  - objectiveAlignmentCheck (textarea)  AI 정합성: 목표-활동-평가 정합성(buildCoherenceContext 재사용 대상)
empty: { unit:'', objectives:[], stages:[], boardPlan:'', timeTotalCheck:'', objectiveAlignmentCheck:'' }
```
- 근거: 기존 `learning_activities`(boardSchemas.js:284)·`assessment_plan`(240행)이 이미 table+차시 구조라, 렌더러/AI 제안 경로가 검증됨.

### 4.3 `demo_script`(대본·타이밍) / `demo_rubric`(셀프체크) — 별도 보드
```
demo_script.fields:
  - segments (table): [ segment(구간명), startMin, durationMin, script(실연 대본), delivery(전달 팁) ]
  - totalDurationCheck (textarea): 합계가 10~15분 범위인지 검증
demo_rubric.fields:
  - items (table): [ criterion(채점 관점), selfCheck(충족/부족 select), evidence(근거), improvement(개선) ]
  - overallComment (textarea): AI 채점관 관점 총평
```
- 발문/판서는 lesson_plan에 통합(별도 보드 아님). 대본·루브릭은 실연 특화라 별도 보드(§7에서 신규 비용 명시).

### 4.4 migration 필요 여부 → **MVP는 0건**
- 신규 테이블 0. 신규 컬럼 0(learner_context jsonb 재활용). BOARD_TYPES/BOARD_SCHEMAS는 코드 파일 변경이라 DB 무관.
- 향후 `projects.mode` 컬럼 승격 시에만 migration 1건.

---

## 5. AI 프롬프트 변경점 (`buildSystemPrompt({mode:'demo'})`)

`server/services/aiAgent.js:646` `buildSystemPrompt`에 `mode`(또는 `isDemo`) 파라미터 추가. 섹션별 분기(§reference/01 섹션표 기준):

| 섹션 | 행 | demo 분기 |
|------|----|----------|
| 1 역할 정의 | 695 | **재해석**: "동료 설계 파트너" → "임용 실연을 함께 준비하는 코치". 팀/융합 문구 제거 |
| 1-B 톤 | 709 | **코치 프리셋 주입**(§5.1) |
| 8 총괄원리(협력UP) | 858 | **끔** — 협력 전제(상호의존·인지분산 등)라 1인 무관 |
| 12 팀 비전 | 893 | **끔** — team_vision 보드 없음 |
| 13 성취기준 융합가드 | **950** | **비활성 필수** — 단일교과가 정상. `subjectGroups.size<2`면 교과 추가 유도하는 로직을 `mode!=='demo'` 조건으로 감쌈 |
| 13-B 검증된 링크 | 969 | **끔** — 융합 연결 컨텍스트 불필요 |
| 5 절차 진행 규칙 / `<procedure_advance>` | 793 | 시연은 절차 트랙 없음 → advance XML 생성 안내 제거(자유 편집) |
| 6 보드 스키마 `<ai_suggestion>` | 820 | **재사용** — demo_lesson_plan 등 새 boardType 스키마가 `getBoardSchemaForPrompt`로 자동 주입 |
| 7 정합성 점검 `buildCoherenceContext` | 846 | **재사용/재해석** — targets를 lesson_plan 내부(목표↔활동↔형성평가)로 재정의(getCoherenceTargets에 시연 코드 매핑 추가 or mode 분기) |
| 15 자료 컨텍스트 `buildMaterialsContext` | 989 | **그대로 재사용** — 교과서/지도서 단원 분석 |
| 0·0-B·4·4-B·9 보안·환각방지·프로토콜·제약존중·공통규칙 | | 그대로 |

### 5.1 코치 프리셋 (constants.js:528 AI_ROLE_PRESETS / 586 PROMPT_TONE_INSTRUCTIONS)
- `AI_ROLE_PRESETS`에 `coach` 추가, `PROMPT_TONE_INSTRUCTIONS`에 `coaching` 톤 신설:
  - 기본: 격려·강점 먼저, 실연 흐름/발문/시간배분을 함께 다듬는 스파링.
  - **강도 토글(코치↔채점관)**: UI 토글이 요청 시 프롬프트에 "채점관 관점" 지시 블록을 추가로 주입(예: `examinerLens: true` → "임용 채점 관점에서 감점 요인·개선점을 구체적으로 지적하되 대안을 함께 제시"). 별도 프리셋보다 **동일 coach 프리셋 + examinerLens 파라미터**가 토글 UX에 맞음.
- 근거: 톤 프리셋은 시스템 프롬프트에 문자열 주입만 하므로(1-B 섹션) 최소 변경.

### 5.2 인트로 함수 톤 반영 (`buildProcedureIntroResponse`, aiAgent.js:1040)
- 현재 톤 프리셋 미반영(정적 설계, reference/01 기록). demo 진입 인트로가 코치 톤이 되도록 이 함수에 `aiRole`/`tone` 인자 추가 → systemPrompt(1078행)에 coaching 톤 문자열 주입. 협력UP 5원리 블록(1081행)은 demo에서 제거.

### 5.3 발문·판서·대본·루브릭 생성
- **별도 엔드포인트 신설 없이** 기존 `/api/chat/message` SSE + `<ai_suggestion type="board_update">` 재사용이 원칙. 보드 스키마(§4)가 발문(keyQuestions)·판서(boardPlan)·대본(script)·루브릭(items) 필드를 가지므로, AI가 해당 필드를 채운 board_update 제안 → 교사 수락 경로가 그대로 동작.
- 화면별 "발문 생성"·"대본 생성" 버튼은 미리 짜인 사용자 프롬프트를 chat으로 보내는 얇은 트리거(신규 라우트 불필요).

---

## 6. reportGenerator 시연용 분기

`server/services/reportGenerator.js`:
- `collectReportData`(57행): `designMap`이 코어 코드(T-1-1·A-1-2·A-2-2 등) 하드코딩 참조(96·228·234·240행). demo 프로젝트는 이 코드들이 없으므로 **`mode==='demo'` 분기**로 designMap 참조 대상을 `demo_lesson_plan`/`demo_script`/`demo_rubric`로 교체.
- `generateExecutiveSummary`(223행): 융합 주제(topicDesign)·통합목표(objDesign) 하드코딩 → demo에서는 **단일교과 교수학습과정안 요약**(단원·차시·본시목표·시간배분·핵심 발문 수·실연 총시간)으로 대체하는 `generateDemoSummary` 신설.
- `generateHTML`(266행)/`generateMarkdown`(860행): 범용 보드 렌더러(`renderBoardContent` 157행)는 새 boardType도 렌더 가능 → 본문은 재사용. 상단 요약·진행률 분모만 demo 분기. 진행률은 `getActiveProcedures`(135행) 대신 demo 보드 3장 기준으로 계산.
- `procedureStatus`(115행): PROCEDURE_LIST 순회 대신 demo 보드 목록 순회로 분기.

---

## 7. 기능별 재활용 vs 신규 비용

| # | 기능 | 재사용 코드 | 신규 코드 | 난이도 |
|---|------|-----------|----------|--------|
| ① | 간소 진입 | auth, createProject/supabaseService.js:224, WorkspacesPage 버튼 | ensurePersonalWorkspace(auth.js dev유저 패턴 복제), /demo-prep 라우트, ProjectPage 팀UI 조건부 은닉 | **하** |
| ② | 교수학습과정안 보드 | ProcedureCanvas 범용 렌더러, ai_suggestion 경로, boardSchemas 패턴 | BOARD_TYPES/SCHEMAS 3엔트리, 얕은 스텝 네비, lesson_plan 뷰(선택) | **하~중** |
| ③ | 발문·판서 생성기 | chat SSE, ai_suggestion board_update | lesson_plan 필드(keyQuestions/boardPlan) + 생성 트리거 버튼·프롬프트 | **하** |
| ④ | 실연 대본·타이밍 | chat SSE, 보드 렌더 | demo_script 보드 + 타이밍 합계 검증 UI(신규 로직·거의 신규) | **중** |
| ⑤ | 채점 셀프체크 루브릭 | chat SSE(채점관 톤), 보드 렌더 | demo_rubric 보드 + 채점 관점 데이터셋(교과별 루브릭 기준) + report 분기 | **중~상** |

- ④⑤는 **재활용 자산이 적다**(실연 타이밍 검증·채점 루브릭은 기존에 대응 개념 없음). 순수 신규 비용이 커서 로드맵 후반(§8)에 배치.

---

## 8. 구현 순서 (로드맵)

> 각 단계는 독립 검증 가능한 세로 슬라이스. 저비용·고재활용(①②③) 먼저, 신규 비용(④⑤) 나중.

**Stage 0 — 골격/격리 (검증: 기존 협력 모드 회귀 없음)**
- `/demo-prep` 라우트 + WorkspacesPage 진입 버튼. ensurePersonalWorkspace + demo 프로젝트 부트스트랩.
- ProjectPage `mode==='demo'` 분기 뼈대(팀 UI 은닉 스텁).
- 검증: 협력 모드 프로젝트 정상 동작(회귀), demo 프로젝트 생성·로드.

**Stage 1 — 교수학습과정안 보드 (①②)**
- BOARD_TYPES/BOARD_SCHEMAS `lesson_plan` 추가, 얕은 스텝 네비, 성취기준 선택 화면(단일교과 안내).
- buildSystemPrompt `mode='demo'` 분기(협력UP/팀비전/융합가드 off), 코치 프리셋.
- 검증: 성취기준 선택 → 보드 작성 → AI board_update 제안·수락, 융합가드 미발동, 어휘격리 스크럽 무해(demo_ 코드).

**Stage 2 — 발문·판서 (③)**
- lesson_plan 발문/판서 필드 + 생성 트리거. buildCoherenceContext 목표-활동-평가 정합성 재사용.
- 검증: 발문 생성·판서 스케치·정합성 점검 출력.

**Stage 3 — 대본·타이밍 (④)**
- demo_script 보드 + 타이밍 합계(10~15분) 검증 UI.
- 검증: 대본 생성, 구간 합계 경고 동작.

**Stage 4 — 루브릭 + 보고서 (⑤ + report)**
- demo_rubric 보드 + 채점 관점 기준. collectReportData/generateHTML demo 분기, 채점관 렌즈 토글.
- 검증: 셀프체크 → 보고서 HTML/MD가 교수학습과정안·실연 준비 요약으로 출력.

**인트로 톤 반영**은 Stage 1에서 buildProcedureIntroResponse 인자 추가와 함께.

---

## 9. 리스크 · 완화

1. **어휘격리 규칙 위반** — 시연 보드 코드가 `T|A|Ds|DI|E-\d+-\d+` 형식이면 스크럽·displayCode 관문에 걸림. **완화**: 시연 코드는 `demo_*` 스네이크형만 사용(정규식 미매칭 확인함, constants.js:253). PROCEDURES에 등록하지 않아 DISPLAY_TO_INTERNAL 전단사 봉인 테스트(`vocabularyIsolation.test.js`)도 무영향. 봉인 테스트 완화 금지.
2. **코어 절차 하드코딩** — reportGenerator designMap·UNSKIPPABLE_PROCEDURES가 T-1-1 등 존재를 가정. demo 프로젝트엔 없음. **완화**: reportGenerator에 mode 분기(§6). demo 프로젝트는 스킵 시스템·UNSKIPPABLE 게이트를 아예 안 태움(절차 트랙 미사용).
3. **hiddenProcedures 유령설정 재활용 유혹** — workflow_config.hiddenProcedures는 소비처 없는 유령(CLAUDE.md·reference/02). **완화**: 시연 모드는 절대 이걸 쓰지 않고, ProjectPage 조건부 렌더로 UI 은닉.
4. **팀 전제 UI 은닉 시 누락 지점** — ProjectPage의 NicknameModal(47행)·소켓 join(382행)·팀 커서 current_procedure PATCH·전파(459행 주변)·memberRole 분기가 팀 전제. demo에서 미은닉 시 "닉네임 입력 강제"·"소켓 join 실패"·"존재하지 않는 절차 커서" 버그. **완화**: `mode==='demo'` 단일 게이트로 이 4개를 함께 끄고, ProcedureCanvas는 memberRole='owner'·readOnly=false 고정.
5. **기존 협력 모드 비회귀(격리 보장)** — buildSystemPrompt·reportGenerator·ProjectPage에 분기를 넣을 때 `mode` 미지정(기존 협력) 경로가 **완전히 기존과 동일**해야 함. **완화**: 모든 분기를 `if (mode==='demo')` opt-in으로만 작성(기본값은 협력). Stage 0에 협력 모드 회귀 검증을 명시. 공유 파일(constants·boardSchemas)은 **추가만** 하고 기존 엔트리 미변경.
6. **개인 워크스페이스 남발** — 사용자마다 워크스페이스가 생기면 협력 워크스페이스 목록에 섞임. **완화**: personal 워크스페이스에 표식(name 규약 or workspaces.workflow_config.personal=true), WorkspacesPage 목록에서 필터/숨김.
7. **성취기준 검색 공개 라우트 의존** — `/api/standards/search`는 requireAuth 없음(reference/03). demo 진입 전 맛보기엔 유리하나, 프로젝트에 담기(`/api/standards/project/:id`)는 requireAuth. **완화**: demo도 로그인 후 담기 전제(결정 2와 일치).

---

## 부록 — 핵심 파일 인덱스
- AI 프롬프트: `server/services/aiAgent.js` (buildSystemPrompt:646, 융합가드:950, 인트로:1040)
- 절차·보드 상수: `shared/constants.js` (BOARD_TYPES:380, AI_ROLE_PRESETS:528, 어휘격리:251)
- 보드 스키마: `shared/boardSchemas.js` (BOARD_SCHEMAS:25, getBoardSchemaForProcedure:455)
- 보고서: `server/services/reportGenerator.js` (collectReportData:57, execSummary:223, generateHTML:266)
- 프로젝트 생성: `server/lib/supabaseService.js` (createWorkspace:85, createProject:224, upsertDesign:361)
- 스키마: `supabase/migrations/00010_rebuild_schema.sql` (projects:97, designs:118, messages:149)
- 프론트: `client/src/pages/ProjectPage.jsx:156`, `WorkspacesPage.jsx`, `components/ProcedureCanvas.jsx:13`, `ProcedureNav.jsx`, `stores/procedureStore.js:190`
