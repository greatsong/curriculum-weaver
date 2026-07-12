-- ============================================================
-- 00026_scenario_cache.sql
-- 시나리오 캐시 일반화: 쌍(1:1) 전용 link_scenarios → 코드 집합(1:N) scenario_cache
-- 한 개념 성취기준에 여러 맥락 성취기준을 연결하는 시나리오를 지원한다.
-- ============================================================

CREATE TABLE IF NOT EXISTS scenario_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  key TEXT NOT NULL UNIQUE,        -- 정렬된 코드들을 '|'로 연결한 정규화 키
  codes TEXT[] NOT NULL,           -- 참여 성취기준 코드 (개념 + 맥락들)
  scenario JSONB NOT NULL,         -- { title, situation, ..., concept_code, context_codes }
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE scenario_cache IS '코드 집합별 실생활 문제 시나리오 캐시 (1:1과 1:N 모두). 품질 문제 시 행 삭제하면 재생성';

-- 기존 쌍 캐시 이관 (link_scenarios는 구버전 서버 호환을 위해 유지 — 새 코드는 이 테이블만 사용)
INSERT INTO scenario_cache (key, codes, scenario, model, created_at)
SELECT source_code || '|' || target_code, ARRAY[source_code, target_code], scenario, model, created_at
FROM link_scenarios
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE link_scenarios IS 'DEPRECATED (00026) — scenario_cache로 대체. 구버전 서버 호환용으로만 잔존, 추후 삭제 가능';

-- ── RLS (모든 접근은 service role 경유) ──
ALTER TABLE scenario_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY sc_admin_all ON scenario_cache
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
