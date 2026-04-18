/**
 * 커리큘럼 위버 서버 엔트리포인트
 *
 * Express + Socket.IO 실시간 협업 서버.
 * Supabase 기반 인증/데이터 + 인메모리 폴백 모드 지원.
 */
import { config as dotenvConfig } from 'dotenv'
// 셸 환경에 빈 문자열(예: Claude Desktop의 ANTHROPIC_API_KEY="")이 미리 주입된 경우
// .env 값을 우선 적용하기 위해 override: true 설정.
dotenvConfig({ override: true })
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import helmet from 'helmet'
import cors from 'cors'
import { initStore, Standards } from './lib/store.js'
import { precomputeEmbeddings } from './services/embeddings.js'
import { loadSemanticIndex, ensureEmbeddingsCache } from './services/semanticSearch.js'
import { supabaseAdmin } from './lib/supabaseAdmin.js'

// ── Rate Limiter 임포트 ──
import { apiLimiter, aiChatLimiter, authLimiter, uploadLimiter } from './middleware/rateLimit.js'

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

// 시맨틱 검색 인덱스 로드 (캐시 없으면 백그라운드 자동 생성)
if (!loadSemanticIndex()) {
  setImmediate(() => ensureEmbeddingsCache(Standards.list()))
}

const app = express()
const server = createServer(app)
const PORT = process.env.PORT || 4007

// CORS 허용 origin 목록
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:4006')
  .split(',')
  .map((o) => o.trim())

function checkOrigin(origin) {
  // Vercel preview는 프로젝트 prefix로 제한
  const isVercelPreview = origin && /^https:\/\/curriculum-weaver(-.*)?\.vercel\.app$/.test(origin)
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
// fire-and-forget 서비스(analyzer 등)에서 req 객체 없이도 접근 가능하도록 전역 참조 등록
globalThis.__cwIo = io

// ── Socket.IO JWT 인증 미들웨어 ──
io.use(async (socket, next) => {
  // 개발 모드: Supabase 미설정 시 바이패스
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
      return next(new Error('서버 인증 설정 오류'))
    }
    socket.user = { id: 'dev-user-001', email: 'dev@curriculum-weaver.local' }
    return next()
  }

  const token = socket.handshake.auth?.token
  if (!token) {
    return next(new Error('인증 토큰이 필요합니다.'))
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
      return next(new Error('유효하지 않은 토큰입니다.'))
    }
    socket.user = user
    next()
  } catch (err) {
    console.error('[socket.io] 인증 오류:', err.message)
    next(new Error('인증 처리 중 오류가 발생했습니다.'))
  }
})

// 프로젝트별 접속자 관리 (projectId -> Map<socketId, user>)
const projectMembers = new Map()

