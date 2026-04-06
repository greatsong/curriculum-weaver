/**
 * Supabase 기반 데이터 서비스 레이어
 *
 * 인메모리 store.js를 대체하여 Supabase PostgreSQL 백엔드 제공.
 * 환경변수 미설정 시 인메모리 Map 폴백으로 개발 환경 지원.
 */
import crypto from 'crypto'

import { supabaseAdmin } from './supabaseAdmin.js'

// ── Supabase 클라이언트 (lazy) ──
let _fallbackMode = false
let _checkedEnv = false

/**
 * Supabase Admin 클라이언트 반환. 환경변수 없으면 null (인메모리 폴백).
 */
function getSupabase() {
  if (_fallbackMode) return null

  if (!_checkedEnv) {
    _checkedEnv = true
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      console.warn('[supabaseService] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 → 인메모리 폴백 모드')
      _fallbackMode = true
      return null
    }
  }

  try {
    return supabaseAdmin
  } catch (err) {
    console.warn('[supabaseService] Supabase 초기화 실패 → 인메모리 폴백 모드:', err.message)
    _fallbackMode = true
    return null
  }
}

// ── 인메모리 폴백 저장소 ──
const mem = {
  workspaces: new Map(),
  members: new Map(),     // `${wsId}:${userId}` -> { workspace_id, user_id, role, joined_at }
  projects: new Map(),
  designs: new Map(),     // `${projectId}:${procedureCode}` -> design
  designsById: new Map(),
  versions: new Map(),    // designId -> [version]
  messages: new Map(),    // projectId -> [message]
  comments: new Map(),    // designId -> [comment]
  activityLogs: new Map(), // projectId -> [log]
  invites: new Map(),     // token -> invite
  standards: new Map(),
  projectStandards: new Map(), // projectId -> [{ standard_id, is_primary, added_by, added_at }]
}

function uuid() { return crypto.randomUUID() }
function now() { return new Date().toISOString() }

/**
 * Supabase 쿼리 에러 처리
 * @param {object} result - Supabase 쿼리 결과 { data, error }
 * @param {string} context - 에러 컨텍스트 메시지
 * @returns {any} data
 */
function handleResult({ data, error }, context) {
  if (error) {
    console.error(`[supabaseService] ${context}:`, error.message)
    throw new Error(`${context}: ${error.message}`)
  }
  return data
}

// ============================================================
// 워크스페이스 (Workspace) 작업
// ============================================================

/**
 * 워크스페이스 생성
 * @param {{ name: string, description?: string, owner_id: string, ai_config?: object, workflow_config?: object }} data
 * @returns {Promise<object>} 생성된 워크스페이스
 */
export async function createWorkspace(data) {
  const sb = getSupabase()
  if (!sb) {
    const ws = { id: uuid(), ...data, created_at: now() }
    mem.workspaces.set(ws.id, ws)
    // 생성자를 owner로 자동 추가
    const memberKey = `${ws.id}:${data.owner_id}`
    mem.members.set(memberKey, {
      workspace_id: ws.id, user_id: data.owner_id, role: 'owner', joined_at: now()
    })
    return ws
  }
  const ws = handleResult(
    await sb.from('workspaces').insert(data).select().single(),
    '워크스페이스 생성 실패'
  )
  // 생성자를 owner 멤버로 추가 (실패 시 워크스페이스 롤백)
  const { error: memberErr } = await sb.from('members').insert({
    workspace_id: ws.id, user_id: data.owner_id, role: 'owner'
  })
  if (memberErr) {
    console.error('[supabaseService] 멤버 추가 실패, 워크스페이스 롤백:', memberErr.message)
    await sb.from('workspaces').delete().eq('id', ws.id)
    throw new Error('워크스페이스 생성 중 멤버 추가 실패')
  }
  return ws
}

/**
 * 워크스페이스 조회 (멤버 포함)
 * @param {string} id - 워크스페이스 ID
 * @returns {Promise<object|null>}
 */
export async function getWorkspace(id) {
  const sb = getSupabase()
  if (!sb) {
    const ws = mem.workspaces.get(id)
    if (!ws) return null
    const membersList = []
    for (const [key, m] of mem.members) {
      if (m.workspace_id === id) membersList.push(m)
    }
    return { ...ws, members: membersList }
  }
  const data = handleResult(
    await sb.from('workspaces')
      .select('*, members(*, users(display_name, email, school_name, subject))')
      .eq('id', id)
      .single(),
    '워크스페이스 조회 실패'
  )
  return data
}

