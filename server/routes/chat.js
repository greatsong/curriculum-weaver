/**
 * AI 채팅 라우터 — 16절차 기반 리빌드
 *
 * 주요 변경:
 * - stage → procedure 전환
 * - <board_update> → <ai_suggestion> (자동 적용 안 함, 교사 수락/편집/거부)
 * - <stage_advance> → <procedure_advance>
 * - <coherence_check> 파싱 추가
 * - 제안 수락/편집수락/거부 엔드포인트 추가
 * - stage-intro → procedure-intro
 */

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { buildAIResponse, buildProcedureIntroResponse } from '../services/aiAgent.js'
import {
  getMessages, getMessage, createMessage,
  getProject, getMemberRole, getDesignsByProject,
  getStandardsByProject, upsertDesign,
} from '../lib/supabaseService.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { Materials } from '../lib/store.js'
import { SSE_EVENTS, BOARD_TYPES, PROCEDURES, ACTION_TYPES, PHASES } from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import { GENERAL_PRINCIPLES } from '../data/generalPrinciples.js'
import { validateCodesInText } from '../lib/standardsValidator.js'
import { PROCEDURE_GUIDE } from '../data/procedureGuide.js'

/**
 * 정적 인트로 마크다운 생성 (AI 호출 없음)
 * — 모든 사용자에게 동일한 내용이므로 AI 대신 PROCEDURE_GUIDE + PROCEDURE_STEPS로 구성
 */
function buildStaticIntro(procedureCode) {
  const procInfo = PROCEDURES[procedureCode]
  const guide = PROCEDURE_GUIDE[procedureCode]
  const steps = PROCEDURE_STEPS[procedureCode] || []
  const phaseInfo = Object.values(PHASES).find(p => p.id === procInfo?.phase)
  const isFirst = procedureCode === 'T-1-1'

  if (!procInfo || !guide) return null

  const lines = []

  if (isFirst) {
    lines.push(`안녕하세요! 협력적 수업설계의 AI 공동설계자입니다. 함께 의미 있는 수업을 만들어 보겠습니다.`)
    lines.push('')
  }

  lines.push(`**[${phaseInfo?.name || ''} > ${procedureCode}: ${procInfo.name}]** 절차에 진입했습니다.`)
  lines.push('')

  // 핵심 질문
  if (guide.coreQuestion) {
    lines.push(`> **핵심 질문**: ${guide.coreQuestion}`)
    lines.push('')
  }

  // 개념/방법/유의사항/산출물 표
  lines.push(`| 항목 | 내용 |`)
  lines.push(`|------|------|`)
  if (guide.concept) lines.push(`| **개념** | ${guide.concept} |`)
  if (guide.methods?.length) lines.push(`| **방법/절차** | ${guide.methods.join(' → ')} |`)
  if (guide.notes) lines.push(`| **유의사항** | ${guide.notes} |`)
  if (guide.deliverable) lines.push(`| **산출물** | ${guide.deliverable} |`)
  lines.push('')

  // 스텝 개요
  if (steps.length > 0) {
    lines.push(`**이 절차의 스텝 (${steps.length}개):**`)
    for (const s of steps) {
      const actionName = ACTION_TYPES[s.actionType]?.name || s.actionType
      const aiTag = s.aiCapability ? ' 🤖' : ''
      lines.push(`${s.stepNumber}. [${actionName}] ${s.title}${aiTag}`)
    }
    lines.push('')

    // 첫 번째 스텝 안내
    const first = steps[0]
    lines.push(`**첫 번째 스텝**: ${first.title}`)
    lines.push(`- ${first.description}`)
    lines.push('')
  }

  lines.push(`이 절차에서 궁금한 점이 있으시면 자유롭게 질문해 주세요!`)

  return lines.join('\n')
}

/**
 * 프로젝트 멤버십 검증 미들웨어
 * session_id(=projectId)로 프로젝트를 찾고, 워크스페이스 멤버인지 확인
 */
