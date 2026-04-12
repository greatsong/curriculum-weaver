import { Router } from 'express'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
// import { supabaseAdmin } from '../lib/supabaseAdmin.js'  // 나중에 다시 활성화
import { Sessions, SessionStandards } from '../lib/store.js'

export const sessionsRouter = Router()
// LEGACY: 프로젝트 기반 전환 완료 후 제거 예정. 현재 데모/세션 호환용으로 유지.
// 읽기는 optionalAuth, 쓰기는 requireAuth 개별 적용

// 세션 목록 조회 (status 필터 지원)
sessionsRouter.get('/', optionalAuth, async (req, res) => {
  const { status } = req.query
  let sessions = Sessions.list()
  if (status) {
    sessions = sessions.filter((s) => s.status === status)
  }
  res.json(sessions)
})

// 세션 상세 조회
sessionsRouter.get('/:id', optionalAuth, async (req, res) => {
  const session = Sessions.get(req.params.id)
  if (!session) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' })
  res.json({ ...session, members: [], member_count: 1 })
})

// 세션 생성
sessionsRouter.post('/', requireAuth, async (req, res) => {
  const { title, description } = req.body
  if (!title?.trim()) return res.status(400).json({ error: '세션 제목을 입력하세요.' })

  try {
    const session = Sessions.create({ title: title.trim(), description: description?.trim() })
    res.status(201).json(session)
  } catch (err) {
    res.status(429).json({ error: err.message })
  }
})

// 초대 코드로 세션 참여
sessionsRouter.post('/join', requireAuth, async (req, res) => {
  const { invite_code } = req.body
  if (!invite_code?.trim()) return res.status(400).json({ error: '초대 코드를 입력하세요.' })

  const session = Sessions.findByInviteCode(invite_code.trim())
  if (!session) return res.status(404).json({ error: '유효하지 않은 초대 코드입니다.' })

  res.json(session)
})

// 세션 업데이트 (단계 변경 등)
sessionsRouter.put('/:id', requireAuth, async (req, res) => {
  const { current_stage, status, title, description } = req.body

  // status 값 검증
  const VALID_STATUSES = ['active', 'completed', 'archived']
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `유효하지 않은 status: ${status}. 허용: ${VALID_STATUSES.join(', ')}` })
  }

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
sessionsRouter.delete('/:id', requireAuth, async (req, res) => {
  const deleted = Sessions.delete(req.params.id)
  if (!deleted) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' })
  res.json({ success: true })
})

// 세션에 연결된 성취기준 조회
sessionsRouter.get('/:id/standards', optionalAuth, async (req, res) => {
  const data = SessionStandards.list(req.params.id)
  res.json(data)
})
