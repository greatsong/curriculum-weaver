/**
 * lib/projectStorage.js — 프로젝트 삭제 뒤 materials 버킷 정리
 */
import { describe, it, expect } from 'vitest'
import { createFakeSupabase } from './fakeSupabase.js'
import {
  toBucketPath, listWorkspaceProjectIds, collectReferencedPaths, purgeProjectStorage,
  findOrphanMaterialFiles, removeUnreferencedFiles,
} from '../projectStorage.js'

const mat = (id, projectId, storagePath) => ({ id, project_id: projectId, storage_path: storagePath })

describe('toBucketPath', () => {
  it('materials/ 접두를 떼고, 접두 없는 경로는 그대로 둔다', () => {
    expect(toBucketPath('materials/p1/a.pdf')).toBe('p1/a.pdf')
    expect(toBucketPath('p1/a.pdf')).toBe('p1/a.pdf')
  })
  it('URL 자료와 빈 값은 버킷 경로가 아니다', () => {
    expect(toBucketPath('https://example.com/doc')).toBeNull()
    expect(toBucketPath('HTTP://example.com')).toBeNull()
    expect(toBucketPath(null)).toBeNull()
    expect(toBucketPath('  ')).toBeNull()
  })
})

describe('purgeProjectStorage', () => {
  it('DB에서 지운 프로젝트의 접두 경로 파일을 모두 지우고 다른 프로젝트 파일은 남긴다', async () => {
    const fake = createFakeSupabase({ files: ['p1/a.pdf', 'p1/b.png', 'p2/c.pdf'] })
    const result = await purgeProjectStorage(fake.sb, ['p1'])
    expect(result).toEqual({ removed: 2, kept: 0, failed: [] })
    expect([...fake.objects]).toEqual(['p2/c.pdf'])
  })

  it('폴더 항목(id 없음)은 지우지 않는다', async () => {
    const fake = createFakeSupabase({ files: ['p1/a.pdf', 'p1/sub/x.pdf'] })
    const result = await purgeProjectStorage(fake.sb, ['p1'])
    expect(result.removed).toBe(1)
    expect([...fake.objects]).toEqual(['p1/sub/x.pdf'])
  })

  it('Storage 목록 한도가 요청보다 작아도 빈 쪽까지 읽어 전부 지운다', async () => {
    const files = Array.from({ length: 25 }, (_, i) => `p1/f${String(i).padStart(2, '0')}.pdf`)
    const fake = createFakeSupabase({ files, listCap: 10 })
    const result = await purgeProjectStorage(fake.sb, ['p1'])
    expect(result.removed).toBe(25)
    expect(fake.objects.size).toBe(0)
  })

  it('남은 자료 행(시뮬레이션 복제본)이 가리키는 원본 파일은 지우지 않는다', async () => {
    // 원본 p1을 지웠고, 복제본 sim이 p1/a.pdf를 공유한다
    const fake = createFakeSupabase({
      materials: [mat('m-sim', 'sim', 'materials/p1/a.pdf')],
      files: ['p1/a.pdf', 'p1/b.pdf'],
    })
    const result = await purgeProjectStorage(fake.sb, ['p1'])
    expect(result).toEqual({ removed: 1, kept: 1, failed: [] })
    expect([...fake.objects]).toEqual(['p1/a.pdf'])
  })

  it('접두 없이 저장된 참조도 남은 참조로 인식한다', async () => {
    const fake = createFakeSupabase({ materials: [mat('m-sim', 'sim', 'p1/a.pdf')], files: ['p1/a.pdf'] })
    const result = await purgeProjectStorage(fake.sb, ['p1'])
    expect(result.kept).toBe(1)
    expect(fake.objects.has('p1/a.pdf')).toBe(true)
  })

  it('지운 복제본이 가리키던 원본 접두 파일은 마지막 참조가 사라졌을 때 지운다', async () => {
    // 원본 p1은 이미 지워졌고 파일만 복제본 때문에 남아 있다. 이제 복제본 sim을 지운다.
    const fake = createFakeSupabase({ files: ['p1/a.pdf'] })
    const result = await purgeProjectStorage(fake.sb, ['sim'], { referencedPaths: ['p1/a.pdf'] })
    expect(result).toEqual({ removed: 1, kept: 0, failed: [] })
    expect(fake.objects.size).toBe(0)
  })

  it('다른 프로젝트가 아직 가리키는 참조 경로는 남긴다', async () => {
    const fake = createFakeSupabase({
      materials: [mat('m-src', 'p1', 'materials/p1/a.pdf')],
      files: ['p1/a.pdf'],
    })
    const result = await purgeProjectStorage(fake.sb, ['sim'], { referencedPaths: ['p1/a.pdf'] })
    expect(result).toEqual({ removed: 0, kept: 1, failed: [] })
    expect(fake.objects.has('p1/a.pdf')).toBe(true)
  })

  it('남은 참조 조회가 DB 상한에 걸려도 빈 쪽까지 읽어 사용 중인 파일을 지우지 않는다', async () => {
    const files = Array.from({ length: 8 }, (_, i) => `p1/f${i}.pdf`)
    // 복제본 3개가 원본 파일 8개를 모두 공유 → 참조 24행, DB 상한 5행
    const materials = []
    for (const sim of ['s1', 's2', 's3']) files.forEach((f, i) => materials.push(mat(`${sim}-${i}`, sim, `materials/${f}`)))
    const fake = createFakeSupabase({ materials, files, rowCap: 5 })
    const result = await purgeProjectStorage(fake.sb, ['p1'])
    expect(result).toEqual({ removed: 0, kept: 8, failed: [] })
    expect(fake.objects.size).toBe(8)
  })

  it('한 프로젝트 목록 조회가 실패해도 나머지는 지우고 실패를 돌려준다', async () => {
    const fake = createFakeSupabase({ files: ['p1/a.pdf', 'p2/b.pdf'] })
    fake.fail.list = (prefix) => (prefix === 'p1' ? 'list down' : null)
    const result = await purgeProjectStorage(fake.sb, ['p1', 'p2'])
    expect(result.removed).toBe(1)
    expect(result.failed).toEqual([{ step: 'list', projectId: 'p1', error: 'list down' }])
    expect([...fake.objects]).toEqual(['p1/a.pdf'])
  })

  it('남은 참조 조회가 실패하면 아무것도 지우지 않는다', async () => {
    const fake = createFakeSupabase({ files: ['p1/a.pdf'] })
    fake.fail.select = (table) => (table === 'materials' ? 'db down' : null)
    const result = await purgeProjectStorage(fake.sb, ['p1'])
    expect(result.removed).toBe(0)
    expect(result.failed).toEqual([{ step: 'references', error: '남은 자료 참조 조회 실패: db down' }])
    expect(fake.objects.has('p1/a.pdf')).toBe(true)
  })

  it('remove 오류는 throw하지 않고 실패로 돌려준다', async () => {
    const fake = createFakeSupabase({ files: ['p1/a.pdf'] })
    fake.fail.remove = () => 'remove denied'
    const result = await purgeProjectStorage(fake.sb, ['p1'])
    expect(result).toEqual({ removed: 0, kept: 0, failed: [{ step: 'remove', error: 'remove denied' }] })
  })

  it('대상이 없으면 Storage를 부르지 않는다', async () => {
    const fake = createFakeSupabase({ files: ['p1/a.pdf'] })
    expect(await purgeProjectStorage(fake.sb, [])).toEqual({ removed: 0, kept: 0, failed: [] })
    expect(fake.events).toEqual([])
  })

  it('비어 있는 프로젝트는 목록만 보고 끝낸다', async () => {
    const fake = createFakeSupabase({ files: ['p2/a.pdf'] })
    const result = await purgeProjectStorage(fake.sb, ['p1'])
    expect(result).toEqual({ removed: 0, kept: 0, failed: [] })
    expect(fake.events).toEqual(['storage:list:p1'])
  })
})