async function checkProjectAccess(req, res, next) {
  const projectId = req.params.sessionId || req.body?.session_id
  if (!projectId) return next() // 프로젝트 ID 없으면 개별 라우트에서 처리
  try {
    const project = await getProject(projectId)
    if (!project) return next() // 레거시 세션/데모일 수 있으므로 통과
    if (project.workspace_id && req.user?.id) {
      const role = await getMemberRole(project.workspace_id, req.user.id)
      if (!role) {
        return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
      }
      req.projectRole = role
    }
    req.project = project
  } catch {
    // Supabase 연결 실패 시 통과 (폴백 모드)
  }
  next()
}

function isReadOnlyProject(project) {
  return project?.status === 'simulation' ||
    project?.status === 'generating' ||
    project?.status === 'failed' ||
    project?.title?.startsWith('[시뮬레이션]')
}

// ──────────────────────────────────────────
// XML 파서: AI 응답에서 구조화 블록 추출
// ──────────────────────────────────────────

/**
 * AI 응답에서 <ai_suggestion> 블록 추출
 * — 기존 <board_update>를 대체. 자동 적용하지 않고 제안으로만 저장
 *
 * @param {string} text - AI 전체 응답
 * @returns {{ cleanText: string, suggestions: Object[] }}
 */
function extractAiSuggestions(text) {
  const suggestions = []
  const regex = /<ai_suggestion\s+type="([^"]+)"\s+procedure="([^"]+)"\s+step="([^"]*?)"\s*(?:action="([^"]*?)")?\s*>\s*([\s\S]*?)\s*<\/ai_suggestion>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[5])
      suggestions.push({
        type: match[1],           // 'board_update'
        procedure: match[2],      // 'T-1-1'
        step: match[3],           // '5'
        action: match[4] || '',   // 'generate'
        content: parsed,
        status: 'pending',        // pending → accepted / edited / rejected
      })
    } catch (e) {
      console.warn('AI 제안 JSON 파싱 실패:', e.message)
    }
  }
  const cleanText = text.replace(/<ai_suggestion\s+[^>]*>[\s\S]*?<\/ai_suggestion>/g, '').trim()
  return { cleanText, suggestions }
}

/**
 * AI 응답에서 <coherence_check> 블록 추출
 *
 * @param {string} text - AI 전체 응답
 * @returns {{ cleanText: string, coherenceCheck: Object|null }}
 */
function extractCoherenceCheck(text) {
  const regex = /<coherence_check\s+procedure="([^"]+)"\s+against="([^"]+)">\s*([\s\S]*?)\s*<\/coherence_check>/g
  const match = regex.exec(text)
  if (!match) return { cleanText: text, coherenceCheck: null }

  try {
    const data = JSON.parse(match[3])
    const coherenceCheck = {
      procedure: match[1],
      against: match[2],
      aligned: data.aligned,
      feedback: data.feedback,
      details: data.details || [],
    }
    const cleanText = text.replace(/<coherence_check\s+[^>]*>[\s\S]*?<\/coherence_check>/g, '').trim()
    return { cleanText, coherenceCheck }
  } catch (e) {
    console.warn('정합성 점검 JSON 파싱 실패:', e.message)
    return { cleanText: text, coherenceCheck: null }
  }
}

/**
 * AI 응답에서 <procedure_advance> 블록 추출
 *
 * @param {string} text - AI 전체 응답
 * @returns {{ cleanText: string, procedureAdvance: Object|null }}
 */
function extractProcedureAdvance(text) {
  const regex = /<procedure_advance\s+current="([^"]+)"\s+suggested="([^"]+)"\s+reason="([^"]*?)"\s*\/>/g
  const match = regex.exec(text)
  if (!match) {
    // 대체 형식: 블록 형태
    const blockRegex = /<procedure_advance\s+current="([^"]+)"\s+suggested="([^"]+)"\s+reason="([^"]*?)">\s*<\/procedure_advance>/g
    const blockMatch = blockRegex.exec(text)
    if (!blockMatch) return { cleanText: text, procedureAdvance: null }

    const procedureAdvance = {
      current: blockMatch[1],
      suggested: blockMatch[2],
      reason: blockMatch[3],
    }
    const cleanText = text.replace(/<procedure_advance[^>]*>[\s\S]*?<\/procedure_advance>/g, '').trim()
    return { cleanText, procedureAdvance }
  }

  const procedureAdvance = {
    current: match[1],
    suggested: match[2],
    reason: match[3],
  }
  const cleanText = text.replace(/<procedure_advance\s+[^>]*\/>/g, '').trim()
  return { cleanText, procedureAdvance }
}

