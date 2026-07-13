# 시연 모드 — 진행 로그 (PROGRESS)

> 최신 상태를 항상 위에 기록. 구현 착수 전(설계만 완료).

## 2026-07-13
- 1단계(코드베이스 탐색) 완료 — `reference/01~03*.md` 축적
- 2단계(설계 갈림길) 완료 — 코디네이터가 4개 결정 확정:
  1. AI 톤=코치형(강도 토글) 2. Supabase+개인 워크스페이스 3. 절차 없는 자유편집+교수학습과정안 보드 4. 신규기능 5개 전부
- 3단계(설계 문서) 완료 — `DESIGN.md`, `PLAN.md` 작성
- **다음**: 사용자 승인 대기. 승인 시 Stage 0(골격·격리)부터 착수.

## 구현 로그 (착수 후 기록)

### Stage 0 — 골격·격리 완료 (2026-07-13)
브랜치 `feat/demo-mode` (origin/main=4278dd2 기준). 모든 분기는 `mode/isDemo` opt-in — 협력 모드 기본값 불변.

**신설**
- `client/src/pages/DemoPrepPage.jsx` — 시연 진입점. `POST /api/demo/bootstrap` 호출 → `/workspaces/:ws/projects/:pid`로 replace 이동. StrictMode 이중 effect 가드는 ref만 사용(effect-local cancelled 플래그를 쓰면 navigate가 영영 안 되는 함정 회피 — 실제로 처음 이 버그를 밟고 수정함).
- 서버 `ensurePersonalWorkspace(user)` (`server/lib/supabaseService.js`) — owner 단독 개인 워크스페이스 idempotent 확보. `workflow_config.personal=true` 표식. 프로세스 promise 캐시로 동시 요청 중복 생성 방지(auth.js dev유저 패턴 준용). 신규 스키마 0건.
- 서버 `POST /api/demo/bootstrap` (`server/routes/demo.js`, requireAuth) — 개인 WS 확보 + demo 프로젝트(`learner_context.demo=true`) 확보. 기존 demo 프로젝트 재사용(누적 방지). 응답 `{ workspaceId, projectId }`. 멱등 확인됨(반복 호출 시 동일 ID).

**수정**
- `client/src/App.jsx` — `/demo-prep` 라우트(ProtectedRoute, lazy) 추가.
- `client/src/pages/WorkspacesPage.jsx` — ① "임용 실연 준비" 진입 버튼(사용안내·데모체험 사이) ② 목록에서 personal 워크스페이스 필터(`visibleWorkspaces`).
- `client/src/pages/ProjectPage.jsx` — `const isDemo = currentProject?.learner_context?.demo === true` 단일 게이트로 팀 UI 4종 은닉: NicknameModal 렌더·소켓 join effect·팀 커서 PATCH(handleProcedureChange)·ProcedureNav 렌더. (§9 리스크1·4)

**검증**
- 부트스트랩 멱등: 반복 호출 동일 workspaceId/projectId. 프로젝트 `learner_context={demo:true}`, my_role=owner, 개인 WS `workflow_config.personal=true`.
- 브라우저 시연 경로: /demo-prep → 로딩 → demo 프로젝트 로드. DOM 확인 `procedureNavPresent:false, nicknameModalPresent:false`. 소켓 join 안 함. 콘솔 에러 없음(기존 flex/flexShrink 경고만).
- 목록 필터: 개인 WS "내 시연 준비 공간"은 목록에서 숨김(협력 WS만 노출).
- **협력 모드 회귀 없음**: 팀 프로젝트("기후위기와 지역사회") 진입 시 ProcedureNav(팀준비·분석 등 + 19절차 서브네비)·보드·AI 인트로("[팀준비 > T-1 …] 진입") 모두 정상.
- 봉인 테스트 `vocabularyIsolation.test.js` 32/32 통과(완화 없음).

**미해결 / Stage 1 인계 주의**
- 로컬 검증 환경 함정: 사용자 원본 트리(root)의 dev 서버가 4007을 상시 점유(node --watch 재점유). 워크트리 검증은 server `.env` PORT=4107 + client `.env.local` VITE_API_URL=http://localhost:4107로 우회(둘 다 gitignored, 미커밋). `.claude/launch.json`의 `PORT=4007 npm run dev` 대신 수동 기동 필요.
- Stage 0은 데모 프로젝트가 여전히 협력용 `prep` 절차/보드로 로드됨(ProjectPage 좌측이 "학습자 맥락" 보드). 시연 전용 `demo_lesson_plan` 보드·얕은 스텝 네비는 Stage 1에서. 현재는 팀 UI만 은닉된 골격.
- 소켓 미연결은 코드 게이트로 보장하나, 헤드리스 network 레코더가 소켓 핸드셰이크를 안 잡아 네트워크 로그로는 대조 불가(닉네임/네비 부재+member 0으로 간접 확인).

### Stage 1 — 교수학습과정안 보드 + AI demo 분기 완료 (2026-07-13)
브랜치 `feat/demo-mode` (Stage 0=d3f3b02 위에 이어감). 모든 분기 `mode==='demo'`/`isDemo` opt-in.

