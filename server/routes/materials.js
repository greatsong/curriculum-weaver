/**
 * materials 라우트 (재설계)
 *
 * 엔드포인트:
 *   POST   /api/materials/upload       파일 업로드 → Storage + DB 행 + 비동기 분석
 *   POST   /api/materials/url          외부 URL 자료 추가 (간단 저장)
 *   GET    /api/materials?project_id=  프로젝트의 자료 목록
 *   GET    /api/materials/:id/analysis AI 분석 결과 조회 (폴링용)
 *   POST   /api/materials/:id/reanalyze 재분석 트리거 (fire-and-forget)
 *   DELETE /api/materials/:id          Storage + DB 삭제
 *
 * 에러 포맷: { error: { code, message, field? } }
 * 참고: _workspace/design/file-upload-redesign.md §2
 */
import { Router } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import path from 'path'

import { requireAuth } from '../middleware/auth.js'
import { Materials, Messages } from '../lib/store.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { getProject, getMemberRole, createMessage } from '../lib/supabaseService.js'
import { analyzeMaterial } from '../services/materialAnalyzer.js'
import {
  MAX_MATERIAL_SIZE_BYTES,
  SUPPORTED_MATERIAL_EXTENSIONS,
  MATERIAL_ERROR_CODES as E,
  MATERIAL_INTENTS,
  MATERIAL_INTENT_LABELS,
  DEFAULT_MATERIAL_INTENT,
  MAX_INTENT_NOTE_LENGTH,
  SENDER_TYPES,
  SYSTEM_MESSAGE_TEMPLATES,
} from '../../shared/constants.js'

/**
 * req.body에서 intent / intent_note를 파싱·검증한다.
 * @returns {{ok: true, intent: string, intentNote: string|null} | {ok: false, code: string, message: string, field: string}}
 */
function parseIntent(body) {
  const raw = (body?.intent ?? DEFAULT_MATERIAL_INTENT).toString().trim() || DEFAULT_MATERIAL_INTENT
  const validIntents = Object.values(MATERIAL_INTENTS)
  if (!validIntents.includes(raw)) {
    return { ok: false, code: E.INVALID_INTENT, message: `유효하지 않은 intent입니다. (${validIntents.join(', ')})`, field: 'intent' }
  }
  let note = body?.intent_note
  if (note !== undefined && note !== null) {
    note = String(note).trim()
  } else {
    note = ''
  }
  if (raw === MATERIAL_INTENTS.CUSTOM) {
    if (!note) {
      return { ok: false, code: E.INTENT_NOTE_REQUIRED, message: 'custom intent를 선택하면 메모를 입력해야 합니다.', field: 'intent_note' }
    }
    if (note.length > MAX_INTENT_NOTE_LENGTH) {
      return { ok: false, code: E.INTENT_NOTE_REQUIRED, message: `메모는 ${MAX_INTENT_NOTE_LENGTH}자 이하로 입력해주세요.`, field: 'intent_note' }
    }
  } else {
    // custom이 아니면 intent_note는 무시 (null로 저장)
    note = null
  }
  return { ok: true, intent: raw, intentNote: note || null }
}

export const materialsRouter = Router()
materialsRouter.use(requireAuth)

// ── 유틸 ──

/** 통일 에러 응답 헬퍼 */
function errorResponse(res, status, code, message, field) {
  const body = { error: { code, message } }
  if (field) body.error.field = field
  return res.status(status).json(body)
}

/** originalname을 경로 탈출 방어 + 안전한 문자로 정제 */
function sanitizeFileName(original) {
  const base = path.basename(String(original || '')).trim()
  // 제어문자와 path 구분자 제거
  const cleaned = base.replace(/[\x00-\x1f/\\]/g, '').slice(0, 200)
  return cleaned || 'unnamed'
}

/** 확장자 추출 (소문자, 점 없음) */
function extractExt(filename) {
  const parts = String(filename || '').split('.')
  if (parts.length < 2) return ''
  return parts.pop().toLowerCase()
}

