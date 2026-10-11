/**
 * 관리자 가입 승인 API (2026-10-11) — 관리자(users.role='admin') 전용
 *
 *   GET  /api/admin/users/pending          승인 대기 목록 (기준 시각 이후 가입 + 미승인 + 미거절)
 *   POST /api/admin/users/:userId/approve  승인 (app_metadata.approved, approved_via='admin')
 *   POST /api/admin/users/:userId/reject   거절 (app_metadata.rejected — 거절 사용자는 계속 이용 불가)
 *
 * 판정 규칙은 lib/approval.js 한곳에 있다.
 */
import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import {
  listAllAuthUsers, isPendingCandidate, approveUser, rejectUser,
  signupProviderOf, getApprovalRequiredSince, isUuid,
} from '../lib/approval.js'

export const adminUsersRouter = Router()
adminUsersRouter.use(requireAuth, requireAdmin)

/** 승인 대기 목록 한 줄 — 화면에 필요한 값만 */
export function toPendingRow(user) {
  const meta = user.user_metadata || {}
  return {
    id: user.id,
    email: user.email || '',
    name: meta.display_name || meta.full_name || meta.name || '',
    school_name: meta.school_name || '',
    subject: meta.subject || '',
    provider: signupProviderOf(user),
    email_confirmed: Boolean(user.email_confirmed_at),
    created_at: user.created_at,
  }
}

/** 관리자 역할 사용자 id 집합 (관리자는 대기 목록에서 뺀다) */
async function loadAdminIds(ids) {
  if (ids.length === 0) return new Set()
  const { data, error } = await supabaseAdmin.from('users').select('id, role').in('id', ids)
  if (error) throw error
  return new Set((data || []).filter((r) => r.role === 'admin').map((r) => r.id))
}

adminUsersRouter.get('/pending', async (req, res) => {
  try {
    const since = getApprovalRequiredSince()
    const users = await listAllAuthUsers()
    const candidates = users.filter((u) => isPendingCandidate(u, { since }))
    const adminIds = await loadAdminIds(candidates.map((u) => u.id))
    const pending = candidates
      .filter((u) => !adminIds.has(u.id))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map(toPendingRow)
    res.json({ since: new Date(since).toISOString(), total_users: users.length, pending })
  } catch (err) {
    console.error('[admin/users] 승인 대기 목록 오류:', err?.message || err)
    res.status(500).json({ error: '승인 대기 목록을 불러오지 못했습니다.' })
  }
})

adminUsersRouter.post('/:userId/approve', async (req, res) => {
  const { userId } = req.params
  if (!isUuid(userId)) return res.status(400).json({ error: '올바른 사용자 ID가 아닙니다.' })
  try {
    const user = await approveUser(userId, { via: 'admin', by: req.user.id })
    console.log(`[admin/users] 가입 승인 — 대상 ${userId}, 처리 ${req.user.id}`)
    res.json({ id: userId, approved: true, approved_at: user?.app_metadata?.approved_at || null })
  } catch (err) {
    if (err?.status === 404) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    console.error('[admin/users] 승인 오류:', err?.message || err)
    res.status(500).json({ error: '승인 처리에 실패했습니다.' })
  }
})

adminUsersRouter.post('/:userId/reject', async (req, res) => {
  const { userId } = req.params
  if (!isUuid(userId)) return res.status(400).json({ error: '올바른 사용자 ID가 아닙니다.' })
  if (userId === req.user.id) return res.status(400).json({ error: '자기 계정은 거절할 수 없습니다.' })
  try {
    await rejectUser(userId, { by: req.user.id })
    console.log(`[admin/users] 가입 거절 — 대상 ${userId}, 처리 ${req.user.id}`)
    res.json({ id: userId, rejected: true })
  } catch (err) {
    if (err?.status === 404) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    console.error('[admin/users] 거절 오류:', err?.message || err)
    res.status(500).json({ error: '거절 처리에 실패했습니다.' })
  }
})
