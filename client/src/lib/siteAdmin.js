/**
 * 사이트 관리자(users.role='admin') 여부 — 관리자 전용 화면(미래보기)의 경로와 메뉴를 가린다.
 * 판단의 정본은 서버다(requireAdmin). 화면은 GET /api/auth/me의 role로 보이기만 정한다.
 * 같은 사용자의 조회는 한 번만 한다. 조회가 실패하면 관리자가 아닌 것으로 보고, 다음 화면에서 다시 묻는다.
 */
import { useEffect, useState } from 'react'
import { apiGet } from './api'
import { useAuthStore } from '../stores/authStore'

const cache = new Map() // userId → Promise<boolean>

export function fetchIsSiteAdmin(userId, get = apiGet) {
  if (!userId) return Promise.resolve(false)
  if (!cache.has(userId)) {
    const request = Promise.resolve()
      .then(() => get('/api/auth/me'))
      .then((me) => me?.role === 'admin')
      .catch(() => { cache.delete(userId); return false })
    cache.set(userId, request)
  }
  return cache.get(userId)
}

/** 테스트 전용 */
export function _clearSiteAdminCache() { cache.clear() }

/** @returns {{ loading: boolean, isAdmin: boolean }} */
export function useIsSiteAdmin() {
  const rawId = useAuthStore((s) => s.user?.id)
  const userId = typeof rawId === 'string' && rawId ? rawId : null // 문자열 id만 쓴다(렌더마다 새 값이면 조회가 반복된다)
  const [result, setResult] = useState({ userId: null, isAdmin: false })
  useEffect(() => {
    if (!userId) return undefined
    let alive = true
    fetchIsSiteAdmin(userId).then((isAdmin) => { if (alive) setResult({ userId, isAdmin }) })
    return () => { alive = false }
  }, [userId])
  if (!userId) return { loading: false, isAdmin: false }
  return result.userId === userId ? { loading: false, isAdmin: result.isAdmin } : { loading: true, isAdmin: false }
}
