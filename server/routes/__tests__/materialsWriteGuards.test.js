/**
 * 자료 쓰기 가드 (2026-10-11)
 * - 열람자(viewer)는 올리기·URL 추가·재분석·삭제가 403
 * - 재분석은 분석이 진행 중이면 409 (오래 멈춘 상태는 다시 분석할 수 있다)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY

const state = vi.hoisted(() => ({ role: 'editor', row: null }))

vi.mock('../../middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, _res, next) => { req.user = { id: 'u1' }; next() },
}))

vi.mock('../../services/materialAnalyzer.js', () => ({
  analyzeMaterial: vi.fn(async () => undefined),
  analyzeUrlMaterial: vi.fn(async () => undefined),
}))

vi.mock('../../lib/supabaseService.js', () => ({
  getProject: vi.fn(async (id) => ({ id, workspace_id: 'w1' })),
  getMemberRole: vi.fn(async () => state.role),
  createMessage: vi.fn(async (row) => ({ id: 'sys', ...row })),
}))

vi.mock('../../lib/supabaseAdmin.js', () => {
  const query = () => {
    const q = {
      _insert: null,
      select() { return q },
      insert(row) { q._insert = row; return q },
      update(patch) { q._update = patch; return q },
      delete() { return q },
      eq() { return q },
      order() { return q },
      async single() {
        if (q._insert) return { data: { ...q._insert }, error: null }
        return state.row ? { data: state.row, error: null } : { data: null, error: { message: 'not found' } }
      },
      then(onFulfilled) {
        // 재분석 준비(update)는 DB 상태를 바꾼다 — 다음 요청이 바뀐 상태를 읽게 한다
        if (q._update && state.row) state.row = { ...state.row, ...q._update }
        return Promise.resolve({ data: null, error: null }).then(onFulfilled)
      },
    }
    return q
  }
  return {
    supabaseAdmin: {
      from: () => query(),
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(4) }, error: null }),
          remove: async () => ({ error: null }),
        }),
      },
    },
  }
})

const { materialsRouter, isAnalysisInProgress } = await import('../materials.js')
const { analyzeMaterial, analyzeUrlMaterial } = await import('../../services/materialAnalyzer.js')

const app = express()
app.use(express.json())
app.use('/api/materials', materialsRouter)

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString()
const row = (extra = {}) => ({
  id: 'mat-1', project_id: 'p1', file_type: 'pdf', storage_path: 'materials/p1/mat-1.pdf',
  processing_status: 'completed', created_at: minutesAgo(120), ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  state.role = 'editor'
  state.row = null
})

describe('열람자는 자료를 바꿀 수 없다', () => {
  beforeEach(() => { state.role = 'viewer' })

  it('파일 올리기 403', async () => {
    const res = await request(app).post('/api/materials/upload')
      .field('project_id', 'p1')
      .attach('file', Buffer.from('수업 메모'), { filename: 'memo.txt', contentType: 'text/plain' })
    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('열람 전용')
    expect(analyzeMaterial).not.toHaveBeenCalled()
  })
  it('URL 추가 403', async () => {
    const res = await request(app).post('/api/materials/url').send({ project_id: 'p1', url: 'https://example.com' })
    expect(res.status).toBe(403)
    expect(analyzeUrlMaterial).not.toHaveBeenCalled()
  })
  it('재분석 403', async () => {
    state.row = row({ processing_status: 'failed' })
    expect((await request(app).post('/api/materials/mat-1/reanalyze')).status).toBe(403)
    expect(analyzeMaterial).not.toHaveBeenCalled()
  })
  it('삭제 403', async () => {
    state.row = row()
    expect((await request(app).delete('/api/materials/mat-1')).status).toBe(403)
  })
  it('목록 조회는 그대로 된다', async () => {
    expect((await request(app).get('/api/materials').query({ project_id: 'p1' })).status).toBe(200)
  })
})

describe('재분석 중복 방지', () => {
  it('막 올린 자료가 아직 분석 중이면 409', async () => {
    state.row = row({ processing_status: 'parsing', created_at: minutesAgo(1) })
    const res = await request(app).post('/api/materials/mat-1/reanalyze')
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ANALYSIS_IN_PROGRESS')
    expect(analyzeMaterial).not.toHaveBeenCalled()
  })
  it('분석이 끝났거나 실패한 자료는 다시 분석한다', async () => {
    state.row = row({ processing_status: 'failed' })
    expect((await request(app).post('/api/materials/mat-1/reanalyze')).status).toBe(202)
    expect(analyzeMaterial).toHaveBeenCalledTimes(1)
  })
  it('같은 자료를 연달아 재분석하면 두 번째는 409', async () => {
    state.row = row({ id: 'mat-2', processing_status: 'completed' })
    expect((await request(app).post('/api/materials/mat-2/reanalyze')).status).toBe(202)
    state.row = row({ id: 'mat-2', processing_status: 'parsing' }) // 첫 재분석이 진행 중
    expect((await request(app).post('/api/materials/mat-2/reanalyze')).status).toBe(409)
  })
  it('같은 자료의 재분석 요청이 겹쳐 들어오면 하나만 시작한다', async () => {
    state.row = row({ id: 'mat-3', processing_status: 'failed' })
    const [a, b] = await Promise.all([
      request(app).post('/api/materials/mat-3/reanalyze'),
      request(app).post('/api/materials/mat-3/reanalyze'),
    ])
    expect([a.status, b.status].sort()).toEqual([202, 409])
    expect(analyzeMaterial).toHaveBeenCalledTimes(1)
  })
  it('isAnalysisInProgress: 15분 넘게 멈춘 상태는 진행 중으로 보지 않는다', () => {
    expect(isAnalysisInProgress(row({ id: 'x1', processing_status: 'analyzing', created_at: minutesAgo(3) }))).toBe(true)
    expect(isAnalysisInProgress(row({ id: 'x2', processing_status: 'analyzing', created_at: minutesAgo(60) }))).toBe(false)
    expect(isAnalysisInProgress(row({ id: 'x3', processing_status: 'completed', created_at: minutesAgo(1) }))).toBe(false)
    expect(isAnalysisInProgress(null)).toBe(false)
  })
})
