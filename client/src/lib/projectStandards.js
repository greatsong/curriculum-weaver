/**
 * 새 프로젝트에 성취기준을 일괄 연결한다(프로젝트 만들기 직후).
 *
 * 2026-10-03 검토: 예전에는 일괄 저장이 실패해도 console.warn만 남기고 넘어가, 프로젝트만 생기고
 * 성취기준은 빠진 것을 교사가 알 수 없었다. 서버도 일부 실패를 ok:true로 돌려줬다.
 * - 서버가 항목별 결과(results)를 주면 저장(saved)·코드 없음(unresolved)·실패(failed)를 나눈다.
 * - 실패한 항목만 한 번 더 보낸다. 서버 저장은 upsert라 다시 보내도 중복으로 붙지 않는다.
 * - 권한·잘못된 요청(4xx, 408·429 제외)은 다시 보내지 않는다.
 * - 옛 서버(results 없음)는 HTTP 성공이면 모두 저장된 것으로 본다(종전 동작).
 *
 * @param {(path: string, body: object) => Promise<any>} post - apiPost
 * @param {string} projectId
 * @param {string[]} keys - 성취기준 key 목록
 * @param {{ retryDelayMs?: number }} [opts]
 * @returns {Promise<{ saved: string[], unresolved: string[], failed: string[], error: Error|null }>}
 */
export async function saveProjectStandards(post, projectId, keys, { retryDelayMs = 800 } = {}) {
  const saved = new Set()
  const unresolved = new Set()
  let pending = [...new Set(keys)]
  let lastError = null

  for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
    if (attempt > 0 && retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs))
    try {
      const res = await post(`/api/standards/project/${projectId}/bulk`, { standard_codes: pending })
      const results = Array.isArray(res?.results) ? res.results : null
      if (!results) {
        for (const k of pending) saved.add(k)
        pending = []
        lastError = null
        break
      }
      for (const r of results) {
        if (r?.status === 'saved') saved.add(r.key)
        else if (r?.status === 'unresolved') unresolved.add(r.key)
      }
      pending = pending.filter((k) => !saved.has(k) && !unresolved.has(k))
      lastError = pending.length > 0 ? new Error('일부 성취기준을 저장하지 못했습니다.') : null
    } catch (err) {
      lastError = err
      const status = err?.status ?? 0
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) break
    }
  }

  const failed = keys.filter((k) => !saved.has(k) && !unresolved.has(k))
  return { saved: [...saved], unresolved: [...unresolved], failed: [...new Set(failed)], error: failed.length ? lastError : null }
}

/** 성취기준 key를 화면에 보일 코드로 바꾼다(복합 키 "코드|과목"이면 코드만). */
function displayKey(key) {
  return String(key).split('|')[0]
}

/**
 * 일부 저장에 실패했을 때 교사에게 보일 안내. 모두 저장됐으면 null.
 * @param {{ failed: string[], unresolved: string[] }} outcome
 */
export function standardsSaveNotice(outcome) {
  const lines = []
  if (outcome.failed.length) {
    lines.push(`프로젝트는 만들었지만 성취기준 ${outcome.failed.length}개를 저장하지 못했습니다.`)
    lines.push(outcome.failed.map(displayKey).join(', '))
  }
  if (outcome.unresolved.length) {
    lines.push(`찾을 수 없는 성취기준 코드 ${outcome.unresolved.length}개는 담지 않았습니다.`)
    lines.push(outcome.unresolved.map(displayKey).join(', '))
  }
  if (!lines.length) return null
  lines.push('프로젝트 화면 위쪽의 [성취기준] 메뉴에서 다시 담아 주세요.')
  return lines.join('\n')
}
