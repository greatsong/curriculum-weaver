/**
 * DELETE /api/projects/:id · DELETE /api/workspaces/:id — Storage 정리 정책(HTTP 단)
 *
 * DB 삭제가 성공하면 Storage 정리가 실패해도 200을 돌려준다(개별 자료 삭제와 같은 정책).
 * 인증·접근 검사만 대체하고 deleteProject·deleteWorkspace는 실제 코드를 사용한다.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createFakeSupabase } from '../../lib/__tests__/fakeSupabase.js'

const holder = vi.hoisted(() => ({ sb: null }))
vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: new Proxy({}, { get: (_, prop) => holder.sb[prop] }),
}))
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'owner-1' }; next() },
  requireRole: () => (_req, _res, next) => next(),
}))
vi.mock('../../lib/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => holder.sb && (await holder.sb.from('projects').select('*').eq('id', id)).data?.[0] || null),
  getMemberRole: vi.fn(async () => 'owner'),
}))

let app
beforeAll(async () => {
  vi.stubEnv('SUPABASE_URL', 'https://test.invalid')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test')
  const { default: workspacesRouter } = await import('../workspaces.js')
  const { default: projectsRouter } = await import('../projects.js')
  app = express()
  app.use(express.json())
  app.use('/api/workspaces', workspacesRouter)
  app.use('/api', projectsRouter)
})

function seed() {
  return createFakeSupabase({
    workspaces: [{ id: 'w1' }],
    projects: [{ id: 'p1', workspace_id: 'w1' }, { id: 'p2', workspace_id: 'w1' }],
    materials: [
      { id: 'm1', project_id: 'p1', storage_path: 'materials/p1/a.pdf' },
      { id: 'm2', project_id: 'p2', storage_path: 'materials/p2/b.pdf' },
    ],
    files: ['p1/a.pdf', 'p2/b.pdf'],
  })
}

let fake
let warn
beforeEach(() => {
  fake = seed()
  holder.sb = fake.sb
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })
afterAll(() => { vi.unstubAllEnvs() })

describe('DELETE /api/projects/:id', () => {
  it('DB와 Storage 파일을 함께 지우고 200을 돌려준다', async () => {
    const res = await request(app).delete('/api/projects/p2')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: '프로젝트가 삭제되었습니다.' })
    expect([...fake.objects]).toEqual(['p1/a.pdf'])
  })

  it('Storage 정리가 실패해도 200을 돌려주고 로그를 남긴다', async () => {
    fake.fail.remove = () => 'storage unavailable'
    const res = await request(app).delete('/api/projects/p2')
    expect(res.status).toBe(200)
    expect(fake.tables.projects.map((p) => p.id)).toEqual(['p1'])
    expect(fake.objects.has('p2/b.pdf')).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Storage 정리 일부 실패'), expect.stringContaining('storage unavailable'))
  })

  it('DB 삭제가 실패하면 기존처럼 500이고 파일은 그대로다', async () => {
    fake.fail.delete = () => 'db down'
    const res = await request(app).delete('/api/projects/p2')
    expect(res.status).toBe(500)
    expect(fake.objects.has('p2/b.pdf')).toBe(true)
  })
})

describe('DELETE /api/workspaces/:id', () => {
  it('워크스페이스의 모든 프로젝트 파일을 지우고 200을 돌려준다', async () => {
    const res = await request(app).delete('/api/workspaces/w1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: '워크스페이스가 삭제되었습니다.' })
    expect(fake.objects.size).toBe(0)
  })

  it('Storage 목록 조회가 실패해도 200을 돌려준다', async () => {
    fake.fail.list = () => 'storage unavailable'
    const res = await request(app).delete('/api/workspaces/w1')
    expect(res.status).toBe(200)
    expect(fake.tables.workspaces).toEqual([])
  })
})
