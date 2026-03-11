import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { Standards, StandardLinks, SessionStandards } from '../lib/store.js'
import { computeEmbedding3D, invalidateEmbeddingCache } from '../services/embeddings.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const standardsRouter = Router()

// 성취기준 검색
standardsRouter.get('/search', async (req, res) => {
  const { q, subject, grade, domain, school_level, curriculum_category } = req.query
  const results = Standards.search({ q, subject, grade, domain, school_level, curriculum_category })
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

// 영역(domain) 목록
standardsRouter.get('/domains', async (req, res) => {
  res.json(Standards.domains())
})

// 학교급 목록
standardsRouter.get('/school-levels', async (req, res) => {
  res.json(Standards.schoolLevels())
})

// 교육과정 구분 목록
standardsRouter.get('/categories', async (req, res) => {
  res.json(Standards.categories())
})

// 성취기준 전체 목록
standardsRouter.get('/all', async (req, res) => {
  const { detail } = req.query
  const standards = Standards.list()
  if (detail === 'full') {
    res.json(standards)
  } else {
    // 기본 필드만 반환 (하위 호환성)
    res.json(standards.map(s => ({
      id: s.id,
      code: s.code,
      subject: s.subject,
      subject_group: s.subject_group || s.subject,
      grade_group: s.grade_group,
      area: s.area,
      content: s.content,
    })))
  }
})

// 성취기준 간 그래프 데이터 (임베딩 3D 좌표 포함)
standardsRouter.get('/graph', async (req, res) => {
  const graph = StandardLinks.getGraph()
  // 임베딩 기반 3D 좌표 계산
  const allStandards = Standards.list()
  const coords = computeEmbedding3D(allStandards)
  // 노드에 초기 좌표 추가 (포스 시뮬레이션의 시작점, 고정하지 않음)
  graph.nodes = graph.nodes.map(node => {
    const pos = coords.get(node.id)
    return pos ? { ...node, x: pos.x, y: pos.y, z: pos.z } : node
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
    const allStandards = Standards.list()
    const graph = StandardLinks.getGraph()

    // 토큰 예산 제한: 시스템 프롬프트를 ~50K 문자 이내로
    const MAX_PROMPT_CHARS = 50000

    // ===== 1. 현재 그래프에 표시된 노드/연결 (최우선 컨텍스트) =====
    let visibleSection = ''
    if (context.visibleNodes?.length > 0) {
      const visibleNodesSummary = context.visibleNodes.map(n => {
        let line = `  ${n.code} [${n.subject}/${n.grade_group}/${n.area}]`
        if (n.school_level) line += ` {${n.school_level}}`
        line += ` — ${n.content}`
        return line
      }).join('\n')

      let visibleLinksSummary = ''
      if (context.visibleLinks?.length > 0) {
        visibleLinksSummary = context.visibleLinks.map(l =>
          `  ${l.source} ↔ ${l.target} [${l.link_type}] ${l.rationale || ''}`
        ).join('\n')
      }

      visibleSection = `
★★★ [현재 그래프에 표시된 노드 — ${context.visibleNodes.length}개] ★★★
교사가 지금 화면에서 보고 있는 성취기준입니다. 이 노드들을 우선적으로 참조하세요.
${visibleNodesSummary}
${visibleLinksSummary ? `
[현재 보이는 연결 — ${context.visibleLinks.length}개]
${visibleLinksSummary}` : '[현재 보이는 연결 없음]'}
`
    }

    // ===== 2. 포커스 교과군의 추가 성취기준 (보이지 않는 것 포함) =====
    const focusSubjectGroups = new Set()
    if (context.selectedNode) {
      focusSubjectGroups.add(context.selectedNode.subject_group || context.selectedNode.subject)
    }
    if (context.filterSubjects?.length > 0) {
      context.filterSubjects.forEach(s => focusSubjectGroups.add(s))
    }

    // 보이는 노드의 코드 세트 (중복 제외용)
    const visibleCodes = new Set((context.visibleNodes || []).map(n => n.code))

    let additionalStandardsSection = ''
    if (focusSubjectGroups.size > 0) {
      // 포커스 교과군의 성취기준 중 그래프에 표시되지 않은 것들
      const additional = allStandards.filter(s =>
        focusSubjectGroups.has(s.subject_group || s.subject) && !visibleCodes.has(s.code)
      )
      if (additional.length > 0) {
        // 학교급 필터가 있으면 같은 학교급만
        const schoolLevels = context.schoolLevel || []
        const filtered = schoolLevels.length > 0
          ? additional.filter(s => schoolLevels.includes(s.school_level))
          : additional
        const summary = filtered.slice(0, 100).map(s =>
          `${s.code} [${s.subject}] ${s.content}`
        ).join('\n')
        additionalStandardsSection = `
[같은 교과군의 추가 성취기준 — ${filtered.length}개${filtered.length > 100 ? ' (상위 100개)' : ''}]
그래프에 표시되지 않았지만 새 연결 제안 시 참고할 수 있는 성취기준입니다.
${summary}`
      }
    }

    // ===== 3. 전체 교과군 요약 (간략) =====
    const groupCounts = new Map()
    allStandards.forEach(s => {
      const g = s.subject_group || s.subject
      groupCounts.set(g, (groupCounts.get(g) || 0) + 1)
    })
    const overviewSection = `[전체 교과군 요약 — 총 ${allStandards.length}개 성취기준]\n` +
      [...groupCounts.entries()].map(([g, cnt]) => `${g}: ${cnt}개`).join(', ')

    // ===== 4. 시스템 프롬프트 조립 =====
    let systemPrompt = `당신은 2022 개정 교육과정의 교과 간 연결 탐색 전문 AI입니다.

교사가 성취기준 그래프를 탐색하고 있습니다. 교사의 질문에 대해:
1. 현재 그래프에 표시된 성취기준과 연결을 분석하고 설명합니다.
2. 아직 발견되지 않은 새로운 교과 간 연결 가능성을 제안합니다.
3. 특정 주제나 역량 중심의 융합 수업 아이디어를 제시합니다.

한국어로 응답하며, 존댓말을 사용합니다. 성취기준 코드를 반드시 포함해서 답변하세요.

새로운 연결을 제안할 때는 다음 JSON 형식을 사용하세요:
<new_links>
[{"source":"[코드]","target":"[코드]","link_type":"cross_subject","rationale":"연결 근거"}]
</new_links>

link_type 종류: cross_subject(교과연계), same_concept(동일개념), prerequisite(선수학습), application(적용), extension(확장)
같은 교과군 내 연결은 제안하지 마세요. 교과군 간 융합만 다룹니다.
${visibleSection}${context.selectedNode ? `
[교사가 선택한 노드]
${context.selectedNode.code} [${context.selectedNode.subject}/${context.selectedNode.area}] — ${context.selectedNode.content}${context.neighborCodes?.length > 0 ? `\n현재 연결: ${context.neighborCodes.join(', ')}` : ''}
→ 이 성취기준을 중심으로 답변해주세요.` : ''}${context.filterSubjects ? `
[교사의 교과 필터] ${context.filterSubjects.join(' × ')}${context.schoolLevel ? ` / 학교급: ${context.schoolLevel.join(', ')}` : ''}` : ''}
${additionalStandardsSection}
${overviewSection}`

    // 프롬프트 크기 초과 시 잘라내기 (안전장치)
    if (systemPrompt.length > MAX_PROMPT_CHARS) {
      console.warn(`시스템 프롬프트 크기 초과: ${systemPrompt.length}자 → ${MAX_PROMPT_CHARS}자로 잘라냄`)
      systemPrompt = systemPrompt.slice(0, MAX_PROMPT_CHARS) + '\n\n[컨텍스트가 길어 일부 생략됨]'
    }

    console.log(`[graph/chat] 프롬프트 크기: ${systemPrompt.length}자, 포커스: ${[...focusSubjectGroups].join(',')||'전체'}, 연결: ${graph.links.length}개`)

    const messages = []
    for (const msg of history.slice(-6)) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })
    }
    messages.push({ role: 'user', content: message })

    let fullResponse = ''
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
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
    console.error('그래프 AI 채팅 오류:', error?.message || error)
    const errMsg = error?.status === 401 ? 'API 키가 유효하지 않습니다.'
      : error?.status === 429 ? 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
      : error?.status === 400 ? `API 요청 오류: ${error?.message || ''}`
      : `응답 생성 중 오류: ${error?.message || '알 수 없는 오류'}`
    res.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

/**
 * AI 내러티브 생성 (SSE 스트리밍)
 * 선택한 성취기준의 연결을 분석하여 융합 수업 스토리를 생성합니다.
 */
standardsRouter.post('/narrative', async (req, res) => {
  const { standardCode, connections = [] } = req.body
  if (!standardCode) {
    return res.status(400).json({ error: '성취기준 코드가 필요합니다.' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    const allStandards = Standards.list()
    const center = allStandards.find(s => s.code === standardCode)
    if (!center) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: '해당 성취기준을 찾을 수 없습니다.' })}\n\n`)
      res.write(`data: [DONE]\n\n`)
      res.end()
      return
    }

    // 연결 정보 정리
    const connectionDetails = connections.slice(0, 15).map(c => {
      const neighbor = allStandards.find(s => s.code === c.neighborCode)
      return neighbor
        ? `  • ${neighbor.code} [${neighbor.subject_group}/${neighbor.grade_group}] — ${neighbor.content}\n    연결유형: ${c.linkType || 'cross_subject'}, 근거: ${c.rationale || '없음'}`
        : null
    }).filter(Boolean).join('\n')

    // 연결 교과 목록
    const subjectSet = new Set(connections.map(c => c.subjectGroup).filter(Boolean))
    const subjectList = [...subjectSet].join(', ')

    const systemPrompt = `당신은 2022 개정 교육과정의 융합 수업 설계 전문가입니다.

교사가 선택한 성취기준과 그 연결을 분석하여, 교육적으로 의미 있는 **융합 수업 내러티브**를 작성하세요.

## 작성 가이드
1. **연결 해석**: 각 연결이 왜 교육적으로 의미 있는지 설명합니다.
2. **융합 수업 아이디어**: 이 연결들을 활용한 구체적 수업 시나리오를 1~2개 제안합니다.
3. **학생 역량**: 이 융합 수업으로 키울 수 있는 핵심 역량을 언급합니다.
4. **실천 팁**: 교사가 바로 활용할 수 있는 실천적 조언을 제공합니다.

## 형식
- 한국어 존댓말 사용
- 마크다운 형식 (##, -, **굵은 글씨** 등)
- 성취기준 코드는 반드시 포함
- 분량: 400~800자 내외로 간결하게

## 중심 성취기준
${center.code} [${center.subject_group}/${center.grade_group}/${center.area || ''}]
${center.content}
${center.explanation ? `해설: ${center.explanation}` : ''}

## 연결된 성취기준 (${connections.length}개, 교과: ${subjectList})
${connectionDetails}
`

    console.log(`[narrative] ${standardCode}: 연결 ${connections.length}개, 교과 ${subjectList}`)

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: `${center.code} 성취기준의 교과 간 연결을 분석하고, 이를 활용한 융합 수업 내러티브를 작성해주세요.` }],
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`)
      }
    }

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (error) {
    console.error('내러티브 생성 오류:', error?.message || error)
    const errMsg = error?.status === 401 ? 'API 키가 유효하지 않습니다.'
      : error?.status === 429 ? 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
      : `내러티브 생성 중 오류: ${error?.message || '알 수 없는 오류'}`
    res.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`)
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
