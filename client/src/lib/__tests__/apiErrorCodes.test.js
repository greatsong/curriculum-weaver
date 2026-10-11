// @vitest-environment happy-dom
/**
 * API 오류 코드 — 맨 위 code(ai_daily_limit·approval_pending 등)를 ApiError.code로 담고,
 * 승인 대기(403 approval_pending)면 window 이벤트로 알린다(authStore가 받아 승인 대기 화면으로 바꾼다).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

import { apiGet, apiPost, APPROVAL_PENDING_EVENT } from '../api'

const respond = (status, body) => ({ ok: false, status, json: async () => body })

beforeEach(() => { globalThis.fetch = vi.fn() })
afterEach(() => { delete globalThis.fetch })

describe('API 오류 코드', () => {
  it('AI 사용 상한 429는 서버 문구와 코드를 그대로 담는다', async () => {
    const body = { code: 'ai_daily_limit', error: '오늘 AI 사용량(400회)을 모두 사용했습니다. 내일 다시 이용해 주세요.' }
    globalThis.fetch.mockResolvedValue(respond(429, body))
    await expect(apiPost('/api/standards/recommend-ai', {})).rejects.toMatchObject({ status: 429, code: 'ai_daily_limit', message: body.error })
  })

  it('자료 형식 오류({ error: { code, message } })는 종전처럼', async () => {
    globalThis.fetch.mockResolvedValue(respond(409, { error: { code: 'ANALYSIS_IN_PROGRESS', message: '이미 분석 중인 자료입니다.' } }))
    await expect(apiPost('/api/materials/x/reanalyze', {})).rejects.toMatchObject({ status: 409, code: 'ANALYSIS_IN_PROGRESS' })
  })

  it('승인 대기 403이면 window 이벤트를 보낸다', async () => {
    const seen = []
    const listener = (e) => seen.push(e.detail)
    window.addEventListener(APPROVAL_PENDING_EVENT, listener)
    globalThis.fetch.mockResolvedValue(respond(403, { code: 'approval_pending', error: '관리자 승인을 기다리고 있습니다.', approval_status: 'pending' }))
    await expect(apiGet('/api/workspaces')).rejects.toMatchObject({ status: 403, code: 'approval_pending' })
    window.removeEventListener(APPROVAL_PENDING_EVENT, listener)
    expect(seen).toEqual([{ status: 'pending' }])
    expect(APPROVAL_PENDING_EVENT).toBe('cw:approval-pending') // authStore가 듣는 이름과 같아야 한다
  })

  it('다른 403은 이벤트를 보내지 않는다', async () => {
    const listener = vi.fn()
    window.addEventListener(APPROVAL_PENDING_EVENT, listener)
    globalThis.fetch.mockResolvedValue(respond(403, { error: '이 프로젝트에 접근 권한이 없습니다.' }))
    await expect(apiGet('/api/projects/x')).rejects.toMatchObject({ status: 403, code: null })
    window.removeEventListener(APPROVAL_PENDING_EVENT, listener)
    expect(listener).not.toHaveBeenCalled()
  })
})
