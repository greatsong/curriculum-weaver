-- ============================================================
-- 00010_rebuild_schema.sql
-- 커리큘럼 위버 리빌드: 전체 스키마 재생성
-- 기존 테이블 DROP → 12 테이블 + 헬퍼 함수 + 인덱스 + RLS
-- ============================================================

-- ── 기존 테이블 삭제 (역순 의존성) ──
DROP TABLE IF EXISTS session_standards CASCADE;
DROP TABLE IF EXISTS standard_links CASCADE;
DROP TABLE IF EXISTS curriculum_standards CASCADE;
DROP TABLE IF EXISTS design_board_history CASCADE;
DROP TABLE IF EXISTS design_boards CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS session_members CASCADE;
DROP TABLE IF EXISTS design_sessions CASCADE;
DROP TABLE IF EXISTS simulations CASCADE;
DROP TABLE IF EXISTS reflections CASCADE;
DROP TABLE IF EXISTS design_principles CASCADE;
DROP TABLE IF EXISTS stage_principles CASCADE;
DROP TABLE IF EXISTS general_principles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 기존 헬퍼 함수 삭제
DROP FUNCTION IF EXISTS is_session_member CASCADE;
DROP FUNCTION IF EXISTS is_workspace_member CASCADE;
DROP FUNCTION IF EXISTS get_member_role CASCADE;
DROP FUNCTION IF EXISTS has_project_access CASCADE;

-- pgvector 확장 (이미 있으면 무시)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. users — 사용자 프로필 (Supabase Auth 연동)
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
  school_name TEXT,
  subject TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE users IS '사용자 프로필. auth.users와 1:1 매핑';
COMMENT ON COLUMN users.role IS 'teacher: 일반 교사, admin: 시스템 관리자';

-- ============================================================
-- 2. workspaces — 팀 워크스페이스
-- ============================================================
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id) NOT NULL,
  ai_config JSONB DEFAULT '{}',
  workflow_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE workspaces IS '팀 단위 워크스페이스. 교사 팀이 함께 수업을 설계하는 공간';
COMMENT ON COLUMN workspaces.ai_config IS '{ model, apiKeyRef, enabledActionTypes }';
COMMENT ON COLUMN workspaces.workflow_config IS '{ hiddenProcedures, procedureOrder }';

-- ============================================================
-- 3. members — 워크스페이스 멤버십
-- ============================================================
CREATE TABLE members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('host', 'owner', 'editor', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

COMMENT ON TABLE members IS '워크스페이스 멤버. host=운영자, owner=생성자, editor=팀원, viewer=관찰자';

-- ============================================================
-- 4. invites — 초대 링크
-- ============================================================
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('host', 'editor', 'viewer')),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id)
);

COMMENT ON TABLE invites IS '이메일 초대 링크. 토큰 기반 팀 합류';

-- ============================================================
-- 5. projects — 수업 프로젝트
-- ============================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  grade TEXT,
  subjects TEXT[],
  learner_context JSONB DEFAULT '{}',
  current_procedure TEXT DEFAULT 'prep',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE projects IS '수업 단위 프로젝트. 워크스페이스 하위 계층';
COMMENT ON COLUMN projects.learner_context IS '{ digitalLiteracy, gender, multicultural, prevContext }';
COMMENT ON COLUMN projects.current_procedure IS '현재 진행 중인 절차 코드 (prep, T-1-1, A-2-1 등)';

-- ============================================================
-- 6. designs — 절차별 설계 캔버스
-- ============================================================
CREATE TABLE designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  procedure_code TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  save_status TEXT DEFAULT 'draft' CHECK (save_status IN ('draft', 'confirmed', 'locked')),
  last_editor_id UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, procedure_code)
);

COMMENT ON TABLE designs IS '절차별 설계 보드. procedure_code로 단계 식별';
COMMENT ON COLUMN designs.save_status IS 'draft=초안, confirmed=확정, locked=버전잠금';

