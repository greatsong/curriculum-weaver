-- ============================================================
-- 00013: comments 테이블 스키마 드리프트 수정
-- ============================================================
-- 1. updated_at 컬럼 추가 (supabaseService.updateComment이 사용하지만 컬럼 없음)
-- 2. section_key NOT NULL 해제 (서버가 null을 보낼 수 있음)
-- ============================================================

-- 1. updated_at 컬럼 추가
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. section_key nullable로 변경
ALTER TABLE comments
  ALTER COLUMN section_key DROP NOT NULL;
