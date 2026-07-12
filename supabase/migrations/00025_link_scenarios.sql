-- ============================================================
-- 00025_link_scenarios.sql
-- 실생활 문제 시나리오 캐시: 교과 연결 쌍당 AI가 생성한 문제 시나리오 1개
-- 첫 요청 시 생성해 저장하고 이후엔 캐시 반환 (팀·사용자 공유 — 같은 쌍은 같은 시나리오)
-- ============================================================

CREATE TABLE IF NOT EXISTS link_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_code TEXT NOT NULL,       -- 성취기준 코드 쌍 (source < target 정규화, curriculum_links와 동일)
  target_code TEXT NOT NULL,

  scenario JSONB NOT NULL,         -- { title, situation, data_sources[], driving_question, why_needed, activity_steps[], assessment_idea }
  model TEXT,                      -- 생성 모델 (재생성 판단용)
  created_at TIMESTAMPTZ DEFAULT now(),

  CHECK (source_code < target_code),
  UNIQUE(source_code, target_code)
);

COMMENT ON TABLE link_scenarios IS '연결 쌍별 실생활 문제 시나리오 캐시. 품질 문제 시 행 삭제하면 다음 요청에서 재생성';

-- ── RLS (모든 접근은 service role 경유) ──
ALTER TABLE link_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY ls_admin_all ON link_scenarios
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
