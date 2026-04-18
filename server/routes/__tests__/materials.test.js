/**
 * POST /api/materials/upload 및 GET /:id/analysis 통합 테스트
 *
 * supertest로 Express 앱에 직접 요청을 보내며 Supabase/Anthropic은 mock.
 * multer + file-type(매직바이트 검증) 경로를 실제로 통과시키기 위해
 *   - PDF 더미는 실제 매직바이트("%PDF-1.4 ...")를 포함
 *   - 분석 파이프라인(analyzeMaterial)은 mock하여 비동기 AI 호출을 차단
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'

// ── 모킹 ───────────────────────────────────────────────
// 분석 파이프라인은 네트워크/AI 차단용으로 no-op 처리
vi.mock('../../services/materialAnalyzer.js', () => ({
  analyzeMaterial: vi.fn(async () => undefined),
}))

// Supabase Admin 전체를 체이너블 스텁으로 교체
//   - from('materials').insert(...).select().single() → { data: row, error: null }
//   - from('materials').select('*').eq('id', ...).single() → 테스트별 컨트롤
//   - storage.from('materials').upload(...) → 성공
const supabaseState = {
  insertResolve: null,  // beforeEach에서 설정
  fetchRow: null,       // analysis GET 시 반환할 row
}

vi.mock('../../lib/supabaseAdmin.js', () => {
  const buildQuery = (table) => {
    const q = {
      _table: table,
      _filters: {},
      _columns: null,
      select: vi.fn(function (cols) { this._columns = cols; return this }),
      insert: vi.fn(function (row) { this._insertRow = row; return this }),
      update: vi.fn(function (patch) { this._updatePatch = patch; return this }),
      delete: vi.fn(function () { return this }),
      eq: vi.fn(function (k, v) { this._filters[k] = v; return this }),
      order: vi.fn(function () { return this }),
      single: vi.fn(async function () {
        if (this._insertRow) {
          return { data: { ...this._insertRow }, error: null }
        }
        // select().eq().single()
        if (supabaseState.fetchRow !== undefined && supabaseState.fetchRow !== null) {
          return { data: supabaseState.fetchRow, error: null }
        }
        return { data: null, error: { message: 'not found' } }
      }),
      // await 시 chain terminator (update().eq() 등)
      then: function (onFulfilled) {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled)
      },
    }
    return q
  }
  return {
    supabaseAdmin: {
      from: (table) => buildQuery(table),
      storage: {
        from: () => ({
          upload: vi.fn(async () => ({ error: null })),
          download: vi.fn(async () => ({
            data: { arrayBuffer: async () => new ArrayBuffer(0) },
            error: null,
          })),
          remove: vi.fn(async () => ({ error: null })),
        }),
      },
    },
  }
})

// 프로젝트 멤버십 검증은 통과
vi.mock('../../lib/supabaseService.js', () => ({
  getProject: vi.fn(async () => ({ id: 'proj-1', workspace_id: null })),
  getMemberRole: vi.fn(async () => 'owner'),
}))

// requireAuth 바이패스 (NODE_ENV=development + SUPABASE 미설정)
beforeAll(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NODE_ENV = 'development'
})

// 지연 import — 모킹 이후 로드
let materialsRouter
let analyzeMaterial
beforeAll(async () => {
  ;({ materialsRouter } = await import('../materials.js'))
  ;({ analyzeMaterial } = await import('../../services/materialAnalyzer.js'))
})

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/materials', materialsRouter)
  return app
}

// 실제 PDF 매직바이트를 포함한 최소 바이너리
function makePdfBuffer() {
  // file-type은 "%PDF-" 프리픽스를 매직바이트로 인식
  const pdfSig = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj\n<<>>\nendobj\n')
  const padding = Buffer.alloc(32, 0x20)
  return Buffer.concat([pdfSig, padding])
}

beforeEach(() => {
  vi.clearAllMocks()
  supabaseState.fetchRow = null
})

describe('POST /api/materials/upload', () => {
  it('happy path — 201 + { material }', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/materials/upload')
      .field('project_id', 'proj-1')
      .field('category', 'textbook')
      .attach('file', makePdfBuffer(), { filename: 'test.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('material')
    expect(res.body.material).toMatchObject({
      project_id: 'proj-1',
      file_name: 'test.pdf',
      file_type: 'pdf',
      processing_status: 'pending',
    })
    // fire-and-forget analyzer가 호출되었는지
    expect(analyzeMaterial).toHaveBeenCalledTimes(1)
  })

  it('파일 크기 초과 → 413 FILE_TOO_LARGE', async () => {
    const app = buildApp()
    const big = Buffer.alloc(21 * 1024 * 1024, 0x20) // 21MB
    // 유효 PDF 시그니처를 앞에 심음 (multer가 크기 검사 전에 fileFilter를 돌리지만,
    // 21MB 스트림이 도달하면 multer가 LIMIT_FILE_SIZE로 반환)
    big.write('%PDF-1.4\n', 0)

    const res = await request(app)
      .post('/api/materials/upload')
      .field('project_id', 'proj-1')
      .attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(413)
    expect(res.body?.error?.code).toBe('FILE_TOO_LARGE')
  })

  it('허용되지 않은 확장자(.doc) → 415 UNSUPPORTED_TYPE', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/materials/upload')
      .field('project_id', 'proj-1')
      .attach('file', Buffer.from('dummy'), { filename: 'legacy.doc', contentType: 'application/msword' })

    expect(res.status).toBe(415)
    expect(res.body?.error?.code).toBe('UNSUPPORTED_TYPE')
  })

  it('project_id 누락 → 400 PROJECT_ID_REQUIRED', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/materials/upload')
      .attach('file', makePdfBuffer(), { filename: 'test.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(400)
    expect(res.body?.error?.code).toBe('PROJECT_ID_REQUIRED')
  })
})

describe('GET /api/materials/:id/analysis', () => {
  it('pending 상태 → analysis는 null', async () => {
    supabaseState.fetchRow = {
      id: 'm-pending',
      project_id: 'proj-1',
      file_name: 'a.pdf',
      processing_status: 'pending',
      processing_error: null,
      ai_summary: null,
      ai_analysis: null,
      analyzed_at: null,
    }
    const app = buildApp()
    const res = await request(app).get('/api/materials/m-pending/analysis')

    expect(res.status).toBe(200)
    expect(res.body.analysis).toBeNull()
    expect(res.body.material).toMatchObject({
      id: 'm-pending',
      processing_status: 'pending',
    })
  })

  it('failed 상태 → error_code 필드에 파싱된 에러 코드 포함', async () => {
    supabaseState.fetchRow = {
      id: 'm-failed',
      project_id: 'proj-1',
      file_name: 'b.pdf',
      processing_status: 'failed',
      processing_error: 'AI_TIMEOUT: AI 분석 타임아웃 (60s)',
      ai_summary: null,
      ai_analysis: null,
      analyzed_at: null,
    }
    const app = buildApp()
    const res = await request(app).get('/api/materials/m-failed/analysis')

    expect(res.status).toBe(200)
    expect(res.body.material.error_code).toBe('AI_TIMEOUT')
    expect(res.body.analysis).toBeNull()
  })
})
