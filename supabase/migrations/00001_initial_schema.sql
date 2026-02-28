-- ============================================================
-- Curriculum Weaver — 초기 스키마
-- PostgreSQL + Supabase + pgvector
-- ============================================================

-- pgvector 확장
CREATE EXTENSION IF NOT EXISTS vector;

-- updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. users — Supabase Auth 연동
-- ============================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'teacher'
                CHECK (role IN ('teacher', 'admin')),
  avatar_url    TEXT,
  school_name   TEXT,
  subject       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. design_sessions — 설계 세션
-- ============================================================
CREATE TABLE design_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  creator_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code     TEXT NOT NULL UNIQUE,
  current_stage   SMALLINT NOT NULL DEFAULT 1
                  CHECK (current_stage BETWEEN 1 AND 7),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'archived')),
  ai_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER design_sessions_updated_at BEFORE UPDATE ON design_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_ds_creator ON design_sessions(creator_id);
CREATE INDEX idx_ds_status ON design_sessions(status);
CREATE INDEX idx_ds_invite ON design_sessions(invite_code);

-- ============================================================
-- 3. session_members — 세션 참여 교사
-- ============================================================
CREATE TABLE session_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES design_sessions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner', 'member')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE INDEX idx_sm_session ON session_members(session_id);
CREATE INDEX idx_sm_user ON session_members(user_id);

-- ============================================================
-- 4. curriculum_standards — 교육과정 성취기준
-- ============================================================
CREATE TABLE curriculum_standards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  subject         TEXT NOT NULL,
  grade_group     TEXT NOT NULL,
  area            TEXT NOT NULL,
  content         TEXT NOT NULL,
  keywords        TEXT[],
  embedding       vector(1536),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cs_subject ON curriculum_standards(subject);
CREATE INDEX idx_cs_grade ON curriculum_standards(grade_group);
CREATE INDEX idx_cs_code ON curriculum_standards(code);

-- ============================================================
-- 5. standard_links — 성취기준 간 연결 (그래프 엣지)
-- ============================================================
CREATE TABLE standard_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID NOT NULL REFERENCES curriculum_standards(id) ON DELETE CASCADE,
  target_id       UUID NOT NULL REFERENCES curriculum_standards(id) ON DELETE CASCADE,
  link_type       TEXT NOT NULL
                  CHECK (link_type IN (
                    'prerequisite', 'cross_subject', 'same_concept',
                    'extension', 'application'
                  )),
  similarity      FLOAT8,
  rationale       TEXT,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_id, link_type)
);

CREATE INDEX idx_sl_source ON standard_links(source_id);
CREATE INDEX idx_sl_target ON standard_links(target_id);

-- ============================================================
-- 6. session_standards — 세션에 연결된 성취기준
-- ============================================================
CREATE TABLE session_standards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES design_sessions(id) ON DELETE CASCADE,
  standard_id     UUID NOT NULL REFERENCES curriculum_standards(id) ON DELETE CASCADE,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  added_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, standard_id)
);

CREATE INDEX idx_ss_session ON session_standards(session_id);

-- ============================================================
-- 7. chat_messages — 실시간 채팅
-- ============================================================
CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES design_sessions(id) ON DELETE CASCADE,
  sender_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_type     TEXT NOT NULL
                  CHECK (sender_type IN ('teacher', 'ai', 'system')),
  content         TEXT NOT NULL,
  stage_context   SMALLINT,
  principles_used TEXT[],
  material_id     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cm_session_created ON chat_messages(session_id, created_at DESC);

-- ============================================================
-- 8. materials — 업로드된 자료
-- ============================================================
CREATE TABLE materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES design_sessions(id) ON DELETE CASCADE,
  uploader_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_type       TEXT NOT NULL,
  file_size       INTEGER NOT NULL,
  storage_path    TEXT NOT NULL,
  extracted_text  TEXT,
  ai_summary      TEXT,
  ai_analysis     JSONB,
  processing_status TEXT NOT NULL DEFAULT 'pending'
                  CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER materials_updated_at BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_mat_session ON materials(session_id);

-- chat_messages의 material_id FK (materials가 먼저 생성되어야 하므로)
ALTER TABLE chat_messages
  ADD CONSTRAINT fk_cm_material
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;

-- ============================================================
-- 9. design_boards — 단계별 설계 보드
-- ============================================================
CREATE TABLE design_boards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES design_sessions(id) ON DELETE CASCADE,
  stage           SMALLINT NOT NULL CHECK (stage BETWEEN 1 AND 7),
  board_type      TEXT NOT NULL,
  content         JSONB NOT NULL DEFAULT '{}',
  last_editor_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, stage, board_type)
);

CREATE TRIGGER design_boards_updated_at BEFORE UPDATE ON design_boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_db_session_stage ON design_boards(session_id, stage);

-- ============================================================
-- 10. design_board_history — 보드 변경 이력
-- ============================================================
CREATE TABLE design_board_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        UUID NOT NULL REFERENCES design_boards(id) ON DELETE CASCADE,
  editor_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  content         JSONB NOT NULL,
  version         INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 11. design_principles — 40개 설계 원칙
-- ============================================================
CREATE TABLE design_principles (
  id              TEXT PRIMARY KEY,
  stage           SMALLINT NOT NULL CHECK (stage BETWEEN 1 AND 7),
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  guideline       TEXT NOT NULL,
  check_question  TEXT,
  examples        JSONB DEFAULT '[]',
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER design_principles_updated_at BEFORE UPDATE ON design_principles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. principle_versions — 원칙 버전 이력
-- ============================================================
CREATE TABLE principle_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principle_id    TEXT NOT NULL REFERENCES design_principles(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  content         JSONB NOT NULL,
  changed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  change_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 13. simulations — 학생 성장 시뮬레이션
-- ============================================================
CREATE TABLE simulations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES design_sessions(id) ON DELETE CASCADE,
  stage           SMALLINT NOT NULL,
  input_data      JSONB NOT NULL,
  result          JSONB NOT NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sim_session ON simulations(session_id);

-- ============================================================
-- 14. reflections — 수업 후 성찰
-- ============================================================
CREATE TABLE reflections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES design_sessions(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  what_worked     TEXT,
  what_didnt      TEXT,
  student_reactions TEXT,
  principle_feedback JSONB DEFAULT '[]',
  next_actions    TEXT,
  ai_insights     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER reflections_updated_at BEFORE UPDATE ON reflections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_ref_session ON reflections(session_id);
