/**
 * 커리큘럼 위버 서버 엔트리포인트
 *
 * Express + Socket.IO 실시간 협업 서버.
 * Supabase 기반 인증/데이터 + 인메모리 폴백 모드 지원.
 */
import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import helmet from 'helmet'
import cors from 'cors'
import { initStore, Standards } from './lib/store.js'
import { precomputeEmbeddings } from './services/embeddings.js'

// ── Rate Limiter 임포트 ──
import { apiLimiter, aiChatLimiter, authLimiter } from './middleware/rateLimit.js'

// ── 라우트 임포트 ──
import authRouter from './routes/auth.js'
import workspacesRouter from './routes/workspaces.js'
import invitesRouter from './routes/invites.js'
import projectsRouter from './routes/projects.js'
import designsRouter from './routes/designs.js'
import versionsRouter from './routes/versions.js'
import activityLogsRouter from './routes/activityLogs.js'
import { chatRouter } from './routes/chat.js'
import { standardsRouter } from './routes/standards.js'
import { materialsRouter } from './routes/materials.js'
import { principlesRouter } from './routes/principles.js'
import { reportRouter } from './routes/report.js'
import { commentsRouter } from './routes/comments.js'
import { boardsRouter } from './routes/boards.js'
import { sessionsRouter } from './routes/sessions.js'
import { demoRouter } from './routes/demo.js'

// 인메모리 스토어 초기화 (로컬 성취기준/링크 데이터 로드)
const defaultSessionId = initStore()
console.log(`  기본 세션 ID: ${defaultSessionId}`)

// 임베딩 사전 계산 (파일 캐시 있으면 즉시, 없으면 백그라운드)
precomputeEmbeddings(Standards.list())

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

// ── Socket.IO 설정 (100명 동시 사용자 최적화) ──
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, checkOrigin(origin))
    },
  },
  pingInterval: 25000,      // 25초 (기본값)
  pingTimeout: 20000,        // 20초 (기본 5초 → 늘림, 느린 네트워크 대응)
  maxHttpBufferSize: 1e6,    // 1MB (기본값)
  transports: ['websocket', 'polling'], // websocket 우선
  allowUpgrades: true,
  connectTimeout: 45000,     // 45초 연결 타임아웃
})

// Socket.IO 인스턴스를 Express app에 등록 (라우트에서 req.app.get('io')로 접근)
app.set('io', io)

// 프로젝트별 접속자 관리 (projectId -> Map<socketId, user>)
const projectMembers = new Map()

io.on('connection', (socket) => {
  let currentProjectId = null

  // 프로젝트 참여 (기존 join_session 대체)
  socket.on('join_project', ({ projectId, user }) => {
    currentProjectId = projectId
    socket.join(projectId)

    if (!projectMembers.has(projectId)) {
      projectMembers.set(projectId, new Map())
    }
    const isHost = projectMembers.get(projectId).size === 0
    const userInfo = { ...user, socketId: socket.id, isHost }
    projectMembers.get(projectId).set(socket.id, userInfo)

    // 현재 접속자 목록을 룸 전체에 전송
    const members = [...projectMembers.get(projectId).values()]
    io.to(projectId).emit('members_updated', members)
    socket.to(projectId).emit('member_joined', userInfo)
  })

  // 프로젝트 퇴장
  socket.on('leave_project', ({ projectId }) => {
    socket.leave(projectId)
    if (projectMembers.has(projectId)) {
      const user = projectMembers.get(projectId).get(socket.id)
      projectMembers.get(projectId).delete(socket.id)
      const members = [...projectMembers.get(projectId).values()]
      io.to(projectId).emit('members_updated', members)
      if (user) socket.to(projectId).emit('member_left', user)
      if (projectMembers.get(projectId).size === 0) {
        projectMembers.delete(projectId)
      }
    }
    currentProjectId = null
  })

  // 하위 호환성: 기존 session 기반 이벤트도 지원
  socket.on('join_session', ({ sessionId, user }) => {
    socket.emit('join_project', { projectId: sessionId, user })
    socket.join(sessionId)
  })

  socket.on('leave_session', ({ sessionId }) => {
    socket.leave(sessionId)
  })

  // 새 메시지 브로드캐스트
  socket.on('new_message', ({ projectId, message }) => {
    socket.to(projectId).emit('message_added', message)
  })

  // AI 응답 완료 브로드캐스트
  socket.on('ai_response_done', ({ projectId, message }) => {
    socket.to(projectId).emit('message_added', message)
  })

  // 설계 캔버스 업데이트 브로드캐스트 (절차 기반)
  socket.on('design_updated', ({ projectId, procedureCode, design }) => {
    socket.to(projectId).emit('design_changed', { procedureCode, design })
  })

  // 절차 변경 브로드캐스트
  socket.on('procedure_changed', ({ projectId, procedureCode }) => {
    socket.to(projectId).emit('procedure_updated', procedureCode)
  })

  // 하위 호환성: 기존 stage 이벤트
  socket.on('stage_changed', ({ sessionId, stage }) => {
    socket.to(sessionId).emit('stage_updated', stage)
  })

  socket.on('board_updated', ({ sessionId, board }) => {
    socket.to(sessionId).emit('board_changed', board)
  })

  // 연결 해제
  socket.on('disconnect', () => {
    if (currentProjectId && projectMembers.has(currentProjectId)) {
      const user = projectMembers.get(currentProjectId).get(socket.id)
      projectMembers.get(currentProjectId).delete(socket.id)
      const members = [...projectMembers.get(currentProjectId).values()]
      io.to(currentProjectId).emit('members_updated', members)
      if (user) io.to(currentProjectId).emit('member_left', user)
      if (projectMembers.get(currentProjectId).size === 0) {
        projectMembers.delete(currentProjectId)
      }
    }
  })
})

