-- ============================================================================
-- 00022_project_source_and_creator.sql
-- 목적: "이어서 데모 시뮬레이션" 기능의 관계 정본 컬럼 추가
--   1) projects.source_project_id : 시뮬레이션 복제본이 참조하는 원본 프로젝트.
--      넘버링(#N)·그룹핑의 진실 원천 — 제목 파싱에 의존하지 않는다.
--      원본 삭제 시 NULL(고아 복제본은 유지, 삭제 연쇄 없음).
--   2) projects.created_by : 프로젝트 생성자. 시뮬레이션 "생성자에게만 노출"
--      정책의 목록 필터 기준. 기존 행은 NULL(= 전원 노출, 기존 동작 유지).
-- 멱등성: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- ============================================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 원본별 시뮬레이션 조회(넘버링 카운트·동시 생성 가드)용
CREATE INDEX IF NOT EXISTS idx_projects_source_project_id
  ON projects(source_project_id) WHERE source_project_id IS NOT NULL;

COMMENT ON COLUMN projects.source_project_id IS '시뮬레이션 복제본의 원본 프로젝트 (원본 삭제 시 NULL)';
COMMENT ON COLUMN projects.created_by IS '프로젝트 생성자 — simulation 노출 필터 기준 (기존 행 NULL=전원 노출)';