/** 확장자 ↔ MIME 화이트리스트 (업로드 허용) */
const EXT_TO_MIME = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  txt: ['text/plain'],
  md: ['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream'],
  csv: ['text/csv', 'application/csv', 'text/plain'],
}

/**
 * file-type 패키지로 매직바이트 검증. 미설치 환경에서는 확장자 화이트리스트로 fallback.
 * 반환: { ok: boolean, detectedMime?: string, message?: string }
 */
async function verifyMagicBytes(buffer, ext) {
  // 텍스트 계열은 매직바이트가 없으므로 스킵
  if (['txt', 'csv'].includes(ext)) return { ok: true }

  try {
    const mod = await import('file-type')
    const detect = mod.fileTypeFromBuffer || mod.default?.fileTypeFromBuffer
    if (!detect) return { ok: true } // API가 달라지면 통과 (보수적)
    const detected = await detect(buffer)
    if (!detected) {
      return { ok: false, message: `매직바이트를 식별하지 못했습니다: .${ext}` }
    }
    const allowed = EXT_TO_MIME[ext] || []
    if (!allowed.includes(detected.mime)) {
      return {
        ok: false,
        detectedMime: detected.mime,
        message: `확장자(.${ext})와 실제 MIME(${detected.mime})이 일치하지 않습니다.`,
      }
    }
    return { ok: true, detectedMime: detected.mime }
  } catch {
    // file-type 미설치 — 로그 1회 후 통과 (확장자 화이트리스트에 의존)
    return { ok: true }
  }
}

/**
 * processing_error 문자열에서 에러 코드를 파싱해 반환.
 * 포맷: "CODE: message" — CODE는 영대문자+언더스코어만 허용.
 * 매핑 실패 시 null.
 */
function parseErrorCode(processingError) {
  if (!processingError || typeof processingError !== 'string') return null
  const match = processingError.match(/^([A-Z_]+):/)
  if (!match) return null
  const code = match[1]
  // 유효한 코드만 리턴 (알 수 없는 접두어 방지)
  return Object.values(E).includes(code) ? code : null
}

/** project_id를 body/query에서 추출 (session_id alias 허용) */
function extractProjectId(req) {
  return (
    req.body?.project_id ||
    req.body?.session_id ||
    req.query?.project_id ||
    req.query?.session_id ||
    null
  )
}

/**
 * 프로젝트 접근 권한 검증. 인메모리 폴백 모드에서는 느슨하게 통과한다.
 * 반환: { ok: boolean, project?: object, status?: number, code?: string, message?: string }
 */
async function assertProjectAccess(projectId, userId) {
  try {
    const project = await getProject(projectId)
    if (!project) {
      return { ok: false, status: 404, code: E.PROJECT_NOT_FOUND, message: '프로젝트를 찾을 수 없습니다.' }
    }
    if (project.workspace_id) {
      const role = await getMemberRole(project.workspace_id, userId)
      if (!role) {
        return { ok: false, status: 403, code: E.FORBIDDEN, message: '이 프로젝트에 접근 권한이 없습니다.' }
      }
    }
    return { ok: true, project }
  } catch {
    // Supabase 미연결 — 개발 모드 바이패스
    return { ok: true, project: null }
  }
}

// ── multer 설정 ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MATERIAL_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = extractExt(file.originalname)
    if (!SUPPORTED_MATERIAL_EXTENSIONS.includes(ext)) {
      return cb(Object.assign(new Error('UNSUPPORTED_TYPE'), { code: E.UNSUPPORTED_TYPE, ext }))
    }
    cb(null, true)
  },
})

// multer 에러를 통일 포맷으로 변환
function multerErrorHandler(handler) {
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next()
      if (err.code === 'LIMIT_FILE_SIZE') {
        return errorResponse(res, 413, E.FILE_TOO_LARGE, `파일이 너무 큽니다. ${Math.floor(MAX_MATERIAL_SIZE_BYTES / 1024 / 1024)}MB 이하로 올려주세요.`, 'file')
      }
      if (err.code === E.UNSUPPORTED_TYPE) {
        return errorResponse(res, 415, E.UNSUPPORTED_TYPE, `지원하지 않는 파일 형식입니다: .${err.ext}. (허용: ${SUPPORTED_MATERIAL_EXTENSIONS.join(', ')})`, 'file')
      }
      return errorResponse(res, 400, E.UPLOAD_FAILED, err.message || '업로드 실패')
    })
  }
}