-- ============================================================
-- 7. versions — 설계 스냅샷 (버전 히스토리)
-- ============================================================
CREATE TABLE versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  trigger_type TEXT CHECK (trigger_type IN ('ai_accept', 'manual_save', 'step_complete')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE versions IS '설계 스냅샷. AI 수락/수동저장/단계완료 시 자동 생성';

-- ============================================================
-- 8. messages — AI 채팅 메시지
-- ============================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'assistant', 'system')),
  sender_scope TEXT DEFAULT 'individual' CHECK (sender_scope IN ('individual', 'team')),
  content TEXT NOT NULL,
  procedure_context TEXT,
  step_context INTEGER,
  ai_suggestions JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE messages IS 'AI 채팅 메시지. 프로젝트 단위로 대화 이력 관리';
COMMENT ON COLUMN messages.sender_scope IS 'individual=개인교사, team=교사팀';
COMMENT ON COLUMN messages.ai_suggestions IS 'AI 제안 데이터 (수락/거부 추적용)';

-- ============================================================
-- 9. comments — 섹션별 댓글
-- ============================================================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE comments IS '설계 보드 섹션별 비동기 댓글 스레드';

-- ============================================================
-- 10. activity_logs — 활동 로그
-- ============================================================
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL,
  procedure_code TEXT,
  section_key TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE activity_logs IS '모든 설계 활동 로그. AI 수락/거부, 편집, 상태변경 등 추적';
COMMENT ON COLUMN activity_logs.action_type IS 'create, edit, delete, ai_accept, ai_edit_accept, ai_reject, comment, status_change, step_advance';

-- ============================================================
-- 11. curriculum_standards — 교육과정 성취기준
-- ============================================================
CREATE TABLE curriculum_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  grade_group TEXT,
  school_level TEXT CHECK (school_level IN ('elementary', 'middle', 'high')),
  area TEXT,
  content TEXT NOT NULL,
  explanation TEXT,
  considerations TEXT,
  competencies JSONB,
  content_system JSONB,
  teaching_learning TEXT,
  assessment_guide TEXT,
  keywords TEXT[],
  embedding VECTOR(1536)
);

COMMENT ON TABLE curriculum_standards IS '교육과정 성취기준. 5,146개+ 성취기준 + 확장 메타데이터';
COMMENT ON COLUMN curriculum_standards.code IS '성취기준 코드 (예: [9국01-01])';
COMMENT ON COLUMN curriculum_standards.content_system IS '{ coreIdea, knowledge, process, values }';

-- ============================================================
-- 12. project_standards — 프로젝트-성취기준 연결
-- ============================================================
CREATE TABLE project_standards (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  standard_id UUID REFERENCES curriculum_standards(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, standard_id)
);

COMMENT ON TABLE project_standards IS '프로젝트에 연결된 성취기준. is_primary=핵심 성취기준';

-- ============================================================
-- 헬퍼 함수
-- ============================================================

-- 워크스페이스 멤버 여부 확인
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members
    WHERE workspace_id = ws_id AND user_id = uid
  );
$$;

COMMENT ON FUNCTION is_workspace_member IS '해당 사용자가 워크스페이스의 멤버인지 확인';

