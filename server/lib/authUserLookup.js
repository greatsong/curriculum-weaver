/**
 * 이메일로 가입한 사용자(auth.users) 찾기
 *
 * 배경: 초대 라우트가 auth.admin.listUsers()를 인자 없이 불러 첫 페이지(기본 50명)에서만
 * 찾았다. 가입자가 50명을 넘자 이미 가입한 교사를 찾지 못하고 토큰 초대로 처리했다.
 *
 * 1) public.users(인증할 때마다 서버가 upsert하는 프로필 미러)에서 email로 후보를 찾고,
 *    auth에서 id로 다시 읽어 지금도 그 이메일인지 확인한다. 미러는 이메일 변경을 다음 요청 때에야
 *    반영하므로 미러 값만 믿고 다른 사람을 멤버로 넣지 않게 한다.
 * 2) 미러에 없으면(가입만 하고 서버에 요청한 적 없는 사용자, 프로필 upsert 실패 등)
 *    listUsers를 빈 페이지가 나올 때까지 넘기며 찾는다.
 *    - 서버가 쪽당 인원을 요청보다 적게 자를 수 있어 "요청보다 적게 왔다"로 끝을 판단하지 않는다.
 *    - auth-js의 nextPage는 Link 헤더에서 쪽 번호의 첫 글자만 읽어 10쪽부터 틀리므로 쓰지 않는다.
 *
 * 조회를 끝내지 못하면 throw한다. 폴백(토큰 초대 등)은 호출부가 정한다.
 * Supabase 미설정(로컬)이면 supabaseAdmin에 접근하는 순간 throw하므로 호출부 폴백으로 이어진다.
 */
import { supabaseAdmin } from './supabaseAdmin.js'

const MIRROR_CANDIDATE_LIMIT = 5
const LIST_PER_PAGE = 1000
const LIST_MAX_PAGES = 200

/**
 * 이메일 비교용 정규화 (앞뒤 공백 제거 + 소문자)
 * @param {unknown} email
 * @returns {string}
 */
export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function hasEmail(user, normalized) {
  return normalizeEmail(user?.email) === normalized
}

async function findInProfileMirror(client, normalized) {
  const { data, error } = await client
    .from('users')
    .select('id')
    .eq('email', normalized)
    .limit(MIRROR_CANDIDATE_LIMIT)
  if (error) throw error

  for (const row of data || []) {
    const { data: found, error: getErr } = await client.auth.admin.getUserById(row.id)
    // 후보 하나를 확인하지 못해도 다음 후보와 전체 탐색이 남아 있다
    if (getErr) continue
    if (hasEmail(found?.user, normalized)) return found.user
  }
  return null
}

async function scanAuthUsers(client, normalized, perPage, maxPages) {
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data?.users || []
    if (users.length === 0) return null
    const found = users.find((u) => hasEmail(u, normalized))
    if (found) return found
  }
  throw new Error(`가입자 조회를 ${maxPages}쪽(쪽당 ${perPage}명)까지 했지만 끝나지 않아 중단했습니다.`)
}

/**
 * 이메일로 가입한 사용자를 찾는다. 가입자 수와 상관없이 끝까지 찾는다.
 *
 * @param {string} email
 * @param {object} [opts]
 * @param {object} [opts.client] - Supabase 관리 클라이언트 (기본: supabaseAdmin)
 * @param {number} [opts.perPage] - listUsers 쪽당 인원
 * @param {number} [opts.maxPages] - listUsers 최대 쪽 수 (넘으면 throw)
 * @returns {Promise<object|null>} auth 사용자 또는 null(가입하지 않음)
 */
export async function findAuthUserByEmail(email, {
  client = supabaseAdmin,
  perPage = LIST_PER_PAGE,
  maxPages = LIST_MAX_PAGES,
} = {}) {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  try {
    const mirrored = await findInProfileMirror(client, normalized)
    if (mirrored) return mirrored
  } catch (err) {
    console.warn('[authUserLookup] 프로필 미러 조회 실패, 전체 탐색으로 진행:', err.message)
  }

  return scanAuthUsers(client, normalized, perPage, maxPages)
}
