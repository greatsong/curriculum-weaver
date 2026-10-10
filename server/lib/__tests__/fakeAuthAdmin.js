/**
 * 테스트용 가짜 Supabase 관리 클라이언트 (가입자 조회에 쓰는 부분만)
 *
 * 실제 동작을 따른다.
 * - auth.admin.listUsers: per_page를 주지 않으면 50명(GoTrue 기본값)만 돌려준다.
 *   serverPerPageCap을 주면 서버가 쪽당 인원을 그보다 적게 자르는 경우를 흉내 낸다.
 * - auth.admin.getUserById: 없는 사용자는 error와 user null
 * - from('users'): select·eq·limit 체인을 await하면 { data, error }. upsert도 받는다.
 *
 * 파일 이름이 *.test.js가 아니므로 vitest가 테스트로 실행하지 않는다.
 */

/** n명의 가입 교사를 만든다. teacher0001@school.kr … */
export function makeTeachers(n) {
  return Array.from({ length: n }, (_, i) => {
    const no = String(i + 1).padStart(4, '0')
    return { id: `user-${no}`, email: `teacher${no}@school.kr`, user_metadata: {} }
  })
}

/**
 * @param {object} opts
 * @param {object[]} [opts.authUsers] - auth.users
 * @param {object[]} [opts.mirrorRows] - public.users (기본: authUsers와 같은 id·email)
 * @param {number} [opts.serverPerPageCap] - 서버가 쪽당 돌려주는 최대 인원
 * @param {object|null} [opts.mirrorError] - public.users 조회 오류
 * @param {object|null} [opts.listError] - listUsers 오류
 */
export function createFakeAuthAdmin({
  authUsers = [],
  mirrorRows = authUsers.map((u) => ({ id: u.id, email: u.email })),
  serverPerPageCap = Infinity,
  mirrorError = null,
  listError = null,
} = {}) {
  const calls = { mirror: [], getUserById: [], listUsers: [], upsert: [] }

  const client = {
    from(table) {
      if (table !== 'users') throw new Error(`예상하지 못한 테이블: ${table}`)
      const filters = []
      let limit = Infinity
      const query = {
        select() { return query },
        eq(column, value) { filters.push([column, value]); return query },
        limit(n) { limit = n; return query },
        upsert(row) { calls.upsert.push(row); return Promise.resolve({ data: null, error: null }) },
        then(resolve, reject) {
          calls.mirror.push(filters.slice())
          const result = mirrorError
            ? { data: null, error: mirrorError }
            : {
                data: mirrorRows
                  .filter((row) => filters.every(([column, value]) => row[column] === value))
                  .slice(0, limit),
                error: null,
              }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return query
    },
    auth: {
      admin: {
        async getUserById(id) {
          calls.getUserById.push(id)
          const user = authUsers.find((u) => u.id === id)
          return user
            ? { data: { user }, error: null }
            : { data: { user: null }, error: { message: 'User not found' } }
        },
        async listUsers(params) {
          calls.listUsers.push(params)
          if (listError) return { data: { users: [] }, error: listError }
          const page = params?.page ?? 1
          const perPage = Math.min(params?.perPage ?? 50, serverPerPageCap)
          const users = authUsers.slice((page - 1) * perPage, page * perPage)
          return { data: { users, aud: 'authenticated', nextPage: null, lastPage: 0, total: 0 }, error: null }
        },
        async createUser() {
          return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } }
        },
      },
    },
  }

  return { client, calls }
}
