---
name: curriculum-weaver-rebuild
description: "커리큘럼 위버 리빌드 오케스트레이터. 협력적 수업설계 워크플로우 + MVP 설계안 + 교육과정 데이터를 기반으로 앱을 전면 재구축한다. '리빌드', '재구축', '워크플로우 반영', 'MVP 구현', '커리큘럼 위버 업그레이드' 요청 시 반드시 이 스킬을 사용할 것."
---

# Curriculum Weaver Rebuild Orchestrator

협력적 수업설계 워크플로우(xlsx) + MVP 설계안(md) + 교육과정 종합분석표(xlsx) 기반으로 커리큘럼 위버를 전면 재구축하는 에이전트 팀 오케스트레이터.

## 실행 모드: 에이전트 팀 (Phase별 팀 재구성)

## 3대 우선순위
1. **협력적 수업설계 워크플로우**를 따른다 (16절차 + 액션스텝 + 5행위자)
2. **MVP 설계안**의 개념을 모두 넣는다 (인증, 역할, Workspace>Project, 수락/거부, 버전, 댓글, 내보내기)
3. **교육과정 종합분석표 데이터**를 참고한다 (5,146 성취기준 + 7시트 메타데이터)

## 에이전트 구성

| 팀원 | 에이전트 정의 | 역할 | 출력 |
|------|-------------|------|------|
| schema-architect | `.claude/agents/schema-architect.md` | DB 스키마 + 마이그레이션 + 인증 | `supabase/migrations/`, `server/lib/` |
| backend-engineer | `.claude/agents/backend-engineer.md` | API 라우트 + 서비스 + 미들웨어 | `server/routes/`, `server/services/` |
| frontend-engineer | `.claude/agents/frontend-engineer.md` | 컴포넌트 + 스토어 + 페이지 | `client/src/` |
| ai-designer | `.claude/agents/ai-designer.md` | AI 시스템 프롬프트 + 대화 프로토콜 | `server/services/aiAgent.js` |
| qa-validator | `.claude/agents/qa-validator.md` | 통합 테스트 + 경계면 검증 | `_workspace/qa/` |

## 레퍼런스 문서

| 문서 | 위치 | 용도 |
|------|------|------|
| Gap 분석 | `references/gap-analysis.md` | 현재↔목표 차이 전체 파악 |
| 워크플로우 매핑 | `references/workflow-mapping.md` | xlsx → 코드 구조 변환 상세 |
| 목표 스키마 | `references/target-schema.md` | 12테이블 Supabase SQL |
| 데이터 스펙 | `references/standards-data-spec.md` | 교육과정 ETL 파이프라인 |

## 워크플로우

### Phase 1: Foundation (스키마 + 상수 + 인증)

**팀 구성**: schema-architect + backend-engineer (2명)

1. `_workspace/` 디렉토리 생성
2. 팀 생성 (2명):
   ```
   TeamCreate(team_name: "cw-foundation")
   Agent(name: "schema-architect", model: "opus", prompt: "...")
   Agent(name: "backend-engineer", model: "opus", prompt: "...")
   ```

3. 작업 등록:

| # | 작업 | 담당 | 의존 |
|---|------|------|------|
| 1 | `shared/constants.js` 재설계 (PHASES, PROCEDURES, ACTION_TYPES, ACTOR_COLUMNS) | backend-engineer | - |
| 2 | `shared/boardSchemas.js` 재설계 (16절차별 보드 스키마) | backend-engineer | 1 |
| 3 | `shared/procedureSteps.js` 생성 (16절차 × 5~9스텝 데이터) | backend-engineer | 1 |
| 4 | Supabase 마이그레이션 작성 (12테이블 + RLS + Realtime) | schema-architect | - |
| 5 | `server/lib/supabaseService.js` 작성 (store.js 대체) | schema-architect | 4 |
| 6 | `server/middleware/auth.js` 활성화 + 역할 검증 | schema-architect | 4 |
| 7 | 인증 API 라우트 (`/api/auth/*`) | backend-engineer | 6 |
| 8 | Workspace/Project CRUD API | backend-engineer | 5 |
| 9 | 초대 링크 API (`/api/invites/*`) | backend-engineer | 5, 6 |

4. 팀원 자체 조율 + 리더 모니터링
5. Phase 1 산출물 검증 후 팀 정리

**산출물**:
- `shared/constants.js` (재설계)
- `shared/boardSchemas.js` (재설계)
- `shared/procedureSteps.js` (신규)
- `supabase/migrations/00010_*.sql` (새 마이그레이션)
- `server/lib/supabaseService.js` (신규)
- `server/middleware/auth.js` (활성화)
- `server/routes/auth.js` (신규)
- `server/routes/workspaces.js` (신규)
- `server/routes/invites.js` (신규)

---

### Phase 2: Core Features (AI + 프론트 + 워크플로우)

**팀 구성**: frontend-engineer + ai-designer + backend-engineer (3명)

1. 새 팀 생성 (이전 팀 산출물은 `_workspace/`에 보존):
   ```
   TeamCreate(team_name: "cw-core")
   Agent(name: "frontend-engineer", model: "opus", prompt: "...")
   Agent(name: "ai-designer", model: "opus", prompt: "...")
   Agent(name: "backend-engineer", model: "opus", prompt: "...")
   ```

2. 작업 등록:

