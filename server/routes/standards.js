import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { Standards, StandardLinks, SessionStandards } from '../lib/store.js'
import { computeEmbedding3D, invalidateEmbeddingCache } from '../services/embeddings.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

// 성취기준 간 그래프 데이터 (임베딩 3D 좌표 포함)
standardsRouter.get('/graph', async (req, res) => {
  const graph = StandardLinks.getGraph()
  // 임베딩 기반 3D 좌표 계산
  const allStandards = Standards.list()
  const coords = computeEmbedding3D(allStandards)
  // 노드에 고정 좌표 추가
  graph.nodes = graph.nodes.map(node => {
    const pos = coords.get(node.id)
    return pos ? { ...node, fx: pos.x, fy: pos.y, fz: pos.z } : node
  })
  res.json(graph)
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

  // 데이터 변경 시 임베딩 캐시 무효화
  if (addedStandards.length > 0) invalidateEmbeddingCache()

  res.status(201).json({
    message: `성취기준 ${addedStandards.length}개, 연결 ${addedLinks.length}개 추가됨`,
    standards_count: addedStandards.length,
    links_count: addedLinks.length,
  })
})

// 성취기준 전체 초기화 (새 데이터 교체용)
standardsRouter.delete('/all', async (req, res) => {
  Standards.clear()
  invalidateEmbeddingCache()
  res.json({ ok: true, message: '모든 성취기준과 연결이 초기화되었습니다.' })
})

/**
 * 그래프 탐색 AI 채팅 (SSE 스트리밍)
 * AI가 전체 성취기준과 연결 데이터를 읽고, 새로운 교과 간 연결을 추천합니다.
 */
standardsRouter.post('/graph/chat', async (req, res) => {
  const { message, history = [], context = {} } = req.body
  if (!message?.trim()) {
    return res.status(400).json({ error: '메시지가 필요합니다.' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    // 전체 성취기준과 연결 데이터를 시스템 프롬프트에 포함
    const allStandards = Standards.list()
    const graph = StandardLinks.getGraph()
    const nodeSubjectMap = new Map()
    graph.nodes.forEach(n => nodeSubjectMap.set(n.id, n.subject))

    // 교차 교과 연결만 추출
    const crossLinks = graph.links.filter(l => nodeSubjectMap.get(l.source) !== nodeSubjectMap.get(l.target))

    const standardsSummary = allStandards.map(s =>
      `${s.code} [${s.subject}/${s.grade_group}/${s.area}] ${s.content}`
    ).join('\n')

    const linksSummary = crossLinks.map(l => {
      const src = graph.nodes.find(n => n.id === l.source)
      const tgt = graph.nodes.find(n => n.id === l.target)
      return `${src?.code}(${src?.subject}) ↔ ${tgt?.code}(${tgt?.subject}) [${l.link_type}] ${l.rationale}`
    }).join('\n')

    const systemPrompt = `당신은 교육과정 연결 탐색 전문 AI입니다.
전체 성취기준 데이터와 교과 간 연결 정보를 바탕으로:
1. 교사의 질문에 맞는 성취기준과 연결을 찾아 안내합니다.
2. 아직 발견되지 않은 새로운 교과 간 연결 가능성을 제안합니다.
3. 특정 주제나 역량 중심의 융합 수업 아이디어를 제시합니다.

한국어로 응답하며, 존댓말을 사용합니다.

새로운 연결을 제안할 때는 다음 JSON 형식을 사용하세요:
<new_links>
[{"source":"[코드]","target":"[코드]","link_type":"cross_subject","rationale":"연결 근거"}]
</new_links>

link_type 종류: cross_subject(교과연계), same_concept(동일개념), prerequisite(선수학습), application(적용), extension(확장)
같은 교과 내 연결은 제안하지 마세요. 교과 간 융합만 다룹니다.

[전체 성취기준 ${allStandards.length}개]
${standardsSummary}

[현재 교과 간 연결 ${crossLinks.length}개]
${linksSummary}${context.selectedNode ? `

[교사의 현재 탐색 컨텍스트]
선택한 성취기준: ${context.selectedNode.code} [${context.selectedNode.subject}/${context.selectedNode.area}] ${context.selectedNode.content}${context.neighborCodes?.length > 0 ? `\n이 성취기준의 현재 연결: ${context.neighborCodes.join(', ')}` : ''}
이 성취기준을 중심으로 답변해주세요. 선택된 노드와 관련된 새로운 교과 간 연결을 우선 제안하세요.` : ''}${context.filterSubject ? `\n현재 교과 필터: ${context.filterSubject} (이 교과와 관련된 연결을 우선 탐색해주세요)` : ''}`

    const messages = []
    for (const msg of history.slice(-10)) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })
    }
    messages.push({ role: 'user', content: message })

    let fullResponse = ''
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        fullResponse += event.delta.text
        res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`)
      }
    }

    // <new_links> 추출
    const linkMatch = fullResponse.match(/<new_links>\s*([\s\S]*?)\s*<\/new_links>/)
    if (linkMatch) {
      try {
        const newLinks = JSON.parse(linkMatch[1])
        res.write(`data: ${JSON.stringify({ type: 'new_links', links: newLinks })}\n\n`)
      } catch (e) {
        console.warn('새 링크 JSON 파싱 실패:', e.message)
      }
    }

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (error) {
    console.error('그래프 AI 채팅 오류:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', message: '응답 생성 중 오류가 발생했습니다.' })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

// AI가 추천한 링크를 실제로 추가하는 엔드포인트
standardsRouter.post('/graph/add-links', async (req, res) => {
  const { links } = req.body
  if (!Array.isArray(links) || links.length === 0) {
    return res.status(400).json({ error: '추가할 링크 배열이 필요합니다.' })
  }
  const added = StandardLinks.addBulk(links)
  res.status(201).json({ message: `${added.length}개 연결 추가됨`, count: added.length })
})
