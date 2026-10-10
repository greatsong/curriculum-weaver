/**
 * 이메일로 가입자 찾기 (findAuthUserByEmail) 단위 테스트
 *
 * 1순위 public.users 미러 + auth 재확인, 미러에 없으면 listUsers 전체 탐색.
 * 가짜 클라이언트는 per_page가 없으면 50명만 돌려준다(fakeAuthAdmin.js).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { findAuthUserByEmail, normalizeEmail } from '../authUserLookup.js'
import { createFakeAuthAdmin, makeTeachers } from './fakeAuthAdmin.js'

afterEach(() => vi.restoreAllMocks())

function pagesOf(calls) {
  return calls.listUsers.map((p) => p.page)
}

describe('normalizeEmail', () => {
  it('앞뒤 공백을 지우고 소문자로 바꾼다', () => {
    expect(normalizeEmail('  Teacher@School.KR ')).toBe('teacher@school.kr')
  })

  it('문자열이 아니면 빈 문자열', () => {
    expect(normalizeEmail(undefined)).toBe('')
    expect(normalizeEmail(null)).toBe('')
  })
})

describe('findAuthUserByEmail — 프로필 미러(public.users)', () => {
  it('미러에서 찾으면 auth에서 id로 확인하고 돌려주며 전체 목록은 읽지 않는다', async () => {
    const { client, calls } = createFakeAuthAdmin({ authUsers: makeTeachers(120) })

    const user = await findAuthUserByEmail('teacher0087@school.kr', { client })

    expect(user.id).toBe('user-0087')
    expect(calls.mirror).toEqual([[['email', 'teacher0087@school.kr']]])
    expect(calls.getUserById).toEqual(['user-0087'])
    expect(calls.listUsers).toHaveLength(0)
  })

  it('미러의 이메일이 낡았으면(이메일 변경) 그 사람을 돌려주지 않고 지금 주인을 찾는다', async () => {
    const teachers = makeTeachers(120)
    teachers[6] = { ...teachers[6], email: 'renamed@school.kr' } // user-0007이 이메일을 바꿈
    teachers[98] = { ...teachers[98], email: 'teacher0007@school.kr' } // 옛 주소를 user-0099가 가입
    const mirrorRows = makeTeachers(120).map((u) => ({ id: u.id, email: u.email })) // 미러는 바뀌기 전 그대로
    const { client, calls } = createFakeAuthAdmin({ authUsers: teachers, mirrorRows })

    const user = await findAuthUserByEmail('teacher0007@school.kr', { client })

    expect(user.id).toBe('user-0099')
    expect(calls.getUserById).toEqual(['user-0007'])
    expect(calls.listUsers.length).toBeGreaterThan(0)
  })

  it('미러 조회가 실패하면 전체 탐색으로 넘어간다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, calls } = createFakeAuthAdmin({
      authUsers: makeTeachers(120),
      mirrorError: { message: 'permission denied for table users' },
    })

    const user = await findAuthUserByEmail('teacher0087@school.kr', { client })

    expect(user.id).toBe('user-0087')
    expect(calls.listUsers.length).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalled()
  })
})

describe('findAuthUserByEmail — listUsers 전체 탐색', () => {
  it('미러에 없는 가입자를 셋째 쪽(쪽당 1,000명)에서 찾는다', async () => {
    const { client, calls } = createFakeAuthAdmin({ authUsers: makeTeachers(2500), mirrorRows: [] })

    const user = await findAuthUserByEmail('teacher2345@school.kr', { client })

    expect(user.id).toBe('user-2345')
    expect(pagesOf(calls)).toEqual([1, 2, 3])
    expect(calls.listUsers.every((p) => p.perPage === 1000)).toBe(true)
  })

  it('서버가 쪽당 50명으로 잘라 보내도 요청보다 적게 왔다고 멈추지 않고 끝까지 찾는다', async () => {
    const { client, calls } = createFakeAuthAdmin({
      authUsers: makeTeachers(120),
      mirrorRows: [],
      serverPerPageCap: 50,
    })

    const user = await findAuthUserByEmail('teacher0120@school.kr', { client })

    expect(user.id).toBe('user-0120')
    expect(pagesOf(calls)).toEqual([1, 2, 3])
  })

  it('대소문자가 섞인 auth 이메일도 찾는다', async () => {
    const teachers = makeTeachers(60)
    teachers[54] = { ...teachers[54], email: 'Mixed.Case@School.kr' }
    const { client } = createFakeAuthAdmin({ authUsers: teachers, mirrorRows: [] })

    const user = await findAuthUserByEmail('mixed.case@school.kr', { client })

    expect(user.id).toBe('user-0055')
  })

  it('가입하지 않은 이메일은 빈 쪽까지 보고 null', async () => {
    const { client, calls } = createFakeAuthAdmin({ authUsers: makeTeachers(1200) })

    expect(await findAuthUserByEmail('nobody@school.kr', { client })).toBeNull()
    expect(pagesOf(calls)).toEqual([1, 2, 3])
  })

  it('listUsers가 오류를 내면 throw해 호출부가 폴백을 정하게 한다', async () => {
    const { client } = createFakeAuthAdmin({
      authUsers: makeTeachers(10),
      mirrorRows: [],
      listError: { message: 'User not allowed' },
    })

    await expect(findAuthUserByEmail('teacher0001@school.kr', { client })).rejects.toMatchObject({
      message: 'User not allowed',
    })
  })

  it('최대 쪽 수를 넘으면 null로 단정하지 않고 throw한다', async () => {
    const { client, calls } = createFakeAuthAdmin({ authUsers: makeTeachers(100), mirrorRows: [] })

    await expect(findAuthUserByEmail('nobody@school.kr', { client, perPage: 10, maxPages: 3 }))
      .rejects.toThrow('가입자 조회를 3쪽')
    expect(pagesOf(calls)).toEqual([1, 2, 3])
  })

  it('빈 이메일은 조회하지 않고 null', async () => {
    const { client, calls } = createFakeAuthAdmin({ authUsers: makeTeachers(10) })

    expect(await findAuthUserByEmail('   ', { client })).toBeNull()
    expect(calls.mirror).toHaveLength(0)
    expect(calls.listUsers).toHaveLength(0)
  })
})
