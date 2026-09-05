-- 00027: 성취기준 식별자를 (code, subject) 복합 키로 전환 (2026-09-05)
--
-- 배경: 교육부 코드 체계가 과목 간에 충돌한다 — [12심독01-01~02-04](심화 영어 독해와 작문 / 심화 독일어),
-- [12스문01-01~03](스포츠 문화 / 스페인어권 문화). code UNIQUE 때문에 한 과목만 담을 수 있었다.
-- 설계: 앱 전체의 식별자는 `key` 컬럼(= code, 충돌 시 "code|subject"). code는 표시용이며 유일하지 않아도 된다.
-- curriculum_links.source_code/target_code 는 이 key 값을 담는다(충돌 없는 코드는 key == code 이므로 기존 행 무변경).

ALTER TABLE curriculum_standards ADD COLUMN IF NOT EXISTS key TEXT;
UPDATE curriculum_standards SET key = code WHERE key IS NULL;
ALTER TABLE curriculum_standards ALTER COLUMN key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_standards_key ON curriculum_standards(key);
-- code 유일 제약 해제 (조회 인덱스는 유지)
ALTER TABLE curriculum_standards DROP CONSTRAINT IF EXISTS curriculum_standards_code_key;
CREATE INDEX IF NOT EXISTS idx_standards_code ON curriculum_standards(code);
-- 같은 (code, subject) 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_standards_code_subject ON curriculum_standards(code, subject);
COMMENT ON COLUMN curriculum_standards.key IS '앱 식별자: code, 코드 충돌 시 "code|subject" (2026-09-05 복합 키 전환)';
