import { Router } from 'express'
import { Standards, StandardLinks, SessionStandards } from '../lib/store.js'

export const standardsRouter = Router()

// 성취기준 검색
standardsRouter.get('/search', async (req, res) => {
  const { q, subject, grade } = req.query
  const results = Standards.search({ q, subject, grade })
  res.json(results)
})

// 교과 목록 조회
standardsRouter.get('/subjects', async (req, res) => {
  res.json(Standards.subjects())
})

// 학년군 목록 조회
standardsRouter.get('/grades', async (req, res) => {
  res.json(Standards.gradeGroups())
})

// 성취기준 전체 목록
standardsRouter.get('/all', async (req, res) => {
  res.json(Standards.list())
})

// 성취기준 간 그래프 데이터
standardsRouter.get('/graph', async (req, res) => {
  res.json(StandardLinks.getGraph())
})

// 특정 성취기준의 연결 조회
standardsRouter.get('/:id/links', async (req, res) => {
  const links = StandardLinks.getByStandard(req.params.id)
  res.json(links)
})

// 세션에 성취기준 추가
standardsRouter.post('/session/:sessionId', async (req, res) => {
  const { standard_id, is_primary } = req.body
  const result = SessionStandards.add(req.params.sessionId, standard_id, is_primary || false)
  if (!result) return res.status(409).json({ error: '이미 추가된 성취기준입니다.' })
  res.status(201).json(result)
})

// 세션에서 성취기준 제거
standardsRouter.delete('/session/:sessionId/:standardId', async (req, res) => {
  const removed = SessionStandards.remove(req.params.sessionId, req.params.standardId)
  if (!removed) return res.status(404).json({ error: '해당 성취기준이 세션에 없습니다.' })
  res.json({ ok: true })
})

// 성취기준 벌크 업로드
standardsRouter.post('/upload', async (req, res) => {
  const { standards: items, links } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'standards 배열이 필요합니다.' })
  }

  // 필수 필드 검증
  for (const item of items) {
    if (!item.code || !item.subject || !item.content) {
      return res.status(400).json({ error: `code, subject, content는 필수입니다. 문제: ${JSON.stringify(item)}` })
    }
  }

  const addedStandards = Standards.addBulk(items)
  let addedLinks = []
  if (Array.isArray(links) && links.length > 0) {
    addedLinks = StandardLinks.addBulk(links)
  }

  res.status(201).json({
    message: `성취기준 ${addedStandards.length}개, 연결 ${addedLinks.length}개 추가됨`,
    standards_count: addedStandards.length,
    links_count: addedLinks.length,
  })
})

// 성취기준 전체 초기화 (새 데이터 교체용)
standardsRouter.delete('/all', async (req, res) => {
  Standards.clear()
  res.json({ ok: true, message: '모든 성취기준과 연결이 초기화되었습니다.' })
})
