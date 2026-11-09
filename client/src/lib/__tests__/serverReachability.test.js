import { describe, it, expect, vi } from 'vitest'

vi.mock('../api', () => ({ API_BASE: 'https://api.example' }))

import { pingServer, classifyReachability, FAILURES_BEFORE_NOTICE } from '../serverReachability.js'

describe('서버 연결 확인', () => {
  it('응답이 오면 상태 코드와 무관하게 닿은 것으로 본다', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 }))
    expect(await pingServer({ fetchImpl })).toBe(true)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example/api/health')
  })

  it('연결 자체가 실패하면 닿지 못한 것으로 본다', async () => {
    expect(await pingServer({ fetchImpl: async () => { throw new TypeError('Failed to fetch') } })).toBe(false)
  })

  it('시간 안에 응답이 없으면 닿지 못한 것으로 본다', async () => {
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')))
    })
    expect(await pingServer({ fetchImpl, timeoutMs: 10 })).toBe(false)
  })

  it('한 번 실패로는 안내하지 않고, 연속 실패부터 망 차단과 인터넷 끊김을 구분한다', () => {
    expect(classifyReachability({ failures: FAILURES_BEFORE_NOTICE - 1, online: true })).toBe('ok')
    expect(classifyReachability({ failures: FAILURES_BEFORE_NOTICE, online: true })).toBe('blocked')
    expect(classifyReachability({ failures: FAILURES_BEFORE_NOTICE, online: false })).toBe('offline')
  })
})
