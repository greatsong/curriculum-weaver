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

## 컨벤션
- UI 텍스트/주석: 한국어
- 코드(변수명, 함수명): 영어
- 상태관리: Zustand (pythink2 패턴)
- API: Express 라우트 + Supabase Admin 클라이언트
- 인증: Supabase Auth (Google OAuth) + JWT 미들웨어
- RLS: session_id 기반 멤버십 경계