/**
 * 사용자의 워크스페이스 목록
 * @param {string} userId - 사용자 ID
 * @returns {Promise<object[]>}
 */
export async function getWorkspacesByUser(userId) {
  const sb = getSupabase()
  if (!sb) {
    const result = []
    for (const [key, m] of mem.members) {
      if (m.user_id === userId) {
        const ws = mem.workspaces.get(m.workspace_id)
        if (ws) result.push({ ...ws, my_role: m.role })
      }
    }
    return result.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  const memberships = handleResult(
    await sb.from('members')
      .select('role, workspaces(*, members(count), projects(count))')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false }),
    '워크스페이스 목록 조회 실패'
  )
  return memberships.map(m => {
    const ws = m.workspaces
    return {
      ...ws,
      my_role: m.role,
      member_count: ws.members?.[0]?.count || 1,
      project_count: ws.projects?.[0]?.count || 0,
    }
  })
}

/**
 * 워크스페이스 수정
 * @param {string} id
 * @param {object} data - 수정할 필드
 * @returns {Promise<object>}
 */
export async function updateWorkspace(id, data) {
  const sb = getSupabase()
  if (!sb) {
    const ws = mem.workspaces.get(id)
    if (!ws) return null
    Object.assign(ws, data)
    return ws
  }
  return handleResult(
    await sb.from('workspaces').update(data).eq('id', id).select().single(),
    '워크스페이스 수정 실패'
  )
}

/**
 * 워크스페이스 삭제
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteWorkspace(id) {
  const sb = getSupabase()
  if (!sb) {
    mem.workspaces.delete(id)
    for (const key of mem.members.keys()) {
      if (key.startsWith(`${id}:`)) mem.members.delete(key)
    }
    return
  }
  handleResult(
    await sb.from('workspaces').delete().eq('id', id),
    '워크스페이스 삭제 실패'
  )
}

// ============================================================
// 프로젝트 (Project) 작업
// ============================================================

/**
 * 프로젝트 생성
 * @param {string} workspaceId
 * @param {{ title: string, description?: string, grade?: string, subjects?: string[], learner_context?: object }} data
 * @returns {Promise<object>}
 */
export async function createProject(workspaceId, data) {
  const sb = getSupabase()
  const payload = { workspace_id: workspaceId, ...data }
  if (!sb) {
    const project = { id: uuid(), ...payload, current_procedure: 'prep', status: 'active', created_at: now(), updated_at: now() }
    mem.projects.set(project.id, project)
    mem.messages.set(project.id, [])
    mem.activityLogs.set(project.id, [])
    mem.projectStandards.set(project.id, [])
    return project
  }
  return handleResult(
    await sb.from('projects').insert(payload).select().single(),
    '프로젝트 생성 실패'
  )
}

/**
 * 프로젝트 조회 (설계 캔버스 포함)
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getProject(id) {
  const sb = getSupabase()
  if (!sb) {
    const project = mem.projects.get(id)
    if (!project) return null
    const designList = []
    for (const [key, d] of mem.designs) {
      if (key.startsWith(`${id}:`)) designList.push(d)
    }
    return { ...project, designs: designList }
  }
  return handleResult(
    await sb.from('projects')
      .select('*, designs(*)')
      .eq('id', id)
      .single(),
    '프로젝트 조회 실패'
  )
}

/**
 * 워크스페이스의 프로젝트 목록
 * @param {string} workspaceId
 * @returns {Promise<object[]>}
 */