| # | 작업 | 담당 | 의존 |
|---|------|------|------|
| 1 | 인증 UI (로그인, 회원가입, 초대수락) | frontend-engineer | - |
| 2 | Workspace/Project 페이지 | frontend-engineer | - |
| 3 | ProcedureNav 컴포넌트 (16절차 네비게이션) | frontend-engineer | - |
| 4 | ProcedureCanvas 컴포넌트 (스텝 기반 UI) | frontend-engineer | 3 |
| 5 | aiAgent.js 리팩토링 (16절차 × 액션스텝) | ai-designer | - |
| 6 | procedureGuide.js 생성 (16절차 가이드 데이터) | ai-designer | - |
| 7 | AI 제안 수락/편집/거부 API | backend-engineer | - |
| 8 | 버전 스냅샷 API | backend-engineer | 7 |
| 9 | 활동 로그 API | backend-engineer | 7 |
| 10 | ChatPanel 수락/거부 UX | frontend-engineer | 4, 7 |
| 11 | 정합성 자동점검 로직 | ai-designer | 5 |
| 12 | Zustand 스토어 재설계 (workspace/project/procedure) | frontend-engineer | 2 |

3. 팀원 자체 조율 (frontend-engineer ↔ backend-engineer API 인터페이스 협의)
4. Phase 2 산출물 검증 후 팀 정리

**산출물**:
- `client/src/pages/` (Login, Workspaces, ProjectPage 등)
- `client/src/components/` (ProcedureNav, ProcedureCanvas, AISuggestion 등)
- `client/src/stores/` (workspaceStore, projectStore, procedureStore 등)
- `server/services/aiAgent.js` (리팩토링)
- `server/data/procedureGuide.js` (신규)
- `server/routes/` (suggestions, versions, logs 라우트)

---

### Phase 3: Collaboration & Data (댓글 + 내보내기 + 데이터)

**팀 구성**: frontend-engineer + backend-engineer + qa-validator (3명)

1. 새 팀 생성:
   ```
   TeamCreate(team_name: "cw-collab")
   Agent(name: "frontend-engineer", model: "opus", prompt: "...")
   Agent(name: "backend-engineer", model: "opus", prompt: "...")
   Agent(name: "qa-validator", model: "opus", prompt: "...")
   ```

2. 작업 등록:

| # | 작업 | 담당 | 의존 |
|---|------|------|------|
| 1 | 댓글 API (CRUD + resolve + 알림) | backend-engineer | - |
| 2 | 댓글 UI (섹션별 스레드) | frontend-engineer | 1 |
| 3 | 역할 기반 UI 분기 (editor/viewer) | frontend-engineer | - |
| 4 | MD + PDF 내보내기 리팩토링 | backend-engineer | - |
| 5 | 교육과정 데이터 ETL 스크립트 | backend-engineer | - |
| 6 | 통합 QA: 전체 플로우 검증 | qa-validator | 1,2,3,4 |
| 7 | 스키마 무결성 검증 | qa-validator | - |
| 8 | API-프론트 경계면 검증 | qa-validator | - |

3. qa-validator가 점진적 QA 수행
4. 발견된 이슈 즉시 수정
5. 최종 산출물 확인 후 팀 정리

**산출물**:
- `server/routes/comments.js` (신규)
- `client/src/components/CommentThread.jsx` (신규)
- `server/services/reportGenerator.js` (리팩토링)
- `scripts/import-standards-xlsx.mjs` (신규/확장)
- `_workspace/qa/` 테스트 리포트

---

## 데이터 흐름

```
Phase 1 산출물 (스키마, 상수, 인증)
    ↓ _workspace/ 보존
Phase 2 팀이 Phase 1 산출물 Read
    ↓ 코어 기능 구현
Phase 3 팀이 Phase 1+2 산출물 위에 협업/데이터 추가
    ↓ QA 검증
최종 산출물: 재구축된 커리큘럼 위버
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 팀원 1명 실패 | SendMessage로 상태 확인 → 재시작 또는 리더가 직접 수행 |
| Phase 간 불일치 | 이전 Phase 산출물을 Read로 검증 후 수정 |
| Supabase 연결 불가 | 인메모리 폴백 모드로 개발 계속 (store.js 유지) |
| 토큰 초과 | 팀원 프롬프트를 핵심만 남기고 references/로 상세 위임 |
| QA 치명적 버그 | 해당 팀원에게 즉시 전달 + 작업 블로킹 |

## 테스트 시나리오

### 정상 흐름
1. 사용자가 "커리큘럼 위버 리빌드" 요청
2. Phase 1: schema-architect + backend-engineer가 스키마/상수/인증 완성 (2명, 9작업)
3. Phase 2: frontend + ai-designer + backend가 코어 기능 구현 (3명, 12작업)
4. Phase 3: frontend + backend + qa가 협업/데이터/검증 완료 (3명, 8작업)
5. 결과: 16절차 워크플로우 + 인증 + 수락/거부 + 댓글 + 5,146 성취기준

### 에러 흐름
1. Phase 2에서 ai-designer가 토큰 초과로 시스템 프롬프트 생성 실패
2. 리더가 감지 → 컨텍스트 축소 지시 (현재 절차 가이드만 포함)
3. ai-designer 재시도 → 성공
4. 나머지 Phase 정상 진행

### 부분 실행 흐름
사용자가 특정 Phase만 요청할 수 있다:
- "Phase 1만 실행" → 스키마 + 상수 + 인증만 구현
- "Phase 2만 실행" → Phase 1 산출물이 존재하는지 확인 후 코어 기능 구현
- "QA만 실행" → qa-validator만 스폰하여 현재 상태 검증
