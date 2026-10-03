/**
 * 보낼 곳 프로젝트 정보 — 탐색 화면 머리 줄에 제목·쓰기 가능 여부를 보이기 위해 한 번 조회한다.
 * 실패해도 탐색은 막지 않는다(머리 줄에 확인 실패만 표시).
 */
import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

export function useDestinationProject(projectId, { get = apiGet } = {}) {
  const [state, setState] = useState({ status: projectId ? 'loading' : 'none', project: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!projectId) { setState({ status: 'none', project: null }); return undefined }
    let alive = true
    setState({ status: 'loading', project: null })
    get(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((project) => { if (alive) setState(project?.id ? { status: 'ready', project } : { status: 'error', project: null }) })
      .catch(() => { if (alive) setState({ status: 'error', project: null }) })
    return () => { alive = false }
  }, [projectId, get, tick])
  const retry = useCallback(() => setTick((n) => n + 1), [])
  return { ...state, retry }
}
