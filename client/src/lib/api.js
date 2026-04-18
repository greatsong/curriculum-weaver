import { supabase } from './supabase'

export const API_BASE = import.meta.env.VITE_API_URL || ''

const DEFAULT_TIMEOUT_MS = 60_000

export class ApiError extends Error {
  constructor(message, status = 0, retryable = false, code = null, field = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryable = retryable
    this.code = code
    this.field = field
  }
}

/**
 * 서버 에러 응답 body({ error: { code, message, field } } 또는 레거시 { error: '...' })를
 * ApiError로 변환한다.
 */
function parseApiErrorBody(body, status) {
  if (body && typeof body.error === 'object' && body.error !== null) {
    const { code = null, message = '요청에 실패했습니다.', field = null } = body.error
    return new ApiError(message, status, false, code, field)
  }
  if (body && typeof body.error === 'string') {
    return new ApiError(body.error, status)
  }
  return new ApiError(`API 오류: ${status}`, status)
}

/**
 * Supabase 세션에서 Authorization 헤더를 포함한 헤더 객체를 반환한다
 */
export async function getHeaders() {
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
      throw parseApiErrorBody(body, res.status)
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
 * 파일 업로드 POST 요청 (multipart/form-data).
 *
 * XMLHttpRequest 기반으로 동작하여 업로드 진행률(progress)을 콜백으로 전달한다.
 *
 * @param {string} path
 * @param {File} file
 * @param {Record<string, string>} extraFields
 * @param {{ onProgress?: (p: { loaded: number, total: number, percent: number }) => void, timeoutMs?: number }} [options]
 */
export async function apiUploadFile(path, file, extraFields = {}, options = {}) {
  const { onProgress, timeoutMs = 120_000 } = options

  const formData = new FormData()
  formData.append('file', file)
  for (const [key, value] of Object.entries(extraFields)) {
    if (value === undefined || value === null) continue
    formData.append(key, value)
  }

  // Supabase 세션 토큰 조회
  let accessToken = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) accessToken = session.access_token
  } catch {
    // 인증 없이 계속 진행 (테스트 모드)
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}${path}`)
    if (accessToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    }
    xhr.timeout = timeoutMs

    xhr.upload.onprogress = (e) => {
      if (!onProgress) return
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100)
        onProgress({ loaded: e.loaded, total: e.total, percent })
      }
    }

    xhr.onload = () => {
      const status = xhr.status
      let body = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        body = null
      }
      if (status >= 200 && status < 300) {
        resolve(body)
      } else {
        reject(parseApiErrorBody(body, status))
      }
    }

    xhr.onerror = () => {
      reject(new ApiError('네트워크 연결을 확인해주세요.', 0))
    }

    xhr.ontimeout = () => {
      reject(new ApiError('파일 처리 시간이 초과되었습니다.', 0))
    }

    xhr.onabort = () => {
      reject(new ApiError('업로드가 취소되었습니다.', 0))
    }

    xhr.send(formData)
  })
}

/**
 * 자료 분석 결과 조회 (폴링용).
 * processing_status !== 'completed'이면 analysis는 null로 반환됨.
 */
export async function apiGetMaterialAnalysis(materialId) {
  return apiGet(`/api/materials/${materialId}/analysis`)
}

/**
 * 자료 재분석 트리거.
 */
export async function apiReanalyzeMaterial(materialId) {
  return apiPost(`/api/materials/${materialId}/reanalyze`, {})
}

/**
 * 자료 삭제.
 */
export async function apiDeleteMaterial(materialId) {
  return apiDelete(`/api/materials/${materialId}`)
}

/**
 * SSE 스트리밍 POST 요청 (AI 채팅용)
 */
export async function apiStreamPost(path, body, { onText, onPrinciples, onBoardSuggestions, onStageAdvance, onCoherenceCheck, onMessageSaved, onDone, onError }) {
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
        else if (parsed.type === 'coherence_check') onCoherenceCheck?.(parsed)
        else if (parsed.type === 'message_saved') onMessageSaved?.(parsed)
        else if (parsed.type === 'error') onError?.(parsed.message)
      } catch {
        // 파싱 실패 무시
      }
    }
  }
  onDone?.()
}