/**
 * 기존 <board_update> 블록도 호환 파싱 (레거시 지원)
 *
 * @param {string} text
 * @returns {{ cleanText: string, legacyUpdates: Object[] }}
 */
function extractLegacyBoardUpdates(text) {
  const updates = []
  const regex = /<board_update\s+type="([^"]+)">\s*([\s\S]*?)\s*<\/board_update>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[2])
      updates.push({ board_type: match[1], content: parsed })
    } catch (e) {
      console.warn('레거시 보드 업데이트 JSON 파싱 실패:', match[1], e.message)
    }
  }
  const cleanText = text.replace(/<board_update\s+type="[^"]+">[\s\S]*?<\/board_update>/g, '').trim()
  return { cleanText, legacyUpdates: updates }
}

// ──────────────────────────────────────────
// 라우터 정의
// ──────────────────────────────────────────

export const chatRouter = Router()
chatRouter.use(requireAuth)
chatRouter.use(checkProjectAccess)

// ─── 채팅 메시지 목록 조회 ───
chatRouter.get('/:sessionId', async (req, res) => {
  try {
    const messages = await getMessages(req.params.sessionId)
    // 클라이언트 호환: procedure_context → stage_context 별칭
    const mapped = messages.map((m) => ({
      ...m,
      stage_context: m.procedure_context || m.stage_context,
      session_id: m.project_id || m.session_id,
    }))
    res.json(mapped)
  } catch (err) {
    console.error('메시지 목록 조회 오류:', err.message)
    res.json([])
  }
})

// ─── 교사 메시지 저장 ───
chatRouter.post('/teacher', async (req, res) => {
  const { session_id, content, procedure, sender_name, sender_subject } = req.body
  const mentionedRaw = req.body?.mentioned_material_ids
  if (!session_id || !content?.trim()) {
    return res.status(400).json({ error: '세션 ID와 메시지 내용이 필요합니다.' })
  }

  const project = req.project || await getProject(session_id).catch(() => null)
  if (isReadOnlyProject(project)) {
    return res.status(403).json({ error: '시뮬레이션 프로젝트는 읽기 전용입니다.' })
  }

  try {
    // @멘션 교차 검증 — 해당 프로젝트 자료만 유효
    const { validIds } = await resolveMentionedMaterials(mentionedRaw, session_id)

    const msg = await createMessage({
      project_id: session_id,
      user_id: req.user?.id || null,
      sender_type: 'teacher',
      content: content.trim(),
      procedure_context: procedure || req.body.stage || null,
      sender_name: sender_name || '교사',
      sender_subject: sender_subject || '',
      mentioned_material_ids: validIds,
    })
    // 클라이언트 호환: stage_context 필드도 포함
    res.status(201).json({ ...msg, stage_context: msg.procedure_context, session_id })
  } catch (err) {
    console.error('교사 메시지 저장 오류:', err.message)
    res.status(500).json({ error: '메시지 저장에 실패했습니다.' })
  }
})