describe('collectReferencedPaths · listWorkspaceProjectIds', () => {
  it('자료 행의 버킷 경로를 중복 없이 모으고 URL 자료는 뺀다', async () => {
    const fake = createFakeSupabase({
      materials: [
        mat('m1', 'p1', 'materials/p1/a.pdf'),
        mat('m2', 'sim', 'materials/p1/a.pdf'),
        mat('m3', 'p1', 'https://example.com/page'),
        mat('m4', 'p1', null),
        mat('m5', 'p9', 'materials/p9/z.pdf'),
      ],
    })
    expect((await collectReferencedPaths(fake.sb, ['p1', 'sim'])).sort()).toEqual(['p1/a.pdf'])
  })

  it('프로젝트가 많고 DB 상한이 작아도 전부 모은다', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `p${String(i).padStart(3, '0')}`)
    const fake = createFakeSupabase({
      materials: ids.map((id) => mat(`m-${id}`, id, `materials/${id}/a.pdf`)),
      rowCap: 7,
    })
    expect((await collectReferencedPaths(fake.sb, ids)).length).toBe(120)
  })

  it('조회 실패는 throw한다(대상을 모르면 삭제하지 않도록)', async () => {
    const fake = createFakeSupabase()
    fake.fail.select = () => 'db down'
    await expect(collectReferencedPaths(fake.sb, ['p1'])).rejects.toThrow('자료 파일 경로 조회 실패')
    await expect(listWorkspaceProjectIds(fake.sb, 'w1')).rejects.toThrow('워크스페이스 프로젝트 조회 실패')
  })

  it('워크스페이스의 프로젝트 ID를 DB 상한과 관계없이 전부 돌려준다', async () => {
    const projects = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, workspace_id: i < 10 ? 'w1' : 'w2' }))
    const fake = createFakeSupabase({ projects, rowCap: 3 })
    expect((await listWorkspaceProjectIds(fake.sb, 'w1')).length).toBe(10)
  })
})

