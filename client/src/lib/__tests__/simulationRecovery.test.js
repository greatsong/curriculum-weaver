import { beforeEach, afterEach, it, expect, vi } from 'vitest'
const get = vi.hoisted(() => vi.fn())
vi.mock('../api', () => ({ apiGet: get }))
import { recoverSimulation } from '../simulationRecovery'
beforeEach(() => { vi.useFakeTimers(); get.mockReset() })
afterEach(() => vi.useRealTimers())
it('네트워크 오류 뒤 생성 중 상태를 거쳐 완료를 복구한다', async () => {
  get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ status: 'generating' }).mockResolvedValueOnce({ status: 'simulation' })
  const result = recoverSimulation({ projectId: 'p' })
  await vi.advanceTimersByTimeAsync(10000)
  expect(await result).toEqual({ status: 'simulation' })
})
it('권한 상실은 끝없이 조회하지 않고 오류로 알린다', async () => {
  get.mockRejectedValue({ status: 403, message: '접근 불가' })
  await expect(recoverSimulation({ projectId: 'p' })).rejects.toMatchObject({ status: 403 })
  expect(get).toHaveBeenCalledTimes(1)
})
it('화면을 떠나면 더 조회하지 않는다', async () => {
  get.mockResolvedValue({ status: 'generating' })
  const controller = new AbortController()
  const result = recoverSimulation({ projectId: 'p' }, { signal: controller.signal })
  await vi.advanceTimersByTimeAsync(1)
  controller.abort()
  expect(await result).toBeNull()
  await vi.advanceTimersByTimeAsync(10000)
  expect(get).toHaveBeenCalledTimes(1)
})
it('완료 상태를 확인하지 못하면 시간 제한 후 안내한다', async () => {
  get.mockResolvedValue({ status: 'generating' })
  const check = expect(recoverSimulation({ projectId: 'p' }, { timeoutMs: 5000 })).rejects.toThrow('워크스페이스')
  await vi.advanceTimersByTimeAsync(5000)
  await check
})
