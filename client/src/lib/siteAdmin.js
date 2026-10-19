/**
 * 사이트 관리자(users.role='admin') 여부 — 관리자 전용 화면(미래보기)의 경로와 메뉴를 가린다.
 * 판단의 정본은 서버다(requireAdmin). 화면은 GET /api/auth/me의 role로 보이기만 정한다.
 * 같은 사용자의 조회는 한 번만 한다. 조회가 실패하면(망·서버 오류) 캐시하지 않고 error로 알린다.
 * 실패를 "관리자 아님"과 구분해야 관리자가 일시적인 연결 실패 때 아무 안내 없이 다른 화면으로 밀려나지 않는다.
 */
import { useCallback, useEffect, useState } from 'react'
import { apiGet } from './api'
import { useAuthStore } from '../stores/authStore'

const cache = new Map() // userId → Promise<boolean> (실패한 조회는 지운다)

export function fetchIsSiteAdmin(userId, get = apiGet) {
  if (!userId) return Promise.resolve(false)
  if (!cache.has(userId)) {
    const request = Promise.resolve()
      .then(() => get('/api/auth/me'))
      .then((me) => me?.role === 'admin')
      .catch((err) => { cache.delete(userId); throw err })
    cache.set(userId, request)
  }
  return cache.get(userId)
}

/** 테스트 전용 */
export function _clearSiteAdminCache() { cache.clear() }

/**
 * @returns {{ loading: boolean, isAdmin: boolean, error: unknown, retry: () => void }}
 *   error가 있으면 관리자 여부를 모르는 상태다(isAdmin은 false로 둔다).
 */
export function useIsSiteAdmin() {
  const rawId = useAuthStore((s) => s.user?.id)
  const userId = typeof rawId === 'string' && rawId ? rawId : null // 문자열 id만 쓴다(렌더마다 새 값이면 조회가 반복된다)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ userId: null, attempt: -1, isAdmin: false, error: null })
  useEffect(() => {
    if (!userId) return undefined
    let alive = true
    fetchIsSiteAdmin(userId).then(
      (isAdmin) => { if (alive) setResult({ userId, attempt, isAdmin, error: null }) },
      (error) => { if (alive) setResult({ userId, attempt, isAdmin: false, error: error || new Error('관리자 확인 실패') }) },
    )
    return () => { alive = false }
  }, [userId, attempt])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  if (!userId) return { loading: false, isAdmin: false, error: null, retry }
  if (result.userId !== userId || result.attempt !== attempt) return { loading: true, isAdmin: false, error: null, retry }
  return { loading: false, isAdmin: result.isAdmin, error: result.error, retry }
}
