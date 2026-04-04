import { supabase } from './supabase'

export const API_BASE = import.meta.env.VITE_API_URL || ''

const DEFAULT_TIMEOUT_MS = 60_000

export class ApiError extends Error {
  constructor(message, status = 0, retryable = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryable = retryable
  }
}

/**
 * Supabase 세션에서 Authorization 헤더를 포함한 헤더 객체를 반환한다
 */
async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  } catch {
    // 인증 없이 계속 진행 (테스트 모드 등)
  }
  return headers
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
  const headers = await getHeaders()
  const qs = new URLSearchParams(params).toString()
  const fullPath = `${API_BASE}${path}`
  const url = qs ? `${fullPath}?${qs}` : fullPath
  const res = await fetchWithTimeout(url, { headers })
  return res.json()
}

export async function apiPost(path, body = {}) {
  const headers = await getHeaders()
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function apiPut(path, body = {}) {
  const headers = await getHeaders()
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function apiDelete(path) {
  const headers = await getHeaders()
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers,
  })
  return res.json()
}

/**
 * 파일 업로드 POST 요청 (multipart/form-data)
 */
export async function apiUploadFile(path, file, extraFields = {}) {
  const formData = new FormData()
  formData.append('file', file)
  for (const [key, value] of Object.entries(extraFields)) {
    formData.append(key, value)
  }

  // Authorization 헤더만 추가 (Content-Type은 브라우저가 설정)
  const authHeaders = {}
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      authHeaders['Authorization'] = `Bearer ${session.access_token}`
    }
  } catch {
    // 인증 없이 계속 진행
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError(body.error || `API 오류: ${res.status}`, res.status)
    }

    return res.json()
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof ApiError) throw err
    if (err.name === 'AbortError') {
      throw new ApiError('파일 처리 시간이 초과되었습니다.', 0)
    }
    throw new ApiError('네트워크 연결을 확인해주세요.', 0)
  }
}

/**
 * SSE 스트리밍 POST 요청 (AI 채팅용)
 */
export async function apiStreamPost(path, body, { onText, onPrinciples, onBoardSuggestions, onStageAdvance, onDone, onError }) {
  // Authorization 헤더 추가
  const headers = { 'Content-Type': 'application/json' }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  } catch {
    // 인증 없이 계속 진행
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
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
        else if (parsed.type === 'board_suggestions') onBoardSuggestions?.(parsed.suggestions, parsed.appliedBoards)
        else if (parsed.type === 'stage_advance' || parsed.type === 'procedure_advance') onStageAdvance?.(parsed)
        else if (parsed.type === 'step_advance') onStageAdvance?.(parsed)
        else if (parsed.type === 'error') onError?.(parsed.message)
      } catch {
        // 파싱 실패 무시
      }
    }
  }
  onDone?.()
}
