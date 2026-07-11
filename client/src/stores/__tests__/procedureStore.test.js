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
  apiDelete: vi.fn(),
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
import { useToastStore } from '../toastStore.js'
import {
  apiUploadFile,
  apiGetMaterialAnalysis,
  apiPost,
  apiDelete,
} from '../../lib/api'
import { socket } from '../../lib/socket'

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

describe('startMaterialPolling — 완료/실패 전역 토스트', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })

  // 즉시 실행되는 1회차 tick만 검증한다 — 타이머를 진전시키지 않고 마이크로태스크만
  // 흘려보내면, 토스트 자동 소멸 setTimeout(6초)이 실행되지 않아 push 직후 상태를 볼 수 있다.
  const flushMicrotasks = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  }

  it('analyzing → completed 전이 시 success 토스트를 띄운다', async () => {
    vi.useFakeTimers()
    useProcedureStore.setState({
      materials: [{ id: 't1', file_name: 'plan.pdf', processing_status: 'analyzing' }],
    })
    apiGetMaterialAnalysis.mockResolvedValue({
      material: { id: 't1', file_name: 'plan.pdf', processing_status: 'completed' },
      analysis: { summary: 'done' },
    })

    useProcedureStore.getState().startMaterialPolling('t1')
    await flushMicrotasks()

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].kind).toBe('success')
    expect(toasts[0].message).toContain('plan.pdf')
    vi.useRealTimers()
  })

  it('parsing → failed 전이 시 error 토스트를 띄운다', async () => {
    vi.useFakeTimers()
    useProcedureStore.setState({
      materials: [{ id: 't2', file_name: 'bad.pdf', processing_status: 'parsing' }],
    })
    apiGetMaterialAnalysis.mockResolvedValue({
      material: { id: 't2', file_name: 'bad.pdf', processing_status: 'failed' },
      analysis: null,
    })

    useProcedureStore.getState().startMaterialPolling('t2')
    await flushMicrotasks()

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].kind).toBe('error')
    vi.useRealTimers()
  })

  it('이미 completed였던 자료를 다시 폴링해도 토스트가 중복되지 않는다', async () => {
    vi.useFakeTimers()
    useProcedureStore.setState({
      materials: [{ id: 't3', file_name: 'done.pdf', processing_status: 'completed' }],
    })
    apiGetMaterialAnalysis.mockResolvedValue({
      material: { id: 't3', file_name: 'done.pdf', processing_status: 'completed' },
      analysis: { summary: 'done' },
    })

    useProcedureStore.getState().startMaterialPolling('t3')
    await flushMicrotasks()

    expect(useToastStore.getState().toasts).toHaveLength(0)
    vi.useRealTimers()
  })
})

describe('절차 스킵 — 상태·액션·실시간 동기화', () => {
  it('setSkips로 초기화하고 isSkipped로 조회한다', () => {
    const store = useProcedureStore.getState()
    store.setSkips([{ procedure_code: 'T-2-2', reason: '이미 있음' }])
    expect(useProcedureStore.getState().isSkipped('T-2-2')).toBe(true)
    expect(useProcedureStore.getState().isSkipped('T-2-3')).toBe(false)
  })

  it('skipProcedure: API 응답의 skips로 교체하고, 커서 보정을 따라간다', async () => {
    apiPost.mockResolvedValue({
      skips: [{ procedure_code: 'T-2-2' }],
      current_procedure: 'T-2-3',
    })
    const store = useProcedureStore.getState()
    store.setProcedure('T-2-2')
    await store.skipProcedure('proj-1', 'T-2-2', '사유')

    expect(apiPost).toHaveBeenCalledWith(
      '/api/projects/proj-1/procedures/T-2-2/skip', { reason: '사유' }
    )
    const state = useProcedureStore.getState()
    expect(state.skippedProcedures).toHaveLength(1)
    // 내가 보던 절차가 스킵됨 → 서버 보정 커서로 이동
    expect(state.currentProcedure).toBe('T-2-3')
  })

  it('skipProcedure: 다른 절차를 보고 있으면 커서를 건드리지 않는다', async () => {
    apiPost.mockResolvedValue({
      skips: [{ procedure_code: 'Ds-2-2' }],
      current_procedure: 'A-1-1',
    })
    const store = useProcedureStore.getState()
    store.setProcedure('A-1-1')
    await store.skipProcedure('proj-1', 'Ds-2-2')
    expect(useProcedureStore.getState().currentProcedure).toBe('A-1-1')
  })

  it('unskipProcedure: 목록에서 제거되고 introCache가 무효화된다', async () => {
    const { useChatStore } = await import('../chatStore.js')
    useChatStore.setState({ introCache: { 'T-2-2': '옛 인트로', 'A-1-1': '유지' } })
    apiDelete.mockResolvedValue({ skips: [], current_procedure: 'A-1-1' })

    const store = useProcedureStore.getState()
    store.setSkips([{ procedure_code: 'T-2-2' }])
    await store.unskipProcedure('proj-1', 'T-2-2')

    expect(apiDelete).toHaveBeenCalledWith('/api/projects/proj-1/procedures/T-2-2/skip')
    expect(useProcedureStore.getState().skippedProcedures).toHaveLength(0)
    // 스킵 전 캐시된 옛 맥락 인트로가 재생되지 않도록 해당 절차만 제거
    expect(useChatStore.getState().introCache['T-2-2']).toBeUndefined()
    expect(useChatStore.getState().introCache['A-1-1']).toBe('유지')
  })

  it('procedure_skips_changed 소켓 이벤트가 스킵 목록을 동기화한다', () => {
    const store = useProcedureStore.getState()
    store.subscribeBoardUpdates('proj-1')

    const call = socket.on.mock.calls.find(([event]) => event === 'procedure_skips_changed')
    expect(call).toBeTruthy()

    const handler = call[1]
    handler({ skips: [{ procedure_code: 'T-2-2' }], current_procedure: 'T-2-3' })
    expect(useProcedureStore.getState().skippedProcedures).toHaveLength(1)

    // 구독 해제 시 off 등록 확인
    store.unsubscribeBoardUpdates()
    const offCall = socket.off.mock.calls.find(([event]) => event === 'procedure_skips_changed')
    expect(offCall).toBeTruthy()
  })

  it('원격 스킵은 내 화면(로컬 뷰)을 강제 이동시키지 않는다 — 편집 초안 유실 방지', () => {
    const store = useProcedureStore.getState()
    store.setProcedure('T-2-2') // 내가 T-2-2를 보며 작업 중
    store.subscribeBoardUpdates('proj-1')

    const handler = socket.on.mock.calls.find(([event]) => event === 'procedure_skips_changed')[1]
    // 다른 호스트가 내가 보던 절차를 스킵 (서버는 팀 커서를 T-2-3으로 보정해 내려줌)
    handler({ skips: [{ procedure_code: 'T-2-2' }], current_procedure: 'T-2-3' })

    // 스킵 목록은 동기화되되, 내 화면은 그대로 (생략 배너·읽기전용으로만 전환)
    expect(useProcedureStore.getState().skippedProcedures).toHaveLength(1)
    expect(useProcedureStore.getState().currentProcedure).toBe('T-2-2')
    store.unsubscribeBoardUpdates()
  })

  it('reset()이 스킵 목록을 비운다 (프로젝트 전환 시 잔존 방지)', () => {
    const store = useProcedureStore.getState()
    store.setSkips([{ procedure_code: 'T-2-2' }])
    store.reset()
    expect(useProcedureStore.getState().skippedProcedures).toEqual([])
  })
})
