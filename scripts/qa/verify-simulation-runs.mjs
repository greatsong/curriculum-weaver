/** 실제 Supabase 실행 예약 검증. --live-verify 명시 필요, 생성한 QA 행만 정리한다. */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
if (!process.argv.includes('--live-verify')) throw new Error('실제 DB 검증은 --live-verify 인자가 필요합니다.')
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const users = Array.from({ length: 5 }, () => crypto.randomUUID())
const projects = []
let checks = 0
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log(`PASS ${label}`) }
async function rpc(name, args = {}) { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data }
const claim = (user, request, scope) => rpc('claim_simulation_run', { p_user: user, p_request: request, p_scope: scope })
const finish = (id, success, procedure = null) => rpc('finish_simulation_run', { p_id: id, p_success: success, p_procedure: procedure })
async function fixture(run) {
  const { data, error } = await db.from('projects').insert({ title: `[자동검증] simulation-runs ${run.id}`, status: 'generating' }).select('id').single()
  if (error) throw error
  projects.push(data.id)
  assert.equal(await rpc('touch_simulation_run', { p_id: run.id, p_project: data.id }), true)
  return data.id
}
async function project(id) { const r = await db.from('projects').select('status,current_procedure').eq('id', id).single(); if(r.error) throw r.error; return r.data }
try {
  const quota = await Promise.all(Array.from({ length: 12 }, () => claim(users[0], crypto.randomUUID(), `qa:${crypto.randomUUID()}`)))
  check(quota.filter(r => r.kind === 'claimed').length === 10 && quota.filter(r => r.kind === 'quota').length === 2, '12개 동시 요청 중 일일 한도 10개만 예약')
  const request = crypto.randomUUID(), scope = `qa:${crypto.randomUUID()}`
  const same = await Promise.all(Array.from({ length: 8 }, () => claim(users[1], request, scope)))
  check(same.filter(r => r.kind === 'claimed').length === 1 && same.filter(r => r.kind === 'existing').length === 7, '동일 요청 8개가 예약 1건으로 합쳐짐')
  check((await claim(users[1], request, 'qa:changed-input')).kind === 'conflict', '같은 요청 ID의 입력 변경 거절')
  const run = same.find(r => r.kind === 'claimed')
  const pid = await fixture(run)
  check(await finish(run.id, true, 'E-2-1'), '성공 종료')
  const completed = await project(pid)
  check(completed.status === 'simulation' && completed.current_procedure === 'E-2-1', '작업과 프로젝트 완료 상태를 함께 확정')
  const fresh = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const replay = await fresh.rpc('claim_simulation_run', { p_user: users[1], p_request: request, p_scope: scope })
  if (replay.error) throw replay.error
  check(replay.data.kind === 'existing' && replay.data.projectId === pid && replay.data.status === 'succeeded', '새 연결에서도 완료 요청과 결과 ID 복구')
  const sharedScope = `qa:${crypto.randomUUID()}`
  const duplicates = await Promise.all([claim(users[2], crypto.randomUUID(), sharedScope), claim(users[3], crypto.randomUUID(), sharedScope)])
  check(duplicates.filter(r => r.kind === 'claimed').length === 1 && duplicates.filter(r => r.kind === 'busy').length === 1, '다른 사용자·서버의 같은 원본 동시 생성 차단')
  const expired = duplicates.find(r => r.kind === 'claimed'), expiredProject = await fixture(expired)
  const content = { note: '복구 후에도 보존할 시험 결과' }
  const board = await db.from('designs').insert({ project_id: expiredProject, procedure_code: 'prep', content })
  if (board.error) throw board.error
  const update = await db.from('simulation_runs').update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq('id', expired.id)
  if (update.error) throw update.error
  await rpc('expire_simulation_runs')
  check((await project(expiredProject)).status === 'failed', '중단된 실행의 프로젝트가 생성 중에서 실패로 복구')
  check(!await rpc('touch_simulation_run', { p_id: expired.id, p_project: null }) && !await finish(expired.id, true), '만료된 이전 서버는 재개·완료할 수 없음')
  const preserved = await db.from('designs').select('content').eq('project_id', expiredProject).single()
  check(!preserved.error && preserved.data.content.note === content.note, '실패 복구 후 부분 결과 보존')
  check((await claim(users[4], crypto.randomUUID(), sharedScope)).kind === 'claimed', '실패 복구 후 같은 원본 재시도 허용')
  const anonymous = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  check(!!(await anonymous.rpc('claim_simulation_run', { p_user: users[0], p_request: crypto.randomUUID(), p_scope: scope })).error, '브라우저 익명 키의 실행 예약 RPC 접근 차단')
  console.log(`${checks} live DB checks passed`)
} finally {
  const removed = await db.from('simulation_runs').delete().in('user_id', users)
  if (removed.error) throw removed.error
  if (projects.length) {
    const removedProjects = await db.from('projects').delete().in('id', projects)
    if (removedProjects.error) throw removedProjects.error
  }
  console.log('이번 검증에서 생성한 QA 행 정리 완료')
}
