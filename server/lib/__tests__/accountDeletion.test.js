import { describe, it, expect } from 'vitest'
import {
  findAccount, runDeleteAccountData, purgeProjectStorage, deleteAuthUser, deleteAccount, formatSummary,
} from '../accountDeletion.js'

const USER = '00000000-0000-0000-0000-00000000000a'

/** 호출 순서를 기록하는 가짜 Supabase 클라이언트 */
function fakeSb({ authUsers = [], profiles = [], rpcResult = {}, rpcError = null, files = {}, removeFails = new Set(), deleteError = null } = {}) {
  const calls = []
  const store = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [...v]]))
  return {
    calls,
    store,
    auth: {
      admin: {
        async getUserById(id) {
          calls.push(['getUserById', id])
          const user = authUsers.find((u) => u.id === id)
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { status: 404, message: 'User not found' } }
        },
        async listUsers({ page, perPage }) {
          calls.push(['listUsers', page])
          return { data: { users: authUsers.slice((page - 1) * perPage, page * perPage) }, error: null }
        },
        async deleteUser(id) {
          calls.push(['deleteUser', id])
          return { data: null, error: deleteError }
        },
      },
    },
    from(table) {
      const q = { filters: {} }
      const builder = {
        select() { return builder },
        eq(col, val) { q.filters[col] = val; return builder },
        async maybeSingle() {
          calls.push(['select', table])
          return { data: profiles.find((p) => p.id === q.filters.id) || null, error: null }
        },
      }
      return builder
    },
    async rpc(name, params) {
      calls.push(['rpc', name, params.p_dry_run])
      return rpcError ? { data: null, error: rpcError } : { data: { ...rpcResult, dry_run: params.p_dry_run }, error: null }
    },
    storage: {
      from(bucket) {
        return {
          async list(prefix) {
            calls.push(['list', bucket, prefix])
            return { data: (store[prefix] || []).map((name) => ({ name, id: `id-${name}` })), error: null }
          },
          async remove(paths) {
            calls.push(['remove', bucket, paths])
            const prefix = paths[0].split('/')[0]
            if (removeFails.has(prefix)) return { data: null, error: { message: '네트워크 오류' } }
            store[prefix] = []
            return { data: paths.map((p) => ({ name: p })), error: null }
          },
        }
      },
    },
  }
}

describe('findAccount', () => {
  it('이메일은 대소문자를 가리지 않고 auth 계정에서 찾는다', async () => {
    const sb = fakeSb({
      authUsers: [{ id: 'x', email: 'other@s.kr' }, { id: USER, email: 'Teacher@School.kr' }],
      profiles: [{ id: USER, email: 'Teacher@School.kr', display_name: '송선생', role: 'teacher' }],
    })
    const account = await findAccount(sb, { email: ' teacher@school.kr ' })
    expect(account).toEqual({ id: USER, email: 'Teacher@School.kr', displayName: '송선생', role: 'teacher', hasAuth: true, hasProfile: true })
  })

  it('auth 계정이 200명을 넘어도 다음 쪽까지 찾는다', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `u${i}`, email: `t${i}@s.kr` }))
    const sb = fakeSb({ authUsers: many })
    const account = await findAccount(sb, { email: 't230@s.kr' })
    expect(account.id).toBe('u230')
    expect(sb.calls.filter((c) => c[0] === 'listUsers').map((c) => c[1])).toEqual([1, 2])
  })

  it('auth 계정은 없고 프로필만 남은 경우도 대상으로 돌려준다', async () => {
    const sb = fakeSb({ profiles: [{ id: USER, email: 'a@s.kr', display_name: '남은 프로필', role: 'teacher' }] })
    const account = await findAccount(sb, { userId: USER })
    expect(account).toMatchObject({ id: USER, hasAuth: false, hasProfile: true })
  })

  it('어디에도 없으면 null', async () => {
    expect(await findAccount(fakeSb(), { email: 'none@s.kr' })).toBeNull()
    expect(await findAccount(fakeSb(), { userId: USER })).toBeNull()
  })
})

