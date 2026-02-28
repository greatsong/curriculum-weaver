import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { initStore } from './lib/store.js'
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
const PORT = process.env.PORT || 4007

app.use(helmet())

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:4006')
  .split(',')
  .map((o) => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
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
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
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

app.listen(PORT, () => {
  console.log(`커리큘럼 위버 서버: http://localhost:${PORT}`)
})
