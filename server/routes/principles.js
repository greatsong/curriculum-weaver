import { Router } from 'express'
// import { requireAuth, requireAdmin } from '../middleware/auth.js'  // 나중에 다시 활성화
import { Principles } from '../lib/store.js'

export const principlesRouter = Router()

// 원칙 목록 조회
principlesRouter.get('/', async (req, res) => {
  const { stage } = req.query
  const data = Principles.list(stage || null)
  res.json(data)
})

// 원칙 상세 조회
principlesRouter.get('/:id', async (req, res) => {
  const principle = Principles.get(req.params.id)
  if (!principle) return res.status(404).json({ error: '원칙을 찾을 수 없습니다.' })
  res.json(principle)
})

// 원칙 업데이트 (나중에 requireAuth + requireAdmin 추가)
principlesRouter.put('/:id', async (req, res) => {
  const { name, description, guideline, examples } = req.body
  const updateData = {}
  if (name !== undefined) updateData.name = name
  if (description !== undefined) updateData.description = description
  if (guideline !== undefined) updateData.guideline = guideline
  if (examples !== undefined) updateData.examples = examples

  const updated = Principles.update(req.params.id, updateData)
  if (!updated) return res.status(404).json({ error: '원칙을 찾을 수 없습니다.' })
  res.json(updated)
})
