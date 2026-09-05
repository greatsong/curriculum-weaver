/**
 * socket.js — 재연결 시 최신 토큰 사용 + 미들웨어 거부 후 자체 재연결 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { fakeSocket, ioMock, getSessionMock } = vi.hoisted(() => {
  const handlers = {}
  const fakeSocket = {
    connected: false,
    active: true,
    on: vi.fn((ev, fn) => { (handlers[ev] ||= []).push(fn) }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    _fire: (ev, ...args) => (handlers[ev] || []).forEach((fn) => fn(...args)),
  }
  return { fakeSocket, ioMock: vi.fn(() => fakeSocket), getSessionMock: vi.fn() }
})

vi.mock('socket.io-client', () => ({ io: ioMock }))
vi.mock('../supabase', () => ({ supabase: { auth: { getSession: getSessionMock } } }))

import { joinSession, leaveSession } from '../socket'

const resolveAuthOnce = async () => {
  const opts = ioMock.mock.calls[0][1]
  return new Promise((resolve) => opts.auth(resolve))
}

beforeEach(() => {
  vi.useFakeTimers()
  fakeSocket.connect.mockClear()
  fakeSocket.emit.mockClear()
  fakeSocket.connected = false
  fakeSocket.active = true
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  leaveSession('s')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('socket auth', () => {
  it('auth는 함수이며 연결 시도마다 현재 세션 토큰을 읽는다', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: { access_token: 'tok-1' } } })
    expect(await resolveAuthOnce()).toEqual({ token: 'tok-1' })
    getSessionMock.mockResolvedValueOnce({ data: { session: { access_token: 'tok-2' } } })
    expect(await resolveAuthOnce()).toEqual({ token: 'tok-2' })
  })

  it('세션이 없거나 조회가 실패하면 빈 auth로 시도한다', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } })
    expect(await resolveAuthOnce()).toEqual({})
    getSessionMock.mockRejectedValueOnce(new Error('boom'))
    expect(await resolveAuthOnce()).toEqual({})
  })
})

describe('reconnect after middleware rejection', () => {
  it('참여 중 미들웨어 거부(active=false)면 백오프 뒤 직접 재연결한다', async () => {
    await joinSession('proj-1', { name: '교사' })
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1)

    fakeSocket.active = false
    fakeSocket._fire('connect_error', new Error('유효하지 않은 토큰입니다.'))
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2_000)
    expect(fakeSocket.connect).toHaveBeenCalledTimes(2)

    // 두 번째 실패는 4초 뒤
    fakeSocket._fire('connect_error', new Error('유효하지 않은 토큰입니다.'))
    vi.advanceTimersByTime(3_999)
    expect(fakeSocket.connect).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect(fakeSocket.connect).toHaveBeenCalledTimes(3)
  })

  it('전송 계층 오류(active=true)는 socket.io 자체 재연결에 맡긴다', async () => {
    await joinSession('proj-1', { name: '교사' })
    fakeSocket.active = true
    fakeSocket._fire('connect_error', new Error('xhr poll error'))
    vi.advanceTimersByTime(60_000)
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1)
  })

  it('세션을 떠난 뒤에는 재연결하지 않는다', async () => {
    await joinSession('proj-1', { name: '교사' })
    leaveSession('proj-1')
    fakeSocket.active = false
    fakeSocket._fire('connect_error', new Error('유효하지 않은 토큰입니다.'))
    vi.advanceTimersByTime(60_000)
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1)
  })

  it('연결되면 현재 세션에 재참여하고 백오프를 초기화한다', async () => {
    await joinSession('proj-1', { name: '교사' })
    fakeSocket._fire('connect')
    expect(fakeSocket.emit).toHaveBeenCalledWith('join_session', { sessionId: 'proj-1', user: { name: '교사' } })
  })
})
