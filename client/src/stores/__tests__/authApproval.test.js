// @vitest-environment happy-dom
/**
 * 가입 승인 상태·이메일 확인 가입 (authStore, 2026-10-11)
 * - signup: 세션이 없으면(확인 메일 대기) 로그인 상태로 두지 않고 needsEmailConfirmation을 돌려준다
 * - refreshApproval: GET /api/auth/me의 approved·approval_status로 상태를 정한다
 * - 서버가 요청 중에 403 approval_pending을 알리면(window 이벤트) 승인 대기로 바꾼다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(async () => ({ error: null })) } },
}))
vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPut: vi.fn() }))

import { supabase } from '../../lib/supabase'
import { apiGet } from '../../lib/api'
import { useAuthStore, SIGNUP_CONFIRM_EMAIL_MESSAGE } from '../authStore'

const user = { id: 'u1', email: 'kim@school.kr', user_metadata: {} }

beforeEach(() => {
  vi.mocked(apiGet).mockReset()
  vi.mocked(supabase.auth.signUp).mockReset()
  vi.mocked(supabase.auth.signInWithPassword).mockReset()
  useAuthStore.setState({ user: null, session: null, approvalStatus: 'unknown', error: null })
})

describe('이메일 가입', () => {
  it('세션 없이 돌아오면(확인 메일) 로그인 상태로 두지 않는다', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({ data: { user, session: null }, error: null })
    const data = await useAuthStore.getState().signup('kim@school.kr', 'secret1', '김교사', {})
    expect(data.needsEmailConfirmation).toBe(true)
    expect(useAuthStore.getState().user).toBeNull()
    expect(apiGet).not.toHaveBeenCalled()
    // 확인 메일 링크가 앱의 콜백 화면으로 돌아오게 한다
    expect(vi.mocked(supabase.auth.signUp).mock.calls[0][0].options.emailRedirectTo).toMatch(/\/auth\/callback$/)
    expect(SIGNUP_CONFIRM_EMAIL_MESSAGE).toBe('확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.')
  })

  it('세션이 있으면(이메일 확인 꺼짐) 바로 로그인하고 승인 상태를 묻는다', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({ data: { user, session: { access_token: 't' } }, error: null })
    vi.mocked(apiGet).mockResolvedValue({ id: 'u1', approved: false, approval_status: 'pending' })
    const data = await useAuthStore.getState().signup('kim@school.kr', 'secret1', '김교사', {})
    expect(data.needsEmailConfirmation).toBe(false)
    expect(useAuthStore.getState().user?.id).toBe('u1')
    await vi.waitFor(() => expect(useAuthStore.getState().approvalStatus).toBe('pending'))
  })

  it('이메일 미확인 로그인 오류는 한국어로 알린다', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ data: {}, error: new Error('Email not confirmed') })
    await expect(useAuthStore.getState().login('kim@school.kr', 'x')).rejects.toThrow()
    expect(useAuthStore.getState().error).toContain('이메일 확인이 아직 끝나지 않았습니다')
  })
})

describe('승인 상태 확인', () => {
  beforeEach(() => useAuthStore.setState({ user, session: { access_token: 't' } }))

  it.each([
    [{ approved: true, approval_status: 'approved' }, 'approved'],
    [{ approved: false, approval_status: 'pending' }, 'pending'],
    [{ approved: false, approval_status: 'rejected' }, 'rejected'],
  ])('/api/auth/me %o → %s', async (me, expected) => {
    vi.mocked(apiGet).mockResolvedValue({ id: 'u1', ...me })
    expect(await useAuthStore.getState().refreshApproval()).toBe(expected)
    expect(useAuthStore.getState().approvalStatus).toBe(expected)
  })

  it('확인에 실패하면 화면을 막지 않는 error 상태', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('network'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await useAuthStore.getState().refreshApproval()).toBe('error')
    warn.mockRestore()
  })

  it('서버가 요청 중에 승인 대기를 알리면 승인 대기 화면 상태로 바뀐다', () => {
    useAuthStore.setState({ approvalStatus: 'approved' })
    window.dispatchEvent(new CustomEvent('cw:approval-pending', { detail: { status: 'pending' } }))
    expect(useAuthStore.getState().approvalStatus).toBe('pending')
    window.dispatchEvent(new CustomEvent('cw:approval-pending', { detail: { status: 'rejected' } }))
    expect(useAuthStore.getState().approvalStatus).toBe('rejected')
  })

  it('로그아웃하면 승인 상태를 지운다', async () => {
    useAuthStore.setState({ approvalStatus: 'pending' })
    await useAuthStore.getState().logout()
    expect(useAuthStore.getState().approvalStatus).toBe('unknown')
  })
})