describe('deleteAccount', () => {
  const account = { id: USER, hasAuth: true }
  const rpcResult = { deleted_project_ids: ['p1', 'p2'], workspaces_deleted: [], workspaces_transferred: [] }

  it('시험 실행은 RPC만 부르고 Storage·auth는 건드리지 않는다', async () => {
    const sb = fakeSb({ rpcResult, files: { p1: ['a.pdf'] } })
    const out = await deleteAccount(sb, account, { apply: false })
    expect(out.db.dry_run).toBe(true)
    expect(sb.calls.map((c) => c[0])).toEqual(['rpc'])
    expect(sb.store.p1).toEqual(['a.pdf'])
  })

  it('실제 처리는 DB → Storage → auth 순서', async () => {
    const sb = fakeSb({ rpcResult, files: { p1: ['a.pdf', 'b.png'], p2: [] } })
    const out = await deleteAccount(sb, account, { apply: true })
    expect(sb.calls.map((c) => c[0])).toEqual(['rpc', 'list', 'remove', 'list', 'deleteUser'])
    expect(sb.calls[0]).toEqual(['rpc', 'delete_account_data', false])
    expect(sb.calls[2]).toEqual(['remove', 'materials', ['p1/a.pdf', 'p1/b.png']])
    expect(out).toMatchObject({ storage: { removed: 2, failed: [] }, auth: 'deleted' })
  })

  it('DB 처리가 실패하면 Storage와 auth는 손대지 않는다', async () => {
    const sb = fakeSb({ rpcError: { message: 'violates foreign key constraint "workspaces_owner_id_fkey"' } })
    await expect(deleteAccount(sb, account, { apply: true })).rejects.toThrow('workspaces_owner_id_fkey')
    expect(sb.calls.map((c) => c[0])).toEqual(['rpc'])
  })

  it('Storage 일부가 실패해도 나머지와 계정 삭제는 진행하고 실패 목록을 돌려준다', async () => {
    const sb = fakeSb({ rpcResult, files: { p1: ['a.pdf'], p2: ['b.pdf'] }, removeFails: new Set(['p1']) })
    const out = await deleteAccount(sb, account, { apply: true })
    expect(out.storage).toEqual({ removed: 1, failed: [{ projectId: 'p1', error: '네트워크 오류' }] })
    expect(out.auth).toBe('deleted')
  })

  it('auth 계정이 처음부터 없으면 삭제를 부르지 않는다', async () => {
    const sb = fakeSb({ rpcResult })
    const out = await deleteAccount(sb, { id: USER, hasAuth: false }, { apply: true })
    expect(out.auth).toBe('absent')
    expect(sb.calls.some((c) => c[0] === 'deleteUser')).toBe(false)
  })
})

describe('개별 단계', () => {
  it('RPC 오류는 함수 이름을 붙여 던진다', async () => {
    await expect(runDeleteAccountData(fakeSb({ rpcError: { message: 'permission denied' } }), USER, { dryRun: true }))
      .rejects.toThrow('delete_account_data 실패: permission denied')
  })

  it('auth 계정이 이미 지워졌으면 already_deleted, 다른 오류는 던진다', async () => {
    expect(await deleteAuthUser(fakeSb({ deleteError: { status: 404, message: 'User not found' } }), USER)).toBe('already_deleted')
    await expect(deleteAuthUser(fakeSb({ deleteError: { status: 500, message: 'boom' } }), USER)).rejects.toThrow('boom')
  })

  it('Storage에서 지워지지 않은 채 오류 없이 돌아오면 무한 반복하지 않고 실패로 남긴다', async () => {
    const sb = fakeSb({ files: { p1: ['a.pdf'] } })
    sb.storage.from = () => ({
      async list() { return { data: [{ name: 'a.pdf', id: '1' }], error: null } },
      async remove() { return { data: [], error: null } },
    })
    expect(await purgeProjectStorage(sb, ['p1'])).toEqual({ removed: 0, failed: [{ projectId: 'p1', error: '파일이 지워지지 않았습니다.' }] })
  })
})

describe('formatSummary', () => {
  it('삭제·이관·남는 기록을 사람이 읽는 줄로 만든다', () => {
    const lines = formatSummary({
      workspaces_deleted: [{ id: 'w1', name: '혼자', personal: false, projects: 2 }, { id: 'w2', name: '개인', personal: true, projects: 1 }],
      workspaces_transferred: [{ id: 'w3', name: '공동', new_owner_id: 'b', previous_role: 'host' }],
      simulation_projects_deleted: 1,
      deleted_project_ids: ['p1', 'p2', 'p3', 'p4'],
      invites_deleted: 1, simulation_runs_deleted: 2, ai_usage_unlinked: 3, memberships_removed: 3,
      kept_unlinked: { messages: 5, activity_logs: 0, designs: 2 },
    }, new Map([['b', { email: 'b@s.kr', display_name: '비교사' }]]))
    expect(lines).toEqual([
      '삭제할 워크스페이스 2개 (프로젝트 3개)',
      '  - 혼자 (프로젝트 2)',
      '  - 개인 [개인 워크스페이스] (프로젝트 1)',
      '소유권을 넘길 워크스페이스 1개',
      '  - 공동 → 비교사 <b@s.kr> (기존 역할 host)',
      '삭제할 시뮬레이션 프로젝트 1개',
      'Storage 파일 정리 대상 프로젝트 4개',
      '탈퇴자 이메일로 온 초대 1건 삭제, 시뮬레이션 실행 기록 2건 삭제, AI 사용량 기록 3건 연결 해제',
      '멤버십 3개 삭제',
      '팀 기록으로 남고 계정 연결만 끊기는 행: 메시지 5, 보드(마지막 편집자) 2',
    ])
  })

  it('실제 처리 뒤에는 과거형으로 쓴다', () => {
    const lines = formatSummary({ workspaces_deleted: [], workspaces_transferred: [], kept_unlinked: { messages: 1 } }, new Map(), { applied: true })
    expect(lines[0]).toBe('삭제한 워크스페이스 0개 (프로젝트 0개)')
    expect(lines[1]).toBe('소유권을 넘긴 워크스페이스 0개')
    expect(lines.at(-1)).toBe('팀 기록으로 남고 계정 연결만 끊긴 행: 메시지 1')
  })
})
