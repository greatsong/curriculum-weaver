/**
 * 가입 승인 요청 메일 알림 (2026-11-10)
 *
 * 승인 대기 사용자가 서비스에 들어오면 관리자에게 메일 한 통을 보낸다. 종전에는 관리자가 /data의
 * 가입 승인 탭을 열어야만 대기자를 알 수 있어, 13명이 최대 한 달 가까이 기다렸다.
 *
 * 발송은 구글 Apps Script 웹 앱에 맡긴다(docs/승인-요청-메일-알림.md). 서버는 HTTPS로 내용만 보내고,
 * 받는 주소는 스크립트 안에 고정한다 — 웹 앱 주소가 새도 임의의 주소로 메일을 보낼 수 없다.
 * 환경 변수 APPROVAL_NOTIFY_WEBHOOK_URL·APPROVAL_NOTIFY_SECRET가 둘 다 있을 때만 동작한다.
 *
 * 같은 사용자로는 한 번만 보낸다: 보낸 뒤 auth app_metadata.approval_notified_at을 남기고,
 * 그 기록이 캐시된 사용자 정보에 반영되기 전의 요청은 프로세스 안의 집합으로 거른다.
 * 실패해도 요청 처리에는 영향을 주지 않는다(다음 요청에서 다시 시도).
 */
import { markApprovalNotified, isSupabaseConfigured } from './approval.js'

const SEND_TIMEOUT_MS = 8_000
const MAX_TRACKED = 5_000
const handled = new Set() // 이 프로세스에서 보냈거나 보내는 중인 사용자 id

export function getNotifyConfig(env = process.env) {
  const url = String(env.APPROVAL_NOTIFY_WEBHOOK_URL || '').trim()
  const secret = String(env.APPROVAL_NOTIFY_SECRET || '').trim()
  if (!/^https:\/\//i.test(url) || !secret) return null
  return { url, secret }
}

/** 승인 화면 주소 — CLIENT_URL의 첫 주소 기준 */
export function approvalPageUrl(env = process.env) {
  const first = String(env.CLIENT_URL || '').split(',')[0].trim().replace(/\/+$/, '')
  return first ? `${first}/data` : ''
}

function formatKst(iso) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  return new Date(t + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')
}

/** 메일 제목과 본문 */
export function buildApprovalMail(user, env = process.env) {
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || '(이름 없음)'
  const email = user?.email || '(이메일 없음)'
  const joined = formatKst(user?.created_at)
  const link = approvalPageUrl(env)
  const lines = [
    '커리큘럼 위버에 가입 승인을 기다리는 교사가 있습니다.',
    '',
    `이름: ${name}`,
    `이메일: ${email}`,
    joined ? `가입 시각: ${joined} (한국 시간)` : null,
    '',
    link ? `승인 화면: ${link}` : null,
  ].filter((line) => line !== null)
  return { subject: `[커리큘럼 위버] 가입 승인 요청: ${name}`, body: lines.join('\n') }
}

/**
 * 승인 대기 사용자를 관리자에게 알린다. 기다리지 않고 부른다(반환한 프로미스는 테스트용).
 * @param {object} user - Supabase auth user
 * @returns {Promise<'sent'|'skipped'|'failed'>}
 */
export async function notifyApprovalPending(user, { env = process.env, fetchImpl = globalThis.fetch, mark = markApprovalNotified } = {}) {
  try {
    const config = getNotifyConfig(env)
    if (!config || !user?.id) return 'skipped'
    if (user.app_metadata?.approval_notified_at) return 'skipped'
    if (handled.has(user.id)) return 'skipped'
    if (handled.size >= MAX_TRACKED) handled.clear()
    handled.add(user.id)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
    let ok = false
    try {
      const res = await fetchImpl(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: config.secret, ...buildApprovalMail(user, env) }),
        signal: controller.signal,
      })
      const text = await res.text().catch(() => '')
      // Apps Script 웹 앱은 오류도 200으로 답하므로 본문의 ok 표시를 확인한다
      ok = res.ok && /"ok"\s*:\s*true/.test(text)
    } finally {
      clearTimeout(timer)
    }
    if (!ok) {
      handled.delete(user.id) // 다음 요청에서 다시 시도
      console.warn('[approvalNotify] 승인 요청 메일 발송 실패')
      return 'failed'
    }
    // 재시작 뒤에도 다시 보내지 않도록 남긴다. 기록에 실패해도 이 프로세스에서는 다시 보내지 않는다.
    if (isSupabaseConfigured(env)) {
      await mark(user.id).catch((err) => console.warn('[approvalNotify] 발송 기록 실패:', err?.message || err))
    }
    return 'sent'
  } catch (err) {
    if (user?.id) handled.delete(user.id)
    console.warn('[approvalNotify] 승인 요청 메일 알림 오류:', err?.message || err)
    return 'failed'
  }
}

/** 테스트 전용 */
export function _resetApprovalNotifyForTest() {
  handled.clear()
}
