-- ============================================================
-- Realtime 활성화
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE design_boards;
ALTER PUBLICATION supabase_realtime ADD TABLE session_members;
ALTER PUBLICATION supabase_realtime ADD TABLE materials;

-- ============================================================
-- pgvector 인덱스 (성취기준 임베딩 검색용)
-- 성취기준 데이터 삽입 후 실행 권장
-- ============================================================
-- CREATE INDEX idx_cs_embedding ON curriculum_standards
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- 벡터 유사도 검색 함수
-- ============================================================
CREATE OR REPLACE FUNCTION search_standards(
  query_embedding vector(1536),
  match_threshold FLOAT8 DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
  filter_subject TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  code TEXT,
  subject TEXT,
  grade_group TEXT,
  area TEXT,
  content TEXT,
  similarity FLOAT8
) AS $$
  SELECT
    cs.id, cs.code, cs.subject, cs.grade_group, cs.area, cs.content,
    1 - (cs.embedding <=> query_embedding) AS similarity
  FROM curriculum_standards cs
  WHERE cs.embedding IS NOT NULL
    AND 1 - (cs.embedding <=> query_embedding) > match_threshold
    AND (filter_subject IS NULL OR cs.subject = filter_subject)
  ORDER BY cs.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
