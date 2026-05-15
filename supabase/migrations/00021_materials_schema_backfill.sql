-- ============================================================
-- 00021_materials_schema_backfill.sql
-- 운영 DB의 기존 materials 테이블에 업로드 파이프라인 필수 컬럼을 보강한다.
--
-- 배경:
--   기존 DB에 materials 테이블이 이미 있으면 00016의 CREATE TABLE IF NOT EXISTS
--   블록은 실행되지 않으므로 category 같은 초기 정의 컬럼이 누락될 수 있다.
--   서버 업로드 라우트는 아래 컬럼들을 insert/update에 사용하므로 모두 멱등 보강한다.
-- ============================================================

ALTER TABLE materials ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS uploader_id UUID;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'reference';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT 'general';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS intent_note TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE materials SET category = 'reference' WHERE category IS NULL;
UPDATE materials SET processing_status = 'pending' WHERE processing_status IS NULL;
UPDATE materials SET intent = 'general' WHERE intent IS NULL;

ALTER TABLE materials ALTER COLUMN category SET DEFAULT 'reference';
ALTER TABLE materials ALTER COLUMN processing_status SET DEFAULT 'pending';
ALTER TABLE materials ALTER COLUMN intent SET DEFAULT 'general';
ALTER TABLE materials ALTER COLUMN intent SET NOT NULL;

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_processing_status_check;
ALTER TABLE materials
  ADD CONSTRAINT materials_processing_status_check
  CHECK (processing_status IN ('pending', 'parsing', 'analyzing', 'completed', 'failed'));

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_intent_check;
ALTER TABLE materials
  ADD CONSTRAINT materials_intent_check
  CHECK (intent IN (
    'general',
    'learner_context',
    'standards_alignment',
    'assessment',
    'activity_design',
    'reference',
    'custom'
  ));

CREATE INDEX IF NOT EXISTS idx_materials_project_id ON materials(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_processing_status ON materials(processing_status);
CREATE INDEX IF NOT EXISTS idx_materials_project_created
  ON materials(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_file_hash ON materials(file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_materials_intent ON materials(intent);
