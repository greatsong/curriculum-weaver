import { beforeEach, afterEach, it, expect, vi } from 'vitest'
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(),
  apiUploadFile: vi.fn(), apiGetMaterialAnalysis: vi.fn(), apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }))
import { useProcedureStore as store } from '../procedureStore.js'
import { apiGetMaterialAnalysis, apiDeleteMaterial, apiGet, apiUploadFile, apiReanalyzeMaterial } from '../../lib/api'
import { socket } from '../../lib/socket'

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks()
  store.getState().reset()
  store.setState({ _materialsProjectId: 'project', materials: [{ id: 'one', project_id: 'project', processing_status: 'analyzing' }] })
})
afterEach(() => { store.getState().stopAllMaterialPolling(); vi.clearAllTimers(); vi.useRealTimers() })

it('느린 조회가 끝날 때까지 다음 요청을 보내지 않는다', async () => {
  apiGetMaterialAnalysis.mockImplementation(() => new Promise(() => {}))
  store.getState().startMaterialPolling('one')
  await vi.advanceTimersByTimeAsync(9000)
  expect(apiGetMaterialAnalysis).toHaveBeenCalledTimes(1)
})

it('6개 자료가 같은 상태로 대기해도 분당 요청 수가 일반 API 한도를 소진하지 않는다', async () => {
  store.setState({ materials: Array.from({ length: 6 }, (_, i) => ({ id: String(i), processing_status: 'analyzing' })) })
  apiGetMaterialAnalysis.mockImplementation(async id => ({ material: { id, processing_status: 'analyzing' } }))
  for (const row of store.getState().materials) store.getState().startMaterialPolling(row.id)
  await vi.advanceTimersByTimeAsync(60000)
  expect(apiGetMaterialAnalysis.mock.calls.length).toBeLessThanOrEqual(42)
})

it('협업 완료 이벤트 뒤 도착한 이전 조회가 완료를 되돌리지 않는다', async () => {
  let finish
  apiGetMaterialAnalysis.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  store.getState().subscribeBoardUpdates()
  store.getState().startMaterialPolling('one')
  socket.on.mock.calls.find(([name]) => name === 'material_updated')[1]({ id: 'one', project_id: 'project', processing_status: 'completed', ai_analysis: { summary: '완료' } })
  finish({ material: { id: 'one', processing_status: 'analyzing' }, analysis: null })
  await vi.advanceTimersByTimeAsync(9000)
  expect(store.getState().materials[0].processing_status).toBe('completed')
  expect(apiGetMaterialAnalysis).toHaveBeenCalledTimes(1)
})

it('조회가 멈추면 상태 확인 필요를 표시하고 사용자가 조회를 재개할 수 있다', async () => {
  apiGetMaterialAnalysis.mockRejectedValue(new Error('연결 실패'))
  store.getState().startMaterialPolling('one')
  await vi.advanceTimersByTimeAsync(600000)
  expect(store.getState().materials[0]._statusUnavailable).toBe(true)
  expect(store.getState().materials[0]._error).toContain('상태 확인')
  apiGetMaterialAnalysis.mockResolvedValue({ material: { id: 'one', processing_status: 'completed' }, analysis: { summary: '완료' } })
  store.getState().startMaterialPolling('one')
  await vi.advanceTimersByTimeAsync(0)
  expect(store.getState().materials[0].processing_status).toBe('completed')
  expect(store.getState().materials[0]._statusUnavailable).toBe(false)
})

