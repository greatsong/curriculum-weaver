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

  // 이미 연결된 경우 끊고 재연결 (auth 갱신을 위해)
  if (socket.connected) {
    socket.disconnect()
  }
  socket.connect()

  // 연결 완료 후 세션 참여
  socket.once('connect', () => {
    socket.emit('join_session', { sessionId, user })
  })

  // 이미 연결되었을 경우 즉시 emit
  if (socket.connected) {
    socket.emit('join_session', { sessionId, user })
  }
}

export function leaveSession(sessionId) {
  socket.emit('leave_session', { sessionId })
}
