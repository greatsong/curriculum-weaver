# 인메모리 → Supabase 마이그레이션 계획서

## 현재 문제
서버 재시작/재배포 시 **모든 세션 데이터 소실** (`server/lib/store.js`가 JavaScript Map 기반)

## 전략
**인증(Auth) 없이 데이터 영속화만 우선 적용** — `supabaseAdmin` (service_role)으로 RLS 우회

---

## 전제 조건 (작업 시작 전 반드시 확인)

1. **Supabase 프로젝트 생성 완료** 및 환경변수 설정:
   - `SUPABASE_URL` — Supabase 대시보드 > Settings > API > Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Settings > API > service_role (비밀키)
   - 서버 `.env` 파일 또는 Railway 환경변수에 설정
2. **마이그레이션 적용 순서**: Supabase SQL Editor에서 실행
   1. `supabase/migrations/00001_initial_schema.sql`
   2. `supabase/migrations/00002_rls_policies.sql`
   3. `supabase/migrations/00003_noauth_mode.sql` ← 이 계획에서 새로 작성
3. RLS는 활성화되지만, `supabaseAdmin` (service_role)이 자동 우회하므로 문제 없음

---

## Phase 0: DB 스키마 조정

### 문제
`design_sessions.creator_id`는 `NOT NULL` + `users(id)` FK 참조.
인증 없이는 `users` 테이블에 레코드가 없으므로 세션 INSERT 불가.
`materials.uploader_id`도 동일한 문제.

### 새 파일: `supabase/migrations/00003_noauth_mode.sql`

```sql
-- ============================================================
-- 인증 없는 모드를 위한 스키마 조정
-- Auth 구현 후 되돌릴 것 (00004_restore_notnull.sql)
-- ============================================================

-- design_sessions: creator_id nullable + FK 해제
ALTER TABLE design_sessions ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE design_sessions DROP CONSTRAINT IF EXISTS design_sessions_creator_id_fkey;

-- materials: uploader_id nullable + FK 해제
ALTER TABLE materials ALTER COLUMN uploader_id DROP NOT NULL;
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_uploader_id_fkey;

-- session_standards: added_by FK 해제 (이미 nullable)
ALTER TABLE session_standards DROP CONSTRAINT IF EXISTS session_standards_added_by_fkey;

-- 기존 RLS 정책은 그대로 두되, service_role이 우회하므로 영향 없음
```

### FK 제약을 해제하는 이유
- `users` 테이블이 비어있으므로, FK가 있으면 INSERT 시 외래키 위반 발생
- `service_role`은 RLS는 우회하지만, FK 제약은 우회 불가
- Auth 구현 후 `00004_restore_notnull.sql`에서 FK 복원

---

## Phase 1: 데이터 분류

### DB로 이동 (영속화 대상)
| 엔티티 | Map 변수 | DB 테이블 | 메서드 수 | 중요도 |
|--------|---------|-----------|----------|--------|
| Sessions | `sessions` | `design_sessions` | 6개 | ★★★ |
| Messages | `messages` | `chat_messages` | 2개 | ★★★ |
| Boards | `boards` | `design_boards` | 3개 | ★★☆ |
| Materials | `materials` | `materials` | 3개 | ★★☆ |
| SessionStandards | `sessionStandards` | `session_standards` | 3개 | ★☆☆ |

### 인메모리 유지 (변경 없음)
| 엔티티 | Map 변수 | 이유 |
|--------|---------|------|
| Principles | `principles` | `data/principles.js`에서 로드하는 40개 정적 데이터 |
| Standards | `standards` | 벌크 업로드+데모 데이터, 서버 시작 시 로드 |
| StandardLinks | `standardLinks` | Standards와 함께 관리 |

> Principles, Standards, StandardLinks의 export 인터페이스는 **그대로 유지** (동기 함수)

### 하이브리드: curriculum_links (DB + 인메모리 캐시)
| 엔티티 | 현재 상태 | DB 테이블 | 비고 |
|--------|----------|-----------|------|
| CurriculumLinks | 인메모리 (`generatedLinks.js`) | `curriculum_links` | 3계층 status 관리 |

