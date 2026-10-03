import { apiGet } from './api'

// 화면 연결만 끊겼다면 서버 작업을 다시 만들지 않고 기존 결과를 기다린다.
export async function recoverSimulation(project, { signal, onWaiting = () => {}, timeoutMs = 32 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (!signal?.aborted && Date.now() < deadline) {
    try {
      const result = await apiGet(`/api/projects/${project.projectId}`)
      if (signal?.aborted) return null
      if (result?.status === 'simulation' || result?.status === 'failed') return result
    } catch (error) {
      if ([401, 403, 404].includes(error.status)) throw error
      // 일시적인 네트워크 장애는 다음 조회에서 다시 확인한다.
    }
    onWaiting()
    await new Promise(resolve => {
      const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve() }
      const timer = setTimeout(done, 5000)
      signal?.addEventListener('abort', done, { once: true })
    })
  }
  if (signal?.aborted) return null
  throw new Error('아직 완료 상태를 확인하지 못했습니다. 워크스페이스에서 생성된 시뮬레이션을 확인해주세요.')
}
