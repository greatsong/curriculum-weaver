/**
 * 회원 탈퇴(계정 삭제) 처리 — 관리자 스크립트 scripts/delete-account.mjs가 사용한다.
 *
 * 순서 (정책은 supabase/migrations/00031_account_deletion.sql 머리말):
 *   ① delete_account_data RPC — 소유권 이관, 혼자 쓰던 워크스페이스·시뮬레이션 삭제, 멤버십 제거,
 *      프로필 삭제를 한 트랜잭션으로 한다. 팀 기록은 원본 그대로 두고 계정 연결만 끊는다.
 *   ② 삭제된 프로젝트의 Storage 파일(materials 버킷의 {projectId}/…). DB 삭제로는 지워지지 않는다.
 *   ③ auth 계정. 동의 기록(user_metadata)·로그인 연결·세션이 함께 지워진다.
 * 멤버십이 ①에서 먼저 사라지므로 남은 토큰으로는 ②·③ 사이에 팀 프로젝트에 쓸 수 없다.
 */

export const MATERIALS_BUCKET = 'materials'
const STORAGE_PAGE = 1000
const AUTH_PAGE = 200

/**
 * 이메일 또는 ID로 탈퇴 대상 계정을 찾는다. auth 계정과 프로필 중 하나라도 있으면 돌려준다.
 * @returns {Promise<null | { id: string, email: string|null, displayName: string|null, role: string, hasAuth: boolean, hasProfile: boolean }>}
 */
export async function findAccount(sb, { email, userId }) {
  let authUser = null
  if (userId) {
    const { data, error } = await sb.auth.admin.getUserById(userId)
    if (error && error.status !== 404) throw error
    authUser = data?.user || null
  } else {
    const target = String(email || '').trim().toLowerCase()
    if (!target) throw new Error('이메일이나 사용자 ID가 필요합니다.')
    for (let page = 1; ; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: AUTH_PAGE })
      if (error) throw error
      const users = data?.users || []
      authUser = users.find((u) => String(u.email || '').toLowerCase() === target) || null
      if (authUser || users.length < AUTH_PAGE) break
    }
  }

  const id = authUser?.id || userId || null
  if (!id) return null
  const { data: profile, error } = await sb.from('users').select('id, email, display_name, role').eq('id', id).maybeSingle()
  if (error) throw error
  if (!authUser && !profile) return null
  return {
    id,
    email: authUser?.email || profile?.email || null,
    displayName: profile?.display_name || null,
    role: profile?.role || 'teacher',
    hasAuth: !!authUser,
    hasProfile: !!profile,
  }
}

/** ① DB 처리. dryRun이면 같은 일을 하고 롤백한 결과만 돌려준다. */
export async function runDeleteAccountData(sb, userId, { dryRun }) {
  const { data, error } = await sb.rpc('delete_account_data', { p_user: userId, p_dry_run: dryRun })
  if (error) throw new Error(`delete_account_data 실패: ${error.message}`)
  return data
}

/** ② 프로젝트별 Storage 파일 삭제. 한 프로젝트가 실패해도 나머지는 계속하고 실패 목록을 돌려준다. */
export async function purgeProjectStorage(sb, projectIds) {
  const bucket = sb.storage.from(MATERIALS_BUCKET)
  let removed = 0
  const failed = []
  for (const projectId of projectIds || []) {
    try {
      for (;;) {
        const { data, error } = await bucket.list(projectId, { limit: STORAGE_PAGE })
        if (error) throw error
        const files = (data || []).filter((f) => f.id) // 폴더 항목은 id가 없다
        if (!files.length) break
        const { data: gone, error: rmErr } = await bucket.remove(files.map((f) => `${projectId}/${f.name}`))
        if (rmErr) throw rmErr
        if (!gone?.length) throw new Error('파일이 지워지지 않았습니다.')
        removed += gone.length
        if (files.length < STORAGE_PAGE) break
      }
    } catch (err) {
      failed.push({ projectId, error: err?.message || String(err) })
    }
  }
  return { removed, failed }
}

