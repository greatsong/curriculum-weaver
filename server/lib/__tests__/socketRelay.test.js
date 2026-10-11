/**
 * Socket.IO 접속자 정보·방 중계 정리 (lib/socketRelay.js)
 * - 접속자 정보는 검증된 socket.user id + 이름·교과(각 50자)만, 클라이언트 객체를 펼치지 않는다
 * - 중계 메시지는 크기 상한·필수 필드를 검사하고 보낸 사람을 서버 기준으로 덮어쓴다
 * - 보드·절차 중계는 절차 코드·객체 형식·크기를 검사한다
 */
import { describe, it, expect } from 'vitest'
import {
  buildMemberInfo, sanitizeRelayMessage, isValidRelayPayload, clampText, payloadBytes,
  RELAY_LIMITS, MEMBER_FIELD_MAX_CHARS, TEACHER_MESSAGE_MAX_CHARS,
} from '../socketRelay.js'

const verified = {
  id: 'user-1',
  email: 'teacher@school.kr',
  user_metadata: { display_name: '김교사', school_name: '당곡고', subject: '정보' },
}

describe('buildMemberInfo', () => {
  it('클라이언트 user 객체를 펼치지 않고 허용 필드만 쓴다', () => {
    const info = buildMemberInfo(verified, {
      name: '김교사', subject: '정보', isHost: true, id: 'someone-else', email: 'x@y', role: 'owner', socketId: 'fake',
    }, { socketId: 'sock-1', isHost: false })
    expect(info).toEqual({ id: 'user-1', name: '김교사', subject: '정보', socketId: 'sock-1', isHost: false })
  })

  it('이름·교과는 각 50자로 자르고 제어 문자를 지운다', () => {
    const info = buildMemberInfo(verified, { name: `가\n나${'다'.repeat(100)}`, subject: '과'.repeat(80) }, { socketId: 's', isHost: true })
    expect(info.name).toHaveLength(MEMBER_FIELD_MAX_CHARS)
    expect(info.name.startsWith('가나')).toBe(true)
    expect(info.subject).toHaveLength(MEMBER_FIELD_MAX_CHARS)
    expect(info.isHost).toBe(true)
  })

  it('이름이 없거나 문자열이 아니면 프로필 이름, 그것도 없으면 "교사"', () => {
    expect(buildMemberInfo(verified, { name: { evil: 1 } }, { socketId: 's', isHost: false }).name).toBe('김교사')
    expect(buildMemberInfo({ id: 'dev' }, null, { socketId: 's', isHost: false }).name).toBe('교사')
    expect(buildMemberInfo({ id: 'dev' }, 'string-user', { socketId: 's', isHost: false }).subject).toBe('')
  })
})

describe('sanitizeRelayMessage — 교사 메시지(new_message)', () => {
  const base = { id: 'm1', sender_type: 'teacher', content: '안녕하세요', project_id: 'p1', sender_name: '김교사' }

  it('보낸 사람을 서버가 검증한 사용자로 덮어쓴다', () => {
    const out = sanitizeRelayMessage({
      ...base, sender_type: 'ai', user_id: 'victim', sender_name: '다른 교사', sender_subject: '수학', project_id: 'other-project',
    }, { kind: 'teacher', roomId: 'p1', socketUser: verified, member: null })
    expect(out.sender_type).toBe('teacher')
    expect(out.user_id).toBe('user-1')
    expect(out.sender_name).toBe('김교사')
    expect(out.sender_subject).toBe('당곡고 정보')
    expect(out.project_id).toBe('p1')
    expect(out.content).toBe('안녕하세요')
  })

  it('프로필이 없으면(로컬 개발) 방에 등록한 접속자 정보를 쓴다', () => {
    const out = sanitizeRelayMessage({ ...base, sender_name: '위장' }, {
      kind: 'teacher', roomId: 'p1', socketUser: { id: 'dev' }, member: { name: '등록한 이름', subject: '과학' },
    })
    expect(out.sender_name).toBe('등록한 이름')
    expect(out.sender_subject).toBe('과학')
  })

  it.each([
    ['id 없음', { content: 'x' }],
    ['id가 객체', { id: { a: 1 }, content: 'x' }],
    ['id가 너무 김', { id: 'i'.repeat(65), content: 'x' }],
    ['내용 없음', { id: 'm1' }],
    ['내용이 문자열이 아님', { id: 'm1', content: ['x'] }],
    ['내용이 5,000자 초과', { id: 'm1', content: '가'.repeat(TEACHER_MESSAGE_MAX_CHARS + 1) }],
    ['배열', [{ id: 'm1', content: 'x' }]],
    ['문자열', 'hello'],
  ])('형식이 틀리면 버린다: %s', (_label, message) => {
    expect(sanitizeRelayMessage(message, { kind: 'teacher', roomId: 'p1', socketUser: verified })).toBeNull()
  })

  it('페이로드가 20KB를 넘으면 버린다', () => {
    const msg = { ...base, padding: 'x'.repeat(RELAY_LIMITS.teacherMessageBytes) }
    expect(sanitizeRelayMessage(msg, { kind: 'teacher', roomId: 'p1', socketUser: verified })).toBeNull()
  })
})

