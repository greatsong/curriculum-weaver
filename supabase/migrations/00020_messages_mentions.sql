-- ============================================================================
-- 00020_messages_mentions.sql
-- 목적: 채팅 인라인 업로드 Phase 1 — 메시지에 @멘션/첨부 메타데이터 부여
--   1) messages.mentioned_material_ids : 교사가 @멘션으로 지정한 자료 ID 배열
--   2) messages.attached_material_id   : 시스템 메시지가 참조하는 자료 (업로드/파싱 알림)
--   3) messages.processing_status      : 시스템 메시지 전용 상태 ('parsing','completed','failed')
-- 참고:
--   - sender_type CHECK 제약은 00010/00012에서 'system'이 이미 허용되어 있어 확장 불필요.
--   - 기본값('{}' / NULL) 덕분에 기존 행은 자동 backfill 됨.
-- 멱등성: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DO 블록으로 제약 중복 방지.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 컬럼 추가
-- ----------------------------------------------------------------------------

-- 1-1) 교사가 @멘션한 materials ID 배열 (기본 빈 배열)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS mentioned_material_ids UUID[] NOT NULL DEFAULT '{}';

-- 1-2) 시스템 메시지(첨부 알림)가 참조하는 material
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attached_material_id UUID;

-- 1-3) 시스템 메시지 전용 처리 상태
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS processing_status TEXT;

-- ----------------------------------------------------------------------------
-- 2) 외래키: attached_material_id → materials(id) ON DELETE SET NULL
--    (이미 존재할 경우 추가하지 않음)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_attached_material_id_fkey'
      AND conrelid = 'messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_attached_material_id_fkey
      FOREIGN KEY (attached_material_id)
      REFERENCES materials(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) processing_status 값 제약 (NULL 허용 + 허용 값 화이트리스트)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_processing_status_check'
      AND conrelid = 'messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_processing_status_check
      CHECK (processing_status IS NULL
             OR processing_status IN ('parsing', 'completed', 'failed'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4) 인덱스
-- ----------------------------------------------------------------------------

-- 4-1) @멘션 배열 검색용 GIN
CREATE INDEX IF NOT EXISTS idx_messages_mentioned
  ON messages USING GIN (mentioned_material_ids);

-- 4-2) 첨부 material 역조회용 부분 btree 인덱스 (NULL 제외)
CREATE INDEX IF NOT EXISTS idx_messages_attached
  ON messages (attached_material_id)
  WHERE attached_material_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5) 컬럼 주석
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN messages.mentioned_material_ids
  IS '교사가 @멘션으로 지정한 materials.id 배열 (기본 빈 배열)';
COMMENT ON COLUMN messages.attached_material_id
  IS '시스템 첨부 알림 메시지가 참조하는 materials.id (ON DELETE SET NULL)';
COMMENT ON COLUMN messages.processing_status
  IS '시스템 메시지 전용 파일 처리 상태: parsing | completed | failed (NULL이면 비해당)';