- **현재**: `generatedLinks.js` → store.js 인메모리 Map으로 로드
- **마이그레이션 후**: `curriculum_links` 테이블이 원본, 서버 시작 시 캐시 로드
- **마이그레이션 스크립트**: `scripts/migrateLinksToDB.js` (1,768개 AI 링크 이관)
- **추가 필드**: `status`, `quality_score`, `semantic_score`, `integration_theme`, `lesson_hook`, `generation_method`

---

## Phase 2: `server/lib/store.js` 완전 변환 코드

### 파일 구조 변경 개요
```
store.js (370줄)
├─ import 추가: supabaseAdmin
├─ Map 변수: sessions, messages, boards, materials, sessionStandards 삭제
│  (principles, standards, standardLinks는 유지)
├─ 헬퍼 함수: inviteCode() 유지, uuid() 삭제 (DB가 gen_random_uuid() 처리)
├─ initStore(): async로 변경, 기본 세션은 DB 확인 후 조건부 생성
├─ Sessions: 전체 async로 변환
├─ Messages: 전체 async로 변환
├─ Boards: 전체 async로 변환
├─ Materials: 전체 async로 변환
├─ SessionStandards: 전체 async로 변환
├─ Principles: 변경 없음 (인메모리 유지)
├─ Standards: 변경 없음 (인메모리 유지)
└─ StandardLinks: 변경 없음 (인메모리 유지)
```

### 2-0. import 및 삭제

```js
// ── 추가 ──
import { supabaseAdmin } from './supabaseAdmin.js'

// ── 삭제 ──
// function uuid() { ... }  — DB가 gen_random_uuid() 처리
// const sessions = new Map()
// const messages = new Map()
// const boards = new Map()
// const materials = new Map()
// const sessionStandards = new Map()

// ── 유지 ──
import crypto from 'crypto'                  // inviteCode()에서 사용 안 하지만 Principles 로딩 등에 필요 없음 — 확인 후 삭제 가능
import { PRINCIPLES } from '../data/principles.js'
import { DEMO_STANDARDS, DEMO_LINKS } from '../data/standards.js'

function inviteCode() { /* 그대로 유지 */ }

const principles = new Map()    // 유지
const standards = new Map()     // 유지
const standardLinks = new Map() // 유지
```

> `crypto`는 `uuid()` 전용이었으므로 삭제 가능. `inviteCode()`는 `Math.random()` 사용 중.

### 2-1. Sessions (6개 메서드)

```js
export const Sessions = {
  list: async () => {
    const { data, error } = await supabaseAdmin
      .from('design_sessions')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  get: async (id) => {
    const { data, error } = await supabaseAdmin
      .from('design_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data  // null if not found
  },

  create: async ({ title, description }) => {
    const { data, error } = await supabaseAdmin
      .from('design_sessions')
      .insert({
        title,
        description: description || null,
        creator_id: null,          // Auth 없는 모드
        invite_code: inviteCode(),
        current_stage: 1,
        status: 'active',
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  update: async (id, updateData) => {
    const { data, error } = await supabaseAdmin
      .from('design_sessions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  delete: async (id) => {
    // CASCADE가 chat_messages, design_boards, materials, session_standards 자동 삭제
    const { error } = await supabaseAdmin
      .from('design_sessions')
      .delete()
      .eq('id', id)
    if (error) throw error
    return true
  },

  findByInviteCode: async (code) => {
    const { data, error } = await supabaseAdmin
      .from('design_sessions')
      .select('*')
      .eq('invite_code', code.toUpperCase())
      .maybeSingle()
    if (error) throw error
    return data  // null if not found
  },
}
```

**인메모리 대비 차이점**:
- `single()` 대신 `maybeSingle()` 사용 — not found 시 에러 대신 `null` 반환
- `delete()`에서 messages/boards/materials를 수동 삭제하던 코드 제거 → DB CASCADE가 처리
- `create()`에서 `messages.set()`, `materials.set()` 등 초기화 코드 제거 → 필요 시 DB에서 빈 배열로 조회됨

### 2-2. Messages (2개 메서드)