// ─── 시드 데이터용: 일반 메시지 직접 추가 ───
chatRouter.post('/seed', async (req, res) => {
  const { session_id, sender_type, content, procedure, sender_name, sender_subject, principles_used } = req.body
  if (!session_id || !content?.trim() || !sender_type) {
    return res.status(400).json({ error: '필수 필드: session_id, sender_type, content' })
  }

  // sender_type 값 검증
  const VALID_SENDER_TYPES = ['teacher', 'ai', 'system']
  if (!VALID_SENDER_TYPES.includes(sender_type)) {
    return res.status(400).json({ error: `유효하지 않은 sender_type: ${sender_type}. 허용: ${VALID_SENDER_TYPES.join(', ')}` })
  }

  try {
    const msg = await createMessage({
      project_id: session_id,
      sender_type,
      content: content.trim(),
      procedure_context: procedure || req.body.stage || null,
      principles_used: principles_used || [],
      sender_name: sender_name || null,
      sender_subject: sender_subject || null,
    })
    res.status(201).json({ ...msg, stage_context: msg.procedure_context, session_id })
  } catch (err) {
    console.error('시드 메시지 저장 오류:', err.message)
    res.status(500).json({ error: '메시지 저장에 실패했습니다.' })
  }
})

// ─── 절차 진입 인트로 메시지 (SSE 스트리밍) ───
chatRouter.post('/procedure-intro', async (req, res) => {
  const { session_id, procedure, aiModel } = req.body

  if (!session_id || !procedure) {
    return res.status(400).json({ error: '세션 ID와 절차 코드가 필요합니다.' })
  }

  // 절차 코드 유효성 검사
  if (!PROCEDURES[procedure]) {
    return res.status(400).json({ error: `유효하지 않은 절차 코드: ${procedure}` })
  }

  const project = req.project || await getProject(session_id).catch(() => null)
  if (isReadOnlyProject(project)) {
    return res.status(403).json({ error: '시뮬레이션 프로젝트에서는 새 AI 안내를 생성하지 않습니다.' })
  }

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    const designs = await getDesignsByProject(session_id).catch(() => [])

    // A-2-1 진입 시: 프로젝트에 성취기준이 없으면 자동 추천
    if (procedure === 'A-2-1') {
      const existingStandards = await getStandardsByProject(session_id).catch(() => [])
      if (existingStandards.length === 0 && project?.subjects?.length >= 2) {
        try {
          const { getStandardsForSubjects } = await import('../lib/standardsValidator.js')
          const { standards: recommended } = getStandardsForSubjects(project.subjects, project.grade || '')
          if (recommended.length > 0) {
            const perSubject = {}
            const topPicks = []
            for (const s of recommended) {
              const sg = s.subject_group || s.subject
              if (!perSubject[sg]) perSubject[sg] = 0
              if (perSubject[sg] < 5) { topPicks.push(s); perSubject[sg]++ }
            }
            res.write(`data: ${JSON.stringify({
              type: 'standards_recommendation',
              recommendations: topPicks,
              message: `${project.subjects.join('+')} 교과에서 ${topPicks.length}개의 성취기준을 추천합니다. 성취기준 탐색기에서 확인/수정해 주세요.`,
            })}\n\n`)
          }
        } catch (e) {
          console.warn('[procedure-intro] 성취기준 자동 추천 실패:', e.message)
        }
      }
    }

    // 정적 인트로 (AI 호출 없음 — 모든 사용자에게 동일한 내용)
    const introText = buildStaticIntro(procedure)
    if (introText) {
      res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.TEXT, content: introText })}\n\n`)

      // 인트로 메시지를 Supabase에 저장
      await createMessage({
        project_id: session_id,
        sender_type: 'ai',
        content: introText,
        procedure_context: procedure,
      })
    }

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (error) {
    console.error('절차 인트로 오류:', error)
    res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: '인트로 생성 중 오류가 발생했습니다.' })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

// ─── 하위 호환: stage-intro → procedure-intro 리디렉트 ───
chatRouter.post('/stage-intro', async (req, res) => {
  // stage 번호를 procedure 코드로 변환하는 것은 클라이언트에서 처리
  // 여기서는 호환성을 위해 procedure 필드가 있으면 사용
  req.body.procedure = req.body.procedure || req.body.stage
  // procedure-intro 핸들러로 포워딩
  const { session_id, procedure, aiModel } = req.body
  if (!session_id || !procedure) {
    return res.status(400).json({ error: '세션 ID와 절차(또는 단계)가 필요합니다.' })
  }

  // 숫자(기존 stage)가 들어온 경우 처리 불가 → 에러
  if (typeof procedure === 'number') {
    return res.status(400).json({ error: 'stage-intro는 deprecated입니다. procedure-intro를 사용하세요.' })
  }

  // procedure-intro와 동일하게 처리
  if (!PROCEDURES[procedure]) {
    return res.status(400).json({ error: `유효하지 않은 절차 코드: ${procedure}` })
  }

  const project = req.project || await getProject(session_id).catch(() => null)
  if (isReadOnlyProject(project)) {
    return res.status(403).json({ error: '시뮬레이션 프로젝트에서는 새 AI 안내를 생성하지 않습니다.' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    // 정적 인트로 (AI 호출 없음)
    const introText = buildStaticIntro(procedure)
    if (introText) {
      res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.TEXT, content: introText })}\n\n`)

      await createMessage({
        project_id: session_id,
        sender_type: 'ai',
        content: introText,
        procedure_context: procedure,
      })
    }

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (error) {
    console.error('단계 인트로 오류 (레거시):', error)
    res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: '인트로 생성 중 오류가 발생했습니다.' })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

