#!/usr/bin/env node
/**
 * 회원 탈퇴(계정 삭제) 관리자 스크립트 — 처리방침의 탈퇴 요청을 처리한다.
 * DB 처리는 supabase/migrations/00031_account_deletion.sql의 delete_account_data가 한 트랜잭션으로 하고,
 * 이 스크립트가 이어서 Storage 파일과 auth 계정을 지운다. 로직은 server/lib/accountDeletion.js.
 *
 * 사용법:
 *   node scripts/delete-account.mjs --email teacher@school.kr                # 시험 실행(기본): 바뀔 내용만 보여 주고 롤백
 *   node scripts/delete-account.mjs --email teacher@school.kr --apply        # 실제 탈퇴 처리
 *   node scripts/delete-account.mjs --user-id <uuid> --email <같은 계정 이메일> --apply
 *   node scripts/delete-account.mjs --purge-storage <projectId,projectId>    # Storage 정리만 다시(앞선 실행이 일부 실패했을 때)
 *
 * 옵션:
 *   --allow-admin   관리자(role=admin) 계정도 처리한다. 기본은 거부.
 *
 * 환경: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. 이미 설정된 환경변수가 우선이고, 없으면 server/.env에서 읽는다.
 * 선행 조건: 운영 DB에 00031이 적용되어 있어야 한다.
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { config as dotenvConfig } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { findAccount, deleteAccount, purgeProjectStorage, formatSummary } from '../server/lib/accountDeletion.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: path.join(__dirname, '..', 'server', '.env'), quiet: true })

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }

const APPLY = flag('--apply')
const EMAIL = opt('--email')
const USER_ID = opt('--user-id')
const PURGE = opt('--purge-storage')

function fail(message) {
  console.error(`오류: ${message}`)
  process.exit(1)
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_URL.includes('placeholder')) {
  fail('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다(server/.env 또는 환경변수).')
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
console.log(`대상 DB: ${new URL(SUPABASE_URL).host}`)

if (PURGE) {
  const ids = PURGE.split(',').map((s) => s.trim()).filter(Boolean)
  const { removed, failed } = await purgeProjectStorage(sb, ids)
  console.log(`Storage 파일 ${removed}개 삭제`)
  for (const f of failed) console.error(`  실패 ${f.projectId}: ${f.error}`)
  process.exit(failed.length ? 2 : 0)
}

if (!EMAIL && !USER_ID) fail('--email 또는 --user-id가 필요합니다.')
const account = await findAccount(sb, { email: EMAIL, userId: USER_ID })
if (!account) fail('계정을 찾지 못했습니다. 이미 탈퇴 처리됐을 수 있습니다.')

console.log(`대상: ${account.displayName || '이름 없음'} <${account.email || '이메일 없음'}> (id ${account.id}, 역할 ${account.role})`)
if (!account.hasProfile) console.log('  프로필이 없습니다. DB에 남은 기록이 있으면 정리하고 auth 계정을 지웁니다.')
if (!account.hasAuth) console.log('  auth 계정이 이미 없습니다. DB 기록만 정리합니다.')
if (account.role === 'admin' && !flag('--allow-admin')) fail('관리자 계정입니다. 정말 처리하려면 --allow-admin을 붙이세요.')
if (APPLY && account.email && String(EMAIL || '').toLowerCase() !== account.email.toLowerCase()) {
  fail('실제 처리(--apply)에는 요청받은 계정 이메일을 --email로 함께 적어야 합니다(확인용).')
}

const { db, storage, auth } = await deleteAccount(sb, account, { apply: APPLY })

const successorIds = (db.workspaces_transferred || []).map((t) => t.new_owner_id)
const people = new Map()
if (successorIds.length) {
  const { data, error } = await sb.from('users').select('id, email, display_name').in('id', successorIds)
  if (error) console.warn(`이관받는 사람 이름 조회 실패: ${error.message}`)
  for (const p of data || []) people.set(p.id, p)
}

console.log(APPLY ? '\n[실제 처리 결과]' : '\n[시험 실행] 아래 내용은 적용하지 않고 롤백했습니다. 실제 처리는 --apply를 붙여 다시 실행하세요.')
for (const line of formatSummary(db, people, { applied: APPLY })) console.log(line)
if (!APPLY) process.exit(0)

console.log(`Storage 파일 ${storage.removed}개 삭제`)
console.log(`auth 계정: ${{ deleted: '삭제', already_deleted: '이미 없음', absent: '처음부터 없음' }[auth]}`)
if (storage.failed.length) {
  console.error('\nStorage 정리에 실패한 프로젝트가 있습니다. 아래 명령으로 다시 실행하세요.')
  for (const f of storage.failed) console.error(`  ${f.projectId}: ${f.error}`)
  console.error(`  node scripts/delete-account.mjs --purge-storage ${storage.failed.map((f) => f.projectId).join(',')}`)
  process.exit(2)
}
console.log('\n탈퇴 처리를 마쳤습니다.')
