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

## 결정·변경 이력
- migration: MVP 0건(learner_context jsonb에 demo 표식). 향후 projects.mode 컬럼 승격 검토.
- 시연 보드 코드는 `demo_*` 스네이크형(어휘격리 정규식 미매칭, PROCEDURES 미등록).
