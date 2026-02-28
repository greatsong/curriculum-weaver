import { io } from 'socket.io-client'

const API_BASE = import.meta.env.VITE_API_URL || ''

export const socket = io(API_BASE, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
})

export function joinSession(sessionId, user) {
  if (!socket.connected) socket.connect()
  socket.emit('join_session', { sessionId, user })
}

export function leaveSession(sessionId) {
  socket.emit('leave_session', { sessionId })
}
