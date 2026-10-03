import { describe, it, expect } from 'vitest'
import {
  readRecentProjects, recordRecentProject, removeRecentProject, resolveRecentProjects,
  RECENT_PROJECTS_KEY, RECENT_PROJECTS_MAX,
} from '../recentProjects'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
}
const throwing = { getItem: () => { throw new Error('막힘') }, setItem: () => { throw new Error('막힘') } }

describe('최근 프로젝트 기록', () => {
  it('최근 순으로 최대 5개, 같은 프로젝트는 맨 앞으로', () => {
    const s = memoryStorage()
    for (let i = 0; i < 7; i++) recordRecentProject(s, { id: `p${i}`, workspaceId: 'w1', title: `제목${i}` }, 100 + i)
    let list = readRecentProjects(s)
    expect(list).toHaveLength(RECENT_PROJECTS_MAX)
    expect(list.map((e) => e.id)).toEqual(['p6', 'p5', 'p4', 'p3', 'p2'])
    recordRecentProject(s, { id: 'p3', workspaceId: 'w1', title: '바뀐 제목' }, 200)
    list = readRecentProjects(s)
    expect(list.map((e) => e.id)).toEqual(['p3', 'p6', 'p5', 'p4', 'p2'])
    expect(list[0]).toEqual({ id: 'p3', workspaceId: 'w1', title: '바뀐 제목', visitedAt: 200 })
  })

  it('필수 값이 없으면 기록하지 않는다', () => {
    const s = memoryStorage()
    expect(recordRecentProject(s, { id: 'p1' })).toBe(false)
    expect(recordRecentProject(s, null)).toBe(false)
    expect(readRecentProjects(s)).toEqual([])
  })

  it('깨진 값·잘못된 항목·중복을 걸러 읽는다', () => {
    const s = memoryStorage()
    s.setItem(RECENT_PROJECTS_KEY, JSON.stringify([
      { id: 'a', workspaceId: 'w', visitedAt: 1 }, { id: 'a', workspaceId: 'w', visitedAt: 5 },
      { id: '', workspaceId: 'w', visitedAt: 9 }, 'x', { id: 'b', workspaceId: 'w', visitedAt: 'x' },
    ]))
    expect(readRecentProjects(s)).toEqual([{ id: 'a', workspaceId: 'w', title: '', visitedAt: 5 }])
    s.setItem(RECENT_PROJECTS_KEY, '{깨짐')
    expect(readRecentProjects(s)).toEqual([])
  })

  it('막힌 저장소에서도 예외를 내지 않는다', () => {
    expect(readRecentProjects(throwing)).toEqual([])
    expect(recordRecentProject(throwing, { id: 'a', workspaceId: 'w' })).toBe(false)
    expect(removeRecentProject(throwing, 'a')).toBe(false)
  })

  it('지우기', () => {
    const s = memoryStorage()
    recordRecentProject(s, { id: 'a', workspaceId: 'w' }, 1)
    recordRecentProject(s, { id: 'b', workspaceId: 'w' }, 2)
    removeRecentProject(s, 'a')
    expect(readRecentProjects(s).map((e) => e.id)).toEqual(['b'])
  })
})

describe('서버 확인', () => {
  const entries = [
    { id: 'ok', workspaceId: 'w', title: '', visitedAt: 3 },
    { id: 'gone', workspaceId: 'w', title: '', visitedAt: 2 },
    { id: 'denied', workspaceId: 'w', title: '', visitedAt: 1 },
    { id: 'net', workspaceId: 'w', title: '', visitedAt: 0 },
    { id: 'demo', workspaceId: 'w', title: '', visitedAt: 0 },
  ]
  const fetchProject = async (id) => {
    if (id === 'ok') return { id, title: '진행 중', current_procedure: 'A-1-2' }
    if (id === 'demo') return { id, learner_context: { demo: true } }
    const err = new Error('실패')
    err.status = id === 'gone' ? 404 : id === 'denied' ? 403 : 0
    throw err
  }

  it('404·403은 조용히 빼고, 네트워크 실패는 확인 실패로 남긴다', async () => {
    const { items, removed } = await resolveRecentProjects(entries, fetchProject)
    expect(items.map((r) => [r.entry.id, r.state])).toEqual([['ok', 'ok'], ['net', 'error']])
    expect(items[0].project.title).toBe('진행 중')
    expect(removed).toEqual(['gone', 'denied', 'demo'])
  })
})