// ── 미들웨어 ──
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
app.use(express.json({ limit: '5mb' }))

// ── Rate Limiter 적용 ──
app.use('/api', apiLimiter)           // 일반 API: 분당 120회
app.use('/api/auth', authLimiter)     // 인증: 분당 5회 (IP당)

// AI 채팅 스트리밍 라우트: 분당 10회 (사용자당)
app.use('/api/chat/message', aiChatLimiter)
app.use('/api/chat/procedure-intro', aiChatLimiter)
app.use('/api/chat/stage-intro', aiChatLimiter)

// ── 헬스 체크 ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'curriculum-weaver',
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || process.env.RAILWAY_ENVIRONMENT || 'local',
  })
})

// ── 라우트 마운트 ──

// 인증
app.use('/api/auth', authRouter)

// 워크스페이스 + 초대
app.use('/api/workspaces', workspacesRouter)
app.use('/api/invites', invitesRouter)

// 프로젝트 (워크스페이스 하위 + 개별 접근)
app.use('/api', projectsRouter)

// 설계 캔버스 (프로젝트 하위)
app.use('/api', designsRouter)

// 버전 (설계 하위 + 개별 접근)
app.use('/api', versionsRouter)

// 활동 로그 (프로젝트 하위)
app.use('/api', activityLogsRouter)

// AI 채팅
app.use('/api/chat', chatRouter)

// 성취기준
app.use('/api/standards', standardsRouter)

// 자료
app.use('/api/materials', materialsRouter)

// 설계 원리
app.use('/api/principles', principlesRouter)

// 보고서
app.use('/api/report', reportRouter)

// 댓글
app.use('/api', commentsRouter)

// 설계 보드
app.use('/api/boards', boardsRouter)

// 세션 (레거시 + 성취기준)
app.use('/api/sessions', sessionsRouter)

// 데모 (인증 불필요)
app.use('/api/demo', demoRouter)

// ── 에러 핸들러 ──
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({
    error: err.message || '서버 내부 오류',
  })
})

// ── 서버 시작 ──
server.listen(PORT, () => {
  console.log(`커리큘럼 위버 서버: http://localhost:${PORT}`)
  console.log(`  Socket.IO 실시간 협업 활성화`)
  console.log(`  라우트: auth, workspaces, invites, projects, designs, versions, logs, chat, standards, materials, principles, report, comments`)
})

// ── Graceful Shutdown ──
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Graceful shutdown...')
  io.close()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
  // 10초 후 강제 종료 (연결이 끊기지 않는 경우 대비)
  setTimeout(() => process.exit(1), 10000)
})

process.on('SIGINT', () => {
  console.log('SIGINT received. Graceful shutdown...')
  io.close()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10000)
})
