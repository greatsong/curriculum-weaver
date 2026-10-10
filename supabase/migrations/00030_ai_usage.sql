-- 00030: AI 호출 사용량 기록 (2026-10-10, 루나 전환·비용 관리)
--
-- 모든 AI 호출(채팅·시연 인트로·자료 분석·교과 연결 시나리오·성취기준 추천)이 한 행씩 남긴다.
-- 서버(service_role)만 쓰고 읽는다(관리자 조회 API: GET /api/admin/ai-usage).
-- 00029 규칙대로 anon·authenticated 권한을 회수하고, RLS는 켜되 정책은 두지 않는다.
-- 로그 성격이라 프로젝트·사용자 삭제와 무관하게 남도록 외래 키를 두지 않는다.
--
-- 되돌리기: DROP TABLE IF EXISTS ai_usage;

CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL,            -- anthropic | openai
  route TEXT NOT NULL,               -- chat | demo_intro | material_analysis | link_scenario | recommend_ai
  model TEXT,
  effort TEXT,
  project_id UUID,
  workspace_id UUID,
  procedure_code TEXT,
  current_step INTEGER,
  user_id UUID,
  input_tokens INTEGER,              -- 캐시 포함 전체 입력
  cache_write_tokens INTEGER,
  cache_read_tokens INTEGER,
  output_tokens INTEGER,             -- 추론 포함
  reasoning_tokens INTEGER,
  finish_reason TEXT,
  latency_ms INTEGER,
  first_token_ms INTEGER,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  error_code TEXT,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_project_idx ON ai_usage (project_id, created_at DESC);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_usage FROM anon, authenticated;
REVOKE ALL ON SEQUENCE ai_usage_id_seq FROM anon, authenticated;