```js
export const Messages = {
  list: async (sessionId) => {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  add: async (sessionId, { sender_type, content, stage_context, principles_used, sender_name, sender_subject }) => {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        sender_id: null,           // Auth 없는 모드
        sender_type,
        content,
        stage_context: stage_context || null,
        principles_used: principles_used || [],  // TEXT[] 타입, SDK가 자동 처리
      })
      .select()
      .single()
    if (error) throw error

    // sender_name, sender_subject는 DB 스키마에 없음
    // → 클라이언트에서만 사용하는 필드이므로, 반환 시 추가
    return { ...data, sender_name: sender_name || null, sender_subject: sender_subject || null }
  },
}
```

**주의: DB 스키마 차이**
- 인메모리 store의 `sender_name`, `sender_subject` 필드는 DB `chat_messages` 테이블에 없음
- 두 가지 선택:
  - **A) DB 컬럼 추가** (권장): `00003_noauth_mode.sql`에 아래 추가
    ```sql
    ALTER TABLE chat_messages ADD COLUMN sender_name TEXT;
    ALTER TABLE chat_messages ADD COLUMN sender_subject TEXT;
    ```
  - **B) 무시**: 이 필드들은 실시간 표시용이고, 재로드 시에는 sender_type으로 구분하면 충분

  → **A안 권장** (채팅 기록 재로드 시 누가 보냈는지 알 수 있어야 함)

### 2-3. Boards (3개 메서드)

```js
export const Boards = {
  listByStage: async (sessionId, stage) => {
    const { data, error } = await supabaseAdmin
      .from('design_boards')
      .select('*')
      .eq('session_id', sessionId)
      .eq('stage', parseInt(stage))
    if (error) throw error
    return data || []
  },

  get: async (id) => {
    const { data, error } = await supabaseAdmin
      .from('design_boards')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data
  },

  upsert: async (sessionId, stage, boardType, content) => {
    const { data, error } = await supabaseAdmin
      .from('design_boards')
      .upsert(
        {
          session_id: sessionId,
          stage: parseInt(stage),
          board_type: boardType,
          content: content || {},
          last_editor_id: null,     // Auth 없는 모드
        },
        { onConflict: 'session_id,stage,board_type' }
      )
      .select()
      .single()
    if (error) throw error
    return data
  },
}
```

**핵심**: DB의 `UNIQUE(session_id, stage, board_type)` 제약 조건 + Supabase `upsert` `onConflict`로 기존 인메모리 upsert 로직을 완전 대체.

**주의: version 필드**
- 인메모리에서는 `version += 1`로 수동 증가
- DB에서는 upsert 시 `version`을 어떻게 처리할지:
  - **선택 A**: DB trigger로 자동 증가 (별도 마이그레이션 필요)
  - **선택 B**: upsert 전에 현재 version 조회 후 +1 (2번 쿼리)
  - **선택 C**: version 필드 무시 (기본값 1 유지)
  - → **선택 A 권장**: `00003_noauth_mode.sql`에 추가
    ```sql
    CREATE OR REPLACE FUNCTION increment_board_version()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD IS NOT NULL THEN
        NEW.version = OLD.version + 1;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER board_version_increment
      BEFORE UPDATE ON design_boards
      FOR EACH ROW EXECUTE FUNCTION increment_board_version();
    ```

### 2-4. Materials (3개 메서드)

```js
export const Materials = {
  list: async (sessionId) => {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  add: async (sessionId, materialData) => {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .insert({
        session_id: sessionId,
        uploader_id: null,          // Auth 없는 모드
        file_name: materialData.file_name,
        file_type: materialData.file_type,
        file_size: materialData.file_size,
        storage_path: materialData.storage_path,
        processing_status: materialData.processing_status || 'pending',
        ai_summary: materialData.ai_summary || null,
        ai_analysis: materialData.ai_analysis || null,
        extracted_text: materialData.extracted_text || null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  update: async (id, updateData) => {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
```

### 2-5. SessionStandards (3개 메서드)