io.on('connection', (socket) => {
  let currentProjectId = null

  // 프로젝트 참여 공통 로직 (멤버십 검증 포함)
  async function handleJoinProject(projectId, user) {
    if (!socket.user) {
      socket.emit('error', { message: '인증이 필요합니다.' })
      return
    }

    // 프로젝트 멤버십 검증
    try {
      const { getProject, getMemberRole } = await import('./lib/supabaseService.js')
      const project = await getProject(projectId)
      if (project?.workspace_id) {
        const role = await getMemberRole(project.workspace_id, socket.user.id)
        if (!role) {
          socket.emit('error', { message: '이 프로젝트에 접근 권한이 없습니다.' })
          return
        }
      }
    } catch {
      // Supabase 연결 실패 또는 레거시 세션 → 통과
    }

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
  }

  socket.on('join_project', ({ projectId, user }) => {
    handleJoinProject(projectId, user)
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
    handleJoinProject(sessionId, user)
  })

  socket.on('leave_session', ({ sessionId }) => {
    socket.leave(sessionId)
    if (projectMembers.has(sessionId)) {
      const user = projectMembers.get(sessionId).get(socket.id)
      projectMembers.get(sessionId).delete(socket.id)
      const members = [...projectMembers.get(sessionId).values()]
      io.to(sessionId).emit('members_updated', members)
      if (user) socket.to(sessionId).emit('member_left', user)
      if (projectMembers.get(sessionId).size === 0) {
        projectMembers.delete(sessionId)
      }
    }
    currentProjectId = null
  })

  // 참여 중인 방에서만 이벤트 중계 허용
  function isInRoom(roomId) {
    return roomId && socket.rooms.has(roomId)
  }

  // 새 메시지 브로드캐스트
  socket.on('new_message', ({ projectId, sessionId, message }) => {
    const roomId = projectId || sessionId
    if (isInRoom(roomId)) socket.to(roomId).emit('message_added', message)
  })

  // AI 응답 완료 브로드캐스트
  socket.on('ai_response_done', ({ projectId, sessionId, message }) => {
    const roomId = projectId || sessionId
    if (isInRoom(roomId)) socket.to(roomId).emit('message_added', message)
  })

  // 설계 캔버스 업데이트 브로드캐스트 (절차 기반)
  socket.on('design_updated', ({ projectId, procedureCode, design }) => {
    if (isInRoom(projectId)) socket.to(projectId).emit('design_changed', { procedureCode, design })
  })

  // 절차 변경 브로드캐스트
  socket.on('procedure_changed', ({ projectId, procedureCode }) => {
    if (isInRoom(projectId)) socket.to(projectId).emit('procedure_updated', procedureCode)
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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: [
        "'self'",
        // Supabase
        process.env.SUPABASE_URL || 'https://*.supabase.co',
        // Anthropic API (서버에서만 사용하지만 안전을 위해)
        'https://api.anthropic.com',
        // WebSocket
        "wss:",
        "ws:",
        // 로컬 개발
        ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:*', 'ws://localhost:*'] : []),
      ].filter(Boolean),
      imgSrc: ["'self'", "data:", "blob:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}))

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

// AI 비용 큰 공개 엔드포인트 보호
app.use('/api/demo/generate', aiChatLimiter)
app.use('/api/standards/graph/chat', aiChatLimiter)

// 파일 업로드: 분당 5회 (사용자당)
app.use('/api/materials/upload', uploadLimiter)

// ── 헬스 체크 ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'curriculum-weaver',
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || process.env.RAILWAY_ENVIRONMENT || 'local',
  })
})

// ── 라우트 마운트 ──

// ─ 인증 불필요 라우트 (먼저 배치) ─
app.use('/api/demo', demoRouter)

// 인증
app.use('/api/auth', authRouter)

// 성취기준 (공개)
app.use('/api/standards', standardsRouter)

// 설계 원리 (공개)
app.use('/api/principles', principlesRouter)

// 설계 보드
app.use('/api/boards', boardsRouter)

// 세션 (레거시 + 성취기준)
app.use('/api/sessions', sessionsRouter)

// AI 채팅
app.use('/api/chat', chatRouter)

// 자료
app.use('/api/materials', materialsRouter)

// 보고서
app.use('/api/report', reportRouter)

// ─ 인증 필요 라우트 (router.use(requireAuth) 포함) ─
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

// 댓글
app.use('/api', commentsRouter)

// ── 에러 핸들러 ──
app.use((err, req, res, next) => {
  console.error(err)
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT
  res.status(err.status || 500).json({
    error: isProduction ? '서버 내부 오류가 발생했습니다.' : (err.message || '서버 내부 오류'),
  })
})

// ── 서버 시작 ──
server.listen(PORT, () => {
  console.log(`커리큘럼 위버 서버: http://localhost:${PORT}`)
  console.log(`  Socket.IO 실시간 협업 활성화`)
  console.log(`  라우트: auth, workspaces, invites, projects, designs, versions, logs, chat, standards, materials, principles, report, comments`)
})

// ── 미처리 예외/거부 핸들러 ──
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err)
  // 프로세스를 안전하게 종료 — uncaughtException 이후 상태가 불확정적
  io.close()
  server.close(() => process.exit(1))
  setTimeout(() => process.exit(1), 5000)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] unhandledRejection:', reason)
  // unhandledRejection은 로그만 남기고 계속 실행 (Node 기본 동작 유지)
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
