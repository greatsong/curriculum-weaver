import { beforeEach, afterEach, it, expect, vi } from 'vitest'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../supabaseAdmin.js', () => ({ supabaseAdmin: { rpc } }))
import { claimSimulationRun, monitorSimulationRun } from '../simulationRuns.js'
beforeEach(() => { vi.stubEnv('SUPABASE_URL', 'https://test.invalid'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test'); rpc.mockReset() })
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
it('DB 장애 시 메모리 예약으로 우회하여 중복 생성을 허용하지 않는다', async () => {
  rpc.mockResolvedValue({ error: { message: 'database offline' } })
  await expect(claimSimulationRun('user', 'request', 'scope')).rejects.toThrow('작업 저장소 오류')
})
it('하트비트가 DB에서 거절되면 공급자 요청도 중단한다', async () => {
  vi.useFakeTimers()
  rpc.mockResolvedValue({ data: false, error: null })
  const monitor = monitorSimulationRun('run')
  try {
    await vi.advanceTimersByTimeAsync(30000)
    expect(monitor.signal.aborted).toBe(true)
    await expect(monitor.assertActive()).rejects.toThrow('만료')
  } finally { monitor.stop() }
})
