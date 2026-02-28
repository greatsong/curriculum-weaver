import { Router } from 'express'
// import { requireAuth } from '../middleware/auth.js'  // 나중에 다시 활성화
import { Boards } from '../lib/store.js'

export const boardsRouter = Router()
// boardsRouter.use(requireAuth)

// 단계별 보드 조회
boardsRouter.get('/:sessionId/:stage', async (req, res) => {
  const { sessionId, stage } = req.params
  const boards = Boards.listByStage(sessionId, parseInt(stage))
  res.json(boards)
})

// 보드 업데이트
boardsRouter.put('/:id', async (req, res) => {
  const { content } = req.body
  const board = Boards.get(req.params.id)
  if (!board) return res.status(404).json({ error: '보드를 찾을 수 없습니다.' })

  const updated = Boards.upsert(board.session_id, board.stage, board.board_type, content)
  res.json(updated)
})

// 보드 생성 (특정 단계/타입에 보드가 없을 때)
boardsRouter.post('/', async (req, res) => {
  const { session_id, stage, board_type, content } = req.body
  const board = Boards.upsert(session_id, stage, board_type, content || {})
  res.json(board)
})
