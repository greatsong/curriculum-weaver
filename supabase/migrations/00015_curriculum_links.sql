-- ============================================================
-- 00015_curriculum_links.sql
-- 3계층 링크 품질 시스템: candidate → reviewed → published
-- AI 제안 후보 저장 + 검수 워크플로우 + 게시 관리
-- ============================================================

-- curriculum_links — 교과 간 연결 (통합 테이블)
CREATE TABLE IF NOT EXISTS curriculum_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 연결 대상 (성취기준 코드)
  source_code TEXT NOT NULL,
  target_code TEXT NOT NULL,

  -- 연결 메타데이터
  link_type TEXT NOT NULL CHECK (link_type IN (
    'cross_subject', 'same_concept', 'application', 'prerequisite', 'extension'
  )),
  rationale TEXT,                  -- 연결 근거 설명
  integration_theme TEXT,          -- 융합 주제 (예: "에너지와 환경")
  lesson_hook TEXT,                -- 수업 아이디어 한 줄

  -- 품질 점수
  semantic_score REAL,             -- 벡터 코사인 유사도 (0~1)
  quality_score REAL,              -- LLM 판정 종합 품질 (0~1)

  -- 3계층 상태
  status TEXT DEFAULT 'candidate' CHECK (status IN (
    'candidate', 'reviewed', 'published'
  )),

  -- 생성 방법
  generation_method TEXT DEFAULT 'ai' CHECK (generation_method IN (
    'tfidf', 'ai', 'manual'
  )),

  -- 검수 정보
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT now(),

  -- 정규화: source < target 으로 방향 통일
  CHECK (source_code < target_code),
  UNIQUE (source_code, target_code)
);

COMMENT ON TABLE curriculum_links IS '교과 간 성취기준 연결. 3계층(candidate→reviewed→published) 품질 관리';
COMMENT ON COLUMN curriculum_links.status IS 'candidate=AI 후보, reviewed=검토 완료, published=사용자 노출';
COMMENT ON COLUMN curriculum_links.semantic_score IS '벡터 코사인 유사도 (0~1). 높을수록 의미적으로 유사';
COMMENT ON COLUMN curriculum_links.quality_score IS 'LLM 판정 교육적 품질 (0~1). 수업 설계 적합도';

-- ── 인덱스 ──
CREATE INDEX idx_cl_status ON curriculum_links(status);
CREATE INDEX idx_cl_source ON curriculum_links(source_code);
CREATE INDEX idx_cl_target ON curriculum_links(target_code);
CREATE INDEX idx_cl_link_type ON curriculum_links(link_type);
CREATE INDEX idx_cl_published_quality ON curriculum_links(quality_score DESC)
  WHERE status = 'published';

-- ── RLS (읽기 공개, 쓰기 admin만) ──
ALTER TABLE curriculum_links ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자 읽기 허용
CREATE POLICY cl_select_all ON curriculum_links
  FOR SELECT USING (true);

-- admin만 수정/삭제 허용
CREATE POLICY cl_admin_modify ON curriculum_links
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
