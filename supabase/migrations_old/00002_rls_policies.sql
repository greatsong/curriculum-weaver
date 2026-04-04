-- ============================================================
-- RLS 정책 — session_id 기반 멤버십 경계
-- ============================================================

-- 세션 멤버십 확인 헬퍼 함수
CREATE OR REPLACE FUNCTION is_session_member(p_session_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM session_members
    WHERE session_id = p_session_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- users
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- 같은 세션에 참여한 사용자 볼 수 있음
CREATE POLICY "users_select_co_member" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM session_members sm1
      JOIN session_members sm2 ON sm1.session_id = sm2.session_id
      WHERE sm1.user_id = auth.uid() AND sm2.user_id = users.id
    )
  );

-- ============================================================
-- design_sessions
-- ============================================================
ALTER TABLE design_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ds_member_select" ON design_sessions
  FOR SELECT USING (is_session_member(id));

CREATE POLICY "ds_creator_all" ON design_sessions
  FOR ALL USING (creator_id = auth.uid());

-- ============================================================
-- session_members
-- ============================================================
ALTER TABLE session_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_member_select" ON session_members
  FOR SELECT USING (is_session_member(session_id));

CREATE POLICY "sm_self_insert" ON session_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "sm_owner_all" ON session_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM design_sessions
      WHERE design_sessions.id = session_members.session_id
        AND design_sessions.creator_id = auth.uid()
    )
  );

-- ============================================================
-- curriculum_standards (공개 읽기)
-- ============================================================
ALTER TABLE curriculum_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_public_read" ON curriculum_standards
  FOR SELECT USING (true);

-- ============================================================
-- standard_links (공개 읽기)
-- ============================================================
ALTER TABLE standard_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sl_public_read" ON standard_links
  FOR SELECT USING (true);

-- ============================================================
-- session_standards
-- ============================================================
ALTER TABLE session_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ss_member_select" ON session_standards
  FOR SELECT USING (is_session_member(session_id));

CREATE POLICY "ss_member_insert" ON session_standards
  FOR INSERT WITH CHECK (is_session_member(session_id));

CREATE POLICY "ss_member_delete" ON session_standards
  FOR DELETE USING (is_session_member(session_id));

-- ============================================================
-- chat_messages
-- ============================================================
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cm_member_select" ON chat_messages
  FOR SELECT USING (is_session_member(session_id));

CREATE POLICY "cm_member_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    is_session_member(session_id)
    AND (sender_id = auth.uid() OR sender_type = 'ai' OR sender_type = 'system')
  );

-- ============================================================
-- materials
-- ============================================================
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mat_member_select" ON materials
  FOR SELECT USING (is_session_member(session_id));

CREATE POLICY "mat_member_insert" ON materials
  FOR INSERT WITH CHECK (is_session_member(session_id) AND uploader_id = auth.uid());

-- ============================================================
-- design_boards
-- ============================================================
ALTER TABLE design_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "db_member_select" ON design_boards
  FOR SELECT USING (is_session_member(session_id));

CREATE POLICY "db_member_insert" ON design_boards
  FOR INSERT WITH CHECK (is_session_member(session_id));

CREATE POLICY "db_member_update" ON design_boards
  FOR UPDATE USING (is_session_member(session_id));

-- ============================================================
-- design_board_history
-- ============================================================
ALTER TABLE design_board_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dbh_member_select" ON design_board_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM design_boards db
      WHERE db.id = design_board_history.board_id
        AND is_session_member(db.session_id)
    )
  );

-- ============================================================
-- design_principles (공개 읽기, 관리자 쓰기)
-- ============================================================
ALTER TABLE design_principles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_public_read" ON design_principles
  FOR SELECT USING (true);

CREATE POLICY "dp_admin_all" ON design_principles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- principle_versions
-- ============================================================
ALTER TABLE principle_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pv_public_read" ON principle_versions
  FOR SELECT USING (true);

-- ============================================================
-- simulations
-- ============================================================
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sim_member_select" ON simulations
  FOR SELECT USING (is_session_member(session_id));

CREATE POLICY "sim_member_insert" ON simulations
  FOR INSERT WITH CHECK (is_session_member(session_id));

-- ============================================================
-- reflections
-- ============================================================
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ref_member_select" ON reflections
  FOR SELECT USING (is_session_member(session_id));

CREATE POLICY "ref_author_insert" ON reflections
  FOR INSERT WITH CHECK (is_session_member(session_id) AND author_id = auth.uid());

CREATE POLICY "ref_author_update" ON reflections
  FOR UPDATE USING (author_id = auth.uid());
