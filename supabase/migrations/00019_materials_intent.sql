-- ============================================================
-- 00019_materials_intent.sql
-- materials 테이블에 자료 업로드 의도(intent) 지원 추가
--   - intent: 업로더가 자료를 올리는 목적 분류 (general | learner_context |
--             curriculum_doc | research | assessment | custom)
--   - intent_note: 사용자가 직접 입력하는 의도 메모 (앱 레벨에서 120자 제한)
-- 참고: _workspace/design/material-context-enhancement.md §2
-- 멱등성: ADD COLUMN IF NOT EXISTS / DO $$ ... $$ 패턴으로 재실행 안전
-- ============================================================

-- ── 1. 컬럼 추가 ──
-- intent: NOT NULL + DEFAULT 'general' → 기존 레코드는 자동으로 'general'로 backfill 됨
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS intent TEXT NOT NULL DEFAULT 'general';

-- intent_note: 자유 텍스트 메모 (nullable). 120자 상한은 애플리케이션 레벨 검증
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS intent_note TEXT;

-- ── 2. CHECK 제약 부착 (중복 방지) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'materials'
      AND constraint_name = 'materials_intent_check'
  ) THEN
    ALTER TABLE materials
      ADD CONSTRAINT materials_intent_check
      CHECK (intent IN (
        'general',
        'learner_context',
        'curriculum_doc',
        'research',
        'assessment',
        'custom'
      ));
  END IF;
END$$;

-- ── 3. 인덱스: intent별 조회·통계용 ──
CREATE INDEX IF NOT EXISTS idx_materials_intent ON materials(intent);

-- ── 4. 컬럼 주석 ──
COMMENT ON COLUMN materials.intent IS
  '자료 업로드 의도: general|learner_context|curriculum_doc|research|assessment|custom';
COMMENT ON COLUMN materials.intent_note IS
  '사용자 입력 의도 메모 (앱 레벨 120자 상한, NULL 허용)';
