import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { beforeEach, afterEach, it, expect, vi, describe } from 'vitest'
import ExplorePage from '../ExplorePage'
import ContinueProjects from '../../components/ContinueProjects'
import { recordRecentProject, readRecentProjects } from '../../lib/recentProjects'
import { createDraft, saveDraft } from '../../lib/explorationDraft'
import { writeBasket, NEW_DESTINATION } from '../../lib/exploreDestination'

vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ user: { email: 'teacher@example.test' }, logout: vi.fn() }) }))
vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), API_BASE: '', getHeaders: vi.fn() }))

let host, root
function Url() { const l = useLocation(); return <output data-testid="url">{l.pathname}{l.search}</output> }
const links = () => [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) }, clear: () => map.clear(), key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  }
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // Node 25의 전역 localStorage가 테스트 환경 것을 가리므로 메모리 저장소로 바꿔 끼운다
  vi.stubGlobal('localStorage', memoryStorage())
  sessionStorage.clear()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

describe('탐색 시작 화면', () => {
  const project = { id: 'p1', workspace_id: 'w1', title: '고1 기후·에너지 융합 수업', current_procedure: 'A-1-2', status: 'active', my_role: 'owner' }
  const get = vi.fn(async (url) => {
    if (url === '/api/workspaces') return [{ id: 'w1', name: '1학년 융합 수업 팀' }]
    if (url === '/api/workspaces/w1/projects') return [project, { id: 'sim', title: '[시뮬레이션] 결과', status: 'simulation' }, { id: 'demo', title: '시연', learner_context: { demo: true } }]
    if (url === '/api/projects/p1') return project
    if (url === '/api/standards/project/p1') return [{}, {}, {}, {}, {}, {}]
    throw new Error(`예상하지 않은 조회: ${url}`)
  })
  async function mount(entry) {
    await act(async () => root.render(
      <MemoryRouter initialEntries={[entry]}><Routes><Route path="/explore" element={<><ExplorePage get={get} /><Url /></>} /></Routes></MemoryRouter>,
    ))
    await flush()
  }

  it('진행 중인 프로젝트로 오면 모든 탐색 입구에 보낼 곳을 싣고, 팀 절차는 표시 코드로만 보인다', async () => {
    await mount('/explore?project=p1')
    const hrefs = links()
    expect(hrefs).toContain('/graph?mode=design&lens=theme&project=p1')
    expect(hrefs).toContain('/graph?mode=design&lens=pair&project=p1')
    expect(hrefs).toContain('/graph?mode=design&lens=neighbor&project=p1')
    expect(hrefs).toContain('/graph?mode=explore&project=p1')
    expect(hrefs).toContain('/futures-lab?project=p1')
    expect(host.textContent).toContain('팀의 현재 절차는 A-2입니다')
    expect(host.textContent).not.toContain('A-1-2')
    expect(host.textContent).toContain('(6개)')
    // 시뮬레이션·시연 프로젝트는 보낼 곳 목록에 없다
    const options = [...host.querySelectorAll('#dest-project-select option')].map((o) => o.value)
    expect(options).toEqual(['p1'])
    // 이 화면은 쓰기 요청을 보내지 않는다
    expect(get.mock.calls.every(([url]) => !url.includes('procedure'))).toBe(true)
  })

  it('프로젝트를 고르라고 왔으면 최근 프로젝트를 고르고 URL에 기록한다', async () => {
    await mount('/explore?for=project')
    expect(host.querySelector('[data-testid="url"]').textContent).toBe('/explore?project=p1')
  })

  it('새 프로젝트로 8개를 담았으면 임의로 자르지 않고 비교를 막는다', async () => {
    writeBasket(sessionStorage, NEW_DESTINATION, ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8'])
    await mount('/explore?for=new')
    expect(host.textContent).toContain('비교는 7개까지 합니다')
    const compareButtons = [...host.querySelectorAll('button')].filter((b) => b.textContent.includes('미래보기'))
    expect(compareButtons.length).toBeGreaterThan(0)
    expect(compareButtons.every((b) => b.disabled)).toBe(true)
    expect(links().some((h) => h.startsWith('/futures-lab'))).toBe(false)
  })
})

describe('홈의 이어서 하기', () => {
  it('404·403은 빼고 기록에서도 지우며, 네트워크 실패는 확인 실패 카드로 남긴다', async () => {
    recordRecentProject(localStorage, { id: 'ok', workspaceId: 'w1', title: '진행 중' }, 3)
    recordRecentProject(localStorage, { id: 'gone', workspaceId: 'w1', title: '지움' }, 2)
    recordRecentProject(localStorage, { id: 'net', workspaceId: 'w1', title: '연결 끊김' }, 1)
    saveDraft(localStorage, createDraft({ projectId: 'ok', text: '초안' }))
    const get = vi.fn(async (url) => {
      if (url === '/api/projects/ok') return { id: 'ok', workspace_id: 'w1', title: '진행 중', current_procedure: 'A-2-1', my_role: 'host' }
      const err = new Error('실패'); err.status = url.endsWith('gone') ? 404 : 0; throw err
    })
    await act(async () => root.render(<MemoryRouter><ContinueProjects workspaces={[{ id: 'w1', name: '1학년 팀' }]} get={get} /></MemoryRouter>))
    await flush()
    expect(host.textContent).toContain('진행 중')
    expect(host.textContent).toContain('A-3')
    expect(host.textContent).not.toContain('A-2-1')
    expect(host.textContent).toContain('호스트')
    expect(host.textContent).toContain('1학년 팀')
    expect(host.textContent).toContain('A-3에서 검토할 탐색 초안 1건이 있습니다.')
    expect(host.textContent).not.toContain('지움')
    expect(host.textContent).toContain('프로젝트 정보를 확인하지 못했습니다.')
    expect(readRecentProjects(localStorage).map((e) => e.id)).toEqual(['ok', 'net'])
    expect(links()).toContain('/workspaces/w1/projects/ok')
    expect(links()).toContain('/explore?project=ok')
  })

  it('기록이 없으면 영역을 그리지 않는다', async () => {
    await act(async () => root.render(<MemoryRouter><ContinueProjects get={vi.fn()} /></MemoryRouter>))
    expect(host.textContent).toBe('')
  })
})