describe('findOrphanMaterialFiles · removeUnreferencedFiles', () => {
  const NOW = Date.parse('2026-10-10T00:00:00.000Z')
  const OLD = '2026-09-01T00:00:00.000Z'
  const RECENT = '2026-10-09T23:00:00.000Z' // 1시간 전
  const LIVE = '11111111-1111-4111-8111-111111111111'
  const GONE = '22222222-2222-4222-8222-222222222222'
  const GONE_SHARED = '33333333-3333-4333-8333-333333333333'

  function seedOrphans() {
    return createFakeSupabase({
      projects: [{ id: LIVE, workspace_id: 'w1' }, { id: 'sim-x', workspace_id: 'w1' }],
      materials: [
        mat('m1', LIVE, `materials/${LIVE}/used.pdf`),
        mat('m-sim', 'sim-x', `materials/${GONE_SHARED}/shared.pdf`), // 원본은 지워졌지만 복제본이 사용한다
      ],
      files: [
        { path: `${LIVE}/used.pdf`, createdAt: OLD },
        { path: `${LIVE}/stray.pdf`, createdAt: OLD, size: 2048 },
        { path: `${LIVE}/uploading.pdf`, createdAt: RECENT },
        { path: `${GONE}/a.pdf`, createdAt: OLD, size: 4096 },
        { path: `${GONE}/b.png`, createdAt: OLD },
        { path: `${GONE_SHARED}/shared.pdf`, createdAt: OLD },
        { path: 'tmp-folder/x.pdf', createdAt: OLD },
        { path: 'root.pdf', createdAt: OLD },
      ],
    })
  }

  it('삭제된 프로젝트 폴더와 참조 없는 파일을 나누고, 참조·최근·형식 밖 폴더는 건너뛴다', async () => {
    const fake = seedOrphans()
    const report = await findOrphanMaterialFiles(fake.sb, { now: NOW })

    expect(report.orphans.map((o) => [o.path, o.reason]).sort()).toEqual([
      [`${LIVE}/stray.pdf`, 'unreferenced'],
      [`${GONE}/a.pdf`, 'deleted_project'],
      [`${GONE}/b.png`, 'deleted_project'],
    ])
    expect(report.orphans.find((o) => o.path === `${GONE}/a.pdf`).size).toBe(4096)
    expect(report).toMatchObject({ scannedFolders: 4, scannedFiles: 6, referenced: 2, skippedRecent: 1, rootFiles: 1, otherFolders: ['tmp-folder'] })
    expect(fake.events.some((e) => e.startsWith('storage:remove') || e.startsWith('db:delete'))).toBe(false) // 읽기만 한다
  })

  it('생성 시각을 모르는 파일은 건너뛴다', async () => {
    const fake = createFakeSupabase({ files: [{ path: `${GONE}/a.pdf`, createdAt: '' }] })
    const report = await findOrphanMaterialFiles(fake.sb, { now: NOW })
    expect(report.orphans).toEqual([])
    expect(report.skippedRecent).toBe(1)
  })

  it('최소 경과 시간을 줄이면 최근 파일도 고아로 본다', async () => {
    const fake = seedOrphans()
    const report = await findOrphanMaterialFiles(fake.sb, { now: NOW, minAgeMs: 0 })
    expect(report.orphans.map((o) => o.path)).toContain(`${LIVE}/uploading.pdf`)
  })

  it('지우기 직전에 참조를 다시 확인해 그사이 생긴 참조는 남긴다', async () => {
    const fake = seedOrphans()
    const report = await findOrphanMaterialFiles(fake.sb, { now: NOW })
    fake.tables.materials.push(mat('m-new', LIVE, `materials/${LIVE}/stray.pdf`))

    const result = await removeUnreferencedFiles(fake.sb, report.orphans.map((o) => o.path))

    expect(result).toEqual({ removed: 2, kept: 1, failed: [] })
    expect(fake.objects.has(`${LIVE}/stray.pdf`)).toBe(true)
    expect(fake.objects.has(`${GONE}/a.pdf`)).toBe(false)
  })

  it('참조 확인이 실패하면 아무것도 지우지 않는다', async () => {
    const fake = seedOrphans()
    fake.fail.select = (table) => (table === 'materials' ? 'db down' : null)
    const result = await removeUnreferencedFiles(fake.sb, [`${GONE}/a.pdf`])
    expect(result.removed).toBe(0)
    expect(result.failed[0].step).toBe('references')
    expect(fake.objects.has(`${GONE}/a.pdf`)).toBe(true)
  })
})
