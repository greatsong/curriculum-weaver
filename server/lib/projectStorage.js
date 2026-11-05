/**
 * 프로젝트·워크스페이스 삭제 뒤 materials 버킷 정리
 *
 * 업로드 원본은 `{projectId}/{materialId}.{ext}`에 저장된다(materials.storage_path에는 'materials/' 접두가 붙는다).
 * DB 행은 ON DELETE CASCADE로 지워지지만 Storage 파일은 남으므로, 삭제 함수가 아래 순서로 정리한다.
 *   ① 삭제 전: 대상 프로젝트 ID와 그 자료 행이 가리키는 파일 경로를 모은다(collectReferencedPaths)
 *   ② DB 삭제
 *   ③ 삭제 뒤: 프로젝트 접두 경로의 파일 + ①의 경로 중 남은 자료 행이 가리키지 않는 것만 지운다(purgeProjectStorage)
 *
 * 시뮬레이션 복제본(routes/demo.js "이어서")은 자료 행만 복사하고 원본 프로젝트의 파일 경로를 공유한다.
 * 그래서 남은 자료 행이 아직 가리키는 파일은 지우지 않고, 복제본을 지울 때는 복제본이 가리키던
 * 원본 접두 아래 파일도 후보에 넣어 마지막 참조가 사라질 때 지워지게 한다.
 *
 * 이미 남아 있는 고아 파일은 findOrphanMaterialFiles로 찾고 removeUnreferencedFiles로 지운다
 * (scripts/cleanup-orphan-material-files.mjs, 시험 실행이 기본).
 *
 * 쪽 나누기는 빈 쪽이 나올 때까지 읽는다. 서버 상한(PostgREST max-rows, Storage list 한도)이
 * 요청한 크기보다 작아도 파일·참조를 놓치지 않기 위해서다. 참조를 놓치면 사용 중인 파일을 지운다.
 */

export const MATERIALS_BUCKET = 'materials'
const PAGE = 1000
const ID_CHUNK = 50 // .in() 목록이 길면 요청 URL이 너무 길어진다
const PATH_CHUNK = 30 // 경로 하나를 두 형태로 조회하므로 실제 목록은 60개
const LIST_CONCURRENCY = 4

/**
 * materials.storage_path → 버킷 안 경로. URL 자료(storage_path가 원본 URL)와 빈 값은 null.
 * @param {string|null|undefined} storagePath
 * @returns {string|null}
 */
