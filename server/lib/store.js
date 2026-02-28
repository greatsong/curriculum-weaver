/**
 * 인메모리 데이터 저장소
 * Supabase 없이 작동하기 위한 로컬 저장소
 * 서버 재시작 시 초기화됨
 */
import crypto from 'crypto'
import { PRINCIPLES } from '../data/principles.js'
import { DEMO_STANDARDS, DEMO_LINKS } from '../data/standards.js'

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
const standards = new Map()         // standardId -> standard
const standardLinks = new Map()     // linkId -> link
const sessionStandards = new Map()  // sessionId -> [{ standard_id, is_primary }]

// ─── 초기 데이터 로드 ───
export function initStore() {
  // 40개 원칙 로드
  for (const p of PRINCIPLES) {
    principles.set(p.id, { ...p, is_active: true, version: 1, created_at: new Date().toISOString() })
  }

  // 성취기준 로드
  for (const s of DEMO_STANDARDS) {
    const id = uuid()
    standards.set(id, { id, ...s, created_at: new Date().toISOString() })
  }

  // 성취기준 간 연결 로드
  for (const link of DEMO_LINKS) {
    const sourceStd = [...standards.values()].find((s) => s.code === link.source)
    const targetStd = [...standards.values()].find((s) => s.code === link.target)
    if (sourceStd && targetStd) {
      const id = uuid()
      standardLinks.set(id, {
        id,
        source_id: sourceStd.id,
        target_id: targetStd.id,
        source_code: link.source,
        target_code: link.target,
        link_type: link.link_type,
        rationale: link.rationale,
        similarity: link.link_type === 'same_concept' ? 0.9 : link.link_type === 'cross_subject' ? 0.7 : 0.6,
        created_at: new Date().toISOString(),
      })
    }
  }

  // 기본 세션 하나 생성
  const defaultSession = {
    id: uuid(),
    title: '융합 수업 설계 시작하기',
    description: 'AI와 함께 융합 수업을 설계해보세요',
    current_stage: 1,
    status: 'active',
    invite_code: inviteCode(),
    created_at: new Date().toISOString(),
  }
  sessions.set(defaultSession.id, defaultSession)
  messages.set(defaultSession.id, [])
  materials.set(defaultSession.id, [])
  sessionStandards.set(defaultSession.id, [])

  console.log(`  초기 데이터: 원칙 ${principles.size}개, 성취기준 ${standards.size}개, 연결 ${standardLinks.size}개, 세션 1개`)
  return defaultSession.id
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

  add: (sessionId, { sender_type, content, stage_context, principles_used }) => {
    const msg = {
      id: uuid(),
      session_id: sessionId,
      sender_type,
      content,
      stage_context: stage_context || null,
      principles_used: principles_used || [],
      created_at: new Date().toISOString(),
    }
    if (!messages.has(sessionId)) messages.set(sessionId, [])
    messages.get(sessionId).push(msg)
    return msg
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

// ─── 원칙 ───
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

  search: ({ q, subject, grade }) => {
    let results = [...standards.values()]
    if (subject) results = results.filter((s) => s.subject === subject)
    if (grade) results = results.filter((s) => s.grade_group === grade)
    if (q) {
      const query = q.toLowerCase()
      results = results.filter((s) =>
        s.content.toLowerCase().includes(query) ||
        s.code.toLowerCase().includes(query) ||
        (s.keywords || []).some((k) => k.toLowerCase().includes(query)) ||
        s.area.toLowerCase().includes(query)
      )
    }
    return results.slice(0, 50)
  },

  get: (id) => standards.get(id) || null,

  getByCode: (code) => [...standards.values()].find((s) => s.code === code) || null,

  subjects: () => [...new Set([...standards.values()].map((s) => s.subject))].sort(),

  gradeGroups: () => [...new Set([...standards.values()].map((s) => s.grade_group))].sort(),

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
      grade_group: s.grade_group,
      area: s.area,
      content: s.content,
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
