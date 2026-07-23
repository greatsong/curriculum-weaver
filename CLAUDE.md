# curriculum-weaver — Claude Code 가이드

## 프로젝트 개요
교사들이 AI와 함께 5가지 협력 원리(협력UP: 활성화·외현화·조정·상호의존·인지분산) 기반으로 융합 수업을 협력 설계하는 플랫폼

## 기술 스택
- **프론트엔드**: React 19, Vite 7, Tailwind CSS 4, Zustand 5, React Router 7
- **백엔드**: Express 5, @anthropic-ai/sdk
- **DB/Auth**: Supabase (PostgreSQL + pgvector + Auth + Realtime + Storage)
- **그래프 시각화**: react-force-graph-2d
- **파일 처리**: multer, pdf-parse, mammoth

## 포트
- 프론트엔드: `4006`
- 백엔드: `4007`

## 구조
```
curriculum-weaver/
├── client/       # Vite + React SPA
├── server/       # Express API
├── shared/       # 공유 상수
├── supabase/     # DB 마이그레이션
└── scripts/      # 데이터 처리 스크립트
```

## 핵심 파일
- `server/services/aiAgent.js` — AI 공동설계자 (단계별 시스템 프롬프트 빌더)
- `server/services/materialAnalyzer.js` — 파일 업로드 분석 파이프라인
- `shared/constants.js` — 7단계 정의, 보드 타입, SSE 이벤트, 링크 상태/생성방법 상수
- `server/lib/store.js` — 인메모리 데이터 스토어 (성취기준, 링크, 세션 관리)
- `server/routes/standards.js` — 성취기준/그래프/링크 API 엔드포인트
- `client/src/components/InlineGraph2D.jsx` — 2D 교과 연결 그래프 시각화
- `client/src/components/DesignMode.jsx` + `lenses/` — /graph 설계 모드 (과목쌍·주제·계열·이웃 렌즈, URL이 상태 기록). 기본 진입=설계, ?mode=explore가 3D 쇼케이스
- `client/src/components/Graph3DShowcase.jsx` — "교육과정 성운" 3D 쇼케이스 (아래 섹션 참조)
- `scripts/migrateLinksToDB.js` — generatedLinks.js → curriculum_links 테이블 마이그레이션
- `supabase/migrations/` — 15개 테이블 스키마 + RLS + Realtime

## 교육과정 성운 — 3D 쇼케이스 재구축 (2026-07-12)

`?mode=explore`를 발표·감상 전용 "교육과정 성운"으로 전면 재구축. 구 Graph3D(1,717줄, react-force-graph-3d)는 `?mode=explore-legacy`로 검증 기간 유지 후 삭제 예정.