```js
export const SessionStandards = {
  list: async (sessionId) => {
    const linked = await supabaseAdmin
      .from('session_standards')
      .select('*')
      .eq('session_id', sessionId)

    if (linked.error) throw linked.error

    // 인메모리 Standards에서 상세 정보 조인 (curriculum_standards는 아직 DB에 없으므로)
    return (linked.data || []).map((entry) => {
      const std = standards.get(entry.standard_id)
      return std ? { ...entry, curriculum_standards: std } : null
    }).filter(Boolean)
  },

  add: async (sessionId, standardId, isPrimary = false) => {
    const { data, error } = await supabaseAdmin
      .from('session_standards')
      .insert({
        session_id: sessionId,
        standard_id: standardId,
        is_primary: isPrimary,
        added_by: null,             // Auth 없는 모드
      })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return null  // UNIQUE 위반 = 이미 추가됨
      throw error
    }
    const std = standards.get(standardId)
    return { ...data, curriculum_standards: std }
  },

  remove: async (sessionId, standardId) => {
    const { error, count } = await supabaseAdmin
      .from('session_standards')
      .delete()
      .eq('session_id', sessionId)
      .eq('standard_id', standardId)
    if (error) throw error
    return count > 0
  },
}
```

**주의: Standards가 인메모리인 한계**
- `session_standards` 테이블의 `standard_id`는 `curriculum_standards` 테이블 FK
- 하지만 Standards가 인메모리이므로, `curriculum_standards` 테이블은 비어있음
- → FK 위반 발생! `00003_noauth_mode.sql`에 FK 해제 추가 필요:
  ```sql
  ALTER TABLE session_standards DROP CONSTRAINT IF EXISTS session_standards_standard_id_fkey;
  ```
- 또는 Standards도 DB에 넣어야 함 (Phase 1에서 "인메모리 유지"로 분류했지만, SessionStandards의 DB 전환 시 충돌)

**대안**: SessionStandards도 인메모리 유지 → 세션 생성 후 추가한 성취기준만 소실되는 제한적 문제
**권장**: `session_standards`의 `standard_id` FK도 해제하고, 인메모리 Standards에서 조인

### 2-6. initStore() 변경

```js
export async function initStore() {
  // 1. 정적 데이터: 기존과 동일하게 인메모리 로드
  for (const p of PRINCIPLES) {
    principles.set(p.id, { ...p, is_active: true, version: 1, created_at: new Date().toISOString() })
  }

  for (const s of DEMO_STANDARDS) {
    const id = crypto.randomUUID()
    standards.set(id, { id, ...s, created_at: new Date().toISOString() })
  }

  for (const link of DEMO_LINKS) {
    const sourceStd = [...standards.values()].find((s) => s.code === link.source)
    const targetStd = [...standards.values()].find((s) => s.code === link.target)
    if (sourceStd && targetStd) {
      const id = crypto.randomUUID()
      standardLinks.set(id, {
        id,
        source_id: sourceStd.id,
        target_id: targetStd.id,
        source_code: link.source,
        target_code: link.target,
        link_type: link.link_type,
        rationale: link.rationale,
        similarity: link.link_type === 'same_concept' ? 0.9 : link.link_type === 'cross_subject' ? 0.7 : 0.6,
        created_at: new Date().toISOString(),
      })
    }
  }

  console.log(`  정적 데이터: 원칙 ${principles.size}개, 성취기준 ${standards.size}개, 연결 ${standardLinks.size}개`)

  // 2. DB에 활성 세션이 있는지 확인 → 없으면 기본 세션 생성
  try {
    const { data: existing } = await supabaseAdmin
      .from('design_sessions')
      .select('id')
      .eq('status', 'active')
      .limit(1)

    if (existing && existing.length > 0) {
      console.log(`  DB 세션 존재 — 기본 세션 생성 건너뜀`)
      return existing[0].id
    }

    // 기본 세션 생성
    const { data: newSession, error } = await supabaseAdmin
      .from('design_sessions')
      .insert({
        title: '융합 수업 설계 시작하기',
        description: 'AI와 함께 융합 수업을 설계해보세요',
        creator_id: null,
        invite_code: inviteCode(),
        current_stage: 1,
        status: 'active',
      })
      .select()
      .single()

    if (error) throw error
    console.log(`  기본 세션 생성됨: ${newSession.id}`)
    return newSession.id
  } catch (err) {
    console.error('  DB 연결 실패 — 인메모리 폴백 없음:', err.message)
    throw err  // DB 없이는 서비스 불가
  }
}
```

