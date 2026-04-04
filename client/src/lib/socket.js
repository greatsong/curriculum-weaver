import { io } from 'socket.io-client'
import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || ''

export const socket = io(API_BASE, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
})

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
  if (!socket.connected) socket.connect()
  socket.emit('join_session', { sessionId, user })
}

export function leaveSession(sessionId) {
  socket.emit('leave_session', { sessionId })
}
