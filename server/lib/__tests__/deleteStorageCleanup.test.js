/**
 * supabaseService.deleteProject · deleteWorkspace — DB 삭제 뒤 Storage 원본 파일 정리
 *
 * 처리방침은 삭제한 설계 데이터의 전자 파일을 복구할 수 없게 지운다고 안내한다.
 * DB 행은 CASCADE로 지워지지만 materials 버킷 파일은 남던 차이를 막는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeSupabase } from './fakeSupabase.js'

const holder = vi.hoisted(() => ({ sb: null }))
vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: new Proxy({}, {
    get(_, prop) {
      if (!holder.sb) throw new Error('인메모리 모드에서 Supabase를 부르면 안 된다')
      return holder.sb[prop]
    },
  }),
}))

const mat = (id, projectId, storagePath) => ({ id, project_id: projectId, storage_path: storagePath })

// supabaseService는 처음 부를 때 환경변수를 한 번만 확인하므로 테스트마다 새로 불러온다
async function loadService({ supabase }) {
  vi.resetModules()
  if (supabase) {
    vi.stubEnv('SUPABASE_URL', 'https://test.invalid')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test')
  } else {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
  }
  return import('../supabaseService.js')
}

function seed() {
  return createFakeSupabase({
    workspaces: [{ id: 'w1' }, { id: 'w2' }],
    projects: [
      { id: 'p1', workspace_id: 'w1' },
      { id: 'sim', workspace_id: 'w1', source_project_id: 'p1' },
      { id: 'p2', workspace_id: 'w1' },
      { id: 'q1', workspace_id: 'w2' },
    ],
    materials: [
      mat('m1', 'p1', 'materials/p1/a.pdf'),
      mat('m2', 'p1', 'materials/p1/b.pdf'),
      mat('m3', 'p1', 'https://example.com/page'),
      mat('m-sim', 'sim', 'materials/p1/a.pdf'), // 복제본은 원본 파일 경로를 공유한다
      mat('m4', 'p2', 'materials/p2/c.png'),
      mat('m5', 'q1', 'materials/q1/d.pdf'),
    ],
    files: ['p1/a.pdf', 'p1/b.pdf', 'p2/c.png', 'q1/d.pdf'],
  })
}

let warn
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { holder.sb = null; vi.unstubAllEnvs(); warn.mockRestore() })

describe('deleteProject', () => {
  it('파일 경로를 먼저 모으고, DB 삭제 뒤 프로젝트 파일을 지운다', async () => {
    const fake = seed()
    holder.sb = fake.sb
    const { deleteProject } = await loadService({ supabase: true })

    const res = await deleteProject('p2')

    expect(res.storage).toEqual({ removed: 1, kept: 0, failed: [] })
    expect(fake.objects.has('p2/c.png')).toBe(false)
    expect(fake.tables.projects.some((p) => p.id === 'p2')).toBe(false)
    const order = (e) => fake.events.indexOf(e)
    expect(order('db:select:materials')).toBeLessThan(order('db:delete:projects'))
    expect(order('db:delete:projects')).toBeLessThan(order('storage:list:p2'))
    expect(order('storage:list:p2')).toBeLessThan(order('storage:remove:1'))
  })

  it('원본을 지워도 남은 시뮬레이션 복제본이 사용하는 파일은 남긴다', async () => {
    const fake = seed()
    holder.sb = fake.sb
    const { deleteProject } = await loadService({ supabase: true })

    const res = await deleteProject('p1')

    expect(res.storage).toEqual({ removed: 1, kept: 1, failed: [] })
    expect(fake.objects.has('p1/b.pdf')).toBe(false)
    expect(fake.objects.has('p1/a.pdf')).toBe(true)
  })

  it('원본이 지워진 뒤 복제본을 지우면 공유하던 원본 파일도 지운다', async () => {
    const fake = seed()
    holder.sb = fake.sb
    const { deleteProject } = await loadService({ supabase: true })

    await deleteProject('p1')
    const res = await deleteProject('sim')

    expect(res.storage).toEqual({ removed: 1, kept: 0, failed: [] })
    expect([...fake.objects].sort()).toEqual(['p2/c.png', 'q1/d.pdf'])
  })

  it('원본이 남아 있으면 복제본을 지워도 원본 파일은 그대로다', async () => {
    const fake = seed()
    holder.sb = fake.sb
    const { deleteProject } = await loadService({ supabase: true })

    const res = await deleteProject('sim')

    expect(res.storage).toEqual({ removed: 0, kept: 1, failed: [] })
    expect(fake.objects.has('p1/a.pdf')).toBe(true)
  })

  it('DB 삭제가 실패하면 throw하고 Storage는 건드리지 않는다', async () => {
    const fake = seed()
    fake.fail.delete = () => 'permission denied'
    holder.sb = fake.sb
    const { deleteProject } = await loadService({ supabase: true })

    await expect(deleteProject('p2')).rejects.toThrow('프로젝트 삭제 실패')
    expect(fake.events.some((e) => e.startsWith('storage:'))).toBe(false)
    expect(fake.objects.has('p2/c.png')).toBe(true)
  })

  it('파일 경로를 모으지 못하면 삭제하지 않는다', async () => {
    const fake = seed()
    fake.fail.select = (table) => (table === 'materials' ? 'db down' : null)
    holder.sb = fake.sb
    const { deleteProject } = await loadService({ supabase: true })

    await expect(deleteProject('p2')).rejects.toThrow('자료 파일 경로 조회 실패')
    expect(fake.tables.projects.some((p) => p.id === 'p2')).toBe(true)
  })

  it('Storage 정리가 실패해도 삭제는 성공으로 끝내고 로그를 남긴다', async () => {
    const fake = seed()
    fake.fail.list = () => 'storage unavailable'
    holder.sb = fake.sb
    const { deleteProject } = await loadService({ supabase: true })

    const res = await deleteProject('p2')

    expect(res.storage.failed).toEqual([{ step: 'list', projectId: 'p2', error: 'storage unavailable' }])
    expect(fake.tables.projects.some((p) => p.id === 'p2')).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Storage 정리 일부 실패'), expect.stringContaining('storage unavailable'))
  })

  it('정리 중 예상 못 한 오류가 나도 throw하지 않는다', async () => {
    const fake = seed()
    fake.sb.storage = { from: () => { throw new Error('boom') } }
    holder.sb = fake.sb
    const { deleteProject } = await loadService({ supabase: true })

    const res = await deleteProject('p2')

    expect(res.storage.failed).toEqual([{ step: 'unexpected', error: 'boom' }])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Storage 정리 실패'), 'boom')
  })
})

describe('deleteWorkspace', () => {
  it('워크스페이스의 모든 프로젝트 파일을 지우고 다른 워크스페이스 파일은 남긴다', async () => {
    const fake = seed()
    holder.sb = fake.sb
    const { deleteWorkspace } = await loadService({ supabase: true })

    const res = await deleteWorkspace('w1')

    expect(res.storage).toEqual({ removed: 3, kept: 0, failed: [] })
    expect([...fake.objects]).toEqual(['q1/d.pdf'])
    expect(fake.tables.projects.map((p) => p.id)).toEqual(['q1'])
    const order = (e) => fake.events.indexOf(e)
    expect(order('db:select:projects')).toBeLessThan(order('db:delete:workspaces'))
    expect(order('db:delete:workspaces')).toBeLessThan(order('storage:list:p1'))
  })

  it('프로젝트 목록을 얻지 못하면 워크스페이스를 지우지 않는다', async () => {
    const fake = seed()
    fake.fail.select = (table) => (table === 'projects' ? 'db down' : null)
    holder.sb = fake.sb
    const { deleteWorkspace } = await loadService({ supabase: true })

    await expect(deleteWorkspace('w1')).rejects.toThrow('워크스페이스 프로젝트 조회 실패')
    expect(fake.tables.workspaces.some((w) => w.id === 'w1')).toBe(true)
    expect(fake.objects.size).toBe(4)
  })

  it('프로젝트가 없는 워크스페이스는 Storage를 부르지 않는다', async () => {
    const fake = seed()
    fake.tables.workspaces.push({ id: 'empty' })
    holder.sb = fake.sb
    const { deleteWorkspace } = await loadService({ supabase: true })

    const res = await deleteWorkspace('empty')

    expect(res.storage).toEqual({ removed: 0, kept: 0, failed: [] })
    expect(fake.events.some((e) => e.startsWith('storage:'))).toBe(false)
  })
})

describe('인메모리 모드(Supabase 없음)', () => {
  it('Storage 정리를 건너뛰고 Supabase를 부르지 않는다', async () => {
    holder.sb = null
    const svc = await loadService({ supabase: false })

    const ws = await svc.createWorkspace({ name: '테스트', owner_id: 'u1' })
    const project = await svc.createProject(ws.id, { title: '프로젝트' })

    expect(await svc.deleteProject(project.id)).toEqual({ storage: null })
    expect(await svc.getProject(project.id)).toBeNull()
    expect(await svc.deleteWorkspace(ws.id)).toEqual({ storage: null })
  })
})