it('자료 삭제 실패는 다른 자료 변경을 보존하며 상태 조회를 재개한다', async () => {
  apiGetMaterialAnalysis.mockResolvedValue({ material: { id: 'one', processing_status: 'analyzing' } })
  store.getState().startMaterialPolling('one')
  await vi.advanceTimersByTimeAsync(0)
  let fail
  apiDeleteMaterial.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject }))
  const deletion = store.getState().deleteMaterial('one')
  const rejected = expect(deletion).rejects.toThrow('실패')
  store.setState({ materials: [{ id: 'two', processing_status: 'completed' }] })
  fail(new Error('실패')); await rejected
  const count = apiGetMaterialAnalysis.mock.calls.length
  await vi.advanceTimersByTimeAsync(6000)
  expect(store.getState().materials.map(m => m.id)).toEqual(['one', 'two'])
  expect(apiGetMaterialAnalysis.mock.calls.length).toBeGreaterThan(count)
})

it('프로젝트 이동 후 이전 프로젝트 목록 응답은 버린다', async () => {
  let finish
  apiGet.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValue({ materials: [{ id: 'new', project_id: 'new-project', processing_status: 'completed' }] })
  const pending = store.getState().loadMaterials('old-project')
  store.getState().reset()
  await store.getState().loadMaterials('new-project')
  finish({ materials: [{ id: 'old', project_id: 'old-project', processing_status: 'completed' }] })
  await pending
  expect(store.getState().materials[0].id).toBe('new')
})

it('자료 목록 조회 중 도착한 완료 이벤트와 새 자료를 늦은 목록으로 덮어쓰지 않는다', async () => {
  let finish
  apiGet.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = store.getState().loadMaterials('project')
  store.getState().applyMaterialUpdate({ id: 'one', project_id: 'project', processing_status: 'completed' })
  store.getState().applyMaterialUpdate({ id: 'two', project_id: 'project', processing_status: 'completed' })
  finish({ materials: [{ id: 'one', project_id: 'project', processing_status: 'analyzing' }] })
  await pending
  expect(store.getState().materials.map(m => m.id)).toEqual(['two', 'one'])
  expect(store.getState().materials.every(m => m.processing_status === 'completed')).toBe(true)
})

it('동료의 자료는 현재 프로젝트에만 추가하고 중첩된 레거시 이벤트도 처리한다', () => {
  store.getState().subscribeBoardUpdates()
  const listener = socket.on.mock.calls.find(([name]) => name === 'material_updated')[1]
  listener({ material: { id: 'two', project_id: 'project', processing_status: 'completed' } })
  listener({ id: 'other', project_id: 'other-project', processing_status: 'completed' })
  expect(store.getState().materials.map(m => m.id)).toEqual(['two', 'one'])
})

it('실시간 추가가 업로드 응답보다 빨라도 자료를 중복 표시하지 않는다', async () => {
  let finish
  apiUploadFile.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = store.getState().uploadMaterial('project', { name: '자료.txt', size: 10 })
  const material = { id: 'new', project_id: 'project', processing_status: 'completed' }
  store.getState().applyMaterialUpdate(material)
  finish({ material: { ...material, processing_status: 'pending' } }); await pending
  expect(store.getState().materials.filter(m => m.id === 'new')).toHaveLength(1)
  expect(store.getState().materials.find(m => m.id === 'new').processing_status).toBe('completed')
})

it('재분석 시작은 이전 요약을 지우고 이전 조회 응답을 무시한다', async () => {
  let finishOld
  apiGetMaterialAnalysis.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    .mockResolvedValue({ material: { id: 'one', processing_status: 'analyzing' } })
  store.getState().startMaterialPolling('one')
  store.setState({ materials: [{ id: 'one', project_id: 'project', processing_status: 'failed', ai_summary: '이전 요약' }] })
  apiReanalyzeMaterial.mockResolvedValue({ material: { id: 'one', processing_status: 'pending' } })
  await store.getState().reanalyzeMaterial('one')
  finishOld({ material: { id: 'one', processing_status: 'completed', ai_summary: '이전 요약' } })
  await vi.advanceTimersByTimeAsync(0)
  expect(store.getState().materials[0].ai_summary).toBeNull()
  expect(store.getState().materials[0].processing_status).toBe('analyzing')
})
