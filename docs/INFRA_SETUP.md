# 커리큘럼 위버 — 인프라 구축 가이드

100명 동시 사용자를 위한 프로덕션 인프라 설정 가이드입니다.

---

## 1. Supabase 프로젝트 생성

### 1-1. 프로젝트 생성

1. [https://supabase.com](https://supabase.com)에 로그인합니다.
2. **New Project**를 클릭합니다.
3. 설정:
   - **Organization**: 기존 조직 선택 또는 새로 생성
   - **Project Name**: `curriculum-weaver` (또는 원하는 이름)
   - **Database Password**: 안전한 비밀번호 설정 (나중에 사용하지 않으므로 기록만 해두세요)
   - **Region**: `Northeast Asia (Tokyo)` 선택
4. **Create new project**를 클릭하고 프로비저닝이 완료될 때까지 대기합니다 (약 2분).

### 1-2. pgvector 확장 활성화

프로젝트가 생성되면 **SQL Editor**에서 아래 SQL을 실행합니다:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 1-3. 인증 설정

1. 좌측 메뉴 **Authentication** > **Providers**로 이동합니다.
2. **Email** 프로바이더가 활성화되어 있는지 확인합니다.
3. (선택) Google OAuth를 사용하려면:
   - Google Cloud Console에서 OAuth 클라이언트 ID를 생성합니다.
   - Supabase **Authentication** > **Providers** > **Google**에 Client ID와 Secret을 입력합니다.

### 1-4. Realtime 확인

1. 좌측 메뉴 **Database** > **Replication**으로 이동합니다.
2. Realtime이 활성화되어 있는지 확인합니다.
3. 필요한 테이블(`messages`, `boards`, `activity_logs`)에 대해 Realtime을 활성화합니다.

---

## 2. 데이터베이스 마이그레이션 적용

### 방법 A: Supabase CLI 사용 (권장)

```bash
# Supabase CLI 로그인
npx supabase login

# 프로젝트 연결 (Project Settings > General에서 Reference ID 확인)
npx supabase link --project-ref YOUR_PROJECT_REF

# 마이그레이션 적용
npx supabase db push
```

### 방법 B: SQL Editor에서 직접 실행

Supabase Dashboard의 **SQL Editor**에서 아래 파일을 순서대로 실행합니다:

1. `supabase/migrations/00010_rebuild_schema.sql` — 테이블 스키마
2. `supabase/migrations/00011_realtime_and_seed.sql` — Realtime 설정 및 시드 데이터

> **주의**: 00001~00005는 이전 스키마이므로 실행하지 않습니다. 00010부터 실행하세요.

---

## 3. 환경변수 추출

Supabase Dashboard에서 아래 값을 복사합니다:

1. **Settings** > **API**로 이동합니다.
2. 필요한 값:

| 환경변수 | 위치 | 설명 |
|----------|------|------|
| `SUPABASE_URL` | Project URL | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | anon / public | 클라이언트용 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret | 서버 전용 관리자 키 |

> **경고**: `SUPABASE_SERVICE_ROLE_KEY`는 절대 클라이언트에 노출하지 마세요.

---

## 4. 성취기준 데이터 적재

### 4-1. 환경변수 설정

프로젝트 루트에 `.env` 파일을 생성합니다:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-...
```

### 4-2. 시드 스크립트 실행

```bash
node scripts/seed-standards-to-supabase.mjs
```

이 스크립트는 `server/data/standards.js`와 `server/data/standards_social.js`의 성취기준 데이터를 Supabase `standards` 테이블에 적재합니다.

---

## 5. Railway 배포 (백엔드)

### 5-1. Railway 프로젝트 생성

1. [https://railway.app](https://railway.app)에 로그인합니다.
2. **New Project** > **Deploy from GitHub repo**를 선택합니다.
3. `curriculum-weaver` 리포지토리를 연결합니다.

### 5-2. 환경변수 설정

Railway Dashboard > **Variables**에서 아래 환경변수를 설정합니다:

| 환경변수 | 값 | 설명 |
|----------|-----|------|
| `PORT` | Railway가 자동 설정 | 서버 포트 |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` | Supabase 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Supabase 관리자 키 |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Claude API 키 |
| `CLIENT_URL` | `https://your-app.vercel.app` | CORS 허용 URL (쉼표로 복수 지정 가능) |
| `NODE_ENV` | `production` | 실행 환경 |

### 5-3. 서비스 설정

- **Root Directory**: `/` (기본값)
- **Start Command**: `npm start` (`railway.json`에 정의됨)
- **Health Check**: `/api/health` (자동 설정됨)

### 5-4. 배포

```bash
# Railway CLI 설치 (아직 안 했다면)
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 연결
railway link

# 배포
railway up
```

또는 GitHub에 push하면 자동 배포됩니다.

### 5-5. 배포 확인

```bash
curl https://your-railway-domain.up.railway.app/api/health
# 응답: {"status":"ok","service":"curriculum-weaver","version":"abc1234"}
```

---

## 6. Vercel 배포 (프론트엔드)

### 6-1. Vercel 프로젝트 생성

1. [https://vercel.com](https://vercel.com)에 로그인합니다.
2. **Import Project** > GitHub 리포지토리 선택합니다.
3. Framework Preset: **Other** 선택합니다.

### 6-2. 빌드 설정

`vercel.json`이 이미 설정되어 있으므로 자동 감지됩니다:

- **Build Command**: `npm run build --workspace=client`
- **Output Directory**: `client/dist`
- **Install Command**: `npm install`

### 6-3. 환경변수 설정

Vercel Dashboard > **Settings** > **Environment Variables**:

| 환경변수 | 값 | 설명 |
|----------|-----|------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` | Supabase 공개 키 |
| `VITE_API_URL` | `https://your-railway-domain.up.railway.app` | 백엔드 API URL |

### 6-4. 배포

```bash
# Vercel CLI 설치 (아직 안 했다면)
npm install -g vercel

# 배포
vercel --prod
```

또는 GitHub에 push하면 자동 배포됩니다.

---

## 7. 동작 확인 체크리스트

배포 후 아래 항목을 순서대로 확인합니다:

### 백엔드 (Railway)

- [ ] 헬스 체크 응답 확인: `GET /api/health` -> `{"status":"ok"}`
- [ ] CORS 설정 확인: Vercel 도메인에서 API 호출 성공
- [ ] Socket.IO 연결 확인: 브라우저 개발자 도구 Network 탭에서 WebSocket 연결 확인
- [ ] Rate Limit 동작 확인: 빠른 연속 요청 시 429 응답

### 프론트엔드 (Vercel)

- [ ] 메인 페이지 로드 확인
- [ ] Supabase 연결 확인: 로그인/회원가입 동작
- [ ] API 연결 확인: 성취기준 목록 로드
- [ ] 정적 에셋 캐싱 확인: `/assets/*` 응답 헤더에 `Cache-Control: public, max-age=31536000, immutable`

### 실시간 협업

- [ ] 두 브라우저에서 같은 프로젝트에 접속하여 실시간 동기화 확인
- [ ] Socket.IO 멤버 목록 업데이트 확인
- [ ] AI 채팅 SSE 스트리밍 정상 동작 확인

### AI 기능

- [ ] AI 채팅 메시지 전송 및 응답 수신 확인
- [ ] 절차 인트로 생성 확인
- [ ] `<ai_suggestion>` 파싱 및 제안 수락/거부 동작 확인
- [ ] Rate Limit: AI 채팅 분당 10회 제한 동작 확인

### 데이터베이스

- [ ] 성취기준 데이터 정상 로드 확인
- [ ] 보드 데이터 저장/조회 확인
- [ ] Realtime 구독 동작 확인 (해당 시)

---

## 8. 용량 계획 (100명 동시 사용자)

### Railway (백엔드)

| 리소스 | 권장 사양 | 근거 |
|--------|----------|------|
| Memory | 512MB ~ 1GB | 인메모리 스토어 + Socket.IO 연결 관리 |
| CPU | 1 vCPU | Express + Socket.IO |
| 인스턴스 | 1개 | Socket.IO 단일 프로세스 (스케일 아웃 시 Redis Adapter 필요) |

### Supabase (DB)

| 항목 | Free 티어 | Pro 티어 (권장) |
|------|----------|---------------|
| DB 크기 | 500MB | 8GB |
| 동시 연결 | 60 | 200 |
| Realtime 메시지 | 200만/월 | 500만/월 |
| Auth 사용자 | 50,000 | 100,000 |

> **참고**: 100명 동시 사용자라면 Supabase **Pro 플랜** ($25/월)을 권장합니다.

### Anthropic API

| 항목 | 값 | 설명 |
|------|-----|------|
| 동시 요청 제한 | 5개 (p-queue) | 서버에서 제어 |
| 사용자당 요청 제한 | 분당 10회 (rate limit) | 서버에서 제어 |
| 모델 | claude-sonnet-4-6 | 비용 효율적 |
| max_tokens | 12,000 (대화) / 1,200 (인트로) | 토큰 예산 관리 |

---

## 9. 트러블슈팅

### Railway 배포 실패 시

```bash
# 빌드 로그 확인
railway logs

# 로컬에서 프로덕션 모드 테스트
NODE_ENV=production npm start
```

### Socket.IO 연결 안 될 때

1. `CLIENT_URL` 환경변수에 프론트엔드 도메인이 포함되어 있는지 확인합니다.
2. Railway의 네트워크 설정에서 WebSocket이 허용되어 있는지 확인합니다.
3. Vercel의 프록시 설정이 WebSocket을 차단하지 않는지 확인합니다.

### AI 응답이 느릴 때

1. Railway 로그에서 p-queue 대기 상황을 확인합니다.
2. Anthropic API Dashboard에서 rate limit 상태를 확인합니다.
3. `max_tokens`를 줄여 응답 속도를 개선할 수 있습니다.

### Supabase 연결 오류 시

1. 환경변수(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)가 올바른지 확인합니다.
2. Supabase Dashboard > **Settings** > **API**에서 키를 다시 복사합니다.
3. RLS 정책이 활성화되어 있다면 `service_role` 키를 사용하는지 확인합니다.
