# Curriculum Weaver — 4차 구조 개선 프롬프트

이 문서를 새 세션의 첫 입력으로 사용하세요.

---

## 현재 상태

3차에 걸쳐 안정화 완료 (rebuild/v2 브랜치, 최신 커밋 `61a85be`):
- **1차** (1df556c): 보드→designs API 전환, 성취기준 경로, 보고서 인증, 레거시 인증 강화 등 15건
- **2차** (7e2350e): chat/materials/report 멤버십 검증, AI 컨텍스트 Supabase 전환, SSE 파서 shape 맞춤, 초대/프로필 경로, 소켓 이벤트명, DesignBoard 시그니처 등 12건
- **3차** (61a85be): 소켓 join_project 멤버십 검증, 이벤트 중계 room 확인, 데모/그래프 AI rate limiter, 업로드 limiter, 원칙 stage 필터, 활동 로그 total 정확도 등 4건

남은 이슈는 **런타임 정합성, 저장소 단일화, 스키마 드리프트** 차원입니다.

## 핵심 원칙

- 정합성/복구성 문제는 **사용자 수와 무관**. 1명이어도 한 번 꼬이면 복구 비용이 큼.
- "실서비스 협업 운영 / 초대·멤버십 신뢰성 / 관리자 데이터 수정" 중 하나라도 해당되면 Sprint 1은 필수.

---

## Sprint 1 — 정합성 + 스키마 (이번 세션)

### 1-1. logActivity 실패가 본 작업을 500으로 만드는 문제 (가장 빠름)

여러 쓰기 라우트에서 본 작업(설계 저장, 상태 변경 등) 성공 후 logActivity() 실패 시 catch에 잡혀 500을 반환. 사용자에게는 "실패"로 보이지만 실제 데이터는 저장됨.

**파일**: `server/routes/designs.js` (line 152-155), `server/routes/projects.js` (line 96-105)
**수정**: logActivity를 try-catch로 감싸고, 실패 시 console.warn만. 본 작업 응답은 정상 반환.

### 1-2. 워크스페이스 생성/초대 수락 트랜잭션 보강

- `createWorkspace` (supabaseService.js line 83-100): workspace INSERT → member INSERT 별도. 중간 실패 시 멤버 없는 워크스페이스.
- `useInvite` (supabaseService.js line 964-983): used_at 갱신 → addMember 별도. 중간 실패 시 초대 소진인데 멤버 미추가.

**수정 방향**:
- Supabase RPC로 원자적 처리: `CREATE FUNCTION create_workspace_with_owner(...)` / `CREATE FUNCTION accept_invite(...)`
- 또는 코드 보상 로직: 두 번째 INSERT 실패 시 첫 번째 롤백

### 1-3. 스키마 드리프트 수정 (운영 DB에서 즉시 터질 수 있음)

- 댓글 생성: 서버가 section_key를 null로 보낼 수 있는데 DB는 NOT NULL
- 댓글 수정: supabaseService가 updated_at을 쓰지만 comments 테이블에 해당 컬럼 없음

**파일**: `server/routes/comments.js` (line 139), `server/lib/supabaseService.js` (line 675), `supabase/migrations/00010_rebuild_schema.sql` (line 169)
**수정**: 마이그레이션 추가 — `ALTER TABLE comments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now()`, `ALTER COLUMN section_key DROP NOT NULL` (또는 서버에서 기본값 '' 처리)

---

## Sprint 2 — 저장소 단일화

### 2-1. standards/principles 한쪽으로 정리

지금 standards가 DB 검색과 인메모리 그래프/업로드가 섞여 있고, principles는 전역 메모리 수정. "정적 로컬 데이터로 고정" 또는 "DB 단일화" 중 하나를 선택.

- `/all`, `/graph`, `/upload`, `/refresh`, `/graph/add-links`는 전부 로컬 store (재시작 시 유실)
- 그래프 링크 추가: 인증만 있으면 전체 그래프 변경 가능
- 원칙 수정: requireAuth만 (requireAdmin 아님)

**파일**: `server/routes/standards.js` (line 62, 111, 135, 284, 525), `server/lib/store.js` (line 467), `server/routes/principles.js` (line 35)
**수정**: DB 단일화 권장. 최소한 그래프 링크 추가 + 원칙 수정에 requireAdmin 적용.

### 2-2. 자료(Materials) 저장/권한 구조 정리

업로드가 인메모리만 → 재시작 시 유실. materialAnalyzer 연결보다 **저장소 영속화가 우선**.

**파일**: `server/routes/materials.js`, `server/routes/chat.js` (materials = [])
**수정**: Supabase Storage + materials 테이블 저장. chat.js AI 컨텍스트에서 Supabase 로드.

---

## Sprint 3 — 품질 개선 (미룰 수 있음)

### 3-1. 설계 버전 자동 생성
designs.js PUT / chat.js 제안 수락 시 자동 스냅샷. 필수 아님, 히스토리/복구 가치 판단 후.

### 3-2. UI 실패 처리
commentStore 서버 실패 시 로컬 롤백 또는 toast. HostSetupWizard 초대 실패 알림.

### 3-3. 성능
getProjectLight() 권한 확인용 경량 조회. 번들 lazy import 강화.

---

## 검증 기준

수정 후 반드시:
1. `npm run build --workspace=client` 통과
2. `node -c server/index.js && node -c server/routes/chat.js && node -c server/routes/designs.js && node -c server/routes/comments.js` 통과
3. grep 검증:
   - `grep -rn "logActivity" server/routes/` — 모든 호출이 try-catch 안에 있는지
   - `grep -rn "Boards\.\|Sessions\.\|Materials\." server/routes/chat.js` — 인메모리 참조 0건
   - `grep -rn "optionalAuth" server/routes/` — sessions.js(레거시)만 남아야 함
4. 커밋 후 배포 (Vercel + Railway 자동)
