/**
 * 없는 프로젝트·워크스페이스 조회는 null (2026-10-19)
 * 종전 .single()은 0행에서 오류를 던져, 호출부의 "없으면 404" 분기 대신 500이 나갔다.
 * (홈 "이어서 하기"가 지운 프로젝트를 404로 알아채지 못하고 확인 실패로 계속 띄움)
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'

const db = vi.hoisted(() => ({ calls: [], result: { data: null, error: null } }))

vi.mock('../supabaseAdmin.js', () => {
  const chain = (table) => {
    const q = {
      select: () => q,
      eq: (col, value) => { db.calls.push({ table, col, value }); return q },
      maybeSingle: async () => db.result,
      single: async () => ({ data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }),
    }
    return q
  }
  return { supabaseAdmin: { from: (table) => chain(table) } }
})

// 이 파일 안에서만 Supabase 모드로 둔다. 전역에 남기면 같은 작업 스레드의 다른 테스트가
// 실제 DB에 접속하려 한다(환경 변수는 파일이 끝나면 되돌린다). 연결 여부는 첫 호출 때 판단한다.
const { getProject, getWorkspace } = await import('../supabaseService.js')
const savedEnv = {}
beforeAll(() => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) savedEnv[k] = process.env[k]
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
})
afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

const UUID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'

beforeEach(() => {
  db.calls.length = 0
  db.result = { data: null, error: null }
})

describe('getProject', () => {
  it('행이 없으면 오류 대신 null', async () => {
    await expect(getProject(UUID)).resolves.toBeNull()
    expect(db.calls).toEqual([{ table: 'projects', col: 'id', value: UUID }])
  })

  it('있으면 그대로 돌려준다', async () => {
    db.result = { data: { id: UUID, workspace_id: 'w1', designs: [] }, error: null }
    await expect(getProject(UUID)).resolves.toMatchObject({ id: UUID, workspace_id: 'w1' })
  })

  it('uuid 형식이 아니면 조회하지 않고 null', async () => {
    await expect(getProject('not-a-uuid')).resolves.toBeNull()
    await expect(getProject(undefined)).resolves.toBeNull()
    expect(db.calls).toEqual([])
  })

  it('DB 오류는 그대로 던진다(일시 장애를 "없음"으로 단정하지 않는다)', async () => {
    db.result = { data: null, error: { message: 'connection reset' } }
    await expect(getProject(UUID)).rejects.toThrow('connection reset')
  })
})

describe('getWorkspace', () => {
  it('행이 없으면 null, 형식이 틀리면 조회하지 않는다', async () => {
    await expect(getWorkspace(UUID)).resolves.toBeNull()
    await expect(getWorkspace('x')).resolves.toBeNull()
    expect(db.calls).toEqual([{ table: 'workspaces', col: 'id', value: UUID }])
  })
})