---

## Phase 3: 라우트 파일 변경 (정확한 위치)

모든 라우트 핸들러는 이미 `async`이므로, `await`만 추가하면 됨.

### 3-1. `server/routes/sessions.js` — 변경 5곳

| 줄 | 현재 코드 | 변경 |
|----|----------|------|
| 14 | `let sessions = Sessions.list()` | `let sessions = await Sessions.list()` |
| 23 | `const session = Sessions.get(req.params.id)` | `const session = await Sessions.get(req.params.id)` |
| 33 | `const session = Sessions.create({...})` | `const session = await Sessions.create({...})` |
| 42 | `const session = Sessions.findByInviteCode(...)` | `const session = await Sessions.findByInviteCode(...)` |
| 58 | `const session = Sessions.update(req.params.id, updateData)` | `const session = await Sessions.update(req.params.id, updateData)` |
| 65 | `const deleted = Sessions.delete(req.params.id)` | `const deleted = await Sessions.delete(req.params.id)` |
| 72 | `const data = SessionStandards.list(req.params.id)` | `const data = await SessionStandards.list(req.params.id)` |

추가: 각 핸들러에 try-catch 래핑 (현재는 없음)

```js
// 변경 전
sessionsRouter.get('/', async (req, res) => {
  const { status } = req.query
  let sessions = Sessions.list()
  if (status) {
    sessions = sessions.filter((s) => s.status === status)
  }
  res.json(sessions)
})

// 변경 후
sessionsRouter.get('/', async (req, res, next) => {
  try {
    const { status } = req.query
    let sessions = await Sessions.list()
    if (status) {
      sessions = sessions.filter((s) => s.status === status)
    }
    res.json(sessions)
  } catch (err) {
    next(err)
  }
})
```

> `next(err)` 패턴: Express 5는 async 에러를 자동 캐치하므로 `try-catch` 없이도 동작.
> 하지만 명시적 에러 처리가 더 안전. Express 5에서는 `next(err)` 불필요할 수 있으나 호환성 유지.

**Express 5 참고**: Express 5는 async 핸들러의 rejected promise를 자동으로 에러 미들웨어에 전달.
따라서 `try-catch + next(err)` 없이 `await`만 추가해도 충분. (`server/package.json`에 `express: ^5.2.1` 확인됨)

### 3-2. `server/routes/chat.js` — 변경 7곳

| 줄 | 현재 코드 | 변경 |
|----|----------|------|
| 48 | `const messages = Messages.list(...)` | `const messages = await Messages.list(...)` |
| 59 | `const msg = Messages.add(...)` | `const msg = await Messages.add(...)` |
| 84 | `const session = Sessions.get(session_id)` | `const session = await Sessions.get(session_id)` |
| 101-106 | `Messages.add(session_id, {...})` | `await Messages.add(session_id, {...})` |
| 136 | `const session = Sessions.get(session_id)` | `const session = await Sessions.get(session_id)` |
| 137 | `const principles = Principles.list(stage)` | 변경 없음 (인메모리 유지) |
| 138 | `const boards = Boards.listByStage(...)` | `const boards = await Boards.listByStage(...)` |
| 139 | `const materials = Materials.list(session_id)` | `const materials = await Materials.list(session_id)` |
| 140 | `const recentMessages = Messages.list(session_id).slice(-20)` | `const allMsgs = await Messages.list(session_id); const recentMessages = allMsgs.slice(-20)` |
| 179 | `Boards.upsert(...)` | `await Boards.upsert(...)` (map 내부 → for 루프로 변환) |
| 194 | `Messages.add(...)` | `await Messages.add(...)` |

**주의: 178-180줄의 `.map()` → `for` 루프 전환 필요**
```js
// 현재 (동기 map)
const appliedBoards = updates.map((u) =>
  Boards.upsert(session_id, stage, u.board_type, u.content)
)

// 변경 (비동기이므로 for 루프 또는 Promise.all)
const appliedBoards = await Promise.all(
  updates.map((u) => Boards.upsert(session_id, stage, u.board_type, u.content))
)
```