-- 멤버 역할 조회
CREATE OR REPLACE FUNCTION get_member_role(ws_id UUID, uid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM members
  WHERE workspace_id = ws_id AND user_id = uid;
$$;

COMMENT ON FUNCTION get_member_role IS '워크스페이스에서의 멤버 역할 반환 (host/owner/editor/viewer)';

-- 프로젝트 접근 권한 확인 (워크스페이스 멤버십 경유)
CREATE OR REPLACE FUNCTION has_project_access(proj_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN members m ON m.workspace_id = p.workspace_id
    WHERE p.id = proj_id AND m.user_id = uid
  );
$$;

COMMENT ON FUNCTION has_project_access IS '프로젝트의 워크스페이스 멤버인지 확인하여 접근 권한 판별';

-- 프로젝트의 워크스페이스에서 역할 조회 (RLS 정책용)
CREATE OR REPLACE FUNCTION get_project_member_role(proj_id UUID, uid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT m.role FROM projects p
  JOIN members m ON m.workspace_id = p.workspace_id
  WHERE p.id = proj_id AND m.user_id = uid;
$$;

COMMENT ON FUNCTION get_project_member_role IS '프로젝트의 워크스페이스에서 해당 사용자의 역할 반환';

-- ============================================================
-- 인덱스
-- ============================================================

-- designs: 프로젝트별 절차 조회 (UNIQUE 제약이 인덱스 역할)
-- 추가 인덱스: project_id 단독 조회용
CREATE INDEX idx_designs_project ON designs(project_id);

-- messages: 프로젝트별 시간순 조회
CREATE INDEX idx_messages_project_created ON messages(project_id, created_at DESC);

-- activity_logs: 프로젝트별 시간순 조회
CREATE INDEX idx_activity_logs_project_created ON activity_logs(project_id, created_at DESC);

-- curriculum_standards: 교과별/학년군별/코드 조회
CREATE INDEX idx_standards_subject ON curriculum_standards(subject);
CREATE INDEX idx_standards_grade_group ON curriculum_standards(grade_group);
-- code UNIQUE 제약이 이미 인덱스 역할

-- projects: 워크스페이스별 조회
CREATE INDEX idx_projects_workspace ON projects(workspace_id);

-- members: 사용자별 조회
CREATE INDEX idx_members_user ON members(user_id);

-- comments: 설계별 섹션 조회
CREATE INDEX idx_comments_design_section ON comments(design_id, section_key);

-- versions: 설계별 시간순 조회
CREATE INDEX idx_versions_design ON versions(design_id, created_at DESC);

-- invites: 토큰 조회 (UNIQUE 제약이 인덱스 역할)
-- 워크스페이스별 조회
CREATE INDEX idx_invites_workspace ON invites(workspace_id);

-- ============================================================
-- RLS 활성화
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_standards ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS 정책
-- ============================================================

-- ── users ──
CREATE POLICY users_select ON users FOR SELECT
  USING (true); -- 모든 인증 사용자가 프로필 조회 가능

CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY users_update ON users FOR UPDATE
  USING (id = auth.uid());

-- ── workspaces ──
CREATE POLICY ws_select ON workspaces FOR SELECT
  USING (is_workspace_member(id, auth.uid()));

CREATE POLICY ws_insert ON workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY ws_update ON workspaces FOR UPDATE
  USING (
    get_member_role(id, auth.uid()) IN ('owner', 'host')
  );

CREATE POLICY ws_delete ON workspaces FOR DELETE
  USING (owner_id = auth.uid());

-- ── members ──
CREATE POLICY members_select ON members FOR SELECT
  USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY members_insert ON members FOR INSERT
  WITH CHECK (
    get_member_role(workspace_id, auth.uid()) IN ('owner', 'host')
  );

CREATE POLICY members_update ON members FOR UPDATE
  USING (
    get_member_role(workspace_id, auth.uid()) IN ('owner', 'host')
  );

CREATE POLICY members_delete ON members FOR DELETE
  USING (
    get_member_role(workspace_id, auth.uid()) IN ('owner', 'host')
  );

-- ── invites ──
CREATE POLICY invites_select ON invites FOR SELECT
  USING (
    is_workspace_member(workspace_id, auth.uid())
    OR token IS NOT NULL -- 토큰 보유자도 조회 가능 (수락 페이지)
  );

CREATE POLICY invites_insert ON invites FOR INSERT
  WITH CHECK (
    get_member_role(workspace_id, auth.uid()) IN ('owner', 'host')
  );

CREATE POLICY invites_update ON invites FOR UPDATE
  USING (auth.uid() IS NOT NULL); -- 수락 시 used_at 업데이트

-- ── projects ──
CREATE POLICY projects_select ON projects FOR SELECT
  USING (has_project_access(id, auth.uid()));

CREATE POLICY projects_insert ON projects FOR INSERT
  WITH CHECK (
    get_member_role(workspace_id, auth.uid()) IN ('owner', 'host', 'editor')
  );

CREATE POLICY projects_update ON projects FOR UPDATE
  USING (
    get_project_member_role(id, auth.uid()) IN ('owner', 'host', 'editor')
  );

CREATE POLICY projects_delete ON projects FOR DELETE
  USING (
    get_project_member_role(id, auth.uid()) IN ('owner', 'host')
  );

-- ── designs ──
CREATE POLICY designs_select ON designs FOR SELECT
  USING (has_project_access(project_id, auth.uid()));

CREATE POLICY designs_insert ON designs FOR INSERT
  WITH CHECK (
    get_project_member_role(project_id, auth.uid()) IN ('owner', 'host', 'editor')
  );

CREATE POLICY designs_update ON designs FOR UPDATE
  USING (
    get_project_member_role(project_id, auth.uid()) IN ('owner', 'host', 'editor')
  );

CREATE POLICY designs_delete ON designs FOR DELETE
  USING (
    get_project_member_role(project_id, auth.uid()) IN ('owner', 'host')
  );

-- ── versions ──
CREATE POLICY versions_select ON versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM designs d
      WHERE d.id = versions.design_id
      AND has_project_access(d.project_id, auth.uid())
    )
  );