/** ③ auth 계정 삭제. 이미 없으면 'already_deleted'. */
export async function deleteAuthUser(sb, userId) {
  const { error } = await sb.auth.admin.deleteUser(userId)
  if (!error) return 'deleted'
  if (error.status === 404) return 'already_deleted'
  throw new Error(`auth 계정 삭제 실패: ${error.message}`)
}

/**
 * 탈퇴 처리 전체. apply=false면 ①을 시험 실행만 한다.
 * Storage 정리가 일부 실패해도 계정 삭제는 진행하고, 실패 목록으로 재실행할 수 있게 한다.
 */
export async function deleteAccount(sb, account, { apply }) {
  const db = await runDeleteAccountData(sb, account.id, { dryRun: !apply })
  if (!apply) return { db }
  const storage = await purgeProjectStorage(sb, db.deleted_project_ids)
  const auth = account.hasAuth ? await deleteAuthUser(sb, account.id) : 'absent'
  return { db, storage, auth }
}

const KEPT_LABELS = {
  messages: '메시지', comments: '댓글', activity_logs: '활동 로그', designs: '보드(마지막 편집자)',
  versions: '보드 버전', project_standards: '추가한 성취기준', procedure_skips: '절차 생략 결정',
  materials: '올린 자료', invites_created: '보낸 초대', projects_created: '만든 프로젝트',
  link_reports: '연결 신고', curriculum_links: '연결 검토',
}

/**
 * 결과를 사람이 읽는 줄 목록으로 만든다.
 * @param {object} db delete_account_data 결과
 * @param {Map<string, {email?: string, display_name?: string}>} people 이관받는 사람 정보(id → 프로필)
 * @param {{ applied?: boolean }} opts 실제 처리 뒤면 과거형으로 쓴다
 */
export function formatSummary(db, people = new Map(), { applied = false } = {}) {
  const v = (planned, done) => (applied ? done : planned)
  const lines = []
  const deleted = db.workspaces_deleted || []
  const projectTotal = deleted.reduce((n, w) => n + (w.projects || 0), 0)
  lines.push(`${v('삭제할', '삭제한')} 워크스페이스 ${deleted.length}개 (프로젝트 ${projectTotal}개)`)
  for (const w of deleted) lines.push(`  - ${w.name}${w.personal ? ' [개인 워크스페이스]' : ''} (프로젝트 ${w.projects})`)

  const moved = db.workspaces_transferred || []
  lines.push(`소유권을 ${v('넘길', '넘긴')} 워크스페이스 ${moved.length}개`)
  for (const t of moved) {
    const p = people.get(t.new_owner_id)
    const who = p ? `${p.display_name || '이름 없음'} <${p.email || '이메일 없음'}>` : t.new_owner_id
    lines.push(`  - ${t.name} → ${who} (기존 역할 ${t.previous_role})`)
  }

  lines.push(`${v('삭제할', '삭제한')} 시뮬레이션 프로젝트 ${db.simulation_projects_deleted || 0}개`)
  lines.push(`Storage 파일 정리 대상 프로젝트 ${(db.deleted_project_ids || []).length}개`)
  lines.push(`탈퇴자 이메일로 온 초대 ${db.invites_deleted || 0}건 삭제, 시뮬레이션 실행 기록 ${db.simulation_runs_deleted || 0}건 삭제, AI 사용량 기록 ${db.ai_usage_unlinked || 0}건 연결 해제`)
  lines.push(`멤버십 ${db.memberships_removed || 0}개 삭제`)

  const kept = Object.entries(db.kept_unlinked || {}).filter(([, n]) => n > 0)
  lines.push(kept.length
    ? `팀 기록으로 남고 계정 연결만 ${v('끊기는', '끊긴')} 행: ${kept.map(([k, n]) => `${KEPT_LABELS[k] || k} ${n}`).join(', ')}`
    : '팀 기록으로 남는 행: 없음')
  return lines
}
