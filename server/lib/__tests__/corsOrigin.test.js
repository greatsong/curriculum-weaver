/**
 * CORS 허용 출처 (lib/corsOrigin.js) — Express·Socket.IO 공용
 * 운영 주소와 이 프로젝트의 Vercel 미리보기(-greatsongs-projects)만 허용하고,
 * 다른 Vercel 계정의 비슷한 이름은 막는다.
 */
import { describe, it, expect } from 'vitest'
import { createOriginChecker, parseAllowedOrigins, PRODUCTION_ORIGIN } from '../corsOrigin.js'

const check = createOriginChecker(parseAllowedOrigins('http://localhost:4006, https://cw.example.org'))

describe('허용', () => {
  it.each([
    PRODUCTION_ORIGIN,
    'http://localhost:4006',
    'https://cw.example.org',
    'https://curriculum-weaver-a1b2c3d4e-greatsongs-projects.vercel.app',
    'https://curriculum-weaver-git-main-greatsongs-projects.vercel.app',
    'https://curriculum-weaver-git-security-server-hardening-greatsongs-projects.vercel.app',
  ])('%s', (origin) => {
    expect(check(origin)).toBe(true)
  })

  it('Origin 헤더가 없는 요청(서버 간 호출)은 허용', () => {
    expect(check(undefined)).toBe(true)
    expect(check('')).toBe(true)
  })
})

describe('차단', () => {
  it.each([
    'https://curriculum-weaver-evil.vercel.app', // 다른 계정의 비슷한 프로젝트
    'https://curriculum-weaver-x-someone.vercel.app',
    'https://curriculum-weaver-a1b2c3d4e-otherteam.vercel.app',
    'https://curriculum-weaver.vercel.app.evil.com',
    'http://curriculum-weaver.vercel.app', // http
    'https://curriculum-weaver-git-main-greatsongs-projects.vercel.app.evil.com',
    'https://evil.com',
    'http://localhost:4007',
    'null',
  ])('%s', (origin) => {
    expect(check(origin)).toBe(false)
  })

  it('문자열이 아닌 값은 차단', () => {
    expect(check(['https://curriculum-weaver.vercel.app'])).toBe(false)
  })
})

describe('parseAllowedOrigins', () => {
  it('미설정이면 로컬 개발 주소', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:4006'])
  })
  it('쉼표 구분·공백 제거·빈 칸 무시', () => {
    expect(parseAllowedOrigins(' a , ,b ')).toEqual(['a', 'b'])
  })
})