CREATE POLICY versions_insert ON versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM designs d
      WHERE d.id = design_id
      AND get_project_member_role(d.project_id, auth.uid()) IN ('owner', 'host', 'editor')
    )
  );

-- ── messages ──
CREATE POLICY messages_select ON messages FOR SELECT
  USING (has_project_access(project_id, auth.uid()));

CREATE POLICY messages_insert ON messages FOR INSERT
  WITH CHECK (
    get_project_member_role(project_id, auth.uid()) IN ('owner', 'host', 'editor')
  );

-- ── comments ──
CREATE POLICY comments_select ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM designs d
      WHERE d.id = comments.design_id
      AND has_project_access(d.project_id, auth.uid())
    )
  );

CREATE POLICY comments_insert ON comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM designs d
      WHERE d.id = design_id
      AND get_project_member_role(d.project_id, auth.uid()) IN ('owner', 'host', 'editor')
    )
  );

CREATE POLICY comments_update ON comments FOR UPDATE
  USING (user_id = auth.uid()); -- 작성자만 수정

CREATE POLICY comments_delete ON comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM designs d
      WHERE d.id = comments.design_id
      AND get_project_member_role(d.project_id, auth.uid()) IN ('owner', 'host')
    )
  );

-- ── activity_logs ──
CREATE POLICY activity_logs_select ON activity_logs FOR SELECT
  USING (has_project_access(project_id, auth.uid()));

CREATE POLICY activity_logs_insert ON activity_logs FOR INSERT
  WITH CHECK (has_project_access(project_id, auth.uid()));

-- ── curriculum_standards ──
CREATE POLICY standards_select ON curriculum_standards FOR SELECT
  USING (true); -- 전체 공개

CREATE POLICY standards_insert ON curriculum_standards FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY standards_update ON curriculum_standards FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY standards_delete ON curriculum_standards FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── project_standards ──
CREATE POLICY ps_select ON project_standards FOR SELECT
  USING (has_project_access(project_id, auth.uid()));

CREATE POLICY ps_insert ON project_standards FOR INSERT
  WITH CHECK (
    get_project_member_role(project_id, auth.uid()) IN ('owner', 'host', 'editor')
  );

CREATE POLICY ps_delete ON project_standards FOR DELETE
  USING (
    get_project_member_role(project_id, auth.uid()) IN ('owner', 'host', 'editor')
  );

-- ============================================================
-- updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_designs_updated_at
  BEFORE UPDATE ON designs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
