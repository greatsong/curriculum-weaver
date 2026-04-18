# curriculum-weaver — Claude Code 가이드

## 프로젝트 개요
교사들이 AI와 함께 40가지 설계 원리 기반으로 융합 수업을 협력 설계하는 플랫폼

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
- `scripts/migrateLinksToDB.js` — generatedLinks.js → curriculum_links 테이블 마이그레이션
- `supabase/migrations/` — 15개 테이블 스키마 + RLS + Realtime

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

## 컨벤션
- UI 텍스트/주석: 한국어
- 코드(변수명, 함수명): 영어
- 상태관리: Zustand (pythink2 패턴)
- API: Express 라우트 + Supabase Admin 클라이언트
- 인증: Supabase Auth (Google OAuth) + JWT 미들웨어
- RLS: session_id 기반 멤버십 경계
