/** 개인정보 동의 판단·기록 형식과 이메일 가입 시 동의 기록 저장 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { auth: { signUp: vi.fn(async ({ options }) => ({ data: { user: { id: 'n1', user_metadata: options.data }, session: null }, error: null })) } } }))
vi.mock('../api', () => ({ apiGet: vi.fn(), apiPut: vi.fn() }))

import { supabase } from '../supabase'
import { useAuthStore } from '../../stores/authStore'
import { hasPrivacyConsent, privacyConsentMetadata, PRIVACY_CONSENT_VERSION, TRANSFER_ROWS } from '../privacyConsent'

describe('privacyConsent', () => {
  it('버전과 시각이 모두 있어야 동의한 것으로 본다', () => {
    expect(hasPrivacyConsent(null)).toBe(false)
    expect(hasPrivacyConsent({ user_metadata: {} })).toBe(false)
    expect(hasPrivacyConsent({ user_metadata: { privacy_consent_version: PRIVACY_CONSENT_VERSION } })).toBe(false)
    expect(hasPrivacyConsent({ user_metadata: privacyConsentMetadata(new Date('2026-10-04T00:00:00Z')) })).toBe(true)
  })

  it('국외 이전 안내에 실제 전송처 네 곳을 모두 적는다', () => {
    expect(TRANSFER_ROWS.map((r) => `${r.to}:${r.country}`)).toEqual(['Anthropic:미국', 'OpenAI:미국', 'Supabase:일본(도쿄)', 'Railway:싱가포르'])
  })

  it('이메일 가입에서 동의했으면 가입 요청에 동의 기록을 함께 보낸다', async () => {
    await useAuthStore.getState().signup('a@b.kr', 'secret1', '김교사', { school_name: '당곡고', subject: '정보', privacyConsent: true })
    const data = supabase.auth.signUp.mock.calls[0][0].options.data
    expect(data).toMatchObject({ display_name: '김교사', school_name: '당곡고', subject: '정보', privacy_consent_version: PRIVACY_CONSENT_VERSION })
    expect(hasPrivacyConsent({ user_metadata: data })).toBe(true)
  })

  it('동의 표시 없이 부르면 동의 기록을 넣지 않는다', async () => {
    supabase.auth.signUp.mockClear()
    await useAuthStore.getState().signup('a@b.kr', 'secret1', '김교사', {})
    expect(supabase.auth.signUp.mock.calls[0][0].options.data).not.toHaveProperty('privacy_consent_version')
  })
})
