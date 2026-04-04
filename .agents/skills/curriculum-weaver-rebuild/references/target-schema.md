# 목표 Supabase 스키마

MVP 설계안 + 워크플로우 xlsx를 통합한 데이터베이스 설계.

---

## 테이블 설계 (12 테이블)

### 1. users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT DEFAULT 'teacher', -- teacher, admin
  school_name TEXT,
  subject TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. workspaces
```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id) NOT NULL,
  -- Host 설정
  ai_config JSONB DEFAULT '{}', -- { model, apiKeyRef, enabledActionTypes }
  workflow_config JSONB DEFAULT '{}', -- { hiddenProcedures, procedureOrder }
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3. members
```sql
CREATE TABLE members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('host', 'owner', 'editor', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
```

### 4. invites
```sql
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'editor',
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
```

### 5. projects
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  grade TEXT, -- 학년
  subjects TEXT[], -- 참여 교과
  learner_context JSONB DEFAULT '{}',
  -- { digitalLiteracy, gender, multicultural, prevContext, etc. }
  current_procedure TEXT DEFAULT 'prep',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 6. designs (절차별 설계 캔버스)
```sql
CREATE TABLE designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  procedure_code TEXT NOT NULL, -- 'T-1-1', 'A-2-1', etc.
  content JSONB DEFAULT '{}', -- 절차별 보드 스키마에 따른 데이터
  save_status TEXT DEFAULT 'draft' CHECK (save_status IN ('draft', 'confirmed', 'locked')),
  last_editor_id UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, procedure_code)
);
```

### 7. versions (설계 스냅샷)
```sql
CREATE TABLE versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL, -- 전체 content 스냅샷
  trigger_type TEXT, -- 'ai_accept', 'manual_save', 'step_complete'
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 8. messages (AI 채팅)
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'assistant', 'system')),
  sender_scope TEXT DEFAULT 'individual', -- 'individual' or 'team'
  content TEXT NOT NULL,
  procedure_context TEXT, -- 현재 절차 코드
  step_context INTEGER, -- 현재 스텝 번호
  ai_suggestions JSONB, -- AI 제안 데이터 (수락/거부 추적)
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 9. comments (섹션별 댓글)
```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL, -- 보드 내 섹션 키
  user_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 10. activity_logs (활동 로그)
```sql
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL,
  -- 'create', 'edit', 'delete', 'ai_accept', 'ai_edit_accept', 'ai_reject',
  -- 'comment', 'status_change', 'step_advance'
  procedure_code TEXT,
  section_key TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 11. curriculum_standards (교육과정 성취기준)
```sql
CREATE TABLE curriculum_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- [9국01-01]
  subject TEXT NOT NULL,
  grade_group TEXT, -- 초1-2, 초3-4, 초5-6, 중, 고공통, 고선택
  school_level TEXT, -- elementary, middle, high
  area TEXT, -- 영역
  content TEXT NOT NULL, -- 성취기준 본문
  explanation TEXT, -- 해설
  considerations TEXT, -- 적용 시 고려사항
  -- 확장 메타데이터 (교육과정 종합분석표)
  competencies JSONB, -- 관련 교과역량
  content_system JSONB, -- { coreIdea, knowledge, process, values }
  teaching_learning TEXT, -- 교수학습 방향
  assessment_guide TEXT, -- 평가 방향
  keywords TEXT[], -- 검색용 키워드
  embedding VECTOR(1536) -- pgvector (선택)
);
```

### 12. project_standards (프로젝트-성취기준 연결)
```sql
CREATE TABLE project_standards (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  standard_id UUID REFERENCES curriculum_standards(id),
  is_primary BOOLEAN DEFAULT false,
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, standard_id)
);
```

---

## RLS 정책 요약

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| workspaces | 멤버만 | 인증 사용자 | owner/host만 | owner만 |
| members | 같은 workspace 멤버 | owner/host만 | owner/host만 | owner/host만 |
| projects | workspace 멤버 | editor 이상 | editor 이상 | owner만 |
| designs | workspace 멤버 | editor 이상 | editor 이상 | owner만 |
| messages | workspace 멤버 | editor 이상 | 없음 | 없음 |
| comments | workspace 멤버 | editor 이상 | 작성자만 | 작성자/owner만 |
| curriculum_standards | 전체 공개 | admin만 | admin만 | admin만 |

---

## 현재 스키마와의 차이

| 현재 (미적용) | 목표 | 변경 |
|-------------|------|------|
| design_sessions | workspaces + projects | 2단계 계층으로 분리 |
| session_members | members | workspace 레벨로 이동 |
| design_boards | designs | procedure_code 기반, save_status 추가 |
| design_board_history | versions | trigger_type 추가 |
| chat_messages | messages | sender_scope, step_context, ai_suggestions 추가 |
| (없음) | comments | **신규** |
| (없음) | activity_logs | **신규** |
| (없음) | invites | **신규** |
| curriculum_standards | curriculum_standards | 메타데이터 대폭 확장 |
| session_standards | project_standards | project 기반으로 변경 |
| standard_links | (유지 가능) | 필요시 별도 결정 |
| design_principles | (인메모리 유지) | 서버 데이터 파일로 충분 |
| simulations | (제거) | MVP 범위 외 |
| reflections | (제거) | E-1-1, E-2-1 designs로 흡수 |