// ============================================================
// POST /api/materials/upload
// ============================================================
materialsRouter.post(
  '/upload',
  multerErrorHandler(upload.single('file')),
  async (req, res) => {
    if (!req.file) {
      return errorResponse(res, 400, E.FILE_REQUIRED, '파일을 선택해주세요.', 'file')
    }

    const projectId = extractProjectId(req)
    if (!projectId) {
      return errorResponse(res, 400, E.PROJECT_ID_REQUIRED, 'project_id가 필요합니다.', 'project_id')
    }

    // intent / intent_note 파싱·검증
    const intentResult = parseIntent(req.body)
    if (!intentResult.ok) {
      return errorResponse(res, 400, intentResult.code, intentResult.message, intentResult.field)
    }
    const { intent, intentNote } = intentResult

    // 프로젝트 접근 권한
    const access = await assertProjectAccess(projectId, req.user.id)
    if (!access.ok) {
      return errorResponse(res, access.status, access.code, access.message)
    }

    const file = req.file
    const safeName = sanitizeFileName(file.originalname)
    const ext = extractExt(safeName)

    // 매직바이트 검증
    const magic = await verifyMagicBytes(file.buffer, ext)
    if (!magic.ok) {
      return errorResponse(res, 415, E.MAGIC_BYTE_MISMATCH, magic.message, 'file')
    }

    // SHA-256 해시 (중복 탐지용, 실제 차단은 하지 않음 — 설계 §9)
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex')

    const materialId = crypto.randomUUID()
    const storagePath = `materials/${projectId}/${materialId}.${ext}`
    const mimeType = magic.detectedMime || file.mimetype || EXT_TO_MIME[ext]?.[0] || 'application/octet-stream'

    // ── Supabase Storage 업로드 ──
    // 실패 시에도 파싱·AI 분석을 계속 진행한다(메모리 버퍼로). Storage 장애 및 dev 환경 안전망.
    let storageOk = false
    try {
      const { error: upErr } = await supabaseAdmin
        .storage
        .from('materials')
        .upload(`${projectId}/${materialId}.${ext}`, file.buffer, {
          contentType: mimeType,
          upsert: false,
        })
      if (upErr) throw upErr
      storageOk = true
    } catch (err) {
      console.warn('[materials] Storage 업로드 실패, 메모리 분석으로 진행', err?.message || err)
    }

    // ── DB insert (Supabase 우선, 실패시 인메모리) ──
    const nowIso = new Date().toISOString()
    const baseRow = {
      id: materialId,
      project_id: projectId,
      uploader_id: req.user.id,
      file_name: safeName,
      file_type: ext,
      mime_type: mimeType,
      file_size: file.size,
      file_hash: fileHash,
      category: (req.body?.category || 'reference').toString().slice(0, 50),
      storage_path: storageOk ? storagePath : null,
      // Storage 실패해도 pending 유지 — analyzer가 메모리 버퍼로 이어서 처리
      processing_status: 'pending',
      processing_error: storageOk
        ? null
        : `${E.STORAGE_UPLOAD_WARNING}: Storage 업로드 실패, 메모리 분석으로 진행`,
      ai_summary: null,
      ai_analysis: null,
      intent,
      intent_note: intentNote,
      created_at: nowIso,
    }

    let material = null
    try {
      const { data, error } = await supabaseAdmin
        .from('materials')
        .insert(baseRow)
        .select()
        .single()
      if (error) throw error
      material = data
    } catch (err) {
      // 인메모리 fallback — storage 미연결/스키마 불일치 등
      console.warn('[materials/upload] DB insert 실패, 인메모리 저장:', err?.message || err)
      material = Materials.add(projectId, baseRow)
    }

    // 메모리 버퍼 참조 해제 (GC 유도)
    const bufferForAnalysis = file.buffer
    // eslint-disable-next-line no-param-reassign
    req.file.buffer = null

    // ── 채팅 인라인 업로드(source='chat'): 원자적으로 system 메시지 INSERT ──
    // 업로드 성공 이후에만 실행. 메시지 생성 실패해도 업로드 응답은 유지.
    // procedure_context/step_context도 함께 기록해 절차별 필터링과 정합.
    let systemMessage = null
    const source = (req.body?.source || 'bar').toString().trim().toLowerCase()
    if (source === 'chat') {
      try {
        const intentLabel =
          (MATERIAL_INTENT_LABELS[intent]?.label) || '수업 참고자료'
        const systemContent = SYSTEM_MESSAGE_TEMPLATES.ATTACHMENT(safeName, intentLabel)
        const procedureCtx = req.body?.procedure || req.body?.procedure_context || null
        const stepCtx = req.body?.current_step != null
          ? Number(req.body.current_step)
          : (req.body?.step_context != null ? Number(req.body.step_context) : null)

        systemMessage = await createMessage({
          project_id: projectId,
          user_id: null,
          sender_type: SENDER_TYPES.SYSTEM,
          content: systemContent,
          procedure_context: procedureCtx,
          step_context: Number.isFinite(stepCtx) ? stepCtx : null,
          attached_material_id: materialId,
          processing_status: 'parsing',
        })
      } catch (err) {
        // 시스템 메시지 생성 실패해도 업로드는 성공 — 경고 로그만 남김
        console.warn(
          '[materials/upload] chat system message 생성 실패(무시):',
          err?.message || err
        )
        // 인메모리 폴백 한 번 더 시도 (Supabase 미연결/RLS 등 보정)
        try {
          const intentLabel =
            (MATERIAL_INTENT_LABELS[intent]?.label) || '수업 참고자료'
          systemMessage = Messages.add(projectId, {
            sender_type: SENDER_TYPES.SYSTEM,
            content: SYSTEM_MESSAGE_TEMPLATES.ATTACHMENT(safeName, intentLabel),
            stage_context: req.body?.procedure || null,
            attached_material_id: materialId,
            processing_status: 'parsing',
          })
        } catch { /* ignore */ }
      }
    }

    // ── 실시간 브로드캐스트: 다른 협업자도 첨부 알림을 즉시 수신 ──
    // chat 경로로 생성된 system 메시지는 프로젝트 room에 message_added로 전파.
    if (source === 'chat' && systemMessage) {
      try {
        const io = req.app.get('io') || globalThis.__cwIo
        if (io) io.to(projectId).emit('message_added', systemMessage)
      } catch (emitErr) {
        console.warn('[materials/upload] message_added emit 실패(무시):', emitErr?.message || emitErr)
      }
    }

    // ── fire-and-forget 분석 ──
    // Storage 실패 여부와 무관하게 메모리 버퍼로 분석을 진행한다.
    analyzeMaterial(materialId, bufferForAnalysis, ext, { intent, intentNote })
      .catch((err) => console.error('[materials] analyzeMaterial 오류:', err?.message || err))

    const responseBody = { material }
    if (systemMessage) responseBody.systemMessage = systemMessage
    return res.status(201).json(responseBody)
  }
)

