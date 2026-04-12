/**
 * 인메모리 데이터 저장소
 * Supabase 없이 작동하기 위한 로컬 저장소
 * 서버 재시작 시 초기화됨
 */
import crypto from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PRINCIPLES } from '../data/principles.js'
import { GENERAL_PRINCIPLES } from '../data/generalPrinciples.js'
import { ALL_STANDARDS } from '../data/standards.js'
import { GENERATED_LINKS } from '../data/generatedLinks.js'
import { SEED_SESSIONS } from '../data/seedSessions.js'

const __storeDir = dirname(fileURLToPath(import.meta.url))

function uuid() {
  return crypto.randomUUID()
}

function inviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// ─── 저장소 ───
const sessions = new Map()
const messages = new Map()          // sessionId -> [message]
const boards = new Map()            // `${sessionId}:${stage}:${boardType}` -> board
const materials = new Map()         // sessionId -> [material]
const principles = new Map()        // principleId -> principle
const generalPrinciples = new Map() // gpId -> generalPrinciple
const standards = new Map()         // standardId -> standard
const standardLinks = new Map()     // linkId -> link
const sessionStandards = new Map()  // sessionId -> [{ standard_id, is_primary }]

// ─── 초기 데이터 로드 ───
export function initStore() {
  // 총괄 원리 로드
  for (const gp of GENERAL_PRINCIPLES) {
    generalPrinciples.set(gp.id, { ...gp })
  }

  // 단계별 원칙 로드
  for (const p of PRINCIPLES) {
    principles.set(p.id, { ...p, is_active: true, version: 1, created_at: new Date().toISOString() })
  }

  // 성취기준 로드 (오염 데이터 필터링 포함)
  let filteredCount = 0
  let flaggedCount = 0
  const seenCodes = new Set()
  for (const s of ALL_STANDARDS) {
    if (seenCodes.has(s.code)) continue
    const c = (s.content || '').trim()
    // 완전히 제거: placeholder / 더미 / 빈 content
    if (!c || c.length < 5) { filteredCount++; continue }
    if (/^[\w가-힣\[\]-]+의\s*성취기준\s*(내용|해설|코드)/.test(c)) { filteredCount++; continue }
    if (/^적용\s*시\s*고려|^성취기준\s*(내용|해설)/.test(c)) { filteredCount++; continue }
    // 마킹만: 해설문이 content에 섞인 경우, 잘린 본문 — 제거하면 성취기준이 사라지므로 _quality 플래그로 표시
    let quality = 'ok'
    if (/^이\s*성취기준은\s/.test(c)) quality = 'explanation_as_content'
    else if (/[을를의에서와과는은이가로]\s*$/.test(c) && c.length > 15) quality = 'truncated'
    else if (/\d+\s*(공통|선택)\s*교육과정/.test(c)) quality = 'page_tag_mixed'
    if (quality !== 'ok') flaggedCount++
    seenCodes.add(s.code)
    const id = uuid()
    standards.set(id, { id, ...s, _quality: quality, created_at: new Date().toISOString() })
  }
  if (filteredCount > 0 || flaggedCount > 0) {
    console.log(`[initStore] 성취기준: ${filteredCount}개 제거, ${flaggedCount}개 품질 경고 플래그`)
  }

  // 성취기준 간 연결 로드 (코드→ID 맵으로 O(1) 조회)
  const codeToId = new Map()
  for (const [id, s] of standards) codeToId.set(s.code, s)
  // 압축 형식: [source, target, link_type, rationale]
  // link_type 축약: cs→cross_subject, sc→same_concept, ap→application
  const ltMap = { cs: 'cross_subject', sc: 'same_concept', ap: 'application', pr: 'prerequisite', ex: 'extension' }
  const now = new Date().toISOString()
  for (const link of GENERATED_LINKS) {
    const [src, tgt, ltShort, rationale] = Array.isArray(link) ? link : [link.source, link.target, link.link_type, link.rationale]
    const sourceStd = codeToId.get(src)
    const targetStd = codeToId.get(tgt)
    if (sourceStd && targetStd) {
      const id = uuid()
      const lt = ltMap[ltShort] || ltShort
      standardLinks.set(id, {
        id,
        source_id: sourceStd.id,
        target_id: targetStd.id,
        source_code: src,
        target_code: tgt,
        link_type: lt,
        rationale: rationale || '',
        similarity: lt === 'same_concept' ? 0.9 : lt === 'prerequisite' ? 0.85 : lt === 'cross_subject' ? 0.7 : 0.6,
        // 3계층 링크 품질 시스템 필드
        status: 'published',           // 기존 AI 생성 링크는 게시 상태
        quality_score: null,
        semantic_score: null,
        integration_theme: null,
        lesson_hook: null,
        generation_method: 'ai',
        created_at: now,
      })
    }
  }

  // 시드 세션 로드 (초/중/고 샘플 세션 + 보드 + 채팅)
  for (const seed of SEED_SESSIONS) {
    const session = {
      id: uuid(),
      title: seed.title,
      description: seed.description,
      current_stage: 1,
      status: 'active',
      invite_code: inviteCode(),
      created_at: new Date().toISOString(),
    }
    sessions.set(session.id, session)
    messages.set(session.id, [])
    materials.set(session.id, [])
    sessionStandards.set(session.id, [])

    // 보드 데이터 로드
    if (seed.boards) {
      for (const [stage, boardMap] of Object.entries(seed.boards)) {
        for (const [boardType, content] of Object.entries(boardMap)) {
          const key = `${session.id}:${stage}:${boardType}`
          boards.set(key, {
            id: uuid(),
            session_id: session.id,
            stage: parseInt(stage),
            board_type: boardType,
            content,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      }
    }

    // 채팅 메시지 로드
    if (seed.chats) {
      for (const chat of seed.chats) {
        messages.get(session.id).push({
          id: uuid(),
          session_id: session.id,
          sender_type: chat.sender_type,
          content: chat.content,
          stage_context: chat.stage || null,
          principles_used: chat.principles_used || [],
          sender_name: chat.sender_name || null,
          sender_subject: chat.sender_subject || null,
          created_at: new Date().toISOString(),
        })
      }
    }
  }

  console.log(`  초기 데이터: 총괄원리 ${generalPrinciples.size}개, 단계별원칙 ${principles.size}개, 성취기준 ${standards.size}개, 연결 ${standardLinks.size}개, 세션 ${sessions.size}개`)
  return [...sessions.keys()][0]
}

// ─── 세션 CRUD ───
export const Sessions = {
  list: () => [...sessions.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)),

  get: (id) => sessions.get(id) || null,

  create: ({ title, description }) => {
    const session = {
      id: uuid(),
      title,
      description: description || null,
      current_stage: 1,
      status: 'active',
      invite_code: inviteCode(),
      created_at: new Date().toISOString(),
    }
    sessions.set(session.id, session)
    messages.set(session.id, [])
    materials.set(session.id, [])
    sessionStandards.set(session.id, [])
    return session
  },

  update: (id, data) => {
    const session = sessions.get(id)
    if (!session) return null
    Object.assign(session, data)
    sessions.set(id, session)
    return session
  },

  delete: (id) => {
    const session = sessions.get(id)
    if (!session) return false
    sessions.delete(id)
    messages.delete(id)
    materials.delete(id)
    sessionStandards.delete(id)
    // 보드 삭제
    for (const key of boards.keys()) {
      if (key.startsWith(`${id}:`)) boards.delete(key)
    }
    return true
  },

  findByInviteCode: (code) => {
    for (const s of sessions.values()) {
      if (s.invite_code === code.toUpperCase()) return s
    }
    return null
  },
}

// ─── 채팅 ───
export const Messages = {
  list: (sessionId) => messages.get(sessionId) || [],

  add: (sessionId, { sender_type, content, stage_context, principles_used, sender_name, sender_subject, ai_suggestions, coherence_check }) => {
    const msg = {
      id: uuid(),
      session_id: sessionId,
      sender_type,
      content,
      stage_context: stage_context || null,
      principles_used: principles_used || [],
      sender_name: sender_name || null,
      sender_subject: sender_subject || null,
      ai_suggestions: ai_suggestions || null,
      coherence_check: coherence_check || null,
      created_at: new Date().toISOString(),
    }
    if (!messages.has(sessionId)) messages.set(sessionId, [])
    messages.get(sessionId).push(msg)
    return msg
  },

  // ID로 메시지 조회 (제안 수락/거부 시 사용)
  get: (messageId) => {
    for (const msgList of messages.values()) {
      const found = msgList.find(m => m.id === messageId)
      if (found) return found
    }
    return null
  },
}

// ─── 설계 보드 ───
export const Boards = {
  listByStage: (sessionId, stage) => {
    const result = []
    for (const [key, board] of boards) {
      if (key.startsWith(`${sessionId}:${stage}:`)) result.push(board)
    }
    return result
  },

  get: (id) => {
    for (const board of boards.values()) {
      if (board.id === id) return board
    }
    return null
  },

  // 세션의 모든 보드를 반환 (정합성 점검용)
  listAll: (sessionId) => {
    const result = []
    for (const [key, board] of boards) {
      if (key.startsWith(`${sessionId}:`)) result.push(board)
    }
    return result
  },

  upsert: (sessionId, stage, boardType, content) => {
    const key = `${sessionId}:${stage}:${boardType}`
    const existing = boards.get(key)
    if (existing) {
      existing.content = content
      existing.version += 1
      existing.updated_at = new Date().toISOString()
      return existing
    }
    const board = {
      id: uuid(),
      session_id: sessionId,
      stage: parseInt(stage),
      board_type: boardType,
      content: content || {},
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    boards.set(key, board)
    return board
  },
}

// ─── 자료 ───
export const Materials = {
  list: (sessionId) => materials.get(sessionId) || [],

  add: (sessionId, data) => {
    const material = { id: uuid(), session_id: sessionId, ...data, created_at: new Date().toISOString() }
    if (!materials.has(sessionId)) materials.set(sessionId, [])
    materials.get(sessionId).push(material)
    return material
  },

  update: (id, data) => {
    for (const list of materials.values()) {
      const mat = list.find((m) => m.id === id)
      if (mat) {
        Object.assign(mat, data)
        return mat
      }
    }
    return null
  },
}

// ─── 총괄 원리 ───
export const GeneralPrinciples = {
  list: () => [...generalPrinciples.values()],
  get: (id) => generalPrinciples.get(id) || null,
}

// ─── 단계별 원칙 ───
export const Principles = {
  list: (stage) => {
    const all = [...principles.values()].filter((p) => p.is_active)
    if (stage) {
      // procedure 코드(문자열)와 숫자 stage 모두 지원
      const numStage = parseInt(stage)
      return all.filter((p) => p.stage === stage || p.stage === numStage || p.substep === stage)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    }
    return all.sort((a, b) => a.stage - b.stage || a.sort_order - b.sort_order)
  },

  get: (id) => principles.get(id) || null,

  update: (id, data) => {
    const p = principles.get(id)
    if (!p) return null
    Object.assign(p, data, { version: p.version + 1, updated_at: new Date().toISOString() })
    return p
  },
}

// ─── 성취기준 ───
export const Standards = {
  list: () => [...standards.values()],

  search: ({ q, subject, grade, domain, school_level, curriculum_category }) => {
    let results = [...standards.values()]
    if (subject) results = results.filter((s) => s.subject === subject)
    if (grade) results = results.filter((s) => s.grade_group === grade)
    if (domain) results = results.filter((s) => s.domain === domain)
    if (school_level) results = results.filter((s) => s.school_level === school_level)
    if (curriculum_category) results = results.filter((s) => s.curriculum_category === curriculum_category)
    if (q) {
      const query = q.toLowerCase()
      // 가중치 기반 검색 — 핵심 필드 매칭이 해설 매칭보다 상위에 노출
      const scored = results.map((s) => {
        let score = 0
        const content = s.content.toLowerCase()
        const code = s.code.toLowerCase()
        const area = (s.area || '').toLowerCase()
        const explanation = (s.explanation || '').toLowerCase()
        const keywords = (s.keywords || []).map((k) => k.toLowerCase())

        // 교과명에 검색어 포함 (예: "인공지능 기초" 교과) — 최고 가중치
        const subjectName = (s.subject || '').toLowerCase()
        const subjectGroup = (s.subject_group || '').toLowerCase()
        if (subjectName.includes(query)) score += 200
        if (subjectGroup.includes(query)) score += 150
        // 코드 매칭
        if (code.includes(query)) score += 100
        // 키워드 매칭 (핵심 개념)
        if (keywords.some((k) => k.includes(query))) score += 80
        // 성취기준 내용 매칭 (핵심)
        if (content.includes(query)) score += 60
        // 영역 매칭
        if (area.includes(query)) score += 40
        // 해설 매칭 (간접 언급 가능성 높음 — 낮은 가중치)
        if (explanation.includes(query)) score += 10

        return { standard: s, score }
      }).filter((item) => item.score > 0)

      // 점수 내림차순 정렬
      scored.sort((a, b) => b.score - a.score)
      results = scored.map((item) => ({
        ...item.standard,
        _matchScore: item.score,
        _matchField: item.score >= 40 ? 'primary' : 'secondary',
      }))
    }
    return results.slice(0, 50)
  },

  get: (id) => standards.get(id) || null,

  getByCode: (code) => [...standards.values()].find((s) => s.code === code) || null,

  subjects: () => [...new Set([...standards.values()].map((s) => s.subject))].sort(),

  gradeGroups: () => [...new Set([...standards.values()].map((s) => s.grade_group))].sort(),

  domains: () => [...new Set([...standards.values()].map((s) => s.domain).filter(Boolean))].sort(),

  schoolLevels: () => [...new Set([...standards.values()].map((s) => s.school_level).filter(Boolean))].sort(),

  categories: () => [...new Set([...standards.values()].map((s) => s.curriculum_category).filter(Boolean))].sort(),

  addBulk: (items) => {
    const added = []
    for (const item of items) {
      const existing = [...standards.values()].find((s) => s.code === item.code)
      if (existing) continue
      const id = uuid()
      const std = { id, ...item, created_at: new Date().toISOString() }
      standards.set(id, std)
      added.push(std)
    }
    return added
  },

  clear: () => {
    standards.clear()
    standardLinks.clear()
  },

  /**
   * 디스크에서 성취기준 데이터를 다시 로드 (서버 재시작 없이 갱신)
   * standards_full.js 우선, 없으면 standards.js 폴백
   * @returns {number} 로드된 성취기준 수
   */
  reload: () => {
    const dataDir = join(__storeDir, '..', 'data')

    // JSON 파싱 방식으로 JS 파일에서 데이터 추출 (ESM 캐시 우회)
    let newData = null
    const fullPath = join(dataDir, 'standards_full.js')
    const fallbackPath = join(dataDir, 'standards.js')

    for (const p of [fullPath, fallbackPath]) {
      if (!existsSync(p)) continue
      try {
        const raw = readFileSync(p, 'utf-8')
        const match = raw.match(/export const ALL_STANDARDS = (\[[\s\S]*\]);/)
        if (match) {
          newData = JSON.parse(match[1])
          console.log(`[reload] 파일 로드: ${p} (${newData.length}개)`)
          break
        }
      } catch (e) {
        console.warn(`[reload] 파일 파싱 실패 (${p}):`, e.message)
      }
    }

    if (!newData) {
      throw new Error('성취���준 데이터 파일을 찾을 수 없거나 파싱에 실패했습니다.')
    }

    // ��존 데이터 클리어
    standards.clear()

    // 오염 데이터 필터링: placeholder / 더미 제거
    const beforeFilter = newData.length
    newData = newData.filter(s => {
      const c = (s.content || '').trim()
      if (!c || c.length < 5) return false
      if (/^[\w가-힣\[\]-]+의\s*성취기준\s*(내용|해설|코드)/.test(c)) return false
      if (/^적용\s*시\s*고려|^성취기준\s*(내용|해설)/.test(c)) return false
      return true
    })
    if (beforeFilter !== newData.length) {
      console.log(`[reload] 오염 데이터 ${beforeFilter - newData.length}개 필터링됨 (${beforeFilter} → ${newData.length})`)
    }

    // 새 데이터 로드 (품질 플래그 포함)
    const seenCodes = new Set()
    for (const s of newData) {
      if (seenCodes.has(s.code)) continue
      seenCodes.add(s.code)
      const c = (s.content || '').trim()
      let quality = 'ok'
      if (/^이\s*성취기준은\s/.test(c)) quality = 'explanation_as_content'
      else if (/[을를의에서와과는은이가로]\s*$/.test(c) && c.length > 15) quality = 'truncated'
      else if (/\d+\s*(공통|선택)\s*교육과정/.test(c)) quality = 'page_tag_mixed'
      const id = uuid()
      standards.set(id, { id, ...s, _quality: quality, created_at: new Date().toISOString() })
    }

    // 링크 재바인딩 — 새 UUID로 만들어진 성취기준에 맞춰 링크도 갱신
    const codeToNewStd = new Map()
    for (const [, s] of standards) codeToNewStd.set(s.code, s)

    const oldLinkCount = standardLinks.size
    const reboundLinks = new Map()
    for (const [linkId, link] of standardLinks) {
      const newSrc = codeToNewStd.get(link.source_code)
      const newTgt = codeToNewStd.get(link.target_code)
      if (newSrc && newTgt) {
        reboundLinks.set(linkId, { ...link, source_id: newSrc.id, target_id: newTgt.id })
      }
      // source_code가 없으면 orphan — 삭제됨
    }
    standardLinks.clear()
    for (const [id, link] of reboundLinks) standardLinks.set(id, link)

    const orphaned = oldLinkCount - standardLinks.size
    console.log(`[reload] 성취기준 ${standards.size}개 로드, 링크 ${standardLinks.size}개 재바인딩 완료${orphaned > 0 ? ` (orphan ${orphaned}개 제거)` : ''}`)
    return standards.size
  },
}

// ─── 성취기준 연결(그래프) ───
export const StandardLinks = {
  list: () => [...standardLinks.values()],

  getByStandard: (standardId) => {
    return [...standardLinks.values()].filter(
      (l) => l.source_id === standardId || l.target_id === standardId
    )
  },

  getGraph: () => {
    const nodes = [...standards.values()].map((s) => ({
      id: s.id,
      code: s.code,
      subject: s.subject,
      subject_group: s.subject_group || s.subject,
      grade_group: s.grade_group,
      area: s.area,
      content: s.content,
      domain: s.domain || '',
      school_level: s.school_level || '',
      curriculum_category: s.curriculum_category || '',
      explanation: s.explanation || '',
    }))
    const links = [...standardLinks.values()].map((l) => ({
      source: l.source_id,
      target: l.target_id,
      link_type: l.link_type,
      rationale: l.rationale,
      status: l.status || 'published',
      quality_score: l.quality_score,
      semantic_score: l.semantic_score,
      integration_theme: l.integration_theme,
      lesson_hook: l.lesson_hook,
      generation_method: l.generation_method,
    }))
    return { nodes, links }
  },

  addBulk: (items) => {
    // 기존 링크 인덱스 생성 (양방향 중복 방지)
    const existingEdges = new Set()
    for (const [, l] of standardLinks) {
      const key1 = `${l.source_id}|${l.target_id}|${l.link_type}`
      const key2 = `${l.target_id}|${l.source_id}|${l.link_type}`
      existingEdges.add(key1)
      existingEdges.add(key2)
    }

    const added = []
    for (const item of items) {
      const sourceStd = item.source_id
        ? standards.get(item.source_id)
        : [...standards.values()].find((s) => s.code === item.source)
      const targetStd = item.target_id
        ? standards.get(item.target_id)
        : [...standards.values()].find((s) => s.code === item.target)
      if (!sourceStd || !targetStd) continue

      // 중복 검사 (양방향)
      const edgeKey = `${sourceStd.id}|${targetStd.id}|${item.link_type}`
      const reverseKey = `${targetStd.id}|${sourceStd.id}|${item.link_type}`
      if (existingEdges.has(edgeKey) || existingEdges.has(reverseKey)) continue

      const id = uuid()
      const link = {
        id,
        source_id: sourceStd.id,
        target_id: targetStd.id,
        source_code: sourceStd.code,
        target_code: targetStd.code,
        link_type: item.link_type,
        rationale: item.rationale || '',
        similarity: item.similarity || 0.7,
        status: item.status || 'candidate',
        quality_score: item.quality_score || null,
        semantic_score: item.semantic_score || null,
        integration_theme: item.integration_theme || null,
        lesson_hook: item.lesson_hook || null,
        generation_method: item.generation_method || 'ai',
        created_at: new Date().toISOString(),
      }
      standardLinks.set(id, link)
      existingEdges.add(edgeKey)
      existingEdges.add(reverseKey)
      added.push(link)
    }
    return added
  },
}

// ─── 세션-성취기준 연결 ───
export const SessionStandards = {
  list: (sessionId) => {
    const linked = sessionStandards.get(sessionId) || []
    return linked.map((entry) => {
      const std = standards.get(entry.standard_id)
      return std ? { ...entry, curriculum_standards: std } : null
    }).filter(Boolean)
  },

  add: (sessionId, standardId, isPrimary = false) => {
    if (!sessionStandards.has(sessionId)) sessionStandards.set(sessionId, [])
    const list = sessionStandards.get(sessionId)
    if (list.some((e) => e.standard_id === standardId)) return null
    const entry = { id: uuid(), session_id: sessionId, standard_id: standardId, is_primary: isPrimary, created_at: new Date().toISOString() }
    list.push(entry)
    return { ...entry, curriculum_standards: standards.get(standardId) }
  },

  remove: (sessionId, standardId) => {
    const list = sessionStandards.get(sessionId) || []
    const idx = list.findIndex((e) => e.standard_id === standardId)
    if (idx === -1) return false
    list.splice(idx, 1)
    return true
  },
}