### 3-3. `server/routes/boards.js` — 변경 3곳

| 줄 | 현재 코드 | 변경 |
|----|----------|------|
| 11 | `const boards = Boards.listByStage(...)` | `const boards = await Boards.listByStage(...)` |
| 18 | `const board = Boards.get(req.params.id)` | `const board = await Boards.get(req.params.id)` |
| 21 | `const updated = Boards.upsert(...)` | `const updated = await Boards.upsert(...)` |
| 28 | `const board = Boards.upsert(...)` | `const board = await Boards.upsert(...)` |

### 3-4. `server/routes/materials.js` — 변경 2곳

| 줄 | 현재 코드 | 변경 |
|----|----------|------|
| 16 | `const materials = Materials.list(...)` | `const materials = await Materials.list(...)` |
| 30 | `const material = Materials.add(...)` | `const material = await Materials.add(...)` |

### 3-5. `server/routes/standards.js` — 변경 1곳 (SessionStandards만)

| 줄 | 현재 코드 | 변경 |
|----|----------|------|
| 55 | `const result = SessionStandards.add(...)` | `const result = await SessionStandards.add(...)` |
| 62 | `const removed = SessionStandards.remove(...)` | `const removed = await SessionStandards.remove(...)` |

나머지 Standards, StandardLinks 호출은 인메모리 유지이므로 변경 없음.

### 3-6. `server/routes/principles.js` — 변경 없음

Principles는 인메모리 유지. 동기 함수 그대로.

### 3-7. `server/index.js` — 변경 1곳

```js
// 현재 (줄 16-17)
const defaultSessionId = initStore()
console.log(`  기본 세션 ID: ${defaultSessionId}`)

// 변경: top-level await (ESM + "type": "module" 이미 설정됨)
const defaultSessionId = await initStore()
console.log(`  기본 세션 ID: ${defaultSessionId}`)
```

> `server/package.json`에 `"type": "module"` 설정되어 있으므로 top-level await 사용 가능.

---

## Phase 4: 에러 처리 전략

### Express 5 자동 에러 전파
Express 5는 async 핸들러에서 throw된 에러를 자동으로 에러 미들웨어로 전달.
따라서 store.js에서 `throw error`만 하면 기존 에러 핸들러(`server/index.js:142-147`)가 처리.

### Supabase 에러 코드 참조
| 코드 | 의미 | 처리 |
|------|------|------|
| `PGRST116` | 행 없음 (`.single()`) | `maybeSingle()` 사용으로 회피 |
| `23505` | UNIQUE 제약 위반 | SessionStandards.add에서 `null` 반환 |
| `23503` | FK 제약 위반 | Phase 0에서 FK 해제로 회피 |
| 네트워크 오류 | DB 연결 실패 | throw → Express 에러 핸들러 → 500 응답 |

### 에러 응답 형식
현재 에러 핸들러가 `{ error: message }` 형식으로 반환하므로, 클라이언트 `ApiError` 클래스와 호환됨.

---

## Phase 5: DB 연결 실패 시 폴백 (선택)

**폴백 없는 전략 (권장)**:
- DB 연결이 없으면 서비스 불가
- `initStore()`에서 throw → 서버 시작 실패 → Railway가 재시작 시도
- 장점: 데이터 일관성 보장, 인메모리 폴백 시 데이터 소실 위험 제거

**폴백 있는 전략 (비권장)**:
- DB 연결 실패 시 기존 인메모리 모드로 폴백
- 단점: 두 가지 모드를 유지해야 하므로 복잡도 증가

---

## 완성된 마이그레이션 SQL: `00003_noauth_mode.sql`

