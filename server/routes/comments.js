/**
 * 댓글(Comment) 라우트
 *
 * 설계 캔버스에 대한 댓글 CRUD + 해결/해결취소.
 * Socket.IO를 통해 실시간 알림 전송.
 *
 * 라우트:
 * - GET    /api/designs/:designId/comments          — 댓글 목록 (section_key 필터 가능)
 * - POST   /api/designs/:designId/comments          — 댓글 생성 (editor+ only)
 * - PUT    /api/comments/:id                        — 댓글 수정 (작성자만)
 * - DELETE /api/comments/:id                        — 댓글 삭제 (작성자 또는 owner)
 * - POST   /api/comments/:id/resolve                — 댓글 해결 (editor+ only)
 * - POST   /api/comments/:id/unresolve              — 댓글 해결취소 (editor+ only)
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getComments, getCommentById, createComment, updateComment,
  deleteComment, resolveComment, unresolveComment,
  getDesignById, getProject, getMemberRole,
} from '../lib/supabaseService.js'

const router = Router()

// 모든 라우트에 인증 적용
router.use(requireAuth)

// ── 권한이 필요한 역할 목록 ──
const EDITOR_ROLES = ['owner', 'host', 'editor']

/**
 * 설계 캔버스 접근 + 멤버십 확인 (designId 기반)
 *
 * req.params.designId로 설계 조회 → 프로젝트 → 워크스페이스 멤버십 확인.
 * req.design, req.project, req.memberRole 설정.
 */
async function checkDesignAccess(req, res, next) {
  try {
    const design = await getDesignById(req.params.designId)
    if (!design) {
      return res.status(404).json({ error: '설계 캔버스를 찾을 수 없습니다.' })
    }

    const project = await getProject(design.project_id)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
    }

    req.design = design
    req.project = project
    req.memberRole = role
    next()
  } catch (err) {
    console.error('[comments] 접근 권한 확인 오류:', err.message)
    res.status(500).json({ error: '접근 권한 확인 중 오류가 발생했습니다.' })
  }
}

/**
 * 댓글 접근 + 멤버십 확인 (commentId 기반)
 *
 * req.params.id로 댓글 조회 → 설계 → 프로젝트 → 워크스페이스 멤버십 확인.
 * req.comment, req.design, req.project, req.memberRole 설정.
 */
async function checkCommentAccess(req, res, next) {
  try {
    const comment = await getCommentById(req.params.id)
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' })
    }

    const design = await getDesignById(comment.design_id)
    if (!design) {
      return res.status(404).json({ error: '설계 캔버스를 찾을 수 없습니다.' })
    }

    const project = await getProject(design.project_id)
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const role = await getMemberRole(project.workspace_id, req.user.id)
    if (!role) {
      return res.status(403).json({ error: '이 프로젝트에 접근 권한이 없습니다.' })
    }

    req.comment = comment
    req.design = design
    req.project = project
    req.memberRole = role
    next()
  } catch (err) {
    console.error('[comments] 댓글 접근 확인 오류:', err.message)
    res.status(500).json({ error: '접근 확인 중 오류가 발생했습니다.' })
  }
}

// ─────────────────────────────────────────
// 설계 기반 라우트 (/api/designs/:designId/comments)
// ─────────────────────────────────────────

/**
 * GET /api/designs/:designId/comments
 * 설계 캔버스의 댓글 목록 조회
 *
 * @query {string} [section_key] - 특정 섹션의 댓글만 필터링
 * @returns {{ comments: object[] }}
 */
router.get('/designs/:designId/comments', checkDesignAccess, async (req, res) => {
  try {
    const sectionKey = req.query.section_key || null
    const comments = await getComments(req.params.designId, sectionKey)
    res.json({ comments })
  } catch (err) {
    console.error('[comments] 목록 조회 오류:', err.message)
    res.status(500).json({ error: '댓글 목록 조회 중 오류가 발생했습니다.' })
  }
})

/**
 * POST /api/designs/:designId/comments
 * 댓글 생성 (editor 이상만 가능)
 *
 * @body {string} section_key - 보드 내 섹션 키 (필드명)
 * @body {string} body - 댓글 본문
 * @returns {{ comment: object }}
 */
router.post('/designs/:designId/comments', checkDesignAccess, async (req, res) => {
  // editor 이상만 댓글 작성 가능
  if (!EDITOR_ROLES.includes(req.memberRole)) {
    return res.status(403).json({ error: '댓글 작성 권한이 없습니다. (editor 이상 필요)' })
  }

  const { section_key, body } = req.body
  if (!body || !body.trim()) {
    return res.status(400).json({ error: '댓글 본문이 필요합니다.' })
  }

  try {
    const comment = await createComment({
      design_id: req.params.designId,
      section_key: section_key || null,
      user_id: req.user.id,
      body: body.trim(),
    })

    // Socket.IO 실시간 알림
    const io = req.app.get('io')
    if (io) {
      io.to(req.project.id).emit('comment_added', {
        designId: req.params.designId,
        comment,
      })
    }

    res.status(201).json({ comment })
  } catch (err) {
    console.error('[comments] 생성 오류:', err.message)
    res.status(500).json({ error: '댓글 생성 중 오류가 발생했습니다.' })
  }
})

