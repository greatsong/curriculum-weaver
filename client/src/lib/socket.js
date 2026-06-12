import { io } from 'socket.io-client'
import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || ''

export const socket = io(API_BASE, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
})

// 연결 에러 로깅
socket.on('connect_error', (err) => {
  console.warn('[socket] 연결 실패:', err.message)
})

// 현재 참여 중인 세션 — 재연결 시 자동 재참여를 위해 보관한다.
let currentSession = null

// 최초 1회만 등록: 연결/재연결될 때마다 현재 세션 room에 재참여한다.
// (예전엔 joinSession 안에서 socket.once('connect')로 첫 연결만 처리해,
//  네트워크가 잠깐 끊겨 자동 재연결되면 room을 이탈한 채 남아 다른 참여자의
//  메시지를 못 받는 버그가 있었다.)
socket.on('connect', () => {
  if (currentSession) {
    socket.emit('join_session', currentSession)
  }
})

/**
 * JWT 토큰을 설정한 후 소켓 연결 + 세션 참여
 */
export async function joinSession(sessionId, user) {
  // JWT 토큰을 소켓 인증에 포함
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      socket.auth = { token: session.access_token }
    }
  } catch {
    // 인증 없이 연결 시도 (개발 모드)
  }

  currentSession = { sessionId, user }

  // auth 갱신을 위해 이미 연결돼 있으면 끊고 다시 연결한다.
  // 연결/재연결 시 위의 connect 핸들러가 currentSession으로 자동 재참여한다.
  if (socket.connected) {
    socket.disconnect()
  }
  socket.connect()
}

export function leaveSession(sessionId) {
  socket.emit('leave_session', { sessionId })
  currentSession = null
}
