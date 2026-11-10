import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../approval.js', () => ({
  markApprovalNotified: vi.fn(async () => ({})),
  isSupabaseConfigured: () => true,
}))

import { notifyApprovalPending, buildApprovalMail, getNotifyConfig, _resetApprovalNotifyForTest } from '../approvalNotify.js'

const env = {
  APPROVAL_NOTIFY_WEBHOOK_URL: 'https://script.google.com/macros/s/abc/exec',
  APPROVAL_NOTIFY_SECRET: 's3cret',
  CLIENT_URL: 'https://curriculum-weaver.vercel.app,http://localhost:4006',
}
const user = {
  id: 'u1', email: 'teacher@example.com', created_at: '2026-11-10T00:30:00Z',
  app_metadata: { provider: 'google' }, user_metadata: { full_name: '김교사' },
}
const okFetch = () => vi.fn(async () => ({ ok: true, text: async () => '{"ok":true}' }))

beforeEach(() => _resetApprovalNotifyForTest())

describe('가입 승인 요청 메일 알림', () => {
  it('설정이 없으면 보내지 않는다', async () => {
    const fetchImpl = okFetch()
    expect(await notifyApprovalPending(user, { env: {}, fetchImpl })).toBe('skipped')
    expect(await notifyApprovalPending(user, { env: { ...env, APPROVAL_NOTIFY_SECRET: '' }, fetchImpl })).toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(getNotifyConfig({ ...env, APPROVAL_NOTIFY_WEBHOOK_URL: 'http://insecure.example' })).toBeNull()
  })

  it('이름·이메일·가입 시각(한국 시간)·승인 화면 주소를 담아 한 번 보내고 기록을 남긴다', async () => {
    const fetchImpl = okFetch()
    const mark = vi.fn(async () => ({}))
    expect(await notifyApprovalPending(user, { env, fetchImpl, mark })).toBe('sent')
    const [url, init] = fetchImpl.mock.calls[0]
    const sent = JSON.parse(init.body)
    expect(url).toBe(env.APPROVAL_NOTIFY_WEBHOOK_URL)
    expect(sent.secret).toBe('s3cret')
    expect(sent.subject).toBe('[커리큘럼 위버] 가입 승인 요청: 김교사')
    expect(sent.body).toContain('teacher@example.com')
    expect(sent.body).toContain('2026-11-10 09:30')
    expect(sent.body).toContain('https://curriculum-weaver.vercel.app/data')
    expect(sent.to).toBeUndefined() // 받는 주소는 스크립트에 고정한다
    expect(mark).toHaveBeenCalledWith('u1')
  })

  it('같은 사용자의 요청이 이어져도 한 번만 보낸다', async () => {
    const fetchImpl = okFetch()
    const results = await Promise.all([1, 2, 3].map(() => notifyApprovalPending(user, { env, fetchImpl, mark: async () => ({}) })))
    expect(results.filter((r) => r === 'sent')).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('이미 보낸 기록이 있으면 보내지 않는다(서버 재시작 뒤)', async () => {
    const fetchImpl = okFetch()
    const notified = { ...user, app_metadata: { approval_notified_at: '2026-11-10T00:31:00Z' } }
    expect(await notifyApprovalPending(notified, { env, fetchImpl })).toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('발송에 실패하면 기록하지 않고 다음 요청에서 다시 시도한다', async () => {
    const mark = vi.fn(async () => ({}))
    const failing = vi.fn(async () => ({ ok: true, text: async () => '{"ok":false,"error":"bad secret"}' }))
    expect(await notifyApprovalPending(user, { env, fetchImpl: failing, mark })).toBe('failed')
    expect(mark).not.toHaveBeenCalled()
    const throwing = vi.fn(async () => { throw new Error('network') })
    expect(await notifyApprovalPending(user, { env, fetchImpl: throwing, mark })).toBe('failed')
    expect(await notifyApprovalPending(user, { env, fetchImpl: okFetch(), mark })).toBe('sent')
  })

  it('이름이 없어도 본문을 만든다', () => {
    const mail = buildApprovalMail({ id: 'u2', email: 'x@example.com' }, env)
    expect(mail.subject).toContain('(이름 없음)')
    expect(mail.body).toContain('x@example.com')
  })
})
