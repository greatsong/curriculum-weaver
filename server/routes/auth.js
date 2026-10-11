/**
 * 인증 라우트
 *
 * 로그아웃 + 프로필 조회·수정. 회원가입·로그인은 클라이언트가 Supabase Auth로 직접 한다
 * (서버 경유 가입·로그인 경로는 쓰지 않아 2026-10-11에 삭제).
 *
 * GET /me와 로그아웃은 승인 대기 사용자도 부를 수 있다 — 화면이 승인 대기 안내를 띄우려면
 * 자기 승인 상태를 알아야 한다. 프로필 수정은 승인된 사용자만.
 */
import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { getUser, updateUser } from '../lib/supabaseService.js'
import { requireAuth, requireAuthAllowPending } from '../middleware/auth.js'

const router = Router()

/**
 * POST /api/auth/logout
 * 로그아웃 (서버 측 세션 무효화)
 *
 * @header Authorization: Bearer <token>
 */
router.post('/logout', requireAuthAllowPending, async (req, res) => {
  try {
    // Supabase Admin으로 사용자 세션 무효화
    const { error } = await supabaseAdmin.auth.admin.signOut(req.token)

    if (error) {
      // signOut 실패해도 클라이언트에서 토큰 제거하면 되므로 경고만
      console.warn('[auth/logout] 세션 무효화 경고:', error.message)
    }

    res.json({ message: '로그아웃되었습니다.' })
  } catch (err) {
    console.error('[auth/logout] 오류:', err.message)
    // 로그아웃은 실패해도 클라이언트에서 처리 가능
    res.json({ message: '로그아웃되었습니다.' })
  }
})

/**
 * GET /api/auth/me
 * 현재 사용자 프로필 + 가입 승인 상태 조회 (승인 대기 사용자도 호출 가능)
 *
 * @header Authorization: Bearer <token>
 * @returns {{ id, email, display_name, role, school_name, subject, created_at, approved: boolean, approval_status: 'approved'|'pending'|'rejected' }}
 */
router.get('/me', requireAuthAllowPending, async (req, res) => {
  const approval = req.approval || { approved: false, status: 'pending' }
  const approvalFields = { approved: approval.approved === true, approval_status: approval.status || 'pending' }
  try {
    const profile = await getUser(req.user.id)

    if (!profile) {
      // users 테이블에 프로필이 없는 경우 (마이그레이션 이전 사용자 등)
      return res.json({
        id: req.user.id,
        email: req.user.email,
        display_name: req.user.user_metadata?.display_name || req.user.email,
        role: 'teacher',
        school_name: null,
        subject: null,
        ...approvalFields,
      })
    }

    res.json({ ...profile, ...approvalFields })
  } catch (err) {
    console.error('[auth/me] 오류:', err.message)
    res.status(500).json({ error: '프로필 조회 중 오류가 발생했습니다.' })
  }
})

/**
 * PUT /api/auth/me
 * 프로필 수정
 *
 * @header Authorization: Bearer <token>
 * @body {{ display_name?: string, school_name?: string, subject?: string }}
 * @returns {object} 수정된 프로필
 */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { display_name, school_name, subject } = req.body
    const updateData = {}

    if (display_name !== undefined) updateData.display_name = display_name
    if (school_name !== undefined) updateData.school_name = school_name
    if (subject !== undefined) updateData.subject = subject

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' })
    }

    const profile = await updateUser(req.user.id, updateData)
    res.json(profile)
  } catch (err) {
    console.error('[auth/me] 프로필 수정 오류:', err.message)
    res.status(500).json({ error: '프로필 수정 중 오류가 발생했습니다.' })
  }
})

export default router
