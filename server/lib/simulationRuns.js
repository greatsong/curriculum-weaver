import crypto from 'node:crypto'
import { supabaseAdmin } from './supabaseAdmin.js'

const localRuns = new Map()
const hasDatabase = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
async function rpc(name, args) {
  const { data, error } = await supabaseAdmin.rpc(name, args)
  if (error) throw new Error(`시뮬레이션 작업 저장소 오류: ${error.message}`)
  return data
}
export async function expireSimulationRuns() {
  if (hasDatabase()) return rpc('expire_simulation_runs', {})
  for (const r of localRuns.values()) if (r.status === 'running' && Math.min(r.lease, r.deadline) <= Date.now()) r.status = 'failed'
}
export async function claimSimulationRun(userId, requestId, scope) {
  if (hasDatabase()) return rpc('claim_simulation_run', { p_user: userId, p_request: requestId, p_scope: scope })
  await expireSimulationRuns()
  const existing = [...localRuns.values()].find(r => r.userId === userId && r.requestId === requestId)
  if (existing && existing.scope !== scope) return { kind: 'conflict' }
  if (existing) return { kind: 'existing', id: existing.id, projectId: existing.projectId, status: existing.status }
  const active = [...localRuns.values()].find(r => r.scope === scope && r.status === 'running')
  if (active) return { kind: 'busy', projectId: active.projectId, status: active.status }
  const day = new Date().toISOString().slice(0, 10)
  if ([...localRuns.values()].filter(r => r.userId === userId && r.day === day).length >= 10) return { kind: 'quota' }
  const id = crypto.randomUUID(), now = Date.now()
  localRuns.set(id, { id, userId, requestId, scope, day, status: 'running', lease: now + 300000, deadline: now + 1800000 })
  return { kind: 'claimed', id }
}
export async function touchSimulationRun(id, projectId = null) {
  if (hasDatabase()) return rpc('touch_simulation_run', { p_id: id, p_project: projectId })
  const r = localRuns.get(id), now = Date.now()
  if (!r || r.status !== 'running' || Math.min(r.lease, r.deadline) <= now) return false
  r.lease = Math.min(now + 300000, r.deadline); if (projectId) r.projectId = projectId
  return true
}
export async function finishSimulationRun(id, success, procedure = null) {
  if (hasDatabase()) return rpc('finish_simulation_run', { p_id: id, p_success: success, p_procedure: procedure })
  const r = localRuns.get(id)
  if (!r || r.status !== 'running' || (success && Math.min(r.lease, r.deadline) <= Date.now())) return false
  if (r.projectId) {
    const { updateProject } = await import('./supabaseService.js')
    await updateProject(r.projectId, { status: success ? 'simulation' : 'failed', ...(procedure && success ? { current_procedure: procedure } : {}) })
  }
  r.status = success ? 'succeeded' : 'failed'
  return true
}
// 화면 연결과 독립적으로 유지한다. 만료된 이전 작업은 저장 전에 중단한다.
export function monitorSimulationRun(id) {
  let lost = false, pending = false
  const controller = new AbortController()
  const assertActive = async (projectId = null) => {
    if (lost || !await touchSimulationRun(id, projectId)) { lost = true; controller.abort(); throw new Error('시뮬레이션 작업의 실행 시간이 만료되었습니다.') }
  }
  const timer = setInterval(async () => {
    if (pending) return
    pending = true
    try { await assertActive() } catch { lost = true; controller.abort() } finally { pending = false }
  }, 30000)
  timer.unref?.()
  return { assertActive, signal: controller.signal, stop: () => clearInterval(timer) }
}
export function startSimulationRecovery() {
  const recover = () => expireSimulationRuns().catch(e => console.error('[simulation recovery]', e.message))
  recover()
  const timer = setInterval(recover, 60000); timer.unref?.()
  return () => clearInterval(timer)
}
