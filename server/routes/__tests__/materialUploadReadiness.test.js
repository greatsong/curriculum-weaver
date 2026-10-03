import { beforeEach, afterEach, it, expect, vi } from 'vitest'
const state = vi.hoisted(() => ({ failDB: false, failStorage: false, failUpdate: false, row: null, analyze: vi.fn(), remove: vi.fn(), emit: vi.fn(), active: false }))
vi.mock('../../services/materialAnalyzer.js', () => ({ analyzeMaterial: state.analyze, analyzeUrlMaterial: state.analyze }))
vi.mock('../../lib/supabaseService.js', () => ({ getProject: async id => ({ id }), getMemberRole: async () => 'owner', createMessage: vi.fn() }))
vi.mock('../../lib/supabaseAdmin.js', () => ({ supabaseAdmin: {
  from: () => {
    const q = { insert: row => { state.row = row; return q }, select: () => q, update: patch => { if (!state.failDB) state.row = { ...state.row, ...patch }; return q }, eq: () => q,
      then: resolve => Promise.resolve({ error: state.failUpdate ? new Error('update failure') : null }).then(resolve),
      single: async () => ({ data: state.failDB ? null : state.row, error: state.failDB ? new Error('DB failure') : null }) }
    return q
  },
  storage: { from: () => ({ upload: async () => ({ error: state.failStorage ? new Error('Storage failure') : null }), remove: state.remove }) },
} }))
import { materialsRouter } from '../materials.js'

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.invalid'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test')
  state.failDB = false; state.failStorage = false; state.failUpdate = false; state.row = null; state.active = false
  state.analyze.mockReset().mockResolvedValue(undefined); state.remove.mockReset().mockResolvedValue({ error: null }); state.emit.mockReset()
  vi.stubGlobal('__cwIo', { to: () => ({ emit: state.emit }) })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const handler = (path, method) => materialsRouter.stack.find(l => l.route?.path === path && l.route.methods[method]).route.stack.at(-1).handle
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
const req = ext => ({ user: { id: 'teacher' }, body: { project_id: 'project' }, file: { originalname: `lesson.${ext}`, buffer: Buffer.from('# 수업 자료'), mimetype: 'text/plain', size: 20 } })

it('정상 Markdown 자료를 저장하고 분석한다', async () => {
  const res = response(); await handler('/upload', 'post')(req('md'), res)
  expect(res.statusCode).toBe(201); expect(state.analyze).toHaveBeenCalledOnce()
  expect(state.emit).toHaveBeenCalledWith('material_updated', expect.objectContaining({ file_type: 'md' }))
})
it('DB 저장 실패는 성공으로 표시하지 않고 원본을 정리한다', async () => {
  state.failDB = true
  const res = response(); await handler('/upload', 'post')(req('txt'), res)
  expect(res.statusCode).toBe(503); expect(state.remove).toHaveBeenCalledOnce(); expect(state.analyze).not.toHaveBeenCalled()
})
it('원본 저장 실패는 업로드 재시도를 안내한다', async () => {
  state.failStorage = true
  const res = response(); await handler('/upload', 'post')(req('txt'), res)
  expect(res.statusCode).toBe(503); expect(state.analyze).not.toHaveBeenCalled()
})
it('URL 자료도 DB 저장 실패를 업로드 성공으로 표시하지 않는다', async () => {
  state.failDB = true
  const res = response(); await handler('/url', 'post')({ user: { id: 'teacher' }, body: { project_id: 'project', url: 'https://example.com' } }, res)
  expect(res.statusCode).toBe(503); expect(state.analyze).not.toHaveBeenCalled()
})
it('재분석 예약 전에 이전 완료 결과를 지우고 상태를 저장한다', async () => {
  state.row = { id: 'one', project_id: 'project', file_type: 'url', storage_path: 'https://example.com', processing_status: 'completed', ai_analysis: { summary: '이전 요약' } }
  const res = response(); await handler('/:id/reanalyze', 'post')({ user: { id: 'teacher' }, params: { id: 'one' } }, res)
  expect(res.statusCode).toBe(202)
  expect(state.row.processing_status).toBe('parsing'); expect(state.row.ai_analysis).toBeNull()
  expect(state.analyze).toHaveBeenCalledOnce()
})

it('재분석 상태 저장 실패 시 AI를 실행하거나 성공 응답을 보내지 않는다', async () => {
  state.failUpdate = true
  state.row = { id: 'one', project_id: 'project', file_type: 'url', storage_path: 'https://example.com', processing_status: 'completed' }
  const res = response(); await handler('/:id/reanalyze', 'post')({ user: { id: 'teacher' }, params: { id: 'one' } }, res)
  expect(res.statusCode).toBe(503)
  expect(state.analyze).not.toHaveBeenCalled()
})
