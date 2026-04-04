-- messages 테이블에 sender_name, sender_subject, principles_used 컬럼 추가
-- sender_type 체크 제약을 확장하여 'teacher', 'ai' 도 허용 (레거시 호환)

ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_subject TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS principles_used TEXT[];

-- sender_type 제약 조건 업데이트: 'user'/'assistant' + 'teacher'/'ai' 모두 허용
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('user', 'assistant', 'system', 'teacher', 'ai'));