export async function getProjectsByWorkspace(workspaceId) {
  const sb = getSupabase()
  if (!sb) {
    return [...mem.projects.values()]
      .filter(p => p.workspace_id === workspaceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  return handleResult(
    await sb.from('projects')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    '프로젝트 목록 조회 실패'
  )
}

/**
 * 프로젝트 수정
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateProject(id, data) {
  const sb = getSupabase()
  if (!sb) {
    const project = mem.projects.get(id)
    if (!project) return null
    Object.assign(project, data, { updated_at: now() })
    return project
  }
  return handleResult(
    await sb.from('projects').update(data).eq('id', id).select().single(),
    '프로젝트 수정 실패'
  )
}

/**
 * 프로젝트 삭제
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteProject(id) {
  const sb = getSupabase()
  if (!sb) {
    mem.projects.delete(id)
    mem.messages.delete(id)
    mem.activityLogs.delete(id)
    mem.projectStandards.delete(id)
    for (const key of mem.designs.keys()) {
      if (key.startsWith(`${id}:`)) mem.designs.delete(key)
    }
    return
  }
  handleResult(
    await sb.from('projects').delete().eq('id', id),
    '프로젝트 삭제 실패'
  )
}

// ============================================================
// 설계 캔버스 (Design) 작업
// ============================================================

/**
 * 특정 절차의 설계 캔버스 조회
 * @param {string} projectId
 * @param {string} procedureCode - 예: 'T-1-1', 'A-2-1'
 * @returns {Promise<object|null>}
 */
export async function getDesign(projectId, procedureCode) {
  const sb = getSupabase()
  if (!sb) {
    return mem.designs.get(`${projectId}:${procedureCode}`) || null
  }
  const { data } = await sb.from('designs')
    .select('*')
    .eq('project_id', projectId)
    .eq('procedure_code', procedureCode)
    .single()
  return data || null
}

/**
 * 설계 캔버스 생성/수정 (upsert)
 * @param {string} projectId
 * @param {string} procedureCode
 * @param {object} content - JSONB 콘텐츠
 * @param {string} userId - 마지막 편집자
 * @returns {Promise<object>}
 */
export async function upsertDesign(projectId, procedureCode, content, userId) {
  // ── 게이트키퍼: A-2-1 성취기준 — DB에 존재하는 코드만 허용 ──
  // AI가 생성한 가짜 코드를 원천 차단. 교정하지 않고 제거만 함.
  if (procedureCode === 'A-2-1' && content?.standards && Array.isArray(content.standards)) {
    try {
      const { validateCode } = await import('./standardsValidator.js')
      const before = content.standards.length
      content = {
        ...content,
        standards: content.standards.filter(row => {
          if (!row.code) return false
          const result = validateCode(row.code)
          if (result.valid) {
            // code/content를 DB 원본으로 고정 — AI가 변형한 내용 방지
            row.code = result.matched.code
            row.content = result.matched.content
            return true
          }
          console.log(`[게이트키퍼] 제거: ${row.code} — DB에 존재하지 않는 성취기준`)
          return false
        }),
      }
      const removed = before - content.standards.length
      if (removed > 0) {
        console.log(`[upsertDesign 게이트키퍼] A-2-1: ${removed}/${before}개 가짜 성취기준 제거됨`)
      }
    } catch (e) {
      console.warn('[upsertDesign 게이트키퍼] 검증 모듈 로드 실패:', e.message)
    }
  }

  const sb = getSupabase()
  if (!sb) {
    const key = `${projectId}:${procedureCode}`
    const existing = mem.designs.get(key)
    if (existing) {
      existing.content = content
      existing.last_editor_id = userId
      existing.updated_at = now()
      return existing
    }
    const design = {
      id: uuid(), project_id: projectId, procedure_code: procedureCode,
      content, save_status: 'draft', last_editor_id: userId, updated_at: now()
    }
    mem.designs.set(key, design)
    mem.designsById.set(design.id, design)
    return design
  }
  return handleResult(
    await sb.from('designs')
      .upsert(
        { project_id: projectId, procedure_code: procedureCode, content, last_editor_id: userId },
        { onConflict: 'project_id,procedure_code' }
      )
      .select()
      .single(),
    '설계 캔버스 upsert 실패'
  )
}

/**
 * 프로젝트의 모든 설계 캔버스
 * @param {string} projectId
 * @returns {Promise<object[]>}
 */
export async function getDesignsByProject(projectId) {
  const sb = getSupabase()
  if (!sb) {
    const result = []
    for (const [key, d] of mem.designs) {
      if (key.startsWith(`${projectId}:`)) result.push(d)
    }
    return result
  }
  return handleResult(
    await sb.from('designs')
      .select('*')
      .eq('project_id', projectId)
      .order('procedure_code'),
    '설계 캔버스 목록 조회 실패'
  )
}

// ============================================================
// 버전 (Version) 작업
// ============================================================

/**
 * 버전 스냅샷 생성
 * @param {string} designId
 * @param {object} snapshot - 전체 content 스냅샷
 * @param {string} triggerType - 'ai_accept' | 'manual_save' | 'step_complete'
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function createVersion(designId, snapshot, triggerType, userId) {
  const sb = getSupabase()
  if (!sb) {
    const version = { id: uuid(), design_id: designId, snapshot, trigger_type: triggerType, created_by: userId, created_at: now() }
    if (!mem.versions.has(designId)) mem.versions.set(designId, [])
    mem.versions.get(designId).push(version)
    return version
  }
  return handleResult(
    await sb.from('versions')
      .insert({ design_id: designId, snapshot, trigger_type: triggerType, created_by: userId })
      .select()
      .single(),
    '버전 생성 실패'
  )
}

/**
 * 설계의 버전 히스토리
 * @param {string} designId
 * @returns {Promise<object[]>}
 */
export async function getVersions(designId) {
  const sb = getSupabase()
  if (!sb) {
    return (mem.versions.get(designId) || []).slice().reverse()
  }
  return handleResult(
    await sb.from('versions')
      .select('*, users:created_by(display_name)')
      .eq('design_id', designId)
      .order('created_at', { ascending: false }),
    '버전 목록 조회 실패'
  )
}

/**
 * 단일 버전 조회
 * @param {string} id - 버전 ID
 * @returns {Promise<object|null>}
 */
export async function getVersion(id) {
  const sb = getSupabase()
  if (!sb) {
    for (const versions of mem.versions.values()) {
      const v = versions.find(v => v.id === id)
      if (v) return v
    }
    return null
  }
  const { data } = await sb.from('versions')
    .select('*, users:created_by(display_name)')
    .eq('id', id)
    .single()
  return data || null
}

/**
 * 설계 캔버스의 save_status 변경
 * @param {string} projectId
 * @param {string} procedureCode
 * @param {string} saveStatus - 'draft' | 'confirmed' | 'locked'
 * @returns {Promise<object|null>}
 */
export async function updateDesignStatus(projectId, procedureCode, saveStatus) {
  const sb = getSupabase()
  if (!sb) {
    const key = `${projectId}:${procedureCode}`
    const design = mem.designs.get(key)
    if (!design) return null
    design.save_status = saveStatus
    design.updated_at = now()
    return design
  }
  return handleResult(
    await sb.from('designs')
      .update({ save_status: saveStatus })
      .eq('project_id', projectId)
      .eq('procedure_code', procedureCode)
      .select()
      .single(),
    '설계 상태 변경 실패'
  )
}

/**
 * 설계 캔버스 ID로 조회
 * @param {string} id - 설계 캔버스 UUID
 * @returns {Promise<object|null>}
 */
export async function getDesignById(id) {
  const sb = getSupabase()
  if (!sb) {
    return mem.designsById.get(id) || null
  }
  const { data } = await sb.from('designs')
    .select('*')
    .eq('id', id)
    .single()
  return data || null
}

// ============================================================
// 메시지 (Message) 작업
// ============================================================

/**
 * 프로젝트의 채팅 메시지 목록
 * @param {string} projectId
 * @param {number} [limit=50]
 * @param {number} [offset=0]
 * @returns {Promise<object[]>}
 */
export async function getMessages(projectId, limit = 200, offset = 0) {
  const sb = getSupabase()
  if (!sb) {
    const all = mem.messages.get(projectId) || []
    return all.slice(offset, offset + limit)
  }
  return handleResult(
    await sb.from('messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1),
    '메시지 목록 조회 실패'
  )
}

/**
 * 단일 메시지 조회
 * @param {string} messageId
 * @returns {Promise<object|null>}
 */
export async function getMessage(messageId) {
  const sb = getSupabase()
  if (!sb) {
    for (const msgs of mem.messages.values()) {
      const found = msgs.find((m) => m.id === messageId)
      if (found) return found
    }
    return null
  }
  const { data } = await sb.from('messages')
    .select('*')
    .eq('id', messageId)
    .single()
  return data || null
}

/**
 * 메시지 생성
 * @param {{ project_id: string, user_id?: string, sender_type: string, sender_scope?: string, content: string, procedure_context?: string, step_context?: number, ai_suggestions?: object }} data
 * @returns {Promise<object>}
 */
export async function createMessage(data) {
  const sb = getSupabase()
  if (!sb) {
    const msg = { id: uuid(), ...data, created_at: now() }
    if (!mem.messages.has(data.project_id)) mem.messages.set(data.project_id, [])
    mem.messages.get(data.project_id).push(msg)
    return msg
  }
  return handleResult(
    await sb.from('messages').insert(data).select().single(),
    '메시지 생성 실패'
  )
}

// ============================================================
// 댓글 (Comment) 작업
// ============================================================

/**
 * 설계의 특정 섹션 댓글 목록
 * @param {string} designId
 * @param {string} [sectionKey] - 미지정 시 전체 댓글
 * @returns {Promise<object[]>}
 */
export async function getComments(designId, sectionKey) {
  const sb = getSupabase()
  if (!sb) {
    const all = mem.comments.get(designId) || []
    if (sectionKey) return all.filter(c => c.section_key === sectionKey)
    return all
  }
  let query = sb.from('comments')
    .select('*, users:user_id(display_name)')
    .eq('design_id', designId)
    .order('created_at', { ascending: true })
  if (sectionKey) query = query.eq('section_key', sectionKey)
  return handleResult(await query, '댓글 목록 조회 실패')
}

/**
 * 댓글 생성
 * @param {{ design_id: string, section_key: string, user_id: string, body: string }} data
 * @returns {Promise<object>}
 */
export async function createComment(data) {
  const sb = getSupabase()
  if (!sb) {
    const comment = { id: uuid(), ...data, resolved: false, resolved_by: null, created_at: now() }
    if (!mem.comments.has(data.design_id)) mem.comments.set(data.design_id, [])
    mem.comments.get(data.design_id).push(comment)
    return comment
  }
  return handleResult(
    await sb.from('comments').insert(data).select().single(),
    '댓글 생성 실패'
  )
}

/**
 * 댓글 단건 조회
 * @param {string} id - 댓글 ID
 * @returns {Promise<object|null>}
 */
export async function getCommentById(id) {
  const sb = getSupabase()
  if (!sb) {
    for (const comments of mem.comments.values()) {
      const c = comments.find(c => c.id === id)
      if (c) return c
    }
    return null
  }
  const { data, error } = await sb.from('comments')
    .select('*, users:user_id(display_name)')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

/**
 * 댓글 본문 수정
 * @param {string} id - 댓글 ID
 * @param {string} body - 새 본문
 * @returns {Promise<object|null>}
 */
export async function updateComment(id, body) {
  const sb = getSupabase()
  if (!sb) {
    for (const comments of mem.comments.values()) {
      const c = comments.find(c => c.id === id)
      if (c) {
        c.body = body
        c.updated_at = now()
        return c
      }
    }
    return null
  }
  return handleResult(
    await sb.from('comments')
      .update({ body, updated_at: now() })
      .eq('id', id)
      .select()
      .single(),
    '댓글 수정 실패'
  )
}

/**
 * 댓글 삭제
 * @param {string} id - 댓글 ID
 * @returns {Promise<boolean>}
 */
export async function deleteComment(id) {
  const sb = getSupabase()
  if (!sb) {
    for (const [designId, comments] of mem.comments.entries()) {
      const idx = comments.findIndex(c => c.id === id)
      if (idx !== -1) {
        comments.splice(idx, 1)
        return true
      }
    }
    return false
  }
  const { error } = await sb.from('comments').delete().eq('id', id)
  if (error) {
    console.error('[supabaseService] 댓글 삭제 실패:', error.message)
    return false
  }
  return true
}

/**
 * 댓글 해결 처리
 * @param {string} id - 댓글 ID
 * @param {string} userId - 해결한 사용자 ID
 * @returns {Promise<object>}
 */
export async function resolveComment(id, userId) {
  const sb = getSupabase()
  if (!sb) {
    for (const comments of mem.comments.values()) {
      const c = comments.find(c => c.id === id)
      if (c) {
        c.resolved = true
        c.resolved_by = userId
        return c
      }
    }
    return null
  }
  return handleResult(
    await sb.from('comments')
      .update({ resolved: true, resolved_by: userId })
      .eq('id', id)
      .select()
      .single(),
    '댓글 해결 실패'
  )
}

/**
 * 댓글 해결 취소
 * @param {string} id - 댓글 ID
 * @returns {Promise<object|null>}
 */
export async function unresolveComment(id) {
  const sb = getSupabase()
  if (!sb) {
    for (const comments of mem.comments.values()) {
      const c = comments.find(c => c.id === id)
      if (c) {
        c.resolved = false
        c.resolved_by = null
        return c
      }
    }
    return null
  }
  return handleResult(
    await sb.from('comments')
      .update({ resolved: false, resolved_by: null })
      .eq('id', id)
      .select()
      .single(),
    '댓글 해결 취소 실패'
  )
}

// ============================================================
// 활동 로그 (ActivityLog) 작업
// ============================================================

/**
 * 활동 로그 기록
 * @param {{ project_id: string, user_id?: string, action_type: string, procedure_code?: string, section_key?: string, before_data?: object, after_data?: object }} data
 * @returns {Promise<object>}
 */
export async function logActivity(data) {
  const sb = getSupabase()
  if (!sb) {
    const log = { id: uuid(), ...data, created_at: now() }
    if (!mem.activityLogs.has(data.project_id)) mem.activityLogs.set(data.project_id, [])
    mem.activityLogs.get(data.project_id).push(log)
    return log
  }
  return handleResult(
    await sb.from('activity_logs').insert(data).select().single(),
    '활동 로그 기록 실패'
  )
}

/**
 * 프로젝트 활동 로그 조회
 * @param {string} projectId
 * @param {number} [limit=50]
 * @returns {Promise<object[]>}
 */
export async function getActivityLogs(projectId, limit = 50) {
  const sb = getSupabase()
  if (!sb) {
    const all = mem.activityLogs.get(projectId) || []
    return all.slice(-limit).reverse()
  }
  return handleResult(
    await sb.from('activity_logs')
      .select('*, users:user_id(display_name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit),
    '활동 로그 조회 실패'
  )
}

// ============================================================
// 멤버 (Member) 작업
// ============================================================

/**
 * 멤버 추가
 * @param {string} workspaceId
 * @param {string} userId
 * @param {string} role - 'host' | 'owner' | 'editor' | 'viewer'
 * @returns {Promise<object>}
 */
export async function addMember(workspaceId, userId, role) {
  const sb = getSupabase()
  if (!sb) {
    const key = `${workspaceId}:${userId}`
    const member = { workspace_id: workspaceId, user_id: userId, role, joined_at: now() }
    mem.members.set(key, member)
    return member
  }
  return handleResult(
    await sb.from('members')
      .insert({ workspace_id: workspaceId, user_id: userId, role })
      .select()
      .single(),
    '멤버 추가 실패'
  )
}

/**
 * 멤버 제거
 * @param {string} workspaceId
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function removeMember(workspaceId, userId) {
  const sb = getSupabase()
  if (!sb) {
    mem.members.delete(`${workspaceId}:${userId}`)
    return
  }
  handleResult(
    await sb.from('members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId),
    '멤버 제거 실패'
  )
}

/**
 * 멤버 역할 조회
 * @param {string} workspaceId
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function getMemberRole(workspaceId, userId) {
  const sb = getSupabase()
  if (!sb) {
    const member = mem.members.get(`${workspaceId}:${userId}`)
    return member?.role || null
  }
  const { data } = await sb.from('members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()
  return data?.role || null
}

/**
 * 멤버 역할 변경
 * @param {string} workspaceId
 * @param {string} userId
 * @param {string} newRole
 * @returns {Promise<object>}
 */
export async function updateMemberRole(workspaceId, userId, newRole) {
  const sb = getSupabase()
  if (!sb) {
    const key = `${workspaceId}:${userId}`
    const member = mem.members.get(key)
    if (!member) return null
    member.role = newRole
    return member
  }
  return handleResult(
    await sb.from('members')
      .update({ role: newRole })
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .select()
      .single(),
    '멤버 역할 변경 실패'
  )
}

// ============================================================
// 초대 (Invite) 작업
// ============================================================

/**
 * 초대 생성
 * @param {string} workspaceId
 * @param {string} email - 초대 대상 이메일
 * @param {string} role - 부여할 역할
 * @param {string} createdBy - 초대한 사용자 ID
 * @returns {Promise<object>} 토큰 포함 초대 객체
 */
export async function createInvite(workspaceId, email, role, createdBy) {
  const token = crypto.randomUUID().replace(/-/g, '') // 32자 토큰
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7일 후 만료

  const sb = getSupabase()
  if (!sb) {
    const invite = {
      id: uuid(), workspace_id: workspaceId, email, role, token,
      expires_at: expiresAt, used_at: null, created_by: createdBy
    }
    mem.invites.set(token, invite)
    return invite
  }
  return handleResult(
    await sb.from('invites')
      .insert({ workspace_id: workspaceId, email, role, token, expires_at: expiresAt, created_by: createdBy })
      .select()
      .single(),
    '초대 생성 실패'
  )
}

/**
 * 토큰으로 초대 조회
 * @param {string} token
 * @returns {Promise<object|null>}
 */
export async function getInviteByToken(token) {
  const sb = getSupabase()
  if (!sb) {
    return mem.invites.get(token) || null
  }
  const { data } = await sb.from('invites')
    .select('*, workspaces(name, description)')
    .eq('token', token)
    .single()
  return data || null
}

/**
 * 초대 사용 처리 (수락)
 * @param {string} token
 * @param {string} userId - 수락한 사용자 ID
 * @returns {Promise<void>}
 */
export async function useInvite(token, userId) {
  const sb = getSupabase()
  if (!sb) {
    const invite = mem.invites.get(token)
    if (!invite) throw new Error('초대를 찾을 수 없습니다.')
    if (invite.used_at) throw new Error('이미 사용된 초대입니다.')
    if (new Date(invite.expires_at) < new Date()) throw new Error('만료된 초대입니다.')
    invite.used_at = now()
    // 멤버로 추가
    await addMember(invite.workspace_id, userId, invite.role)
    return
  }
  // 초대 유효성 확인
  const invite = await getInviteByToken(token)
  if (!invite) throw new Error('초대를 찾을 수 없습니다.')
  if (invite.used_at) throw new Error('이미 사용된 초대입니다.')
  if (new Date(invite.expires_at) < new Date()) throw new Error('만료된 초대입니다.')

  // 초대 사용 처리 + 멤버 추가 (실패 시 보상 롤백)
  handleResult(
    await sb.from('invites').update({ used_at: now() }).eq('token', token),
    '초대 사용 처리 실패'
  )
  try {
    await addMember(invite.workspace_id, userId, invite.role)
  } catch (memberErr) {
    // 멤버 추가 실패 → 초대 사용 상태 롤백
    console.error('[supabaseService] 멤버 추가 실패, 초대 롤백:', memberErr.message)
    await sb.from('invites').update({ used_at: null }).eq('token', token)
    throw new Error('초대 수락 중 멤버 추가 실패')
  }
}

// ============================================================
// 교육과정 성취기준 (Standards) 작업
// ============================================================

/**
 * 성취기준 검색
 * @param {string} [query] - 텍스트 검색어
 * @param {{ subject?: string, grade_group?: string, school_level?: string }} [filters]
 * @returns {Promise<object[]>}
 */
export async function searchStandards(query, filters = {}) {
  const sb = getSupabase()
  if (!sb) {
    let results = [...mem.standards.values()]
    if (filters.subject) results = results.filter(s => s.subject === filters.subject)
    if (filters.grade_group) results = results.filter(s => s.grade_group === filters.grade_group)
    if (filters.school_level) results = results.filter(s => s.school_level === filters.school_level)
    if (query) {
      const q = query.toLowerCase()
      results = results.filter(s =>
        s.content.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.keywords || []).some(k => k.toLowerCase().includes(q)) ||
        (s.area || '').toLowerCase().includes(q)
      )
    }
    return results.slice(0, 50)
  }
  let dbQuery = sb.from('curriculum_standards').select('*')
  if (filters.subject) dbQuery = dbQuery.eq('subject', filters.subject)
  if (filters.grade_group) dbQuery = dbQuery.eq('grade_group', filters.grade_group)
  if (filters.school_level) dbQuery = dbQuery.eq('school_level', filters.school_level)
  if (query) dbQuery = dbQuery.or(`content.ilike.%${query}%,code.ilike.%${query}%,area.ilike.%${query}%`)
  dbQuery = dbQuery.limit(50)
  return handleResult(await dbQuery, '성취기준 검색 실패')
}

/**
 * 프로젝트에 연결된 성취기준 목록
 * @param {string} projectId
 * @returns {Promise<object[]>}
 */
export async function getStandardsByProject(projectId) {
  const sb = getSupabase()
  if (!sb) {
    const linked = mem.projectStandards.get(projectId) || []
    return linked.map(entry => {
      const std = mem.standards.get(entry.standard_id)
      return std ? { ...entry, curriculum_standards: std } : null
    }).filter(Boolean)
  }
  return handleResult(
    await sb.from('project_standards')
      .select('*, curriculum_standards(*)')
      .eq('project_id', projectId),
    '프로젝트 성취기준 조회 실패'
  )
}

/**
 * 프로젝트에 성취기준 연결
 * @param {string} projectId
 * @param {string} standardId
 * @param {string} userId
 * @param {boolean} [isPrimary=false]
 * @returns {Promise<void>}
 */
export async function addStandardToProject(projectId, standardId, userId, isPrimary = false) {
  const sb = getSupabase()
  if (!sb) {
    if (!mem.projectStandards.has(projectId)) mem.projectStandards.set(projectId, [])
    const list = mem.projectStandards.get(projectId)
    if (list.some(e => e.standard_id === standardId)) return
    list.push({ project_id: projectId, standard_id: standardId, is_primary: isPrimary, added_by: userId, added_at: now() })
    return
  }
  handleResult(
    await sb.from('project_standards')
      .upsert({ project_id: projectId, standard_id: standardId, is_primary: isPrimary, added_by: userId }),
    '성취기준 연결 실패'
  )
}

/**
 * 프로젝트에서 성취기준 연결 해제
 * @param {string} projectId
 * @param {string} standardId
 * @returns {Promise<void>}
 */
export async function removeStandardFromProject(projectId, standardId) {
  const sb = getSupabase()
  if (!sb) {
    const list = mem.projectStandards.get(projectId) || []
    const idx = list.findIndex(e => e.standard_id === standardId)
    if (idx !== -1) list.splice(idx, 1)
    return
  }
  handleResult(
    await sb.from('project_standards')
      .delete()
      .eq('project_id', projectId)
      .eq('standard_id', standardId),
    '성취기준 연결 해제 실패'
  )
}

// ============================================================
// 사용자 (User) 작업 — auth.js 라우트에서 사용
// ============================================================

/**
 * 사용자 프로필 생성 (회원가입 후처리)
 * @param {{ id: string, email: string, display_name: string, school_name?: string, subject?: string }} data
 * @returns {Promise<object>}
 */
export async function createUser(data) {
  const sb = getSupabase()
  if (!sb) {
    const user = { ...data, role: 'teacher', created_at: now() }
    return user
  }
  return handleResult(
    await sb.from('users').insert({ ...data, role: 'teacher' }).select().single(),
    '사용자 프로필 생성 실패'
  )
}

/**
 * 사용자 프로필 조회
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getUser(id) {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.from('users').select('*').eq('id', id).single()
  return data || null
}

/**
 * 사용자 프로필 수정
 * @param {string} id
 * @param {{ display_name?: string, school_name?: string, subject?: string }} data
 * @returns {Promise<object>}
 */
export async function updateUser(id, data) {
  const sb = getSupabase()
  if (!sb) return { id, ...data }
  return handleResult(
    await sb.from('users').update(data).eq('id', id).select().single(),
    '사용자 프로필 수정 실패'
  )
}

// ── 서비스 객체로 일괄 내보내기 ──
const supabaseService = {
  // 워크스페이스
  createWorkspace, getWorkspace, getWorkspacesByUser, updateWorkspace, deleteWorkspace,
  // 프로젝트
  createProject, getProject, getProjectsByWorkspace, updateProject, deleteProject,
  // 설계
  getDesign, getDesignById, upsertDesign, getDesignsByProject, updateDesignStatus,
  // 버전
  createVersion, getVersions, getVersion,
  // 메시지
  getMessages, getMessage, createMessage,
  // 댓글
  getComments, getCommentById, createComment, updateComment, deleteComment, resolveComment, unresolveComment,
  // 활동 로그
  logActivity, getActivityLogs,
  // 멤버
  addMember, removeMember, getMemberRole, updateMemberRole,
  // 초대
  createInvite, getInviteByToken, useInvite,
  // 성취기준
  searchStandards, getStandardsByProject, addStandardToProject, removeStandardFromProject,
  // 사용자
  createUser, getUser, updateUser,
}

export default supabaseService
