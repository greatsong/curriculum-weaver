-- 00029: 공개 키·로그인 역할의 테이블 직접 접근 회수
--
-- 클라이언트는 Supabase Auth만 사용하고 테이블은 전부 서버(service_role)를 거쳐 접근한다.
-- 그런데 public 테이블에 anon/authenticated 기본 권한이 남아 있어, RLS 정책의 빈틈이
-- 공개 키만으로 악용될 수 있었다.
--   - invites_select: token IS NOT NULL 조건이 항상 참이라 초대 토큰 전체가 공개 키로 조회됨
--   - invites_update: 로그인한 누구나 모든 초대 행 수정 가능
--   - users_update: 열 제한이 없어 자기 role을 admin으로 변경 가능
--   - users_select / pps_select_all: 교사 프로필·프로젝트 ID 노출
-- 00028(simulation_runs)과 같은 방식으로 권한 자체를 회수한다. RLS 정책은 그대로 둔다.
-- 운영 DB에는 2026-10-05에 적용했다.
--
-- 되돌리기: GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--          (그 뒤 simulation_runs는 00028의 REVOKE를 다시 실행)
--
-- 새 테이블을 만드는 마이그레이션은 같은 REVOKE를 함께 넣는다.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
