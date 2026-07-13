# reference/03 — 스키마·API 표면·프론트 진입 흐름

## DB 스키마 (supabase/migrations/00010_rebuild_schema.sql)
계층: **workspaces → members → projects → designs/messages** (전부 FK NOT NULL 강결합)

| 테이블 | 핵심 컬럼 | 시연 데이터 얹힘 가능성 |
|--------|-----------|----------|
| `workspaces` | owner_id, ai_config, workflow_config(jsonb) | 시연 모드 표식을 config에 얹기 가능 |
| `members` | (workspace_id,user_id) PK, role host/owner/editor/viewer | 1인이면 owner 단독 |
| `projects` | workspace_id FK **NOT NULL**, title, grade, subjects[], learner_context(jsonb), current_procedure DEFAULT 'prep', status | **시연 메타를 여기 얹기 자연스러움** — 예: `mode` 컬럼 추가 or learner_context jsonb에 표식 |
| `designs` | (project_id,procedure_code) UNIQUE, content(jsonb), save_status draft/confirmed/locked | 교수학습과정안 보드도 여기에 procedure_code로 저장 |
| `messages` | project_id FK, sender_type user/assistant/system, procedure_context | AI 스파링 대화 그대로 재사용 |
| `project_procedure_skips` | (00023) 스킵 표시 | 절차 축약 재사용 시 활용 |

- **핵심 제약**: `createProject(workspaceId, data)` (supabaseService.js 224행)는 workspace_id를 강제 주입. 프로젝트는 워크스페이스 없이 존재 불가. current_procedure는 'prep'로 시작.
- 확장 컬럼: 00022가 project_source·creator 추가함(데모 이어하기 선례) — 시연 모드 표식 컬럼 추가의 마이그레이션 선례 존재.

## API 표면 (server/index.js 마운트)
- `/api/standards/search`·`/semantic-search`·`/subjects`·`/grades`·`/domains` — **requireAuth 없음(공개)**. 성취기준 검색은 인증 없이 호출 가능 → 경량 시연 모드에 유리.
- `/api/standards/project/:projectId/*` — requireAuth (프로젝트 성취기준 담기)
- `/api/chat/procedure-intro`, `/api/chat/message` — SSE 스트리밍, aiChatLimiter. context = getRecentMessages + getStandardsByProject + boards + skips 병렬 수집(chat.js 611행 Promise.all) → buildAIResponse.
- `/api/report/:projectId/{html,md,preview}` (report.js) — requireAuth + 프로젝트 접근 체크. `collectReportData → generateHTML/generateMarkdown`.
- `/api/materials/upload` (uploadLimiter), analyzeMaterial/analyzeUrlMaterial (materialAnalyzer 660·720행) — 큐 동시성 3.
- projects/designs/versions/comments 라우터는 `/api` 루트에 마운트.

## 보고서 생성 (server/services/reportGenerator.js, 1,164줄)
- `collectReportData(projectId)` (57행): designs → designMap[procedure_code], procedureStatus(skipped/confirmed/draft/in_progress/empty), 진행률 분모 = `getActiveProcedures(skips).length` (135행 — 스킵 인식).
- `generateHTML`(266행)/`generateMarkdown`(860행): PROCEDURE_LIST 순회하며 designMap[proc.code] 렌더. `renderBoardContent`(157행)이 보드타입별 렌더. designMap이 **T-1-1·T-2-1·A-1-2·A-2-2 등 코어 코드를 하드코딩 참조**(96·228·234·240행) → 이 코어 절차가 없는 신규 트랙이면 보고서가 빈 값 참조.
- **시연 모드 교수학습과정안 출력 관점**: generateHTML/MD는 범용 보드 렌더러라 새 lesson_plan 보드도 렌더 가능하나, executiveSummary(223행)가 융합 주제/통합목표 하드코딩 → 시연용 요약은 별도 분기 필요.

## 프론트 진입 흐름
라우트(App.jsx 192행~): `/workspaces` → `/workspaces/:wsId` → `/workspaces/:wsId/projects/:projectId`(ProjectPage). 그 외 `/intro`, `/demo`(DemoMode), `/graph`, `/data`, `/guide`.
- **WorkspacesPage** (512줄): "프로젝트 만들 워크스페이스 선택" 강제. `?createProject=1` 이월(그래프에서 성취기준 담아온 흐름). 워크스페이스 → 상세 → 프로젝트 생성 다단계.
- **ProjectPage** (1,010줄): 2단 레이아웃 = ProcedureNav(절차 네비) + ProcedureCanvas(보드) + ChatPanel(AI). boardRatio 분할. current_procedure로 커서 동기화, 소켓 join, 스킵 절차는 열람만(459행 주석). NicknameModal(팀 협업 전제).
- **ProcedureCanvas** (1,145줄): `readOnly`, `memberRole`, 스킵 UI(host/owner만 34~52행), 생략 배너(123행), AI 제안 카드(275행). props로 procedureCode 받아 보드 렌더.

## 팀/워크스페이스 강결합 정도 (1인 모드 우회 비용)
- **강결합 지점**: (1) projects.workspace_id NOT NULL, (2) 모든 프로젝트 라우트가 `getMemberRole(workspaceId, userId)` 게이트, (3) ProjectPage가 NicknameModal·소켓 join·memberRole 분기·팀 커서(current_procedure PATCH 전파)를 전제.
- **우회 옵션 A (권장)**: 사용자당 "개인 워크스페이스" 1개 자동 생성(가입 시 or 시연 진입 시), owner 단독 멤버 → 기존 스키마·라우트 100% 재사용, UI에서 워크스페이스/초대/멤버 계층만 숨김. 저비용.
- **우회 옵션 B**: 로컬 경량(Supabase 우회) — 별도 저장/상태 트랙 신설. 재활용 코드가 대부분 서버 라우트에 있어 고비용.