```sql
-- ============================================================
-- 인증 없는 모드를 위한 스키마 조정
-- Auth 구현 시 00004_restore_auth_constraints.sql로 되돌릴 것
-- ============================================================

-- 1. NOT NULL 제거
ALTER TABLE design_sessions ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE materials ALTER COLUMN uploader_id DROP NOT NULL;

-- 2. FK 제약 해제 (users 테이블 비어있으므로)
ALTER TABLE design_sessions DROP CONSTRAINT IF EXISTS design_sessions_creator_id_fkey;
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_uploader_id_fkey;
ALTER TABLE session_standards DROP CONSTRAINT IF EXISTS session_standards_added_by_fkey;
ALTER TABLE session_standards DROP CONSTRAINT IF EXISTS session_standards_standard_id_fkey;

-- 3. chat_messages에 발신자 정보 컬럼 추가
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_subject TEXT;

-- 4. design_boards 버전 자동 증가 트리거
CREATE OR REPLACE FUNCTION increment_board_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD IS NOT NULL THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS board_version_increment ON design_boards;
CREATE TRIGGER board_version_increment
  BEFORE UPDATE ON design_boards
  FOR EACH ROW EXECUTE FUNCTION increment_board_version();
```

---

## 변경 파일 최종 요약

| 파일 | 변경 내용 | 변경 규모 |
|------|----------|----------|
| `supabase/migrations/00003_noauth_mode.sql` | **새 파일**: NOT NULL 해제, FK 해제, 컬럼 추가, 트리거 | ~30줄 |
| `server/lib/store.js` | **핵심 변경**: 5개 엔티티 Map→Supabase, initStore async화 | ~200줄 재작성 |
| `server/routes/sessions.js` | `await` 추가 7곳 | 최소 |
| `server/routes/chat.js` | `await` 추가 7곳 + `.map` → `Promise.all` | 소규모 |
| `server/routes/boards.js` | `await` 추가 4곳 | 최소 |
| `server/routes/materials.js` | `await` 추가 2곳 | 최소 |
| `server/routes/standards.js` | `await` 추가 2곳 (SessionStandards만) | 최소 |
| `server/index.js` | `initStore()` → `await initStore()` | 1줄 |

**변경하지 않는 파일**:
- `server/routes/principles.js` — Principles 인메모리 유지
- `server/lib/supabaseAdmin.js` — 이미 완성됨
- `server/services/aiAgent.js` — store에서 데이터를 받으므로 무관
- `server/middleware/auth.js` — 아직 비활성화 상태
- `client/*` — API 응답 형식 동일, 프론트엔드 변경 없음

---

## 작업 후 검증 체크리스트

### 서버 시작
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 환경변수 설정 확인
- [ ] `00001`, `00002`, `00003` 마이그레이션 적용 확인
- [ ] `npm run dev` → 서버 정상 시작, "기본 세션 ID" 로그 출력
- [ ] 서버 재시작 → "DB 세션 존재 — 기본 세션 생성 건너뜀" 로그 확인

### 세션 CRUD
- [ ] 대시보드에서 새 세션 생성 → DB에 저장 확인
- [ ] 서버 재시작 후 대시보드 → 이전 세션 목록 유지
- [ ] 세션 삭제 → DB에서 CASCADE 삭제 확인
- [ ] 초대 코드로 세션 참여 → 정상 동작

### 채팅
- [ ] AI 메시지 전송 → DB `chat_messages`에 저장
- [ ] 서버 재시작 후 세션 진입 → 이전 채팅 기록 표시
- [ ] SSE 스트리밍 정상 동작 (기존과 동일한 UX)

### 보드
- [ ] AI 보드 업데이트 → DB `design_boards`에 upsert
- [ ] 서버 재시작 후 → 이전 보드 내용 유지
- [ ] version 자동 증가 확인

### 자료 업로드
- [ ] 파일 업로드 → DB `materials`에 메타데이터 저장
- [ ] 서버 재시작 후 → 자료 목록 유지 (파일 자체는 여전히 인메모리)

### Socket.IO 실시간
- [ ] 멀티 유저 채팅 → 기존과 동일하게 동작
- [ ] 보드 실시간 동기화 → 기존과 동일

---

## 향후 단계 (이 마이그레이션 이후)

1. **Standards/Principles → DB 이동**: 벌크 업로드 데이터가 재시작 시에도 유지되도록
2. **Supabase Storage 연동**: 파일 업로드 바이너리 영속화 (현재 메모리 버퍼만)
3. **Auth 구현**: CLAUDE.md TODO 계획 참조
4. **FK/NOT NULL 복원**: `00004_restore_auth_constraints.sql`
5. **RLS 전환**: service_role → anon key + JWT 인증