describe('sanitizeRelayMessage — 옛 탭 AI 응답(ai_response_done)', () => {
  it('AI 메시지로 고정하고 사람 정보는 지운다(교사로 위장 불가)', () => {
    const out = sanitizeRelayMessage({
      id: 'tmp-1', sender_type: 'teacher', user_id: 'victim', sender_name: '다른 교사', content: 'AI 답변',
    }, { kind: 'ai', roomId: 'p1', socketUser: verified })
    expect(out.sender_type).toBe('ai')
    expect(out.user_id).toBeNull()
    expect(out.sender_name).toBeNull()
    expect(out.content).toBe('AI 답변')
  })

  it('AI 응답은 교사 메시지보다 큰 상한(64KB)을 쓴다', () => {
    const content = '가'.repeat(8000) // 약 24KB
    expect(sanitizeRelayMessage({ id: 'a', content }, { kind: 'ai', roomId: 'p1', socketUser: verified })).not.toBeNull()
    const huge = 'x'.repeat(RELAY_LIMITS.aiMessageBytes + 1)
    expect(sanitizeRelayMessage({ id: 'a', content: huge }, { kind: 'ai', roomId: 'p1', socketUser: verified })).toBeNull()
  })
})

describe('isValidRelayPayload', () => {
  it('보드 중계: 유효한 절차 코드 + 객체 보드 + 256KB 이하', () => {
    expect(isValidRelayPayload('design', { projectId: 'p1', procedureCode: 'T-1-1', design: { content: {} } })).toBe(true)
    expect(isValidRelayPayload('design', { projectId: 'p1', procedureCode: 'demo_lesson_plan', design: {} })).toBe(true)
    expect(isValidRelayPayload('design', { projectId: 'p1', procedureCode: 'X-9-9', design: {} })).toBe(false)
    expect(isValidRelayPayload('design', { projectId: 'p1', procedureCode: 'T-1-1', design: 'str' })).toBe(false)
    expect(isValidRelayPayload('design', {
      projectId: 'p1', procedureCode: 'T-1-1', design: { big: 'x'.repeat(RELAY_LIMITS.boardBytes) },
    })).toBe(false)
  })

  it('절차 이동 중계: 절차 코드만 허용', () => {
    expect(isValidRelayPayload('procedure', { sessionId: 'p1', stage: 'A-2-1' })).toBe(true)
    expect(isValidRelayPayload('procedure', { projectId: 'p1', procedureCode: 'prep' })).toBe(true)
    expect(isValidRelayPayload('procedure', { sessionId: 'p1', stage: '../../x' })).toBe(false)
    expect(isValidRelayPayload('procedure', { sessionId: 'p1', stage: { code: 'T-1-1' } })).toBe(false)
  })

  it('레거시 보드 중계: 객체 보드만', () => {
    expect(isValidRelayPayload('board', { sessionId: 's', board: { id: 'b' } })).toBe(true)
    expect(isValidRelayPayload('board', { sessionId: 's', board: null })).toBe(false)
    expect(isValidRelayPayload('board', null)).toBe(false)
  })
})

describe('보조 함수', () => {
  it('clampText: 문자열이 아니면 빈 문자열', () => {
    expect(clampText(5)).toBe('')
    expect(clampText('  가  ')).toBe('가')
  })
  it('payloadBytes: UTF-8 바이트 기준, 직렬화 불가면 Infinity', () => {
    expect(payloadBytes({ a: '가' })).toBe(Buffer.byteLength('{"a":"가"}'))
    expect(payloadBytes({ n: 10n })).toBe(Infinity)
  })
})
