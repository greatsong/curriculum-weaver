-- ============================================================
-- 00024_link_reports.sql
-- 링크 신고: 사용자가 "이 연결이 이상해요"로 제보한 교과 연결
-- 신고 = INSERT(멱등), 처리 = 관리자가 검토 후 링크 강등/유지 결정
-- curriculum_links 자체는 절대 건드리지 않음 — 신고는 검토 큐일 뿐
-- ============================================================

CREATE TABLE IF NOT EXISTS link_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_code TEXT NOT NULL,       -- 성취기준 코드 쌍 (source < target 정규화, curriculum_links와 동일)
  target_code TEXT NOT NULL,

  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- 감사: 누가 신고했는지
  reason TEXT,                     -- 신고 사유 (선택)
  resolved_at TIMESTAMPTZ,         -- 관리자 처리 시각 (NULL = 미처리)
  created_at TIMESTAMPTZ DEFAULT now(),

  CHECK (source_code < target_code),
  -- 같은 사람이 같은 링크를 중복 신고 방지 (자연 멱등)
  UNIQUE(source_code, target_code, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_lr_pair ON link_reports(source_code, target_code);
CREATE INDEX IF NOT EXISTS idx_lr_unresolved ON link_reports(created_at) WHERE resolved_at IS NULL;

COMMENT ON TABLE link_reports IS '사용자 신고 기반 링크 품질 검토 큐. 신고가 링크를 자동 강등하지 않음 — 관리자 검토 후 결정';
COMMENT ON COLUMN link_reports.reason IS '신고 사유 (선택) — 검토 시 참고';

-- ── RLS (모든 접근은 service role 경유 — 서버가 인증·정규화 담당) ──
ALTER TABLE link_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY lr_admin_all ON link_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