**공유 상수·스키마 (추가만 — 기존 엔트리 불변)**
- `shared/constants.js` — `BOARD_TYPES['demo_lesson_plan']='lesson_plan'`, `BOARD_TYPE_LABELS.lesson_plan='교수학습과정안'`. `DEMO_BOARD_TYPES` Set + `isDemoBoardCode()` 헬퍼(협력 절차/시연 자립 보드 구분 단일 소스). `AI_ROLE_PRESETS.coach`(promptTone='coaching', `demoOnly:true`) + `PROMPT_TONE_INSTRUCTIONS.coaching`(격려 기반+요청 시 채점관 관점). `AI_ROLE_PRESET_LIST`는 `demoOnly` 필터로 협력 역할 선택 UI에 coach 미노출(회귀 방지).
- `shared/boardSchemas.js` — `BOARD_SCHEMAS.lesson_plan`: unit(text)·objectives(list)·**stages(table: 단계/시간/교사활동/학생활동/핵심발문/자료/형성평가/유의점)**·boardPlan(textarea)·timeTotalCheck·objectiveAlignmentCheck. 발문·판서·형성평가를 별도 보드로 쪼개지 않고 한 장의 표로 통합(§4.2).

**서버**
- `server/services/aiAgent.js` `buildSystemPrompt({..., mode, tone})` — `isDemo=mode==='demo'`. `DEMO_PROC_INFO` 폴백으로 PROCEDURES 미등록 코드 수용(시스템 오류 회피). demo 분기: 역할=코치 재해석·톤=coaching 강제·**융합 가드 비활성(단일교과 정상)**·협력UP(총괄원리)/팀비전/검증링크/procedure_advance 제거. 협력 경로는 `if(!isDemo)`/else로 완전 불변.
- `buildProcedureIntroResponse({..., mode, tone})` — demo면 절차 가이드/협력UP 없는 코치 톤 환영 인트로를 별도 조립·스트리밍.
- `server/routes/chat.js` — `/message`: 프로젝트 표식으로 `isDemo` 판별(클라 불신) → `mode:'demo'`,`tone:'coaching'`,`aiRole:'coach'` 주입. `/stage-intro`: demo 보드 코드는 buildProcedureIntroResponse(mode:'demo')로 코치 인트로(PROCEDURES 검증 우회).
- `server/routes/designs.js` — GET/PUT(content)/PUT(status) 코드 검증을 `isValidDesignCode`(PROCEDURES ∪ demo_*)로 완화(보드 저장/로드 경로가 demo_lesson_plan을 400으로 막던 것 해결). **스킵 라우트는 PROCEDURES-only 유지**(demo 미사용).

**프론트**
- `client/src/components/DemoStepNav.jsx`(얕은 스텝: ①성취기준·단원 ②교수학습과정안), `DemoStandardsPanel.jsx`(단일교과 안내 카피 + 선택 성취기준 목록 + 탐색기 열기 + 다음).
- `client/src/pages/ProjectPage.jsx` — demo면 ProcedureNav 대신 DemoStepNav, 커서를 `demo_lesson_plan`으로 고정, 좌측 패널을 demoStep으로 전환(standards↔ProcedureCanvas), 인트로 요청 코드도 demo 보드로 고정.
- `client/src/components/ProcedureCanvas.jsx` — PROCEDURES 미등록 demo 보드도 BOARD_TYPE_LABELS로 헤더 합성해 렌더(범용 필드 렌더러·ai_suggestion 수락 흐름 재사용).
- `client/src/stores/procedureStore.js` — `setProcedure` 가드에 `isDemoBoardCode` 허용.

**검증 (백엔드 4107 + 프론트 4006, dev-bypass)**
- 시연 보드: /demo-prep→demo 프로젝트 로드, ②단계에서 demo_lesson_plan이 **도입-전개-정리 stages 테이블**로 렌더·편집(브라우저 확인). PUT/GET designs로 4행(도입/전개1/전개2/정리) 저장·재로드 확인.
- AI demo 분기(실채팅 1회): (a)**융합 가드 미발동**(단일교과 [12역학01-02]인데 "다른 교과 추가" 안 함) (b)코치 톤("예비교사님, …잘 분석하셨네요") (c)`<ai_suggestion type="board_update" procedure="demo_lesson_plan">`로 lesson_plan 스키마 전 필드 제안 → updateBoard(PUT) 저장·렌더. 코치 인트로도 스트리밍 확인.
- 봉인 테스트: `vocabularyIsolation.test.js` — 기존 32 + demo 격리/분기 4 = **36/36 통과**(완화 없음, demo_ 코드 스크럽·정규화 무해). 서버 전체 **180/180 통과**.
- 회귀: 협력 buildSystemPrompt(A-2-1, 단일교과) 융합 가드·총괄원리 **여전히 발동**(불변 확인). ProjectPage 협력 경로 ProcedureNav 렌더 코드 불변.

**Stage 2 인계 주의**
- 헤더의 "여기부터 시뮬레이션"(ContinueSimulationButton)·"보고서"·"공유" 버튼은 demo에서도 노출됨 — 시연 부적합(특히 continue-simulation은 협력 시뮬 개념). Stage 4(보고서 분기) 또는 별도로 demo 은닉/재해석 필요.
- reportGenerator·demo continue는 여전히 코어 절차(T-1-1 등) 가정 → demo 프로젝트에서 미검증. Stage 4에서 분기.
- coherence(정합성 점검)는 Stage 2 범위 — 현재 demo는 getCoherenceTargets 빈값이라 섹션 미주입(무해).

## 결정·변경 이력
- migration: MVP 0건(learner_context jsonb에 demo 표식). 향후 projects.mode 컬럼 승격 검토.
- 시연 보드 코드는 `demo_*` 스네이크형(어휘격리 정규식 미매칭, PROCEDURES 미등록).
- coach 프리셋은 `demoOnly:true`로 협력 역할 선택 UI에서 제외.
- 보드 저장/로드는 designs.js의 `isValidDesignCode` 관문 경유(demo_* 허용, 스킵 라우트는 협력 전용 유지).
