import { Router } from 'express'
// import { requireAuth } from '../middleware/auth.js'  // 나중에 다시 활성화
// import { supabaseAdmin } from '../lib/supabaseAdmin.js'  // 나중에 다시 활성화
import { Sessions, SessionStandards } from '../lib/store.js'

export const sessionsRouter = Router()

// 테스트 모드: 인증 없이 사용
// sessionsRouter.use(requireAuth)

// 세션 목록 조회 (status 필터 지원)
sessionsRouter.get('/', async (req, res) => {
  const { status } = req.query
  let sessions = Sessions.list()
  if (status) {
    sessions = sessions.filter((s) => s.status === status)
  }
  res.json(sessions)
})

// 세션 상세 조회
sessionsRouter.get('/:id', async (req, res) => {
  const session = Sessions.get(req.params.id)
  if (!session) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' })
  res.json({ ...session, members: [], member_count: 1 })
})

// 세션 생성
sessionsRouter.post('/', async (req, res) => {
  const { title, description } = req.body
  if (!title?.trim()) return res.status(400).json({ error: '세션 제목을 입력하세요.' })

  const session = Sessions.create({ title: title.trim(), description: description?.trim() })
  res.status(201).json(session)
})

// 초대 코드로 세션 참여
sessionsRouter.post('/join', async (req, res) => {
  const { invite_code } = req.body
  if (!invite_code?.trim()) return res.status(400).json({ error: '초대 코드를 입력하세요.' })

  const session = Sessions.findByInviteCode(invite_code.trim())
  if (!session) return res.status(404).json({ error: '유효하지 않은 초대 코드입니다.' })

  res.json(session)
})

// 세션 업데이트 (단계 변경 등)
sessionsRouter.put('/:id', async (req, res) => {
  const { current_stage, status, title, description } = req.body

  const updateData = {}
  if (current_stage !== undefined) updateData.current_stage = current_stage
  if (status !== undefined) updateData.status = status
  if (title !== undefined) updateData.title = title
  if (description !== undefined) updateData.description = description

  const session = Sessions.update(req.params.id, updateData)
  if (!session) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' })
  res.json(session)
})

// 세션 삭제
sessionsRouter.delete('/:id', async (req, res) => {
  const deleted = Sessions.delete(req.params.id)
  if (!deleted) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' })
  res.json({ success: true })
})

// 세션에 연결된 성취기준 조회
sessionsRouter.get('/:id/standards', async (req, res) => {
  const data = SessionStandards.list(req.params.id)
  res.json(data)
})
