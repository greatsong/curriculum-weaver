/**
 * 가입 승인 판정·처리 (2026-10-11)
 *
 * 판정 기준(우선순위 순):
 *   1. public.users.role === 'admin' → 항상 승인
 *   2. auth app_metadata.rejected === true → 거절(계속 이용 불가)
 *   3. auth app_metadata.approved === true → 승인
 *   4. 계정 생성 시각(auth user created_at)이 APPROVAL_REQUIRED_SINCE 이전 → 승인(기존 가입자)
 *   5. 그 밖 → 승인 대기
 *
 * app_metadata는 서버(service_role)만 쓸 수 있다. user_metadata와 public.users는 사용자가
 * 직접 고칠 수 있으므로 판정에 쓰지 않는다(관리자 역할만 예외 — users.role은 00029로 쓰기 권한을 회수했다).
 *
 * 승인·거절 뒤에는 onApprovalChange 구독자(인증 미들웨어의 토큰 캐시)가 그 사용자 캐시를 비운다.
 */
import { supabaseAdmin } from './supabaseAdmin.js'

/** 이 시각 이후에 만든 계정부터 승인이 필요하다 (env APPROVAL_REQUIRED_SINCE로 덮어쓸 수 있다) */
export const DEFAULT_APPROVAL_REQUIRED_SINCE = '2026-10-11T15:00:00+09:00'

/** 승인 경로 — app_metadata.approved_via에 남는다 */
export const APPROVAL_VIA = Object.freeze(['invite', 'admin', 'join_request', 'member_add'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** Supabase가 실제로 연결된 환경인지 (placeholder 주소는 로컬 인메모리 개발) */
export function isSupabaseConfigured(env = process.env) {
  const url = String(env.SUPABASE_URL || '')
  return Boolean(url && env.SUPABASE_SERVICE_ROLE_KEY && !/placeholder/i.test(url))
}

/** 승인 필요 기준 시각(ms). env 값이 잘못되었으면 기본값을 쓴다 */
export function getApprovalRequiredSince(env = process.env) {
  const raw = String(env.APPROVAL_REQUIRED_SINCE || '').trim()
  const parsed = raw ? Date.parse(raw) : NaN
  return Number.isFinite(parsed) ? parsed : Date.parse(DEFAULT_APPROVAL_REQUIRED_SINCE)
}

/**
 * app_metadata와 가입 시각만으로 본 상태. 관리자 여부는 보지 않는다(resolveApproval이 본다).
 * created_at을 읽을 수 없으면 승인 대기로 본다(안전 쪽).
 * @returns {'approved'|'pending'|'rejected'}
 */
export function approvalStatusFromAuthUser(user, { since = getApprovalRequiredSince() } = {}) {
  if (!user?.id) return 'pending'
  const meta = user.app_metadata || {}
  if (meta.rejected === true) return 'rejected'
  if (meta.approved === true) return 'approved'
  const created = Date.parse(user.created_at || '')
  if (Number.isFinite(created) && created < since) return 'approved'
  return 'pending'
}

// ── 관리자 역할 조회 (60초 캐시) ─────────────────────────────────
const ADMIN_TTL_MS = 60_000
const adminCache = new Map() // userId → { isAdmin, expiresAt }

/**
 * users.role === 'admin' 여부. 조회 실패는 관리자가 아닌 것으로 보고 캐시하지 않는다.
 * @param {string} userId
 */
export async function isAdminUser(userId) {
  if (!userId || !isSupabaseConfigured()) return false
  const hit = adminCache.get(userId)
  if (hit && hit.expiresAt > Date.now()) return hit.isAdmin
  try {
    const { data, error } = await supabaseAdmin.from('users').select('role').eq('id', userId).maybeSingle()
    if (error) throw error
    const isAdmin = data?.role === 'admin'
    adminCache.set(userId, { isAdmin, expiresAt: Date.now() + ADMIN_TTL_MS })
    if (adminCache.size > 5_000) adminCache.clear()
    return isAdmin
  } catch (err) {
    console.warn('[approval] 관리자 역할 조회 실패:', err?.message || err)
    return false
  }
}

/**
 * 최종 승인 판정.
 * @param {object} user - Supabase auth user (app_metadata·created_at 포함)
 * @returns {Promise<{ approved: boolean, status: 'approved'|'pending'|'rejected', admin?: boolean }>}
 */
export async function resolveApproval(user) {
  const status = approvalStatusFromAuthUser(user)
  if (status === 'approved') return { approved: true, status }
  if (user?.id && await isAdminUser(user.id)) return { approved: true, status: 'approved', admin: true }
  return { approved: false, status }
}

// ── 승인 변경 알림 (토큰 캐시 비우기용) ──────────────────────────
const changeListeners = new Set()

/** 승인·거절이 바뀌면 userId로 호출된다. 해제 함수를 돌려준다 */
export function onApprovalChange(listener) {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

function notifyApprovalChange(userId) {
  adminCache.delete(userId)
  for (const listener of changeListeners) {
    try { listener(userId) } catch { /* 구독자 오류는 승인 처리를 깨지 않는다 */ }
  }
}

// ── auth 사용자 조회 ─────────────────────────────────────────────

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

/** 확인된 이메일 — 구글 로그인이거나 email_confirmed_at이 있을 때만. 없으면 null */
export function verifiedEmailOf(user) {
  const email = normalizeEmail(user?.email)
  if (!email) return null
  if (user.email_confirmed_at) return email
  const providers = [
    user.app_metadata?.provider,
    ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []),
    ...(Array.isArray(user.identities) ? user.identities.map((i) => i?.provider) : []),
  ]
  return providers.includes('google') ? email : null
}

/** 가입 방식 — 'google' | 'email' | 기타 provider 이름 */
export function signupProviderOf(user) {
  return user?.app_metadata?.provider
    || (Array.isArray(user?.identities) && user.identities[0]?.provider)
    || 'email'
}

export async function getAuthUserById(userId) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error) throw error
  return data?.user || null
}

