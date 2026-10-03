import crypto from 'node:crypto'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
vi.mock('../supabaseService.js', () => ({ updateProject: vi.fn(async () => ({})) }))
import { claimSimulationRun, touchSimulationRun, finishSimulationRun, expireSimulationRuns, monitorSimulationRun } from '../simulationRuns.js'
beforeEach(() => { vi.stubEnv('SUPABASE_URL', ''); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
it('같은 요청을 반복해도 생성 예약과 한도를 중복 소비하지 않는다', async () => {
  const user = crypto.randomUUID(), request = crypto.randomUUID(), scope = crypto.randomUUID()
  const results = await Promise.all(Array.from({ length: 12 }, () => claimSimulationRun(user, request, scope)))
  expect(results.filter(r => r.kind === 'claimed')).toHaveLength(1)
  expect(results.filter(r => r.kind === 'existing')).toHaveLength(11)
  expect((await claimSimulationRun(user, request, '다른 입력')).kind).toBe('conflict')
})
it('서버가 중단돼 임대가 만료되면 재실행 가능하며 이전 작업은 성공할 수 없다', async () => {
  const user = crypto.randomUUID(), scope = crypto.randomUUID()
  const first = await claimSimulationRun(user, crypto.randomUUID(), scope)
  await vi.advanceTimersByTimeAsync(300001)
  await expireSimulationRuns()
  expect(await touchSimulationRun(first.id)).toBe(false)
  expect(await finishSimulationRun(first.id, true)).toBe(false)
  expect((await claimSimulationRun(user, crypto.randomUUID(), scope)).kind).toBe('claimed')
})
it('하트비트가 있어도 최대 실행 시간을 넘으면 AI 중단 신호를 보낸다', async () => {
  const run = await claimSimulationRun(crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID())
  const monitor = monitorSimulationRun(run.id)
  try {
    await vi.advanceTimersByTimeAsync(1800001)
    expect(monitor.signal.aborted).toBe(true)
    await expect(monitor.assertActive()).rejects.toThrow('만료')
    expect(await finishSimulationRun(run.id, true)).toBe(false)
  } finally { monitor.stop() }
})
