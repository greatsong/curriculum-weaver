-- ============================================================
-- 00031: 회원 탈퇴(계정 삭제) 처리
--
-- 배경: 처리방침은 탈퇴 요청을 확인하면 계정을 삭제한다고 안내한다. 그런데 users(id)를 참조하는
-- 외래 키 10개가 ON DELETE 규칙 없이(NO ACTION) 만들어져 auth 사용자를 지우면 삭제가 막혔다.
-- 운영 DB의 materials.uploader_id에는 외래 키가 아예 없었다(00021이 컬럼만 추가).
--
-- 정책 (2026-10-10 사용자 결정):
--   1) 혼자 쓰던 워크스페이스(다른 멤버 없음)와 개인 워크스페이스는 프로젝트·대화·보드·자료까지 삭제한다.
--   2) 다른 멤버가 남은 워크스페이스는 소유권을 넘긴다.
--      순서: owner → host → editor → viewer, 같은 역할이면 먼저 합류한 사람.
--   3) 팀 기록(메시지 본문, 보낸 사람 이름, 보드, 활동 로그)은 원본 그대로 남기고
--      계정과의 연결(user_id 등)만 끊는다.
--   4) 탈퇴자가 만든 시뮬레이션 프로젝트는 삭제한다. created_by가 비면 팀 전원에게 보이기 때문이다.
--   5) 탈퇴자 이메일로 보낸 초대와 시뮬레이션 실행 기록은 삭제하고, AI 사용량 기록은 계정 연결만 끊는다.
--
-- 구성:
--   A. 계정 연결 컬럼의 외래 키를 ON DELETE SET NULL로 바꾼다.
--      workspaces.owner_id는 일부러 NO ACTION으로 둔다. 소유권 처리가 빠지면 삭제가 막히는 안전장치다.
--   B. materials.uploader_id에 ON DELETE SET NULL 외래 키를 붙인다.
--   C. delete_account_data(p_user, p_dry_run) — 위 정책을 한 트랜잭션으로 실행한다.
--      시험 실행(p_dry_run = true, 기본값)은 같은 일을 한 뒤 롤백하고 결과만 돌려준다.
--      service_role만 실행할 수 있다(00028 함수와 같은 권한 규칙).
--
-- Storage 파일과 auth 계정은 SQL 밖에 있어 scripts/delete-account.mjs가 이어서 지운다.
-- 로컬 검증: node scripts/qa/verify-account-deletion-sql.mjs (Homebrew postgresql@16)
--
-- 되돌리기:
--   DROP FUNCTION IF EXISTS public.delete_account_data(uuid, boolean);
--   ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_uploader_id_fkey;
--   그리고 아래 A의 각 제약을 ON DELETE 절 없이 다시 만든다. 예:
--   ALTER TABLE messages DROP CONSTRAINT messages_user_id_fkey,
--     ADD CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- ============================================================