// ============================================================
// POST /api/materials/url  (간단 URL 저장 — 기존 호환)
// ============================================================
materialsRouter.post('/url', async (req, res) => {
  const projectId = extractProjectId(req)
  const { url, title, category } = req.body || {}
  if (!projectId) {
    return errorResponse(res, 400, E.PROJECT_ID_REQUIRED, 'project_id가 필요합니다.', 'project_id')
  }
  if (!url) {
    return errorResponse(res, 400, E.FILE_REQUIRED, 'URL이 필요합니다.', 'url')
  }

  const access = await assertProjectAccess(projectId, req.user.id)
  if (!access.ok) return errorResponse(res, access.status, access.code, access.message)

  const materialId = crypto.randomUUID()
  const baseRow = {
    id: materialId,
    project_id: projectId,
    uploader_id: req.user.id,
    file_name: title || url,
    file_type: 'url',
    mime_type: 'text/uri-list',
    file_size: 0,
    category: category || 'website',
    storage_path: url,
    processing_status: 'completed',
    ai_summary: `참고 링크: ${title || url}`,
    created_at: new Date().toISOString(),
  }

  let material = null
  try {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .insert(baseRow)
      .select()
      .single()
    if (error) throw error
    material = data
  } catch {
    material = Materials.add(projectId, baseRow)
  }
  return res.status(201).json({ material })
})

