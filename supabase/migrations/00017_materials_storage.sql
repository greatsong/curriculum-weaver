-- ============================================================
-- 00017_materials_storage.sql
-- Supabase Storage: materials 버킷 생성 + RLS 정책
--   - private 버킷 (public=false)
--   - 경로 규칙: materials/{project_id}/{uuid}.{ext}
--     → storage.objects.name의 첫 번째 세그먼트가 project_id가 되도록 강제
--   - 접근 제어: 해당 프로젝트의 워크스페이스 멤버만 읽기/쓰기
--   - 파일 크기 제한: 20MB (file_size_limit, bytes)
-- 멱등성: ON CONFLICT / IF NOT EXISTS 사용
-- ============================================================

-- ── 1. materials 버킷 생성 ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materials',
  'materials',
  false,
  20971520,  -- 20 MiB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/hwp+zip',
    'application/x-hwp',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- ── 2. RLS 정책 ──
-- storage.objects 테이블에 정책을 건다. 버킷 'materials' 한정.
-- 경로의 첫 세그먼트(storage.foldername(name))[1]가 project_id UUID.

-- 기존 정책이 있을 수 있으므로 제거 후 재생성
DROP POLICY IF EXISTS materials_storage_select ON storage.objects;
DROP POLICY IF EXISTS materials_storage_insert ON storage.objects;
DROP POLICY IF EXISTS materials_storage_update ON storage.objects;
DROP POLICY IF EXISTS materials_storage_delete ON storage.objects;

-- 조회: 경로의 project_id가 현재 사용자의 접근 가능 프로젝트일 때
CREATE POLICY materials_storage_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'materials'
    AND has_project_access((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- 업로드: 마찬가지
CREATE POLICY materials_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'materials'
    AND has_project_access((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- 갱신 (overwrite 등): 동일 조건
CREATE POLICY materials_storage_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'materials'
    AND has_project_access((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- 삭제: 프로젝트 멤버 중 owner/editor/host 또는 업로더(본 파일을 materials 테이블에서 역조회)
CREATE POLICY materials_storage_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'materials'
    AND has_project_access((storage.foldername(name))[1]::uuid, auth.uid())
  );
