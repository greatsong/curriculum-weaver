import { io } from 'socket.io-client'
import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || ''

// 서버 미들웨어 거부 뒤 직접 재연결할 때의 지수 백오프(ms)
const RECONNECT_BASE_MS = 2_000
const RECONNECT_MAX_MS = 30_000

/**
 * 연결(재연결)을 시도할 때마다 "현재" Supabase 세션 토큰을 읽어 핸드셰이크에 싣는다.
 *
 * 예전엔 joinSession 시점의 토큰을 socket.auth 객체에 고정했다. Supabase 액세스 토큰은 1시간짜리라,
 * 수업 중 네트워크가 잠깐 끊겨 socket.io가 자동 재연결하면 만료 토큰으로 인증을 시도했고 서버
 * 미들웨어가 거부했다. 미들웨어 거부는 socket.io가 자동 재연결하지 않으므로(socket.active=false)
 * 그 뒤로 실시간 동기화가 조용히 죽어 있었다. 함수형 auth는 시도마다 다시 평가된다.
 * (supabase.auth.getSession은 만료된 토큰이면 갱신해서 돌려준다.)
 */
function resolveAuth(cb) {
  supabase.auth.getSession()
    .then(({ data }) => cb(data?.session?.access_token ? { token: data.session.access_token } : {}))
    .catch(() => cb({})) // 인증 없이 연결 시도 (개발 모드)
}

export const socket = io(API_BASE, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: resolveAuth,
})

// 현재 참여 중인 세션 — 재연결 시 자동 재참여를 위해 보관한다.
let currentSession = null
let reconnectTimer = null
let reconnectAttempt = 0

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

/**
 * 서버 미들웨어 거부(토큰 만료·인증 서버 일시 오류) 뒤 지수 백오프로 직접 재연결한다.
 * 전송 계층 오류(socket.active=true)는 socket.io 자체 재연결에 맡기고 여기서는 건드리지 않는다.
 */
function scheduleReconnect() {
  if (reconnectTimer || !currentSession) return
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt)
  reconnectAttempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (!currentSession || socket.connected) return
    socket.connect()
  }, delay)
}

socket.on('connect_error', (err) => {
  console.warn('[socket] 연결 실패:', err.message)
  if (socket.active) return // 전송 오류 → socket.io가 알아서 재시도한다
  scheduleReconnect()
})

// 최초 1회만 등록: 연결/재연결될 때마다 현재 세션 room에 재참여한다.
// (예전엔 joinSession 안에서 socket.once('connect')로 첫 연결만 처리해,
//  네트워크가 잠깐 끊겨 자동 재연결되면 room을 이탈한 채 남아 다른 참여자의
//  메시지를 못 받는 버그가 있었다.)
socket.on('connect', () => {
  reconnectAttempt = 0
  clearReconnectTimer()
  if (currentSession) {
    socket.emit('join_session', currentSession)
  }
})

/**
 * 소켓 연결 + 세션 참여. 토큰은 연결 시점에 resolveAuth가 새로 읽는다.
 */
export async function joinSession(sessionId, user) {
  currentSession = { sessionId, user }
  reconnectAttempt = 0
  clearReconnectTimer()

  // 이미 연결돼 있으면 끊고 다시 연결해 최신 토큰으로 재인증한다.
  // 연결/재연결 시 위의 connect 핸들러가 currentSession으로 자동 재참여한다.
  if (socket.connected) {
    socket.disconnect()
  }
  socket.connect()
}

export function leaveSession(sessionId) {
  socket.emit('leave_session', { sessionId })
  currentSession = null
  clearReconnectTimer()
}