-- ── A. 계정 연결 컬럼: 사용자가 삭제되면 NULL ──

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_user_id_fkey,
  ADD CONSTRAINT messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS comments_user_id_fkey,
  DROP CONSTRAINT IF EXISTS comments_resolved_by_fkey,
  ADD CONSTRAINT comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT comments_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey,
  ADD CONSTRAINT activity_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE designs
  DROP CONSTRAINT IF EXISTS designs_last_editor_id_fkey,
  ADD CONSTRAINT designs_last_editor_id_fkey
    FOREIGN KEY (last_editor_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE versions
  DROP CONSTRAINT IF EXISTS versions_created_by_fkey,
  ADD CONSTRAINT versions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE project_standards
  DROP CONSTRAINT IF EXISTS project_standards_added_by_fkey,
  ADD CONSTRAINT project_standards_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE project_procedure_skips
  DROP CONSTRAINT IF EXISTS project_procedure_skips_skipped_by_fkey,
  ADD CONSTRAINT project_procedure_skips_skipped_by_fkey
    FOREIGN KEY (skipped_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE invites
  DROP CONSTRAINT IF EXISTS invites_created_by_fkey,
  ADD CONSTRAINT invites_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE curriculum_links
  DROP CONSTRAINT IF EXISTS curriculum_links_reviewed_by_fkey,
  ADD CONSTRAINT curriculum_links_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT workspaces_owner_id_fkey ON workspaces IS
  '일부러 NO ACTION — 탈퇴 처리(delete_account_data)가 소유권을 넘기거나 워크스페이스를 지우지 않으면 계정 삭제가 막힌다';

-- ── B. materials.uploader_id 외래 키 (운영은 FK 없이 컬럼만 있었다) ──

UPDATE materials m SET uploader_id = NULL
WHERE uploader_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.uploader_id);

ALTER TABLE materials
  DROP CONSTRAINT IF EXISTS materials_uploader_id_fkey,
  ADD CONSTRAINT materials_uploader_id_fkey
    FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── C. 탈퇴 처리 함수 ──

CREATE OR REPLACE FUNCTION public.delete_account_data(p_user uuid, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_found boolean;
  ws record;
  v_succ_id uuid;
  v_succ_role text;
  v_ids uuid[];
  v_project_ids uuid[] := '{}';
  v_deleted_ws jsonb := '[]';
  v_transferred jsonb := '[]';
  v_sim_count integer := 0;
  v_invites integer := 0;
  v_runs integer := 0;
  v_ai_usage integer := 0;
  v_memberships integer := 0;
  v_kept jsonb := '{}';
  v_result jsonb;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'p_user가 필요합니다';
  END IF;

  -- 같은 계정에 대한 동시 실행을 직렬화한다
  PERFORM pg_advisory_xact_lock(hashtext('delete_account_data:' || p_user::text));

  -- 시험 실행은 이 블록의 변경을 예외로 롤백한다. 변수(결과)는 롤백되지 않는다.
  BEGIN
    SELECT email INTO v_email FROM users WHERE id = p_user FOR UPDATE;
    v_found := FOUND;

    -- 1) 소유한 워크스페이스: 다른 멤버가 있으면 넘기고, 없거나 개인 워크스페이스면 삭제
    FOR ws IN
      SELECT w.id, w.name, COALESCE(w.workflow_config->>'personal', '') = 'true' AS personal
      FROM workspaces w
      WHERE w.owner_id = p_user
      ORDER BY w.created_at, w.id
      FOR UPDATE
    LOOP
      v_succ_id := NULL;
      v_succ_role := NULL;
      IF NOT ws.personal THEN
        SELECT m.user_id, m.role INTO v_succ_id, v_succ_role
        FROM members m
        WHERE m.workspace_id = ws.id AND m.user_id <> p_user
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'host' THEN 1 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 3 ELSE 4 END,
                 m.joined_at NULLS LAST, m.user_id
        LIMIT 1;
      END IF;

      IF v_succ_id IS NULL THEN
        SELECT COALESCE(array_agg(p.id ORDER BY p.created_at, p.id), '{}') INTO v_ids
        FROM projects p WHERE p.workspace_id = ws.id;
        v_project_ids := v_project_ids || v_ids;
        DELETE FROM workspaces WHERE id = ws.id;  -- 프로젝트·보드·대화·자료 행·초대·멤버십은 CASCADE
        v_deleted_ws := v_deleted_ws || jsonb_build_object(
          'id', ws.id, 'name', ws.name, 'personal', ws.personal, 'projects', cardinality(v_ids));
      ELSE
        UPDATE workspaces SET owner_id = v_succ_id WHERE id = ws.id;
        UPDATE members SET role = 'owner' WHERE workspace_id = ws.id AND user_id = v_succ_id;
        v_transferred := v_transferred || jsonb_build_object(
          'id', ws.id, 'name', ws.name, 'new_owner_id', v_succ_id, 'previous_role', v_succ_role);
      END IF;
    END LOOP;

    -- 2) 남은 워크스페이스에 있는 탈퇴자의 시뮬레이션 프로젝트 (판정은 server/lib/projectGuards.js와 같다)
    SELECT COALESCE(array_agg(p.id ORDER BY p.created_at, p.id), '{}') INTO v_ids
    FROM projects p
    WHERE p.created_by = p_user
      AND (p.status IN ('simulation', 'generating', 'failed') OR p.title LIKE '[시뮬레이션]%');
    DELETE FROM projects WHERE id = ANY(v_ids);
    v_project_ids := v_project_ids || v_ids;
    v_sim_count := cardinality(v_ids);

    -- 3) 탈퇴자 이메일로 보낸 초대, 시뮬레이션 실행 기록, AI 사용량 기록(외래 키 없음)
    IF v_email IS NOT NULL THEN
      DELETE FROM invites WHERE lower(email) = lower(v_email);
      GET DIAGNOSTICS v_invites = ROW_COUNT;
    END IF;

    DELETE FROM simulation_runs WHERE user_id = p_user;
    GET DIAGNOSTICS v_runs = ROW_COUNT;

    IF to_regclass('public.ai_usage') IS NOT NULL THEN  -- 00030 적용 전 DB에서도 동작
      EXECUTE 'UPDATE public.ai_usage SET user_id = NULL WHERE user_id = $1' USING p_user;
      GET DIAGNOSTICS v_ai_usage = ROW_COUNT;
    END IF;

    -- 4) 팀 기록으로 남고 계정 연결만 끊기는 행 수 (users 삭제 때 ON DELETE SET NULL)
    v_kept := jsonb_build_object(
      'messages',          (SELECT count(*) FROM messages WHERE user_id = p_user),
      'comments',          (SELECT count(*) FROM comments WHERE user_id = p_user OR resolved_by = p_user),
      'activity_logs',     (SELECT count(*) FROM activity_logs WHERE user_id = p_user),
      'designs',           (SELECT count(*) FROM designs WHERE last_editor_id = p_user),
      'versions',          (SELECT count(*) FROM versions WHERE created_by = p_user),
      'project_standards', (SELECT count(*) FROM project_standards WHERE added_by = p_user),
      'procedure_skips',   (SELECT count(*) FROM project_procedure_skips WHERE skipped_by = p_user),
      'materials',         (SELECT count(*) FROM materials WHERE uploader_id = p_user),
      'invites_created',   (SELECT count(*) FROM invites WHERE created_by = p_user),
      'projects_created',  (SELECT count(*) FROM projects WHERE created_by = p_user),
      'link_reports',      (SELECT count(*) FROM link_reports WHERE reporter_id = p_user),
      'curriculum_links',  (SELECT count(*) FROM curriculum_links WHERE reviewed_by = p_user)
    );

    -- 5) 프로필 삭제 → 멤버십 CASCADE, 위 연결 컬럼 SET NULL.
    --    소유 워크스페이스가 남아 있으면 workspaces_owner_id_fkey가 여기서 막는다.
    SELECT count(*) INTO v_memberships FROM members WHERE user_id = p_user;
    DELETE FROM users WHERE id = p_user;

    v_result := jsonb_build_object(
      'user_id', p_user,
      'found', v_found,
      'workspaces_deleted', v_deleted_ws,
      'workspaces_transferred', v_transferred,
      'simulation_projects_deleted', v_sim_count,
      'deleted_project_ids', to_jsonb(v_project_ids),
      'invites_deleted', v_invites,
      'simulation_runs_deleted', v_runs,
      'ai_usage_unlinked', v_ai_usage,
      'memberships_removed', v_memberships,
      'kept_unlinked', v_kept
    );

    IF p_dry_run THEN
      RAISE EXCEPTION USING ERRCODE = 'CWDRY', MESSAGE = '시험 실행 롤백';
    END IF;
  EXCEPTION WHEN SQLSTATE 'CWDRY' THEN
    NULL;  -- 시험 실행: 블록 안 변경은 모두 롤백됐다
  END;

  RETURN v_result || jsonb_build_object('dry_run', p_dry_run);
END $$;

COMMENT ON FUNCTION public.delete_account_data(uuid, boolean) IS
  '회원 탈퇴 DB 처리(00031). 기본은 시험 실행(롤백). Storage 파일·auth 계정 삭제는 scripts/delete-account.mjs가 이어서 한다';

REVOKE ALL ON FUNCTION public.delete_account_data(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid, boolean) TO service_role;
