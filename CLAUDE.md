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
- `shared/constants.js` — 7단계 정의, 보드 타입, SSE 이벤트
- `supabase/migrations/` — 14개 테이블 스키마 + RLS + Realtime

## 환경변수
- 클라이언트: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- 서버: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`

## TODO: Auth 구현 계획

현재 테스트 모드 (인증 없음). 아래 순서로 전환:

1. **클라이언트 Supabase Auth 연결**
   - `client/src/lib/supabase.js` 활성화
   - Google OAuth 로그인 UI 추가 (Dashboard 헤더)
   - `api.js`의 `getHeaders()`에 `Authorization: Bearer ${session.access_token}` 추가

2. **서버 JWT 미들웨어 활성화**
   - `server/middleware/auth.js`의 `requireAuth` 주석 해제
   - `server/routes/sessions.js`에서 `sessionsRouter.use(requireAuth)` 활성화
   - `req.user.id`로 creator_id 설정

3. **권한 적용**
   - 세션 삭제/아카이브: creator_id === req.user.id 검증
   - 세션 참여: session_members에 user_id 추가
   - 인메모리 store → Supabase Admin 클라이언트로 전환

4. **RLS 활성화** (이미 마이그레이션에 정의됨)
   - `ds_creator_all`: 생성자만 수정/삭제
   - `ds_member_select`: 멤버만 조회
   - `is_session_member()` 함수 활용

관련 파일: `server/middleware/auth.js`, `server/lib/supabaseAdmin.js`, `supabase/migrations/00002_rls_policies.sql`

## 컨벤션
- UI 텍스트/주석: 한국어
- 코드(변수명, 함수명): 영어
- 상태관리: Zustand (pythink2 패턴)
- API: Express 라우트 + Supabase Admin 클라이언트
- 인증: Supabase Auth (Google OAuth) + JWT 미들웨어
- RLS: session_id 기반 멤버십 경계
