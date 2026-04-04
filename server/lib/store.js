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

  // 성취기준 로드
  const seenCodes = new Set()
  for (const s of ALL_STANDARDS) {
    if (seenCodes.has(s.code)) continue
    seenCodes.add(s.code)
    const id = uuid()
    standards.set(id, { id, ...s, created_at: new Date().toISOString() })
  }

  // 성취기준 간 연결 로드 (코드→ID 맵으로 O(1) 조회)
  const codeToId = new Map()
  for (const [id, s] of standards) codeToId.set(s.code, s)
  // 압축 형식: [source, target, link_type, rationale]
  // link_type 축약: cs→cross_subject, sc→same_concept, ap→application
  const ltMap = { cs: 'cross_subject', sc: 'same_concept', ap: 'application', pr: 'prerequisite' }
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
    if (stage) return all.filter((p) => p.stage === parseInt(stage)).sort((a, b) => a.sort_order - b.sort_order)
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
      results = results.filter((s) =>
        s.content.toLowerCase().includes(query) ||
        s.code.toLowerCase().includes(query) ||
        (s.keywords || []).some((k) => k.toLowerCase().includes(query)) ||
        s.area.toLowerCase().includes(query) ||
        (s.explanation || '').toLowerCase().includes(query)
      )
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

    // 새 데이터 로드
    const seenCodes = new Set()
    for (const s of newData) {
      if (seenCodes.has(s.code)) continue
      seenCodes.add(s.code)
      const id = uuid()
      standards.set(id, { id, ...s, created_at: new Date().toISOString() })
    }

    console.log(`[reload] 성취기준 ${standards.size}개 로드 완료`)
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
    }))
    return { nodes, links }
  },

  addBulk: (items) => {
    const added = []
    for (const item of items) {
      const sourceStd = item.source_id
        ? standards.get(item.source_id)
        : [...standards.values()].find((s) => s.code === item.source)
      const targetStd = item.target_id
        ? standards.get(item.target_id)
        : [...standards.values()].find((s) => s.code === item.target)
      if (!sourceStd || !targetStd) continue
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
        created_at: new Date().toISOString(),
      }
      standardLinks.set(id, link)
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
