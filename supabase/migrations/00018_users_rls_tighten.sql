-- users 테이블 SELECT 정책을 authenticated 역할로 제한
--
-- 이전 정책은 USING (true)로 anon 역할도 포함되어 이메일/이름/ID가 노출됨.
-- 의도는 '로그인한 사용자끼리 프로필 조회 가능'이었음.
-- anon key는 클라이언트 번들에 공개되므로, TO authenticated 미지정 시 PII 유출.

DROP POLICY IF EXISTS users_select ON users;

CREATE POLICY users_select ON users
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON POLICY users_select ON users IS
  '인증된 사용자끼리 프로필(이메일·이름 등) 조회 허용. anon 역할은 접근 불가.';
