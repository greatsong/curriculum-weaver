/**
 * 서버가 저장한 AI 메시지를 팀원 탭에 보내는 헬퍼(2026-10-05).
 * 요청한 탭의 화면 글을 중계하던 ai_response_done 대신, 저장 행을 요청한 탭만 빼고 보낸다.
 */
import { describe, it, expect, vi } from 'vitest'
import { broadcastSavedAiMessage, readRequesterSocketId, toClientMessage } from '../messageBroadcast.js'

function fakeIo() {
  const sent = []
  const io = {
    to: vi.fn((room) => ({
      except: vi.fn((except) => ({
        emit: vi.fn((event, payload) => { sent.push({ room, except, event, payload }) }),
      })),
    })),
  }
  return { io, sent }
}

const row = { id: 'm1', project_id: 'p1', sender_type: 'ai', content: '서버 원문', procedure_context: 'T-1-1' }

describe('readRequesterSocketId', () => {
  it('소켓 id 문자열만 받는다', () => {
    expect(readRequesterSocketId({ socket_id: 'AbC_d-123456789012345' })).toBe('AbC_d-123456789012345')
  })

  it('없거나 문자열이 아니거나 형식이 다르면 null(방송하지 않음)', () => {
    expect(readRequesterSocketId({})).toBeNull()
    expect(readRequesterSocketId(undefined)).toBeNull()
    expect(readRequesterSocketId({ socket_id: 12345 })).toBeNull()
    expect(readRequesterSocketId({ socket_id: { $ne: '' } })).toBeNull()
    expect(readRequesterSocketId({ socket_id: ['a'] })).toBeNull()
    expect(readRequesterSocketId({ socket_id: '' })).toBeNull()
    expect(readRequesterSocketId({ socket_id: 'has space' })).toBeNull()
    expect(readRequesterSocketId({ socket_id: 'x'.repeat(65) })).toBeNull()
  })
})

describe('broadcastSavedAiMessage', () => {
  it('socket_id가 있으면 그 탭만 빼고(except) 프로젝트 방에 저장 행을 보낸다', () => {
    const { io, sent } = fakeIo()
    expect(broadcastSavedAiMessage(io, { projectId: 'p1', row, requesterSocketId: 'sockA' })).toBe(true)
    expect(sent).toEqual([{
      room: 'p1',
      except: 'sockA',
      event: 'message_added',
      payload: { ...row, stage_context: 'T-1-1', session_id: 'p1' },
    }])
  })

  it('socket_id가 없으면(옛 탭) 보내지 않는다 — 옛 탭은 ai_response_done 중계로 전달된다', () => {
    const { io, sent } = fakeIo()
    expect(broadcastSavedAiMessage(io, { projectId: 'p1', row, requesterSocketId: null })).toBe(false)
    expect(io.to).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it('저장에 실패해 행이 없으면 보내지 않는다', () => {
    const { io } = fakeIo()
    expect(broadcastSavedAiMessage(io, { projectId: 'p1', row: null, requesterSocketId: 'sockA' })).toBe(false)
    expect(broadcastSavedAiMessage(io, { projectId: 'p1', row: undefined, requesterSocketId: 'sockA' })).toBe(false)
    expect(broadcastSavedAiMessage(io, { projectId: 'p1', row: { content: 'id 없음' }, requesterSocketId: 'sockA' })).toBe(false)
    expect(io.to).not.toHaveBeenCalled()
  })

  it('소켓 서버가 없거나 방송이 실패해도 던지지 않는다', () => {
    expect(broadcastSavedAiMessage(null, { projectId: 'p1', row, requesterSocketId: 'sockA' })).toBe(false)
    const io = { to: () => { throw new Error('adapter down') } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => broadcastSavedAiMessage(io, { projectId: 'p1', row, requesterSocketId: 'sockA' })).not.toThrow()
    expect(broadcastSavedAiMessage(io, { projectId: 'p1', row, requesterSocketId: 'sockA' })).toBe(false)
    warn.mockRestore()
  })
})

describe('toClientMessage', () => {
  it('목록 조회(GET)와 같은 별칭을 붙인다', () => {
    expect(toClientMessage(row)).toMatchObject({ stage_context: 'T-1-1', session_id: 'p1', procedure_context: 'T-1-1' })
  })
})
