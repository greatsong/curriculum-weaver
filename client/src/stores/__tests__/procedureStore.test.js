/**
 * procedureStore 단위 테스트 (자료 업로드 + 폴링)
 *
 * 대상:
 *   - uploadMaterial: 낙관적 업데이트 → tempId → 실제 material 교체 (성공) / 제거 (실패)
 *   - startMaterialPolling: COMPLETED/FAILED 시 clearInterval, 동일 id 중복 방지
 *
 * 외부 의존성(api/socket)은 vi.mock으로 차단.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// api/socket을 먼저 mock — store import 전에 등록되어야 함
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiUploadFile: vi.fn(),
  apiGetMaterialAnalysis: vi.fn(),
  apiReanalyzeMaterial: vi.fn(),
  apiDeleteMaterial: vi.fn(),
}))

vi.mock('../../lib/socket', () => ({
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}))

import { useProcedureStore } from '../procedureStore.js'
import {
  apiUploadFile,
  apiGetMaterialAnalysis,
} from '../../lib/api'

beforeEach(() => {
  // 각 테스트 전 store 리셋
  useProcedureStore.getState().reset()
  vi.clearAllMocks()
})

afterEach(() => {
  // 폴링 타이머 흔적 제거
  useProcedureStore.getState().stopAllMaterialPolling()
})

describe('uploadMaterial — 낙관적 업데이트 & 롤백', () => {
  it('성공 시 tempId 항목이 서버 material로 교체된다', async () => {
    const serverMaterial = {
      id: 'srv-abc',
      project_id: 'proj-1',
      file_name: 'plan.pdf',
      file_type: 'pdf',
      processing_status: 'pending',
      created_at: new Date().toISOString(),
    }
    apiUploadFile.mockResolvedValue({ material: serverMaterial })
    // 폴링이 시작되면 즉시 completed 응답 → 1회 후 종료
    apiGetMaterialAnalysis.mockResolvedValue({
      material: { ...serverMaterial, processing_status: 'completed' },
      analysis: { summary: 'ok' },
    })

    const fakeFile = {
      name: 'plan.pdf',
      size: 1024,
      type: 'application/pdf',
    }

    const promise = useProcedureStore.getState().uploadMaterial('proj-1', fakeFile, 'reference')

    // 업로드 중에는 낙관적 항목이 존재해야 한다
    const during = useProcedureStore.getState().materials
    expect(during).toHaveLength(1)
    expect(during[0]._uploading).toBe(true)
    expect(during[0].id).toMatch(/^temp-/)

    const result = await promise
    expect(result).toEqual(serverMaterial)

    const after = useProcedureStore.getState().materials
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe('srv-abc')
    expect(after[0]._uploading).toBeUndefined()
  })

  it('실패 시 낙관적 항목이 제거되고 에러가 re-throw된다', async () => {
    const err = new Error('서버 500')
    apiUploadFile.mockRejectedValue(err)

    const fakeFile = { name: 'x.pdf', size: 10, type: 'application/pdf' }

    await expect(
      useProcedureStore.getState().uploadMaterial('proj-1', fakeFile)
    ).rejects.toThrow('서버 500')

    const after = useProcedureStore.getState().materials
    expect(after).toHaveLength(0)
  })
})

describe('startMaterialPolling — 종료 조건과 중복 방지', () => {
  it('COMPLETED 응답 시 clearInterval되어 더 이상 tick하지 않는다', async () => {
    vi.useFakeTimers()
    // 초기에 목록에 항목이 있어야 폴링 업데이트가 반영됨
    useProcedureStore.setState({
      materials: [{ id: 'm1', processing_status: 'analyzing' }],
    })

    apiGetMaterialAnalysis.mockResolvedValue({
      material: { id: 'm1', processing_status: 'completed' },
      analysis: { summary: 'done' },
    })

    useProcedureStore.getState().startMaterialPolling('m1')

    // 즉시 1회 tick이 실행됨 — 마이크로태스크 flush
    await vi.runOnlyPendingTimersAsync()
    await Promise.resolve()
    await Promise.resolve()

    expect(apiGetMaterialAnalysis).toHaveBeenCalledTimes(1)

    // 타이머가 clear되어야 하므로 3초 전진해도 추가 호출이 없어야 함
    await vi.advanceTimersByTimeAsync(10_000)
    expect(apiGetMaterialAnalysis).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('FAILED 응답 시에도 clearInterval되어 추가 tick이 없다', async () => {
    vi.useFakeTimers()
    useProcedureStore.setState({
      materials: [{ id: 'm2', processing_status: 'parsing' }],
    })
    apiGetMaterialAnalysis.mockResolvedValue({
      material: { id: 'm2', processing_status: 'failed', processing_error: 'AI_TIMEOUT: ...' },
      analysis: null,
    })

    useProcedureStore.getState().startMaterialPolling('m2')
    await vi.runOnlyPendingTimersAsync()
    await Promise.resolve()
    await Promise.resolve()

    expect(apiGetMaterialAnalysis).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(apiGetMaterialAnalysis).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('동일 id로 중복 호출해도 폴링은 1회만 등록된다', async () => {
    vi.useFakeTimers()
    useProcedureStore.setState({
      materials: [{ id: 'dup', processing_status: 'analyzing' }],
    })
    // 첫 tick은 여전히 analyzing → 종료되지 않음
    apiGetMaterialAnalysis.mockResolvedValue({
      material: { id: 'dup', processing_status: 'analyzing' },
      analysis: null,
    })

    const store = useProcedureStore.getState()
    store.startMaterialPolling('dup')
    store.startMaterialPolling('dup') // 두 번째 호출은 무시되어야 함
    store.startMaterialPolling('dup')

    // 즉시 tick 1회가 각 등록마다 실행되면 3회가 되지만, 중복 방지로 1회만 호출되어야 한다
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(apiGetMaterialAnalysis).toHaveBeenCalledTimes(1)

    // stopAll로 정리
    store.stopAllMaterialPolling()
    vi.useRealTimers()
  })
})