export function toBucketPath(storagePath) {
  if (typeof storagePath !== 'string' || !storagePath.trim()) return null
  if (/^https?:\/\//i.test(storagePath)) return null
  return storagePath.startsWith(`${MATERIALS_BUCKET}/`)
    ? storagePath.slice(MATERIALS_BUCKET.length + 1)
    : storagePath
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** buildQuery()가 돌려주는 쿼리를 빈 쪽이 나올 때까지 range로 읽는다. */
async function selectAllPages(buildQuery, context) {
  const rows = []
  for (let from = 0; ; ) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw new Error(`${context}: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    from += data.length
  }
  return rows
}

/**
 * 워크스페이스에 속한 프로젝트 ID 전부. 실패하면 throw한다. 대상을 모르면 삭제하지 않는다.
 * @returns {Promise<string[]>}
 */
export async function listWorkspaceProjectIds(sb, workspaceId) {
  const rows = await selectAllPages(
    () => sb.from('projects').select('id').eq('workspace_id', workspaceId).order('id'),
    '워크스페이스 프로젝트 조회 실패',
  )
  return rows.map((r) => r.id)
}

/**
 * 지울 프로젝트들의 자료 행이 가리키는 버킷 경로(중복 제거). 삭제 전에 부른다. 실패하면 throw.
 * @returns {Promise<string[]>}
 */
export async function collectReferencedPaths(sb, projectIds) {
  const paths = new Set()
  for (const ids of chunk(projectIds || [], ID_CHUNK)) {
    const rows = await selectAllPages(
      () => sb.from('materials').select('id, storage_path').in('project_id', ids).order('id'),
      '자료 파일 경로 조회 실패',
    )
    for (const row of rows) {
      const p = toBucketPath(row.storage_path)
      if (p) paths.add(p)
    }
  }
  return [...paths]
}

/** 버킷에서 prefix 바로 아래 항목 전부(파일 + 폴더). 폴더 항목은 id가 없다. */
async function listEntries(bucket, prefix) {
  const entries = []
  for (let offset = 0; ; ) {
    const { data, error } = await bucket.list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw error
    if (!data?.length) break
    entries.push(...data)
    offset += data.length
  }
  return entries
}

/** prefix 바로 아래 파일 경로 전부(폴더 항목 제외). */
async function listPrefixFiles(bucket, prefix) {
  return (await listEntries(bucket, prefix)).filter((f) => f.id).map((f) => `${prefix}/${f.name}`)
}

/**
 * 자료 행이 하나라도 가리키는 경로. 'materials/' 접두가 있는 형태와 없는 형태를 함께 조회한다. 실패하면 throw.
 * @param {string[]} paths 버킷 안 경로
 * @returns {Promise<Set<string>>}
 */
export async function findReferencedPaths(sb, paths) {
  const kept = new Set()
  for (const part of chunk(paths, PATH_CHUNK)) {
    const forms = part.flatMap((p) => [`${MATERIALS_BUCKET}/${p}`, p])
    const rows = await selectAllPages(
      () => sb.from('materials').select('id, storage_path').in('storage_path', forms).order('id'),
      '남은 자료 참조 조회 실패',
    )
    for (const row of rows) {
      const p = toBucketPath(row.storage_path)
      if (p) kept.add(p)
    }
  }
  return kept
}

/**
 * DB 삭제가 끝난 뒤 Storage 파일을 지운다. 한 프로젝트 목록 조회가 실패해도 나머지는 계속하고,
 * 실패는 throw하지 않고 failed로 돌려준다(호출 쪽이 로그만 남기도록).
 * 남은 참조 조회가 실패하면 사용 중인 파일을 지울 수 있으므로 아무것도 지우지 않는다.
 *
 * @param {object} sb Supabase 관리 클라이언트
 * @param {string[]} projectIds 지운 프로젝트 ID
 * @param {{ referencedPaths?: string[] }} [opts] 삭제 전에 collectReferencedPaths로 모은 경로
 * @returns {Promise<{ removed: number, kept: number, failed: Array<{ step: string, projectId?: string, error: string }> }>}
 */
export async function purgeProjectStorage(sb, projectIds, { referencedPaths = [] } = {}) {
  const result = { removed: 0, kept: 0, failed: [] }
  const ids = [...new Set((projectIds || []).filter(Boolean))]
  const candidates = new Set(referencedPaths.filter(Boolean))
  if (!ids.length && !candidates.size) return result

  const bucket = sb.storage.from(MATERIALS_BUCKET)
  for (const part of chunk(ids, LIST_CONCURRENCY)) {
    await Promise.all(part.map(async (projectId) => {
      try {
        for (const f of await listPrefixFiles(bucket, projectId)) candidates.add(f)
      } catch (err) {
        result.failed.push({ step: 'list', projectId, error: err?.message || String(err) })
      }
    }))
  }
  if (!candidates.size) return result

  const removal = await removeUnreferencedFiles(sb, [...candidates])
  return { removed: removal.removed, kept: removal.kept, failed: [...result.failed, ...removal.failed] }
}

/**
 * 자료 행이 가리키지 않는 파일만 지운다. 참조 조회가 실패하면 아무것도 지우지 않는다. throw하지 않는다.
 * @param {string[]} paths 버킷 안 경로
 * @returns {Promise<{ removed: number, kept: number, failed: Array<{ step: string, error: string }> }>}
 */
export async function removeUnreferencedFiles(sb, paths) {
  const result = { removed: 0, kept: 0, failed: [] }
  const unique = [...new Set((paths || []).filter(Boolean))]
  if (!unique.length) return result

  let referenced
  try {
    referenced = await findReferencedPaths(sb, unique)
  } catch (err) {
    result.failed.push({ step: 'references', error: err?.message || String(err) })
    return result
  }

  const targets = unique.filter((p) => !referenced.has(p))
  result.kept = unique.length - targets.length
  const bucket = sb.storage.from(MATERIALS_BUCKET)
  for (const part of chunk(targets, PAGE)) {
    try {
      const { data, error } = await bucket.remove(part)
      if (error) throw error
      result.removed += data?.length || 0
    } catch (err) {
      result.failed.push({ step: 'remove', error: err?.message || String(err) })
    }
  }
  return result
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 이미 남아 있는 고아 파일을 찾는다. 읽기만 한다(scripts/cleanup-orphan-material-files.mjs).
 *   - deleted_project: 폴더 이름(프로젝트 ID)의 프로젝트가 DB에 없다
 *   - unreferenced: 프로젝트는 있지만 어느 자료 행도 그 파일을 가리키지 않는다(자료 삭제 때 Storage 삭제가 실패한 경우 등)
 * 어느 자료 행이든 가리키는 파일은 고아가 아니다(시뮬레이션 공유).
 * minAgeMs보다 최근이거나 생성 시각을 모르는 파일은 건너뛴다. 업로드는 Storage에 먼저 저장하고 DB 행을 나중에 만들므로,
 * 그 사이에 겹치면 사용 중인 파일을 고아로 볼 수 있다. 프로젝트 ID 형식이 아닌 폴더와 버킷 맨 위 파일은 판단하지 않고 센다.
 *
 * @returns {Promise<{ scannedFolders: number, scannedFiles: number, referenced: number, skippedRecent: number,
 *   otherFolders: string[], rootFiles: number,
 *   orphans: Array<{ path: string, projectId: string, reason: 'deleted_project'|'unreferenced', size: number|null, createdAt: string|null }> }>}
 */
export async function findOrphanMaterialFiles(sb, { minAgeMs = 24 * 60 * 60 * 1000, now = Date.now() } = {}) {
  const bucket = sb.storage.from(MATERIALS_BUCKET)
  const root = await listEntries(bucket, '')
  const folders = root.filter((e) => !e.id).map((e) => e.name)
  const projectFolders = folders.filter((name) => UUID_RE.test(name))
  const report = {
    scannedFolders: folders.length,
    scannedFiles: 0,
    referenced: 0,
    skippedRecent: 0,
    otherFolders: folders.filter((name) => !UUID_RE.test(name)),
    rootFiles: root.filter((e) => e.id).length,
    orphans: [],
  }

  const existing = new Set()
  for (const ids of chunk(projectFolders, ID_CHUNK)) {
    const rows = await selectAllPages(
      () => sb.from('projects').select('id').in('id', ids).order('id'),
      '프로젝트 조회 실패',
    )
    for (const r of rows) existing.add(r.id)
  }

  const files = []
  for (const part of chunk(projectFolders, LIST_CONCURRENCY)) {
    const lists = await Promise.all(part.map(async (projectId) => (await listEntries(bucket, projectId))
      .filter((e) => e.id)
      .map((e) => ({ path: `${projectId}/${e.name}`, projectId, size: e.metadata?.size ?? null, createdAt: e.created_at || null }))))
    files.push(...lists.flat())
  }
  report.scannedFiles = files.length

  const referenced = await findReferencedPaths(sb, files.map((f) => f.path))
  for (const f of files) {
    if (referenced.has(f.path)) { report.referenced++; continue }
    const created = Date.parse(f.createdAt || '')
    if (!Number.isFinite(created) || now - created < minAgeMs) { report.skippedRecent++; continue }
    report.orphans.push({ ...f, reason: existing.has(f.projectId) ? 'unreferenced' : 'deleted_project' })
  }
  return report
}
