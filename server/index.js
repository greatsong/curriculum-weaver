import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import helmet from 'helmet'
import cors from 'cors'
import { initStore, Messages } from './lib/store.js'
import { sessionsRouter } from './routes/sessions.js'
import { chatRouter } from './routes/chat.js'
import { materialsRouter } from './routes/materials.js'
import { standardsRouter } from './routes/standards.js'
import { boardsRouter } from './routes/boards.js'
import { principlesRouter } from './routes/principles.js'

// 인메모리 스토어 초기화
const defaultSessionId = initStore()
console.log(`  기본 세션 ID: ${defaultSessionId}`)

const app = express()
const server = createServer(app)
const PORT = process.env.PORT || 4007

// CORS 허용 origin 목록
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:4006')
  .split(',')
  .map((o) => o.trim())

function checkOrigin(origin) {
  const isVercelPreview = origin?.endsWith('.vercel.app')
  return !origin || allowedOrigins.includes(origin) || isVercelPreview
}

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, checkOrigin(origin))
    },
  },
})

// 세션별 접속자 관리 (sessionId -> Map<socketId, user>)
const sessionMembers = new Map()

io.on('connection', (socket) => {
  let currentSessionId = null

  socket.on('join_session', ({ sessionId, user }) => {
    currentSessionId = sessionId
    socket.join(sessionId)

    if (!sessionMembers.has(sessionId)) {
      sessionMembers.set(sessionId, new Map())
    }
    // 첫 번째 참여자를 호스트로 지정
    const isHost = sessionMembers.get(sessionId).size === 0
    const userInfo = { ...user, socketId: socket.id, isHost }
    sessionMembers.get(sessionId).set(socket.id, userInfo)

    // 현재 접속자 목록을 룸 전체에 전송
    const members = [...sessionMembers.get(sessionId).values()]
    io.to(sessionId).emit('members_updated', members)
    socket.to(sessionId).emit('member_joined', userInfo)

    // 새 멤버 환영 시스템 메시지 생성
    const userName = user.name || '교사'
    const userSubject = user.subject ? ` (${user.subject})` : ''
    const welcomeContent = isHost
      ? `${userName}${userSubject} 선생님, 환영합니다! 🎉 세션을 개설해 주셨군요. 다른 선생님들이 참여하시면 함께 수업을 설계해 보아요.`
      : `${userName}${userSubject} 선생님이 참여하셨습니다! 🙌 반갑습니다, 함께 멋진 수업을 설계해 봐요!`
    const welcomeMsg = Messages.add(sessionId, {
      sender_type: 'system',
      content: welcomeContent,
    })
    io.to(sessionId).emit('message_added', welcomeMsg)
  })

  socket.on('leave_session', ({ sessionId }) => {
    socket.leave(sessionId)
    if (sessionMembers.has(sessionId)) {
      const user = sessionMembers.get(sessionId).get(socket.id)
      sessionMembers.get(sessionId).delete(socket.id)
      const members = [...sessionMembers.get(sessionId).values()]
      io.to(sessionId).emit('members_updated', members)
      if (user) socket.to(sessionId).emit('member_left', user)
      if (sessionMembers.get(sessionId).size === 0) {
        sessionMembers.delete(sessionId)
      }
    }
    currentSessionId = null
  })

  socket.on('new_message', ({ sessionId, message }) => {
    socket.to(sessionId).emit('message_added', message)
  })

  socket.on('ai_response_done', ({ sessionId, message }) => {
    socket.to(sessionId).emit('message_added', message)
  })

  socket.on('board_updated', ({ sessionId, board }) => {
    socket.to(sessionId).emit('board_changed', board)
  })

  socket.on('stage_changed', ({ sessionId, stage }) => {
    socket.to(sessionId).emit('stage_updated', stage)
  })

  socket.on('disconnect', () => {
    if (currentSessionId && sessionMembers.has(currentSessionId)) {
      const user = sessionMembers.get(currentSessionId).get(socket.id)
      sessionMembers.get(currentSessionId).delete(socket.id)
      const members = [...sessionMembers.get(currentSessionId).values()]
      io.to(currentSessionId).emit('members_updated', members)
      if (user) io.to(currentSessionId).emit('member_left', user)
      if (sessionMembers.get(currentSessionId).size === 0) {
        sessionMembers.delete(currentSessionId)
      }
    }
  })
})

app.use(helmet())

app.use(cors({
  origin: (origin, callback) => {
    if (checkOrigin(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS 차단: ${origin}`))
    }
  },
}))
app.use(express.json({ limit: '1mb' }))

// 헬스 체크
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'curriculum-weaver',
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || process.env.RAILWAY_ENVIRONMENT || 'local',
  })
})

// 라우트
app.use('/api/sessions', sessionsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/materials', materialsRouter)
app.use('/api/standards', standardsRouter)
app.use('/api/boards', boardsRouter)
app.use('/api/principles', principlesRouter)

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({
    error: err.message || '서버 내부 오류',
  })
})

server.listen(PORT, () => {
  console.log(`커리큘럼 위버 서버: http://localhost:${PORT}`)
  console.log(`  Socket.IO 실시간 협업 활성화`)
})