// ─────────────────────────────────────────
// 댓글 기반 라우트 (/api/comments/:id)
// ─────────────────────────────────────────

/**
 * PUT /api/comments/:id
 * 댓글 본문 수정 (작성자만 가능)
 *
 * @body {string} body - 수정할 댓글 본문
 * @returns {{ comment: object }}
 */
router.put('/comments/:id', checkCommentAccess, async (req, res) => {
  // 작성자만 수정 가능
  if (req.comment.user_id !== req.user.id) {
    return res.status(403).json({ error: '본인이 작성한 댓글만 수정할 수 있습니다.' })
  }

  const { body } = req.body
  if (!body || !body.trim()) {
    return res.status(400).json({ error: '댓글 본문이 필요합니다.' })
  }

  try {
    const updated = await updateComment(req.params.id, body.trim())
    if (!updated) {
      return res.status(404).json({ error: '댓글 수정에 실패했습니다.' })
    }

    // Socket.IO 실시간 알림
    const io = req.app.get('io')
    if (io) {
      io.to(req.project.id).emit('comment_updated', {
        designId: req.comment.design_id,
        comment: updated,
      })
    }

    res.json({ comment: updated })
  } catch (err) {
    console.error('[comments] 수정 오류:', err.message)
    res.status(500).json({ error: '댓글 수정 중 오류가 발생했습니다.' })
  }
})

/**
 * DELETE /api/comments/:id
 * 댓글 삭제 (작성자 또는 워크스페이스 owner만 가능)
 */
router.delete('/comments/:id', checkCommentAccess, async (req, res) => {
  // 작성자 또는 owner만 삭제 가능
  const isAuthor = req.comment.user_id === req.user.id
  const isOwner = req.memberRole === 'owner'

  if (!isAuthor && !isOwner) {
    return res.status(403).json({ error: '댓글 삭제 권한이 없습니다. (작성자 또는 owner만 가능)' })
  }

  try {
    const success = await deleteComment(req.params.id)
    if (!success) {
      return res.status(500).json({ error: '댓글 삭제에 실패했습니다.' })
    }

    // Socket.IO 실시간 알림
    const io = req.app.get('io')
    if (io) {
      io.to(req.project.id).emit('comment_updated', {
        designId: req.comment.design_id,
        commentId: req.params.id,
        deleted: true,
      })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[comments] 삭제 오류:', err.message)
    res.status(500).json({ error: '댓글 삭제 중 오류가 발생했습니다.' })
  }
})

/**
 * POST /api/comments/:id/resolve
 * 댓글 해결 처리 (editor 이상만 가능)
 *
 * @returns {{ comment: object }}
 */
router.post('/comments/:id/resolve', checkCommentAccess, async (req, res) => {
  if (!EDITOR_ROLES.includes(req.memberRole)) {
    return res.status(403).json({ error: '댓글 해결 권한이 없습니다. (editor 이상 필요)' })
  }

  if (req.comment.resolved) {
    return res.status(400).json({ error: '이미 해결된 댓글입니다.' })
  }

  try {
    const resolved = await resolveComment(req.params.id, req.user.id)
    if (!resolved) {
      return res.status(500).json({ error: '댓글 해결 처리에 실패했습니다.' })
    }

    // Socket.IO 실시간 알림
    const io = req.app.get('io')
    if (io) {
      io.to(req.project.id).emit('comment_resolved', {
        designId: req.comment.design_id,
        comment: resolved,
      })
    }

    res.json({ comment: resolved })
  } catch (err) {
    console.error('[comments] 해결 처리 오류:', err.message)
    res.status(500).json({ error: '댓글 해결 처리 중 오류가 발생했습니다.' })
  }
})

/**
 * POST /api/comments/:id/unresolve
 * 댓글 해결 취소 (editor 이상만 가능)
 *
 * @returns {{ comment: object }}
 */
router.post('/comments/:id/unresolve', checkCommentAccess, async (req, res) => {
  if (!EDITOR_ROLES.includes(req.memberRole)) {
    return res.status(403).json({ error: '댓글 해결취소 권한이 없습니다. (editor 이상 필요)' })
  }

  if (!req.comment.resolved) {
    return res.status(400).json({ error: '해결되지 않은 댓글입니다.' })
  }

  try {
    const unresolved = await unresolveComment(req.params.id)
    if (!unresolved) {
      return res.status(500).json({ error: '댓글 해결취소에 실패했습니다.' })
    }

    // Socket.IO 실시간 알림
    const io = req.app.get('io')
    if (io) {
      io.to(req.project.id).emit('comment_resolved', {
        designId: req.comment.design_id,
        comment: unresolved,
      })
    }

    res.json({ comment: unresolved })
  } catch (err) {
    console.error('[comments] 해결취소 오류:', err.message)
    res.status(500).json({ error: '댓글 해결취소 중 오류가 발생했습니다.' })
  }
})

export const commentsRouter = router
