-- ============================================================
-- 00023_project_procedure_skips.sql
-- 절차 스킵(건너뜀) 시스템: 프로젝트별로 팀이 생략하기로 결정한 절차
-- 스킵 = INSERT, 해제 = DELETE (행 단위 원자성 — 동시 변경 경합 없음)
-- 보드 내용(designs)은 절대 건드리지 않음 — 스킵은 표시일 뿐
-- ============================================================

CREATE TABLE IF NOT EXISTS project_procedure_skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  procedure_code TEXT NOT NULL,    -- 내부 절차 코드 (T-2-2 등, displayCode 아님)

  reason TEXT,                     -- 생략 사유 (선택, 보고서에 병기)
  skipped_by UUID REFERENCES users(id),  -- 감사: 누가 스킵했는지
  created_at TIMESTAMPTZ DEFAULT now(),

  -- 프로젝트당 절차 하나에 스킵 행 하나 (중복 스킵 방지 + 자연 멱등)
  UNIQUE(project_id, procedure_code)
);

CREATE INDEX IF NOT EXISTS idx_pps_project ON project_procedure_skips(project_id);

COMMENT ON TABLE project_procedure_skips IS '팀이 생략하기로 결정한 절차. 코어 절차(T-1-1, T-2-1, A-1-2, A-2-1, A-2-2)는 서버에서 스킵 금지 강제';
COMMENT ON COLUMN project_procedure_skips.procedure_code IS '내부 절차 코드 (사용자 노출은 displayCode 변환 필요)';
COMMENT ON COLUMN project_procedure_skips.reason IS '생략 사유 — 보고서의 생략 블록에 병기됨';

-- ── RLS (읽기 공개, 쓰기는 service role 경유 — 서버가 host 권한 검사) ──
ALTER TABLE project_procedure_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY pps_select_all ON project_procedure_skips
  FOR SELECT USING (true);

CREATE POLICY pps_admin_modify ON project_procedure_skips
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