/**
 * auth 사용자 전체를 페이지 끝까지 읽는다(기본 listUsers는 50명만 준다).
 * @param {{ perPage?: number, maxPages?: number, stopWhen?: (user) => boolean }} [opts]
 */
export async function listAllAuthUsers({ perPage = 1000, maxPages = 100, stopWhen } = {}) {
  const users = []
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const batch = data?.users || []
    users.push(...batch)
    if (stopWhen && batch.some(stopWhen)) break
    if (batch.length < perPage) break
  }
  return users
}

/** 이메일(대소문자 무시)로 auth 사용자 찾기 — 페이지 끝까지 본다 */
export async function findAuthUserByEmail(email) {
  const target = normalizeEmail(email)
  if (!target) return null
  const match = (u) => normalizeEmail(u?.email) === target
  const users = await listAllAuthUsers({ stopWhen: match })
  return users.find(match) || null
}

// ── 승인·거절 처리 ───────────────────────────────────────────────

async function writeAppMetadata(userId, patch) {
  const current = await getAuthUserById(userId)
  if (!current) {
    const err = new Error('사용자를 찾을 수 없습니다.')
    err.status = 404
    throw err
  }
  // 기존 app_metadata(provider 등)를 보존하도록 합쳐서 쓴다
  const appMetadata = { ...(current.app_metadata || {}), ...patch }
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: appMetadata })
  if (error) throw error
  notifyApprovalChange(userId)
  return data?.user || { ...current, app_metadata: appMetadata }
}

/**
 * 승인 처리. app_metadata에 approved·approved_at·approved_via·approved_by를 쓴다.
 * @param {string} userId
 * @param {{ via: 'invite'|'admin'|'join_request'|'member_add', by?: string|null }} opts
 */
export async function approveUser(userId, { via, by = null } = {}) {
  if (!APPROVAL_VIA.includes(via)) throw new Error(`알 수 없는 승인 경로입니다: ${via}`)
  return writeAppMetadata(userId, {
    approved: true,
    approved_at: new Date().toISOString(),
    approved_via: via,
    approved_by: by || null,
    rejected: false,
  })
}

/** 거절 처리. 거절된 사용자는 관리자가 다시 승인하기 전까지 계속 이용할 수 없다 */
export async function rejectUser(userId, { by = null } = {}) {
  return writeAppMetadata(userId, {
    approved: false,
    rejected: true,
    rejected_at: new Date().toISOString(),
    rejected_by: by || null,
  })
}

/**
 * 승인 대기인 사용자만 승인한다(초대·참여 요청·멤버 직접 추가 경로용).
 * 이미 승인된 사용자는 그대로 두고, 관리자가 거절한 사용자는 이 경로로 되살리지 않는다.
 * Supabase가 없는 로컬 개발에서는 아무것도 하지 않는다.
 * @param {object|string} userOrId - auth user 객체 또는 id
 * @returns {Promise<{ status: string, changed: boolean }>}
 */
export async function approveIfPending(userOrId, { via, by = null } = {}) {
  if (!isSupabaseConfigured()) return { status: 'approved', changed: false }
  const user = typeof userOrId === 'string' ? await getAuthUserById(userOrId) : userOrId
  if (!user?.id) return { status: 'pending', changed: false }
  const { status } = await resolveApproval(user)
  if (status !== 'pending') return { status, changed: false }
  await approveUser(user.id, { via, by })
  return { status: 'approved', changed: true }
}

/** 관리자 승인 대기 목록에 들어갈 사용자인지 (기준 시각 이후 생성 + 승인 대기) */
export function isPendingCandidate(user, { since = getApprovalRequiredSince() } = {}) {
  const created = Date.parse(user?.created_at || '')
  if (!Number.isFinite(created) || created < since) return false
  return approvalStatusFromAuthUser(user, { since }) === 'pending'
}

/** 테스트 전용: 캐시·구독자 초기화 */
export function _resetApprovalStateForTest() {
  adminCache.clear()
  changeListeners.clear()
}