/**
 * @멘션 자료 id 교차 검증.
 * - project_id가 일치하는 materials만 유효한 것으로 간주한다.
 * - Supabase 실패 또는 미연결이면 인메모리 Materials로 폴백.
 * - 잘못된 id(삭제됨/타 프로젝트)는 조용히 drop한다.
 *
 * @param {string[]} rawIds
 * @param {string} projectId
 * @returns {Promise<{validIds: string[], materials: object[]}>}
 */
async function resolveMentionedMaterials(rawIds, projectId) {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { validIds: [], materials: [] }
  }
  // 중복 제거 + 문자열 정규화
  const unique = [...new Set(rawIds.filter((v) => typeof v === 'string' && v.length > 0))]
  if (unique.length === 0) return { validIds: [], materials: [] }

  // Supabase 우선
  try {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select('*')
      .in('id', unique)
      .eq('project_id', projectId)
    if (error) throw error
    return { validIds: (data || []).map((m) => m.id), materials: data || [] }
  } catch {
    // 인메모리 폴백
    const list = Materials.list(projectId) || []
    const idSet = new Set(unique)
    const valid = list.filter((m) => idSet.has(m.id))
    return { validIds: valid.map((m) => m.id), materials: valid }
  }
}

// ─── AI 채팅 메시지 전송 (SSE 스트리밍) ───
chatRouter.post('/message', async (req, res) => {
  const { session_id, content, procedure, currentStep, aiRole, aiModel } = req.body
  const mentionedRaw = req.body?.mentioned_material_ids
  // 하위 호환: stage → procedure
  const activeProcedure = procedure || req.body.stage

  if (!session_id || !content?.trim()) {
    return res.status(400).json({ error: '세션 ID와 메시지 내용이 필요합니다.' })
  }

  // 사용자 입력 길이 제한 (프롬프트 인젝션 방어)
  if (content.length > 5000) {
    return res.status(400).json({ error: '메시지가 너무 깁니다. (최대 5,000자)' })
  }

  const project = req.project || await getProject(session_id).catch(() => null)
  if (isReadOnlyProject(project)) {
    return res.status(403).json({ error: '시뮬레이션 프로젝트는 읽기 전용입니다.' })
  }

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // 클라이언트 disconnect 감지 — AI 토큰 낭비 방지
  let clientDisconnected = false
  req.on('close', () => {
    clientDisconnected = true
  })

  try {
    // 컨텍스트 로드 (Supabase 영속 저장소)
    const designs = await getDesignsByProject(session_id).catch(() => [])
    const allMessages = await getMessages(session_id)

    // 현재 절차의 이전 대화를 우선 포함 + 최근 대화도 포함
    // (절차 1→2→3→4→5 진행 후 절차 2로 돌아오면, 절차 2의 대화가 최근 20개에서 밀려나 있으므로)
    const currentProcMessages = allMessages.filter(
      m => (m.procedure_context || m.stage_context) === activeProcedure
    )
    const recentGlobalMessages = allMessages.slice(-10)

    // 현재 절차 대화(최대 10개) + 최근 전체 대화(최대 10개)를 시간순 병합, 중복 제거
    const procSlice = currentProcMessages.slice(-10)
    const mergedMap = new Map()
    for (const m of procSlice) mergedMap.set(m.id, m)
    for (const m of recentGlobalMessages) mergedMap.set(m.id, m)
    const recentMessages = [...mergedMap.values()]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    const standards = await getStandardsByProject(session_id).catch(() => [])

    // 프로젝트 소속 자료 로드 (분석 완료 + 진행 중 포함)
    // 일반 컨텍스트 주입용 — 멘션된 자료는 mentionedMaterials로 별도 관리
    let materials = []
    try {
      const { data: matsData, error: matsErr } = await supabaseAdmin
        .from('materials')
        .select('*')
        .eq('project_id', session_id)
        .order('created_at', { ascending: false })
      if (matsErr) throw matsErr
      materials = matsData || []
    } catch {
      materials = Materials.list(session_id) || []
    }

    // @멘션 교차 검증 (project_id 일치 항목만 통과)
    let { validIds: mentionedIds, materials: mentionedMaterials } =
      await resolveMentionedMaterials(mentionedRaw, session_id)

    // ── 텍스트 스캔 폴백 ──
    // 교사가 드롭다운 없이 "@파일명"을 직접 타이핑한 경우에도 멘션으로 인식.
    // project의 실제 materials.file_name과 일치할 때만 자동 승격.
    if (content && mentionedIds.length < (materials?.length || 0)) {
      const already = new Set(mentionedIds)
      const autoAdded = []
      for (const m of materials) {
        if (!m?.file_name || already.has(m.id)) continue
        if (content.includes(`@${m.file_name}`)) {
          already.add(m.id)
          autoAdded.push(m)
        }
      }
      if (autoAdded.length > 0) {
        mentionedIds = [...mentionedIds, ...autoAdded.map(m => m.id)]
        mentionedMaterials = [...(mentionedMaterials || []), ...autoAdded]
      }
    }

    const context = {
      session: project,
      standards,
      materials,
      boards: designs,
      recentMessages,
      userMessage: content,
      procedure: activeProcedure,
      currentStep: currentStep ? Number(currentStep) : null,
      aiRole: aiRole || undefined,
      aiModel: aiModel || undefined,
      mentionedMaterialIds: mentionedIds,
      mentionedMaterials,
    }

    // 사용된 원칙 ID 추적
    const generalPrinciples = GENERAL_PRINCIPLES || []
    const principlesUsed = generalPrinciples.map((gp) => gp.id)

    // 적용된 원칙 전송
    if (principlesUsed.length > 0) {
      res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.PRINCIPLES, principles: principlesUsed })}\n\n`)
    }

    // Claude API 스트리밍 응답
    let fullResponse = ''
    await buildAIResponse(context, {
      onText: (text) => {
        if (clientDisconnected) return // 클라이언트 끊김 시 쓰기 중단
        fullResponse += text
        res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.TEXT, content: text })}\n\n`)
      },
      onError: (error) => {
        if (clientDisconnected) return
        res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: error })}\n\n`)
      },
    })

    // ─── AI 응답 파싱 ───
    let processedText = fullResponse

    // 1. <ai_suggestion> 추출 (새 형식)
    const { cleanText: afterSuggestions, suggestions } = extractAiSuggestions(processedText)
    processedText = afterSuggestions

    // 2. 레거시 <board_update> 추출 (하위 호환)
    const { cleanText: afterLegacy, legacyUpdates } = extractLegacyBoardUpdates(processedText)
    processedText = afterLegacy

    // 레거시 업데이트를 새 형식으로 변환
    for (const lu of legacyUpdates) {
      suggestions.push({
        type: 'board_update',
        procedure: activeProcedure,
        step: '',
        action: '',
        content: lu.content,
        status: 'pending',
        _legacyBoardType: lu.board_type,
      })
    }

    // 3. <coherence_check> 추출
    const { cleanText: afterCoherence, coherenceCheck } = extractCoherenceCheck(processedText)
    processedText = afterCoherence

    // 4. <procedure_advance> 추출
    const { cleanText: finalCleanText, procedureAdvance } = extractProcedureAdvance(processedText)

    // ─── SSE 이벤트 전송 ───

    // AI 제안 전송 (자동 적용하지 않음 — 교사 수락 대기)
    if (suggestions.length > 0) {
      res.write(`data: ${JSON.stringify({
        type: SSE_EVENTS.BOARD_SUGGESTIONS,
        suggestions,
      })}\n\n`)
    }

    // 정합성 점검 결과 전송
    if (coherenceCheck) {
      res.write(`data: ${JSON.stringify({
        type: 'coherence_check',
        ...coherenceCheck,
      })}\n\n`)
    }

    // 절차 전환 제안 전송
    if (procedureAdvance) {
      res.write(`data: ${JSON.stringify({
        type: SSE_EVENTS.PROCEDURE_ADVANCE,
        ...procedureAdvance,
      })}\n\n`)
    }

    // 채팅 본문의 성취기준 코드 검증 — 가짜 코드가 있으면 클라이언트에 경고 전송
    const codeValidation = validateCodesInText(finalCleanText)
    const invalidCodes = codeValidation.codes.filter(c => !c.valid)
    if (invalidCodes.length > 0) {
      res.write(`data: ${JSON.stringify({
        type: 'standards_warning',
        message: `AI 응답에 검증되지 않은 성취기준 코드가 포함되어 있습니다: ${invalidCodes.map(c => c.code).join(', ')}`,
        invalidCodes,
      })}\n\n`)
    }

    // 클린 텍스트를 Supabase에 저장 (AI 제안은 별도 필드로 저장)
    if (finalCleanText) {
      const savedMsg = await createMessage({
        project_id: session_id,
        sender_type: 'ai',
        content: finalCleanText,
        procedure_context: activeProcedure,
        principles_used: principlesUsed,
        ai_suggestions: suggestions.length > 0 ? suggestions : undefined,
      })

      // 저장된 메시지 ID를 클라이언트에 전송 (제안 수락/거부 시 참조)
      if (suggestions.length > 0 && savedMsg?.id) {
        res.write(`data: ${JSON.stringify({
          type: 'message_saved',
          messageId: savedMsg.id,
          suggestionCount: suggestions.length,
        })}\n\n`)
      }
    }

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (error) {
    console.error('AI 채팅 오류:', error)
    res.write(`data: ${JSON.stringify({ type: SSE_EVENTS.ERROR, message: '응답 생성 중 오류가 발생했습니다.' })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

// ──────────────────────────────────────────
// AI 제안 수락/편집수락/거부 엔드포인트
// ──────────────────────────────────────────

/**
 * POST /api/chat/suggestion/:messageId/accept
 * — AI 제안을 수락하여 보드에 적용
 */
chatRouter.post('/suggestion/:messageId/accept', async (req, res) => {
  const { messageId } = req.params
  const { session_id, procedure, suggestionIndex = 0 } = req.body

  if (!session_id || !procedure) {
    return res.status(400).json({ error: '세션 ID와 절차 코드가 필요합니다.' })
  }

  try {
    // 메시지에서 제안 데이터 조회
    const message = await getMessage(messageId)
    const suggestions = message?.ai_suggestions || req.body.suggestions || []
    const suggestion = suggestions[suggestionIndex]

    if (!suggestion) {
      return res.status(404).json({ error: '해당 제안을 찾을 수 없습니다.' })
    }

    // 보드에 적용
    const boardType = suggestion._legacyBoardType || BOARD_TYPES[procedure]
    if (!boardType) {
      return res.status(400).json({ error: `절차 ${procedure}에 대응하는 보드 타입이 없습니다.` })
    }

    // Supabase에 설계 저장 (성취기준 검증은 upsertDesign 게이트키퍼가 처리)
    const contentToSave = suggestion.content
    let updatedDesign = null
    try {
      updatedDesign = await upsertDesign(session_id, procedure, contentToSave, req.user?.id)
    } catch (err) {
      console.warn(`[제안 수락] Supabase 저장 실패, 계속 진행:`, err.message)
    }

    // 제안 상태 업데이트
    suggestion.status = 'accepted'

    console.log(`[활동] 제안 수락 — 프로젝트: ${session_id}, 절차: ${procedure}, 보드: ${boardType}`)

    res.json({
      success: true,
      boardType,
      content: updatedDesign?.content || contentToSave,
      design: updatedDesign,
    })
  } catch (error) {
    console.error('제안 수락 오류:', error)
    res.status(500).json({ error: '제안 수락 중 오류가 발생했습니다.' })
  }
})

/**
 * POST /api/chat/suggestion/:messageId/edit-accept
 * — AI 제안을 교사가 수정한 후 수락
 */
chatRouter.post('/suggestion/:messageId/edit-accept', async (req, res) => {
  const { messageId } = req.params
  const { session_id, procedure, suggestionIndex = 0, editedContent } = req.body

  if (!session_id || !procedure || !editedContent) {
    return res.status(400).json({ error: '세션 ID, 절차 코드, 수정된 내용이 필요합니다.' })
  }

  try {
    // 보드에 수정된 내용 적용
    const boardType = BOARD_TYPES[procedure]
    if (!boardType) {
      return res.status(400).json({ error: `절차 ${procedure}에 대응하는 보드 타입이 없습니다.` })
    }

    // Supabase에 설계 저장 (성취기준 검증은 upsertDesign 게이트키퍼가 처리)
    let updatedDesign = null
    try {
      updatedDesign = await upsertDesign(session_id, procedure, editedContent, req.user?.id)
    } catch (err) {
      console.warn(`[제안 편집수락] Supabase 저장 실패:`, err.message)
    }

    console.log(`[활동] 제안 편집수락 — 프로젝트: ${session_id}, 절차: ${procedure}, 보드: ${boardType}`)

    res.json({
      success: true,
      boardType,
      content: updatedDesign?.content || editedContent,
      design: updatedDesign,
    })
  } catch (error) {
    console.error('제안 편집수락 오류:', error)
    res.status(500).json({ error: '제안 편집수락 중 오류가 발생했습니다.' })
  }
})

/**
 * POST /api/chat/suggestion/:messageId/reject
 * — AI 제안을 거부
 */
chatRouter.post('/suggestion/:messageId/reject', async (req, res) => {
  const { messageId } = req.params
  const { session_id, procedure, suggestionIndex = 0, reason = '' } = req.body

  if (!session_id) {
    return res.status(400).json({ error: '세션 ID가 필요합니다.' })
  }

  try {
    // 활동 로그
    console.log(`[활동] 제안 거부 — 세션: ${session_id}, 절차: ${procedure || '?'}, 사유: ${reason || '없음'}`)

    res.json({
      success: true,
      status: 'rejected',
      reason,
    })
  } catch (error) {
    console.error('제안 거부 오류:', error)
    res.status(500).json({ error: '제안 거부 중 오류가 발생했습니다.' })
  }
})
