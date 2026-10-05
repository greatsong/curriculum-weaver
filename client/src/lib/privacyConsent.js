/**
 * 개인정보 동의 — 문구·버전·판단의 단일 소스.
 *
 * 동의 기록은 Supabase 사용자 메타데이터(user_metadata)에 둔다(DB 스키마 변경 없음).
 * - 이메일 가입: 가입 요청에 함께 실어 보낸다(signUp options.data).
 * - Google 로그인·기존 회원: 기록이 없거나 버전이 다르면 PrivacyConsentGate가 한 번 묻고 updateUser로 저장한다.
 * 문구를 바꿔 다시 동의를 받아야 하면 PRIVACY_CONSENT_VERSION을 올린다.
 * 화면 문구는 솔라 프로4 작성(2026-10-04, 2026-10-05 보완), 표의 사실(전송처·국가·항목)은 코드에서 확인한 값.
 *
 * 국외 이전은 2026-10-05부터 동의 항목이 아니라 '안내'다. 서비스 제공에 필요한 처리위탁·보관이므로
 * 개인정보 보호법 제28조의8 제1항 제3호에 따라 같은 조 제2항의 다섯 사항(항목, 국가·시기·방법,
 * 이전받는 자와 연락처, 목적·보유 기간, 거부 방법·효과)을 알리는 것으로 갈음한다. 수집·이용 동의의
 * [자세한 내용 보기] 안에 표로 둔다. 동의 범위가 줄어든 변경이라 버전은 올리지 않았다(기존 동의자 재동의 불필요).
 */

export const PRIVACY_CONSENT_VERSION = '2026-10-04'

/** 이번 접속만 그대로 시작했을 때(기록 저장 실패) 표시 — 탭을 닫으면 사라지고 다음 접속 때 다시 묻는다 */
const SESSION_KEY = 'cw_privacy_consent_session'

export function hasPrivacyConsent(user) {
  const meta = user?.user_metadata || {}
  return meta.privacy_consent_version === PRIVACY_CONSENT_VERSION && !!meta.privacy_consent_at
}

export function privacyConsentMetadata(now = new Date()) {
  return {
    privacy_consent_version: PRIVACY_CONSENT_VERSION,
    privacy_consent_at: now.toISOString(),
    privacy_consent_items: ['collection', 'overseas_transfer_notice'],
  }
}

export function markSessionConsent(userId) {
  try { sessionStorage.setItem(SESSION_KEY, `${userId}:${PRIVACY_CONSENT_VERSION}`) } catch { /* 저장 불가 환경 */ }
}

export function hasSessionConsent(userId) {
  try { return sessionStorage.getItem(SESSION_KEY) === `${userId}:${PRIVACY_CONSENT_VERSION}` } catch { return false }
}

export const CONSENT_TEXT = {
  title: '개인정보 동의',
  intro: '서비스를 이용하려면 개인정보 수집·이용에 동의하셔야 합니다.',
  item1Label: '[필수] 개인정보 수집·이용 동의',
  item1Summary: '수집하는 개인정보는 이름, 이메일, 소속, 교과, 채팅·보드·업로드 자료 내용입니다. 일부 정보는 AI 응답 생성, 의미 검색, 자료 저장, 서비스 운영을 위해 미국, 일본, 싱가포르로 이전됩니다. 자세한 내용은 아래에서 확인하실 수 있습니다.',
  transferHeading: '개인정보 국외 이전 안내',
  transferRefusal: '국외 이전을 원하지 않으시면 동의하지 않고 나가시거나 회원 탈퇴를 요청하실 수 있습니다. 이 경우 AI 공동 설계가 중심인 본 서비스를 이용하실 수 없습니다.',
  detailToggle: '자세한 내용 보기',
  refusal: '동의를 거부할 수 있으나, 거부하면 AI 공동 설계가 중심 기능인 이 서비스를 이용할 수 없습니다.',
  agreeButton: '동의하고 계속하기',
  logoutButton: '동의하지 않고 나가기',
  saveError: '동의 기록 저장에 실패했습니다. 다시 시도하거나 이번 접속만 그대로 시작할 수 있습니다. 다음 접속 때 다시 묻습니다.',
  retryButton: '다시 시도',
  continueButton: '이번 접속만 시작',
  signupMissing: '필수 개인정보 동의 항목을 체크해야 가입을 진행할 수 있습니다.',
  retention: '회원 탈퇴 시까지 보관하며, 탈퇴는 관리자에게 요청해야 합니다.',
}

/** ① 수집·이용 상세 — 표 */
export const COLLECTION_ROWS = [
  { label: '수집 항목', value: '이름, 이메일, 소속 학교(선택), 담당 교과(선택). Google 로그인 시 Google 계정의 이름·이메일·프로필 사진 주소. 서비스 이용 중 작성하거나 올린 채팅, 설계 보드, 업로드 자료' },
  { label: '이용 목적', value: '회원 식별과 로그인, 팀 협업(팀원에게 이름·교과 표시), AI 수업 설계 지원, 설계 보고서 작성' },
  { label: '보유 기간', value: CONSENT_TEXT.retention },
]

/**
 * 국외 이전 안내 — 표 (전송처·국가는 server/services와 Supabase·Railway 설정에서 확인, 2026-10-04).
 * 연락처는 각 사 개인정보 처리방침의 개인정보 문의 메일(2026-10-05 확인).
 */
export const TRANSFER_ROWS = [
  { to: 'Anthropic', contact: 'privacy@anthropic.com', country: '미국', items: '채팅, 설계 보드, 업로드 자료 내용(안에 적힌 이름 포함)', purpose: 'AI 응답 생성, 자료 분석' },
  { to: 'OpenAI', contact: 'privacy@openai.com', country: '미국', items: '성취기준 검색어', purpose: '성취기준 의미 검색' },
  { to: 'Supabase', contact: 'privacy@supabase.com', country: '일본(도쿄)', items: '계정 정보와 설계 데이터 전체', purpose: '데이터 저장, 로그인' },
  { to: 'Railway', contact: 'privacy@railway.com', country: '싱가포르', items: '서비스 이용 중 주고받는 정보', purpose: '서버 운영' },
]

export const TRANSFER_NOTE = '서비스를 이용할 때 암호화된 연결로 전송합니다. Supabase·Railway에서는 회원 탈퇴 시까지 보관하고, Anthropic·OpenAI에서는 각 사의 API 데이터 정책에 따라 처리합니다.'
