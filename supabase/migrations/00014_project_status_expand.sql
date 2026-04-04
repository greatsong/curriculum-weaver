-- projects.status CHECK 제약조건 확장
-- 기존: active, archived, completed
-- 추가: simulation, generating, failed

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active', 'archived', 'completed', 'simulation', 'generating', 'failed'));

COMMENT ON COLUMN projects.status IS 'active=진행중, archived=보관, completed=완료, simulation=시뮬레이션(읽기전용), generating=AI생성중, failed=생성실패';
