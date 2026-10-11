/**
 * 프런트(Vercel) 보안 헤더 — 저장소 루트 vercel.json
 * - 모든 경로: nosniff, Referrer-Policy, X-Frame-Options DENY
 * - 강제 CSP는 화면을 깨뜨리지 않는 지시어만(frame-ancestors·object-src·base-uri)
 * - 전체 정책은 Report-Only로 두고, 앱이 실제로 쓰는 출처(API·Supabase·Google Fonts)를 허용
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const vercel = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../vercel.json'), 'utf8'))
const allPaths = vercel.headers.find((h) => h.source === '/(.*)')
const header = (key) => allPaths?.headers.find((h) => h.key === key)?.value

function directives(policy) {
  return Object.fromEntries(String(policy || '').split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...values] = d.split(/\s+/)
    return [name, values]
  }))
}

describe('vercel.json 보안 헤더', () => {
  it('모든 경로에 기본 보안 헤더', () => {
    expect(allPaths).toBeTruthy()
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header('X-Frame-Options')).toBe('DENY')
  })

  it("강제 CSP: frame-ancestors 'none' 포함, 스크립트·스타일·연결 제한은 넣지 않는다", () => {
    const d = directives(header('Content-Security-Policy'))
    expect(d['frame-ancestors']).toEqual(["'none'"])
    expect(d['object-src']).toEqual(["'none'"])
    expect(d['base-uri']).toEqual(["'self'"])
    for (const risky of ['default-src', 'script-src', 'style-src', 'connect-src']) expect(d[risky]).toBeUndefined()
  })

  it('Report-Only 정책: 앱이 쓰는 출처를 허용하고 eval·인라인 스크립트는 허용하지 않는다', () => {
    const d = directives(header('Content-Security-Policy-Report-Only'))
    const apiUrl = vercel.build.env.VITE_API_URL
    const apiHost = new URL(apiUrl).host
    expect(d['connect-src']).toEqual(expect.arrayContaining([
      "'self'", `https://${apiHost}`, `wss://${apiHost}`, 'https://*.supabase.co', 'wss://*.supabase.co',
    ]))
    expect(d['script-src']).toEqual(["'self'"])
    expect(d['style-src']).toEqual(expect.arrayContaining(["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']))
    expect(d['font-src']).toEqual(expect.arrayContaining(['https://fonts.gstatic.com']))
    expect(d['frame-ancestors']).toEqual(["'none'"])
    expect(JSON.stringify(d)).not.toContain('unsafe-eval')
  })

  it('보안 헤더 블록이 기존 캐시 헤더(version.json·assets)를 대체하지 않는다', () => {
    expect(vercel.headers.some((h) => h.source === '/version.json')).toBe(true)
    expect(vercel.headers.some((h) => h.source === '/assets/(.*)')).toBe(true)
  })
})
