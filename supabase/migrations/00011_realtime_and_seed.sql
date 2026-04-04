-- ============================================================
-- 00011_realtime_and_seed.sql
-- Supabase Realtime 활성화 + curriculum_standards 구조 확인
-- ============================================================

-- ── Realtime 활성화 ──
-- messages: 채팅 메시지 실시간 동기화
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- designs: 설계 캔버스 실시간 동기화
ALTER PUBLICATION supabase_realtime ADD TABLE designs;

-- comments: 댓글 실시간 동기화
ALTER PUBLICATION supabase_realtime ADD TABLE comments;

-- members: 멤버십 변경 실시간 동기화
ALTER PUBLICATION supabase_realtime ADD TABLE members;

-- ── curriculum_standards 구조 확인용 시드 (데이터 없음, ETL에서 채움) ──
-- 교과 목록 참고용 코멘트만 추가
COMMENT ON TABLE curriculum_standards IS
  '교육과정 성취기준 저장소. ETL 파이프라인으로 데이터 적재.
   교과: 국어, 수학, 영어, 사회, 과학, 도덕, 음악, 미술, 체육, 기술가정, 정보, 한문, 제2외국어, 실과 등
   학년군: 초1-2, 초3-4, 초5-6, 중, 고공통, 고선택
   학교급: elementary, middle, high';

-- ── 교과 참조 테이블 (선택사항, 검증용) ──
-- 별도 테이블은 만들지 않고, curriculum_standards의 subject 컬럼을 자유 텍스트로 유지.
-- 필요 시 CHECK 제약조건이나 참조 테이블 추가 가능.