// ============================================================
// GET /api/materials?project_id=...
// ============================================================
materialsRouter.get('/', async (req, res) => {
  const projectId = extractProjectId(req)
  if (!projectId) {
    return errorResponse(res, 400, E.PROJECT_ID_REQUIRED, 'project_id가 필요합니다.', 'project_id')
  }
  const access = await assertProjectAccess(projectId, req.user.id)
  if (!access.ok) return errorResponse(res, access.status, access.code, access.message)

  try {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select('id, project_id, file_name, file_type, mime_type, file_size, category, storage_path, processing_status, processing_error, ai_summary, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return res.json({ materials: data || [] })
  } catch {
    return res.json({ materials: Materials.list(projectId) })
  }
})

// ── 레거시 호환: GET /:sessionId (path 기반 구버전 클라이언트) ──
// 응답 형식을 신규 규약({ materials: [...] })으로 통일. 프론트 loadMaterials는 양쪽을 모두 처리하므로 호환됨.
materialsRouter.get('/:projectId', async (req, res, next) => {
  // /upload, /url 등 예약어와 충돌 방지
  const id = req.params.projectId
  if (['upload', 'url'].includes(id)) return next()
  const access = await assertProjectAccess(id, req.user.id)
  if (!access.ok) return errorResponse(res, access.status, access.code, access.message)
  try {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return res.json({ materials: data || [] })
  } catch {
    return res.json({ materials: Materials.list(id) })
  }
})

// ============================================================
// GET /api/materials/:id/analysis   (폴링용)
// ============================================================
materialsRouter.get('/:id/analysis', async (req, res) => {
  const { id } = req.params
  let row = null
  let fromFallback = false

  try {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select('*')
      .eq('id', id)
      .single()
    if (!error) row = data
  } catch { /* fallthrough */ }

  // H3 폴백: Supabase에서 찾지 못하면 인메모리 store 조회.
  // 테스트 모드(Supabase 미연결)에서 폴링이 무한 404 루프에 빠지는 것을 방지.
  if (!row) {
    const mem = Materials.findById(id)
    if (mem) {
      row = mem
      fromFallback = true
    }
  }

  if (!row) {
    return errorResponse(res, 404, E.MATERIAL_NOT_FOUND || E.NOT_FOUND, '자료를 찾을 수 없습니다.')
  }

  // 프로젝트 멤버십 확인 (인메모리 폴백 경로 포함)
  if (row.project_id) {
    const access = await assertProjectAccess(row.project_id, req.user.id)
    if (!access.ok) return errorResponse(res, access.status, access.code, access.message)
  }

  const completed = row.processing_status === 'completed'
  const errorCode = parseErrorCode(row.processing_error)

  return res.json({
    material: {
      id: row.id,
      project_id: row.project_id,
      file_name: row.file_name,
      processing_status: row.processing_status,
      processing_error: row.processing_error,
      error_code: errorCode,         // 프론트 materialErrors.js 매핑 키
      ai_summary: row.ai_summary,
      intent: row.intent || DEFAULT_MATERIAL_INTENT,
      intent_note: row.intent_note || null,
      analyzed_at: row.analyzed_at,
      _source: fromFallback ? 'memory' : 'db',
    },
    analysis: completed ? (row.ai_analysis || null) : null,
  })
})

// ============================================================
// POST /api/materials/:id/reanalyze
// ============================================================
materialsRouter.post('/:id/reanalyze', async (req, res) => {
  const { id } = req.params
  let row = null
  try {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    row = data
  } catch {
    return errorResponse(res, 404, E.NOT_FOUND, '자료를 찾을 수 없습니다.')
  }

  if (!row?.project_id || !row?.file_type) {
    return errorResponse(res, 400, E.UPLOAD_FAILED, '재분석에 필요한 자료 정보가 없습니다.')
  }
  if (!row.storage_path) {
    // 최초 업로드 시 Storage 실패 → 메모리 분석 완료된 자료는 원본 파일이 없음
    return errorResponse(
      res,
      400,
      E.STORAGE_NOT_AVAILABLE,
      '원본 파일이 저장되지 않아 재분석할 수 없습니다. 파일을 다시 업로드해주세요.'
    )
  }

  const access = await assertProjectAccess(row.project_id, req.user.id)
  if (!access.ok) return errorResponse(res, access.status, access.code, access.message)

  // Storage에서 파일 재다운로드
  let buffer = null
  try {
    // storage_path는 "materials/{project}/{uuid}.{ext}" 형태. 버킷 경로 prefix는 "materials/" 제거
    const bucketPath = row.storage_path.startsWith('materials/')
      ? row.storage_path.slice('materials/'.length)
      : row.storage_path
    const { data, error } = await supabaseAdmin.storage.from('materials').download(bucketPath)
    if (error) throw error
    const arrayBuf = await data.arrayBuffer()
    buffer = Buffer.from(arrayBuf)
  } catch (err) {
    return errorResponse(res, 500, E.UPLOAD_FAILED, `Storage 다운로드 실패: ${err?.message || err}`)
  }

  // 상태를 parsing으로 직접 전환 (M2 — 프론트 낙관적 상태 PARSING과 정합성 유지).
  // analyzeMaterial 내부에서도 parsing으로 UPDATE하지만, 여기서 먼저 전환해 응답과 일치시킨다.
  try {
    await supabaseAdmin.from('materials').update({
      processing_status: 'parsing',
      processing_error: null,
    }).eq('id', id)
  } catch {
    // 인메모리 폴백
    try { Materials.update(id, { processing_status: 'parsing', processing_error: null }) } catch { /* ignore */ }
  }

  analyzeMaterial(id, buffer, row.file_type, {
    intent: row.intent || DEFAULT_MATERIAL_INTENT,
    intentNote: row.intent_note || null,
  }).catch((err) => console.error('[materials/reanalyze] 오류:', err?.message || err))

  return res.status(202).json({
    material: { id, processing_status: 'parsing' },
  })
})

// ============================================================
// DELETE /api/materials/:id
// ============================================================
materialsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params
  let row = null
  try {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select('*')
      .eq('id', id)
      .single()
    if (!error) row = data
  } catch { /* fallthrough */ }

  if (!row) {
    // 인메모리 폴백 삭제
    const removed = Materials.remove(id)
    if (!removed) return errorResponse(res, 404, E.NOT_FOUND, '자료를 찾을 수 없습니다.')
    return res.json({ success: true })
  }

  const access = await assertProjectAccess(row.project_id, req.user.id)
  if (!access.ok) return errorResponse(res, access.status, access.code, access.message)

  // Storage 삭제 시도 (실패해도 DB 삭제는 진행)
  if (row.storage_path) {
    try {
      const bucketPath = row.storage_path.startsWith('materials/')
        ? row.storage_path.slice('materials/'.length)
        : row.storage_path
      await supabaseAdmin.storage.from('materials').remove([bucketPath])
    } catch (err) {
      console.warn('[materials/delete] Storage 삭제 실패(무시):', err?.message || err)
    }
  }

  try {
    const { error } = await supabaseAdmin.from('materials').delete().eq('id', id)
    if (error) throw error
  } catch (err) {
    return errorResponse(res, 500, E.INTERNAL, `DB 삭제 실패: ${err?.message || err}`)
  }
  return res.json({ success: true })
})
