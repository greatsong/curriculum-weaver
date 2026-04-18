-- ============================================================
-- 00016_materials_redesign.sql
-- materials 테이블 재설계
--   - 파일 업로드 파이프라인 재설계 (file-upload-redesign.md 참조)
--   - session_id → project_id 전환 (기존 session_id는 DEPRECATED nullable 유지)
--   - Supabase Storage 경로·해시·상태·AI 분석 결과 컬럼 추가
--   - 프로젝트 멤버십 기반 RLS + Realtime 구독 등록
-- 멱등성: IF NOT EXISTS / IF EXISTS 패턴 사용, 여러 번 실행해도 안전
-- ============================================================

-- ── 1. 테이블이 없으면 생성 (신규 환경) ──
CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id UUID,  -- DEPRECATED: 향후 00018에서 DROP 예정, 현재는 호환 위해 nullable 유지
  uploader_id UUID REFERENCES users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  category TEXT DEFAULT 'reference',
  ai_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE materials IS '프로젝트에 업로드된 수업 자료. project_id 기반으로 관리';
COMMENT ON COLUMN materials.session_id IS 'DEPRECATED(호환용). project_id 사용. 00018에서 제거 예정';

-- ── 2. project_id 컬럼 보정 (기존 환경에 세션 기반 테이블이 있는 경우) ──
ALTER TABLE materials ADD COLUMN IF NOT EXISTS project_id UUID;

-- session_id만 있고 project_id가 비어있는 행은 design_sessions 역참조가 불가하므로,
-- 현재 스키마(00010)에서는 session_id 기반 테이블이 존재하지 않아 데이터 이관 SQL은 no-op.
-- 향후 구 스키마 DB에서 실행될 경우를 위한 방어 코드:
DO $$
BEGIN
  -- design_sessions 테이블이 존재하고 session_id 경유로 project를 알 수 있을 때만 복원
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'design_sessions') THEN
    EXECUTE $migrate$
      UPDATE materials m
      SET project_id = ds.project_id
      FROM design_sessions ds
      WHERE m.project_id IS NULL
        AND m.session_id = ds.id
    $migrate$;
  END IF;
END$$;

-- FK 부착 (이미 있으면 skip)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'materials' AND constraint_name = 'materials_project_id_fkey'
  ) THEN
    ALTER TABLE materials
      ADD CONSTRAINT materials_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END$$;

-- ── 3. 신규 컬럼 추가 (재설계 스펙) ──
-- Supabase Storage 경로: materials/{project_id}/{uuid}.{ext}
ALTER TABLE materials ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS mime_type TEXT;
-- SHA-256 해시: 동일 파일 중복 업로드 감지용 (nullable)
ALTER TABLE materials ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- 분석 상태: pending → parsing → analyzing → completed | failed
ALTER TABLE materials ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS extracted_text TEXT;
-- AI 분석 결과: { material_type, summary, key_insights[], design_suggestions[],
--                extracted_keywords[], validated_connections[], rejected_codes[] }
ALTER TABLE materials ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- processing_status CHECK 제약: 기존 제약 삭제 후 재부착 (값 집합 변경 가능성 대비)
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_processing_status_check;
ALTER TABLE materials
  ADD CONSTRAINT materials_processing_status_check
  CHECK (processing_status IN ('pending', 'parsing', 'analyzing', 'completed', 'failed'));

COMMENT ON COLUMN materials.storage_path IS 'Supabase Storage 경로: materials/{project_id}/{uuid}.{ext}';
COMMENT ON COLUMN materials.file_hash IS 'SHA-256 해시. 동일 파일 중복 업로드 감지용';
COMMENT ON COLUMN materials.processing_status IS 'pending|parsing|analyzing|completed|failed';
COMMENT ON COLUMN materials.ai_analysis IS 'AI 분석 결과 JSONB (할루시네이션 필터 통과 코드 포함)';

-- ── 4. 인덱스 ──
CREATE INDEX IF NOT EXISTS idx_materials_project_id ON materials(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_processing_status ON materials(processing_status);
CREATE INDEX IF NOT EXISTS idx_materials_project_created
  ON materials(project_id, created_at DESC);
-- 해시 기반 중복 탐지 (nullable 허용)
CREATE INDEX IF NOT EXISTS idx_materials_file_hash ON materials(file_hash) WHERE file_hash IS NOT NULL;

-- ── 5. RLS: 프로젝트 멤버십 기반 ──
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

-- 기존 세션 기반 정책이 있다면 제거 (구 스키마 호환)
DROP POLICY IF EXISTS materials_select ON materials;
DROP POLICY IF EXISTS materials_insert ON materials;
DROP POLICY IF EXISTS materials_update ON materials;
DROP POLICY IF EXISTS materials_delete ON materials;

-- 조회: 프로젝트의 워크스페이스 멤버만
CREATE POLICY materials_select ON materials FOR SELECT
  USING (has_project_access(project_id, auth.uid()));

-- 삽입: 본인이 업로더이며 프로젝트 접근권 보유
CREATE POLICY materials_insert ON materials FOR INSERT
  WITH CHECK (
    has_project_access(project_id, auth.uid())
    AND (uploader_id IS NULL OR uploader_id = auth.uid())
  );

-- 갱신: 프로젝트 멤버면 누구나 (AI 분석 결과를 서버/RPC가 갱신하는 케이스 포함)
CREATE POLICY materials_update ON materials FOR UPDATE
  USING (has_project_access(project_id, auth.uid()))
  WITH CHECK (has_project_access(project_id, auth.uid()));

-- 삭제: 업로더 본인 또는 워크스페이스 owner/editor
CREATE POLICY materials_delete ON materials FOR DELETE
  USING (
    has_project_access(project_id, auth.uid())
    AND (
      uploader_id = auth.uid()
      OR get_project_member_role(project_id, auth.uid()) IN ('owner', 'editor', 'host')
    )
  );

-- ── 6. Realtime publication 등록 (이미 있으면 예외 무시) ──
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE materials;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
END$$;
