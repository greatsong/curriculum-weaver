-- 00031: 워크스페이스 참여 요청 + 운영 권한 정리 기록 (2026-10-11)
--
-- 1) workspace_join_requests
--    초대 링크를 연 계정의 확인된 이메일이 초대 이메일과 다를 때 만드는 참여 요청.
--    워크스페이스 host·owner가 멤버 화면에서 수락하면 멤버가 된다(server/routes/workspaces.js).
--    서버(service_role)만 읽고 쓴다. 00029 규칙대로 anon·authenticated 권한을 회수하고,
--    RLS는 켜되 정책은 두지 않는다.
--
-- 2) 기록용 — 운영 DB에 이미 적용한 권한 정리를 같은 내용으로 남긴다(다시 실행해도 결과가 같다).
--    - 쓰지 않는 materials 저장소 정책 4개 삭제(자료 파일은 서버가 service_role로만 다룬다)
--    - RLS 도우미 함수 4개의 EXECUTE 권한 회수
--    - 앞으로 public 스키마에 만드는 테이블·시퀀스·함수에 anon·authenticated 기본 권한을 주지 않음
--
-- 되돌리기: DROP TABLE IF EXISTS workspace_join_requests;
--          (기록용 2)는 되돌리지 않는다. 필요하면 00017의 정책과 함수 GRANT를 다시 실행한다)

-- ============================================================
-- 1) workspace_join_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_id UUID REFERENCES invites(id) ON DELETE SET NULL,
  requested_role TEXT NOT NULL DEFAULT 'editor' CHECK (requested_role IN ('host', 'editor', 'viewer')),
  invited_email TEXT,            -- 초대받은 이메일(소문자)
  user_email TEXT,               -- 링크를 연 계정의 이메일(소문자)
  user_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE workspace_join_requests IS '초대 이메일과 다른 계정의 워크스페이스 참여 요청. host·owner가 수락/거절';

-- 같은 사용자의 대기 중 요청은 워크스페이스마다 하나만
CREATE UNIQUE INDEX IF NOT EXISTS workspace_join_requests_pending_uniq
  ON workspace_join_requests (workspace_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS workspace_join_requests_ws_status_idx
  ON workspace_join_requests (workspace_id, status, created_at);

ALTER TABLE workspace_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_join_requests FROM anon, authenticated;
-- 이 테이블은 uuid 기본 키라 시퀀스가 없다. 다른 시퀀스에 남은 권한도 함께 회수한다.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ============================================================
-- 2) 기록용 — 운영에 이미 적용한 권한 정리 (멱등)
-- ============================================================

-- materials 저장소 정책 삭제 (storage 스키마가 없는 환경에서도 실패하지 않게)
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS materials_storage_select ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS materials_storage_insert ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS materials_storage_update ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS materials_storage_delete ON storage.objects';
  END IF;
END
$$;

-- RLS 도우미 함수 EXECUTE 회수 (함수가 없으면 건너뛴다)
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.is_workspace_member(uuid, uuid)',
    'public.get_member_role(uuid, uuid)',
    'public.has_project_access(uuid, uuid)',
    'public.get_project_member_role(uuid, uuid)'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END
$$;

-- 앞으로 만드는 객체에 anon·authenticated 기본 권한을 주지 않는다
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