- **역할 선언**: 읽기 전용 프레젠테이션. AI 채팅·링크 추가·복잡 필터는 전부 제거(설계는 DesignMode 렌즈 담당). published + 교과군 간 연결 + 연결 노드만 표시(1,476노드/1,636링크)
- **레이아웃 사전계산**: `scripts/compute-graph3d-layout.mjs` — /graph에서 published 그래프를 받아 d3-force-3d를 오프라인 실행(UMAP 임베딩 좌표 시드 + 약한 복원력으로 의미 지형 보존, 결정적), `server/data/graph3dLayout.json`(46KB) 출력. **링크 대량 변경 시 재실행 후 JSON 커밋 필요**
- **API**: `GET /api/standards/graph3d` — 좌표 포함 경량 페이로드 867KB(기존 /graph 5.7MB 대비 -85%), 링크 버전 캐시. 레이아웃 없는 신규 노드는 임베딩 좌표 → code 해시 지터 폴백
- **렌더러**: `client/src/lib/nebulaScene.js` — three.js 커스텀. 노드 전체=Points 1드로우콜(글로우 셰이더, gl_PointSize에 pixelRatio 곱 필수), 링크 전체=LineSegments 1드로우콜(additive라 색 밝기=알파). 상태 전환은 타깃 배열+프레임당 지수 러프 — **오브젝트 재생성 0**. force 시뮬레이션 없음
- **디자인 단일 소스**: `client/src/lib/nebulaTheme.js` (다크 보정 팔레트·알파·타이밍·카메라). 원 스펙: `_workspace/design/graph3d-showcase-spec.md`. 절제 원칙: 기본 링크는 단일색 안개(#7C89B8 @0.08), 타입 5색은 선택 하이라이트에만
- **기능**: 첫 진입 카메라 다이브+교과군 스태거 점등, 노드 선택(펄스 링·이웃 하이라이트·상세 카드·"다음 연결로 여행"), 자동 투어(교과군 스톱별 캡션+궤도 선회), 칩=조명 스위치(끄면 감광, 더블클릭=솔로), idle 오토로테이트. URL이 상태 기록: `?subjects=&levels=&focus=&tour=1` — DesignMode의 toExplore 이월과 호환
- **QA 주의**: 헤드리스/백그라운드 탭은 rAF 정지 + 뷰포트 0×0(모바일 오인) — dev 한정 `window.__nebula.frame(t)` 수동 펌프로 검증(프로덕션 제외). 씬 재생성 시 sceneEpoch로 선택/필터 재주입

## 자료 업로드 분석 파이프라인 (2026-07-12 성능 개선)

실측 p50 35s·최대 51s(타임아웃 60s와 마진 9s)였던 분석 지연을 점검·개선. 지배 요인은 **AI 출력 토큰 수**(출력 1,909tok=21s 실측).

- **출력 감량**: intent=general이면 `intent_driven_summary`를 required에서 제외(`buildAnalyzeTool(intent)` 동적 스키마, 서버가 summary로 폴백), 성취기준 후보 10→5개·reason 200→100자. 출력 1,909→1,334tok. prompt_version `2026-07-a`
- **Vision 분석**: 텍스트 추출이 안 되는 스캔본 PDF는 base64 document 블록으로 자동 폴백(600페이지 상한), 이미지(png/jpg/jpeg/webp/gif, 5MB 이하)는 image 블록으로 직접 분석 — 과거 실패 25%("추출된 텍스트가 비어 있습니다")가 전부 이 케이스. 타임아웃: 텍스트 90s / Vision 150s
- **hwpx 지원**: OWPML ZIP의 `Contents/section*.xml`에서 `<hp:t>` 런 추출(`extractHwpxText`, jszip). 정규식 태그명은 정확히 `t`로 고정할 것 — `hp:t[^>]*`는 hp:tbl·hp:tc까지 잡아 XML이 본문에 샘(실파일 검증에서 발견). 바이너리 .hwp는 미지원(hwpx/PDF 변환 안내)
- **실패 안내**: 서버 processing_error("CODE: 메시지")의 메시지가 목록·토스트에 그대로 노출(`materialFailureMessage`, INTERNAL류는 매핑 문구로 대체). 확장자·20MB·이미지 5MB는 업로드 전 클라 검증(`validateMaterialFile`)
- **업로드 응답 병렬화**: Storage 업로드를 DB insert·응답과 병렬 실행(낙관적 insert, 실패 시 행 보정), 분석은 첨부 시스템 메시지 생성 직후(Storage 완료 전) 시작. E2E 실측 응답 621ms
- **실시간 상태**: analyzer가 parsing/analyzing/completed/failed 전이마다 `material_updated` 소켓 브로드캐스트(`transitionMaterial` 헬퍼) → procedureStore `applyMaterialUpdate`가 즉시 반영+폴링 조기 종료. 3초 폴링은 소켓 유실 대비 안전망으로 유지
- E2E(업로드→소켓 감지→completed) 13.1s 실측. 검증 기법: 자체 서버 4207 + 테스트 유저/JWT + socket.io-client, 데이터 완전 정리

## 절차 스킵(건너뛰기) 시스템 (2026-07-11)

팀이 불필요한 절차를 생략 표시하는 기능. **보드 내용은 절대 건드리지 않는다** — 스킵은 표시일 뿐, 해제하면 원상복구.

- **저장**: `project_procedure_skips` 테이블(00023) — 스킵=INSERT, 해제=DELETE (행 단위 원자성, 감사 이력 내장)
- **관문 함수** (`shared/constants.js`): `UNSKIPPABLE_PROCEDURES`(코어 5: T-1-1·T-2-1·A-1-2·A-2-1·A-2-2 — 보고서·AI가 하드코딩 참조), `isProcedureSkippable`, `getActiveProcedures`, `getNextActiveProcedure`. **스킵 인식이 필요한 곳은 `PROCEDURE_LIST` 직접 순회 금지, 반드시 관문 함수 경유** (직접 순회 grep으로 감사 가능)
- **API**: `POST/DELETE /api/projects/:id/procedures/:code/skip` (host/owner 전용, 코어 403, 멱등). 스킵 대상이 팀 커서면 다음 활성 절차로 자동 보정. `GET /projects/:id` 응답에 `skipped_procedures` 포함
- **실시간**: `procedure_skips_changed` 소켓 이벤트 (서버 브로드캐스트, designs.js) → procedureStore가 구독
- **AI**: `buildSystemPrompt({ skippedCodes })` — procedure_advance가 생략 절차를 건너뜀, [생략된 절차] 섹션 주입, 정합성 점검은 "(팀 결정으로 생략됨)" 표기. procedure-intro는 스킵 절차 400
- **보고서**: procedureStatus 'skipped' 분기, 진행률 분모=활성 절차 수, 본문에 "팀 합의로 생략(사유)" 블록
- **데모**: 스킵 프로젝트는 이어서 시뮬레이션 400 차단 (잔여판정·복제·프롬프트가 스킵 미인식 — 전면 지원은 별도 작업)
- **UI**: ProcedureCanvas 헤더 버튼(host) + 생략 배너 + 읽기전용, ProcedureNav 취소선·분모 제외, 스킵 절차 클릭=로컬 열람만(커서 PATCH 안 함). 진행률·stale 체인에서 스킵 제외
- **명칭 규칙**: 사용자 노출 문구는 반드시 displayCode(`getProcedureLabel`/`getProcedureDisplayCode`) — 내부 코드(T-1-1)는 DB·API 전용
- 주의: DesignBoard.jsx·StageNav.jsx는 **미사용 레거시**(import 0건)라 스킵 미반영. WorkspaceDetailPage·HostSetupWizard의 `hiddenProcedures` 설정 UI는 **소비처 없는 유령 설정**(별도 정리 필요, 스킵과 다른 개념)

## 성취기준 데이터 정본 (2026-06-12 일원화)

> **2026-07-23 완결성 복원 (5,665 → 5,907)**: 811 복원이 놓쳤던 필수·선택 교과를 교육부 고시
> 원문 verbatim으로 추가 — 영어 초3~중3 61(별책14)·초1-2 통합교과 48(별책2)·중학 선택 환경/보건/
> 진로와 직업 59(별책18 표 셀). + 중학 사회 74 역이관 + [9역]→역사·[12생과]→생명과학 재라벨 +
> grade_group 정규화(초2→초1-2 등). 2팀 독립 감사 통과(원문 verbatim 100%·두 저장소 동일).
> 신규 242코드 융합 연결 1,677 생성(published 475), Supabase seed·메타 동기 완료. 오픈소스
> 데이터셋(k-curriculum-2022)에도 동일 반영. **후속: graph3dLayout 좌표 재계산(서버 기동 필요).**

성취기준 데이터는 **`server/data/standards.js` (`ALL_STANDARDS`, 5,907개 code)** 가 **정본**이다.
검색 런타임·reload·Supabase 시드가 모두 이 단일 파일을 소스로 쓴다.

| 파일 | 역할 | 비고 |
|------|------|------|
| `server/data/standards.js` | **정본** (4,856 code) | `store.js`가 import. `parse-xlsx-to-standards.mjs`가 직접 출력 |
| `server/data/standards_full.js` | **레거시 ETL** (4,484 code) | 풍부한 메타(competencies/content_system/assessment_guide)의 원천이나 일부 content가 잘림 + 정본 외 10개 code. 더 이상 런타임 소스 아님 |
| `server/data/standards_social.js` | 사회과 412개 (`SOCIAL_STANDARDS`) | 오프라인 링크생성 스크립트 전용. 검색 런타임 미사용(standards.js에 사회 145개 별도 포함) |

- **검색**: `routes/standards.js`의 `/search`는 항상 `store.js`의 인메모리 `Standards`(= standards.js, 4,856개 전체 — 오염 0)를 단일 소스로 사용. Supabase `searchStandards`는 미사용.
- **reload()**: `store.js`의 `Standards.reload()`는 정본 standards.js만 로드(과거 standards_full.js 우선 → 4,484로 되돌아가던 버그 제거). initStore와 동일하게 4,856 반환.
- **오염 복원 완료 (2026-07-11)**: xlsx 재파싱 때 유입된 content 오염 525건(해설체 혼입·개행 유실·푸터 혼입)을 전량 복원 — ① `scripts/restore-standards-from-backup.mjs`가 backup_20260327에서 475건 복원(해설은 explanation으로 이동) ② 잔여 25건은 교육부 고시 HWP 원문 리서치 후 `scripts/apply-manual-standard-fixes.mjs`로 적용(`scripts/results/restore-manual-20260711.json`, 출처 명기). Supabase·임베딩 캐시 동기화는 `scripts/sync-restored-standards.mjs`. 오염 탐지는 `server/lib/standardsQuality.js` 단일 소스(store.js·report 스크립트 공유), 품질 게이트: `node scripts/report-standards-quality.mjs --max-flagged 30` (현재 플래그 0). 과거 오염필터로 제거되던 145건까지 편입되어 4,711 → 4,856 전체 서빙.
- **Supabase 재정합**: `scripts/seed-standards-from-canonical.mjs` — 정본 구동, `code` onConflict upsert, 기존 id·rich 메타·embedding 보존(비파괴). content는 정본 권위로 교체, 나머지는 빈 값만 채움.
- **검증**: `scripts/verify-standards-supabase.mjs` — 검색 code 전부가 Supabase에서 resolve되는지 확인(현재 PASS).
- `scripts/seed-standards-to-supabase.mjs`는 레거시(standards_full.json 시드) — **DEPRECATED**, 사용 금지.
- Supabase에는 정본 외 잉여 code 10개(`[12정치…]`, `[디직 …]`, `[성직 …]`)가 남아 있음. FK 참조 0건이라 삭제 가능하나 검색엔 안 나오므로 무해.

## 환경변수
- 클라이언트: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- 서버: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`

## Auth 구현 상태 (2026-04-18 업데이트)

**프로덕션에서 실제 동작 중.** 이메일/비밀번호 + Google OAuth 지원.

- 클라이언트: `client/src/lib/supabase.js` 활성, `api.js`가 세션 토큰 자동 첨부
- 로그인 UI: `LoginPage.jsx` — 이메일/비번 + "Google로 계속하기" 버튼
- OAuth 콜백: `/auth/callback` → `AuthCallback.jsx` → `/workspaces` 이동
- 서버: 모든 라우트가 `requireAuth` 적용 (`server/routes/*.js`), JWT는 Supabase admin 클라이언트로 검증
- 로컬 dev 모드: `VITE_SUPABASE_URL=placeholder`로 설정 시 더미 사용자로 바이패스 (개발 편의)

**로컬 dev 서버 인증 바이패스 (QA ISSUE-001 해결, 2026-07-11)**:
- 서버 `.env`에 `DEV_AUTH_BYPASS=true` 설정 시(단, `NODE_ENV !== 'production'`일 때만) JWT 없는/무효한 요청을 실제 Supabase의 dev 유저 `dev@curriculum-weaver.local`로 처리 — 클라 placeholder 모드 + 서버 실제 Supabase 조합에서도 401 없이 로컬 E2E 가능
- dev 유저는 `server/middleware/auth.js`가 supabaseAdmin으로 idempotent 생성/조회 후 프로세스 캐시 (FK 안전). 생성 실패 시 바이패스 자동 비활성 + 경고 로그
- 프로덕션에는 이 env를 절대 설정하지 말 것 (`NODE_ENV=production`이면 어차피 무시됨)

**아직 손봐야 하는 부분**:
- **레거시 `/api/sessions/*` 라우트**: 읽기는 `optionalAuth`, 쓰기는 `requireAuth`. 프로젝트 전환 완료 후 삭제 예정.
- **RLS 정책 실제 활성화 여부**: 마이그레이션 파일(`supabase/migrations/00002_rls_policies.sql`)은 있으나 프로덕션 DB에 적용됐는지 Dashboard에서 재확인 필요.
- **인메모리 store 잔존**: `server/lib/store.js`의 `Sessions`/`SessionStandards`가 레거시 세션용으로 남아 있음. 프로젝트 기반 전환 완료 후 제거 가능.

관련 파일: `server/middleware/auth.js`, `server/lib/supabaseAdmin.js`, `supabase/migrations/00002_rls_policies.sql`, `client/src/pages/LoginPage.jsx`, `client/src/pages/AuthCallback.jsx`

## 3계층 링크 품질 시스템

교과 간 성취기준 연결을 3단계로 관리하는 품질 파이프라인.

### 상태 흐름
```
candidate (AI 제안 후보) → reviewed (검토 완료) → published (사용자 노출)
```

### 링크 단일 소스 = Supabase `curriculum_links` (2026-07-08 일원화)
- 서버 부팅 시 `server/lib/linkService.js`의 `hydrateLinksFromDB()`가 DB 전체를 인메모리로 로드
- Supabase 미설정(placeholder dev)/장애/빈 테이블 시 정적 `server/data/generatedLinks.js` 폴백 (비파괴)
- `add-links`·`PATCH status`는 인메모리 + DB 동시 반영 (재시작 시 소실 문제 해결)
- add-links는 사용자 확정 행위로 간주해 `published`로 저장
- 스키마 제약 `CHECK (source_code < target_code)` — DB 쓰기 전 반드시 정규화

### 링크 생성 파이프라인 v2 — `scripts/generateLinksV2.mjs`
1단계 OpenAI 임베딩 코사인 top-k 후보쌍 추출(결정적, 실측 semantic_score) →
2단계 claude-sonnet-5 배치 판정(인덱스 참조로 코드 할루시네이션 원천 차단,
quality_score·rationale·integration_theme·lesson_hook 생성) → **candidate 적재**.
```bash
node scripts/generateLinksV2.mjs --dry-run           # 1단계 통계만 (비용 없음)
node scripts/generateLinksV2.mjs --min-cos 0.6       # 전체 실행 + DB candidate 적재
node scripts/generateLinksV2.mjs --backfill-semantic # 기존 링크 semantic_score 백필
node scripts/promoteLinks.mjs --dry-run              # 승격 대상 확인 (quality>=0.8 → published)
```
**모드**: 기본(교과군 간) | `--same-group`(같은 교과군 내 과목 간, 과목쌍별 top-N 보장 — 계열성·선수학습) |
`--rejudge`(기존 링크 재판정) | `--import-results`(결과 파일 → DB 복구 적재) | `--backfill-semantic`.
승격/강등: `promoteLinks.mjs` (`--min-quality`, `--demote-below`).

2026-07-08 전면 재정비 결과:
- 교차군 생성 2,938쌍 → 1,660 채택 / 같은군 생성 8,907쌍 → 4,342 채택 (데이터 과학↔인공지능 기초 등 커버)
- v1 2,021개 재판정: 통과 1,314 / 기각 460, quality<0.7 854개 candidate 강등
- **게시 정책: quality_score ≥ 0.8 자동 승격, < 0.7 강등 — 게시 링크는 전부 0.7 이상**
- 최종: published 2,938 / candidate 5,085. 전 링크 실측 semantic_score 보유. v1 스크립트(generateLinksAI/Mission)는 레거시.
- 2026-07-11 성취기준 오염 복원 후속: 복원 코드가 낀 링크 1,258건을 `--rejudge --codes-file`(신규 옵션, rationale·theme·hook까지 새 판정으로 교체)로 재판정 → 통과 906 / 기각 353, 정책 적용(강등 182·승격 66). **현재: published 2,812 / candidate 5,202** (그래프 노드 4,856 — 복원으로 링크 해석 가능 성취기준 증가).

### 테이블: `curriculum_links` (`supabase/migrations/00015_curriculum_links.sql`)
| 컬럼 | 설명 |
|------|------|
| `source_code`, `target_code` | 성취기준 코드 쌍 (source < target 정규화) |
| `link_type` | cross_subject, same_concept, application, prerequisite, extension |
| `rationale` | 연결 근거 설명 |
| `integration_theme` | 융합 주제 (예: "에너지와 환경") |
| `lesson_hook` | 수업 아이디어 한 줄 |
| `semantic_score` | 벡터 코사인 유사도 (0~1) |
| `quality_score` | LLM 판정 교육적 품질 (0~1) |
| `status` | candidate / reviewed / published |
| `generation_method` | tfidf / ai / manual |

### API
- `GET /api/standards/graph?status=published` — 기본값, published 링크만 반환
- `GET /api/standards/graph?status=all` — 전체 링크 반환
- `GET /api/standards/graph?status=candidate,reviewed` — 쉼표 구분 필터
- `PATCH /api/standards/links/:linkId/status` — 링크 상태 변경 (body: `{ status }`)

### 프론트엔드 렌더링
- **published 링크**: 기존 link_type 색상, 실선, 100% 불투명도
- **non-published 링크**: 회색(`#94a3b8`), 점선, 40% 불투명도
- **"AI 제안 포함" 토글**: DataManage 페이지에서 candidate/reviewed 링크 표시 제어
- **상세 패널**: integration_theme (🔗), lesson_hook (📝) 표시

### 관련 상수 (`shared/constants.js`)
- `LINK_STATUSES`: `{ CANDIDATE, REVIEWED, PUBLISHED }`
- `LINK_GENERATION_METHODS`: `{ TFIDF, AI, MANUAL }`

### 데이터 마이그레이션
기존 1,768개 AI 생성 링크는 `scripts/migrateLinksToDB.js`로 Supabase에 이관 가능:
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrateLinksToDB.js
```

## 동시 30명(3인×10팀) 하드닝 (2026-07-12)

학교 NAT(전원 동일 공인 IP) + 수업 동시 사용 시나리오 대응. PR #42(인증 캐시·채팅 병렬화)·#45(그래프 메모이즈)·#46(임베딩 바이너리)에 이어 나머지 5건 적용.

- **Rate limit 사용자 키** (`server/middleware/rateLimit.js`): limiter가 requireAuth보다 먼저 실행돼 IP 키로만 동작하던 문제(학급 전체가 분당 120/AI 10을 공유 → 수업 시작 429 폭탄) 수정. JWT sub를 서명 검증 없이 디코드해 버킷 키로 사용(`userKey`) + IP 백스톱 분당 3,000회(위조 sub 회전 방어). **새 limiter를 추가할 때 이 함정 주의 — `req.user`는 limiter 시점에 항상 비어 있다.**
- **로그인 제한 완화**: 종전 IP당 5회/분이 `/api/auth` 전체에 걸려 30명 동시 로그인이 불가능했음 → IP+이메일 키 10회/분, `/api/auth/login`·`signup`에만 마운트
- **AI 큐** (`aiAgent.js`): concurrency 5→12, timeout 60s→180s (p-queue timeout은 실행 시간에만 적용·초과 시 reject라 12k 토큰 장문 스트림이 중단되던 위험). env `AI_QUEUE_CONCURRENCY`/`AI_QUEUE_TIMEOUT_MS`
- **자료 분석 큐** (`materialAnalyzer.js`): analyzeMaterial/analyzeUrlMaterial이 동시성 3의 `analysisQueue`(p-queue) 경유 — 종전 무제한 fire-and-forget은 동시 업로드 수만큼 20MB 버퍼+파싱+Vision 호출이 겹쳐 OOM 위험. 대기 중 상태는 pending/parsing으로 기존 폴링·소켓 UI에 노출. env `MATERIAL_ANALYSIS_CONCURRENCY`
- **프로젝트 목록 캐시** (`routes/projects.js`): 워크스페이스별 10초 TTL(생성/수정/삭제 시 즉시 무효화, 단일 인스턴스 전제) — 목록 요청당 프로젝트별 메시지 count(N+1) 반복 흡수
- **compression** (`index.js`, level 4): 그래프 실측 5.7MB→1.4MB. SSE(text/event-stream)는 filter로 제외 — 압축 버퍼링이 스트리밍을 깨뜨림
- 주의: 캐시·rate limit 모두 인메모리 = **단일 인스턴스 전제**. 수평 확장 시 Redis store 필요

## 컨벤션
- UI 텍스트/주석: 한국어
- 코드(변수명, 함수명): 영어
- 상태관리: Zustand (pythink2 패턴)
- API: Express 라우트 + Supabase Admin 클라이언트
- 인증: Supabase Auth (Google OAuth) + JWT 미들웨어
- RLS: session_id 기반 멤버십 경계
