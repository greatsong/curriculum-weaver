/**
 * Storage 정리 테스트용 가짜 Supabase — 테이블 3개(workspaces·projects·materials)와 materials 버킷.
 * 운영 스키마처럼 workspaces → projects → materials 순으로 ON DELETE CASCADE가 걸려 있다.
 *
 * 서버 상한을 흉내 낸다: rowCap(PostgREST max-rows)·listCap(Storage list 한도)이 요청 크기보다 작으면
 * 그만큼만 돌려준다. fail로 단계별 오류를 넣는다.
 * files는 경로 문자열 또는 { path, createdAt, size }. 문자열이면 생성 시각은 2026-01-01로 둔다.
 */
export function createFakeSupabase({ workspaces = [], projects = [], materials = [], files = [], rowCap = Infinity, listCap = Infinity } = {}) {
  const tables = {
    workspaces: workspaces.map((r) => ({ ...r })),
    projects: projects.map((r) => ({ ...r })),
    materials: materials.map((r) => ({ ...r })),
  }
  const meta = new Map()
  for (const f of files) {
    const path = typeof f === 'string' ? f : f.path
    meta.set(path, { createdAt: (typeof f === 'string' ? null : f.createdAt) ?? '2026-01-01T00:00:00.000Z', size: (typeof f === 'string' ? null : f.size) ?? 100 })
  }
  const objects = new Set(meta.keys())
  const events = []
  const fail = {
    select: null, // (table, filters) => 오류 메시지 | null
    delete: null, // (table) => 오류 메시지 | null
    list: null, // (prefix) => 오류 메시지 | null
    remove: null, // (paths) => 오류 메시지 | null
  }

  function cascadeDelete(table, rows) {
    if (table === 'workspaces') {
      const ids = new Set(rows.map((r) => r.id))
      cascadeDelete('projects', tables.projects.filter((p) => ids.has(p.workspace_id)))
    }
    if (table === 'projects') {
      const ids = new Set(rows.map((r) => r.id))
      tables.materials = tables.materials.filter((m) => !ids.has(m.project_id))
    }
    const gone = new Set(rows)
    tables[table] = tables[table].filter((r) => !gone.has(r))
  }

  function query(table) {
    const filters = []
    let mode = 'select'
    let orderCol = null
    let range = null
    const q = {
      select() { return q },
      delete() { mode = 'delete'; return q },
      eq(col, value) { filters.push((r) => r[col] === value); return q },
      in(col, values) { const set = new Set(values); filters.push((r) => set.has(r[col])); return q },
      order(col) { orderCol = col; return q },
      range(from, to) { range = [from, to]; return q },
      then(onFulfilled, onRejected) {
        return Promise.resolve().then(() => run()).then(onFulfilled, onRejected)
      },
    }
    function run() {
      const matched = tables[table].filter((r) => filters.every((f) => f(r)))
      if (mode === 'delete') {
        const msg = fail.delete?.(table)
        if (msg) return { data: null, error: { message: msg } }
        cascadeDelete(table, matched)
        events.push(`db:delete:${table}`)
        return { data: null, error: null }
      }
      const msg = fail.select?.(table)
      if (msg) return { data: null, error: { message: msg } }
      let rows = orderCol ? [...matched].sort((a, b) => String(a[orderCol]).localeCompare(String(b[orderCol]))) : matched
      if (range) rows = rows.slice(range[0], Math.min(range[1] + 1, range[0] + rowCap))
      events.push(`db:select:${table}`)
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    return q
  }

  const bucket = {
    async list(prefix, { limit = 100, offset = 0 } = {}) {
      const msg = fail.list?.(prefix)
      if (msg) return { data: null, error: { message: msg } }
      events.push(`storage:list:${prefix}`)
      const entries = new Map()
      for (const path of [...objects].sort()) {
        if (prefix && !path.startsWith(`${prefix}/`)) continue
        const rest = prefix ? path.slice(prefix.length + 1) : path
        const slash = rest.indexOf('/')
        if (slash === -1) {
          const m = meta.get(path)
          entries.set(rest, { name: rest, id: `obj:${path}`, created_at: m.createdAt, metadata: { size: m.size } })
        } else {
          entries.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null, created_at: null, metadata: null }) // 폴더 항목
        }
      }
      const all = [...entries.values()]
      return { data: all.slice(offset, offset + Math.min(limit, listCap)), error: null }
    },
    async remove(paths) {
      const msg = fail.remove?.(paths)
      if (msg) return { data: null, error: { message: msg } }
      events.push(`storage:remove:${paths.length}`)
      const gone = paths.filter((p) => objects.delete(p))
      return { data: gone.map((name) => ({ name })), error: null }
    },
  }

  const sb = {
    from: (table) => query(table),
    storage: { from: () => bucket },
  }
  return { sb, tables, objects, events, fail }
}
