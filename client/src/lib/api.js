// import { supabase } from './supabase'  // 나중에 다시 활성화

export const API_BASE = import.meta.env.VITE_API_URL || ''

const DEFAULT_TIMEOUT_MS = 30_000

export class ApiError extends Error {
  constructor(message, status = 0, retryable = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryable = retryable
  }
}

// 테스트 모드: 인증 없이 사용
function getHeaders() {
  return { 'Content-Type': 'application/json' }
}

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError(body.error || `API 오류: ${res.status}`, res.status)
    }

    return res
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof ApiError) throw err
    if (err.name === 'AbortError') {
      throw new ApiError('서버 응답 시간이 초과되었습니다.', 0)
    }
    throw new ApiError('네트워크 연결을 확인해주세요.', 0)
  }
}

export async function apiGet(path, params = {}) {
  const headers = getHeaders()
  const qs = new URLSearchParams(params).toString()
  const fullPath = `${API_BASE}${path}`
  const url = qs ? `${fullPath}?${qs}` : fullPath
  const res = await fetchWithTimeout(url, { headers })
  return res.json()
}

export async function apiPost(path, body = {}) {
  const headers = getHeaders()
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function apiPut(path, body = {}) {
  const headers = getHeaders()
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function apiDelete(path) {
  const headers = getHeaders()
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers,
  })
  return res.json()
}

/**
 * SSE 스트리밍 POST 요청 (AI 채팅용)
 */
export async function apiStreamPost(path, body, { onText, onPrinciples, onDone, onError }) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    onError?.(err.error || '알 수 없는 오류')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') {
        onDone?.()
        return
      }
      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'text') onText?.(parsed.content)
        else if (parsed.type === 'principles') onPrinciples?.(parsed.principles)
        else if (parsed.type === 'error') onError?.(parsed.message)
      } catch {
        // 파싱 실패 무시
      }
    }
  }
  onDone?.()
}
