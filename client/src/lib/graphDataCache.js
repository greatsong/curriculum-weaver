/**
 * /api/standards/graph 응답 공유 캐시 (성능, 2026-07-12)
 *
 * DesignMode·Graph3D·InlineGraph2D가 각자 mount마다 전체 그래프(gzip ~1.2MB)를
 * 재다운로드하던 것을 세션 내 1회로 줄인다.
 * - status 파라미터별 캐시 + 동시 요청 단일화(in-flight dedup)
 * - 콜드스타트 대비 재시도(기존 Graph3D 동작 계승)
 * - 링크 상태 변경·추가 후에는 invalidateGraphCache() 호출로 강제 재조회
 */
import { apiGet } from './api'

const cache = new Map()    // status → graph data
const inflight = new Map() // status → Promise

/**
 * 그래프 데이터 조회 (캐시 우선).
 * @param {string} status - 'published' | 'all' | 'candidate,reviewed' 등
 * @param {number} retries - 콜드스타트 대비 재시도 횟수
 * @returns {Promise<{nodes: object[], links: object[]}>}
 */
export function fetchGraphData(status = 'published', retries = 2) {
  if (cache.has(status)) return Promise.resolve(cache.get(status))
  if (inflight.has(status)) return inflight.get(status)

  const load = (async () => {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await apiGet(`/api/standards/graph?status=${encodeURIComponent(status)}`)
        cache.set(status, data)
        return data
      } catch (e) {
        lastErr = e
        if (attempt < retries) await new Promise((r) => setTimeout(r, 2000))
      }
    }
    throw lastErr
  })()

  inflight.set(status, load)
  load.finally(() => inflight.delete(status))
  return load
}

/** 링크 추가/상태 변경 등 그래프에 영향 주는 변이 후 호출 — 다음 조회부터 재다운로드 */
export function invalidateGraphCache() {
  cache.clear()
}
