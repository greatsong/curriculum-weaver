/**
 * 조회 오류를 "없음"으로 돌려주지 않는다 (2026-11-10)
 * 종전 getDesign·getMemberRole은 .single()의 error를 읽지 않았다. DB가 잠깐 실패하면
 * - getDesign은 null(보드 없음)을 돌려줘 화면이 빈 보드를 정상으로 받았고, 저장하면 기존 보드를 덮어썼다.
 * - getMemberRole은 null(멤버 아님)을 돌려줘 정상 멤버가 403을 받았다.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'

const db = vi.hoisted(() => ({ results: [], calls: 0 }))

vi.mock('../supabaseAdmin.js', () => {
  const chain = () => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => { db.calls += 1; return db.results.length > 1 ? db.results.shift() : db.results[0] },
    }
    return q
  }
  return { supabaseAdmin: { from: () => chain() } }
})

const { getDesign, getMemberRole } = await import('../supabaseService.js')
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
const FAIL = { data: null, error: { message: 'connection reset' } }

beforeEach(() => { db.results = []; db.calls = 0 })

describe('getDesign', () => {
  it('행이 없으면 null', async () => {
    db.results = [{ data: null, error: null }]
    await expect(getDesign(UUID, 'T-1-1')).resolves.toBeNull()
  })
  it('행이 있으면 그대로 돌려준다', async () => {
    db.results = [{ data: { id: 'd1', content: { commonVision: '비전' } }, error: null }]
    await expect(getDesign(UUID, 'T-1-1')).resolves.toMatchObject({ id: 'd1' })
  })
  it('조회 오류는 null이 아니라 예외다', async () => {
    db.results = [FAIL]
    await expect(getDesign(UUID, 'T-1-1')).rejects.toMatchObject({ message: 'connection reset' })
  })
})

describe('getMemberRole', () => {
  it('멤버가 아니면 null', async () => {
    db.results = [{ data: null, error: null }]
    await expect(getMemberRole(UUID, UUID)).resolves.toBeNull()
    expect(db.calls).toBe(1)
  })
  it('한 번 실패해도 다시 시도해 역할을 돌려준다', async () => {
    db.results = [FAIL, { data: { role: 'editor' }, error: null }]
    await expect(getMemberRole(UUID, UUID)).resolves.toBe('editor')
    expect(db.calls).toBe(2)
  })
  it('두 번 모두 실패하면 "멤버 아님"이 아니라 예외다', async () => {
    db.results = [FAIL]
    await expect(getMemberRole(UUID, UUID)).rejects.toMatchObject({ message: 'connection reset' })
    expect(db.calls).toBe(2)
  })
})
