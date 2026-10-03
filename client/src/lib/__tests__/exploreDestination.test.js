import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseDestination, withDestination, basketStorageKey, readBasket, writeBasket, clearBasket,
  compareAvailability, futuresUrl, graphUrl, exploreHubUrl, projectPath, destinationAccess,
  NEW_BASKET_KEY, LEGACY_BASKET_KEY, NEW_DESTINATION, projectDestination, mergeBasketMeta, readBasketMeta,
} from '../exploreDestination'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    dump: () => Object.fromEntries(map),
  }
}
const throwing = { getItem: () => { throw new Error('막힘') }, setItem: () => { throw new Error('막힘') }, removeItem: () => { throw new Error('막힘') } }

describe('보낼 곳 파싱', () => {
  it('project 파라미터가 있으면 프로젝트, 없거나 비면 새 프로젝트', () => {
    expect(parseDestination('?project=p1')).toEqual({ type: 'project', projectId: 'p1' })
    expect(parseDestination('?project=%20p2%20&mode=design')).toEqual({ type: 'project', projectId: 'p2' })
    expect(parseDestination('?mode=explore')).toEqual(NEW_DESTINATION)
    expect(parseDestination('?project=')).toEqual(NEW_DESTINATION)
    expect(parseDestination(new URLSearchParams('project=p3'))).toEqual({ type: 'project', projectId: 'p3' })
  })
  it('지나치게 긴 값은 받지 않는다', () => {
    expect(parseDestination(`?project=${'x'.repeat(300)}`)).toEqual(NEW_DESTINATION)
  })
  it('기존 파라미터를 보존하며 보낼 곳만 바꾼다', () => {
    const base = new URLSearchParams('mode=explore&subjects=과학&focus=k1&tour=1')
    const next = withDestination(base, projectDestination('p1'))
    expect(next.get('subjects')).toBe('과학'); expect(next.get('focus')).toBe('k1'); expect(next.get('tour')).toBe('1')
    expect(next.get('project')).toBe('p1')
    expect(withDestination(next, NEW_DESTINATION).has('project')).toBe(false)
    expect(base.has('project')).toBe(false) // 원본 불변
  })
})

describe('목적지별 담기 키', () => {
  let storage
  beforeEach(() => { storage = memoryStorage() })

  it('새 프로젝트와 프로젝트별 키를 나눈다', () => {
    expect(basketStorageKey(NEW_DESTINATION)).toBe(NEW_BASKET_KEY)
    expect(basketStorageKey(projectDestination('p1'))).toBe('cw_explore_basket:project:p1')
  })

  it('새 프로젝트 담기는 기존 키와 같은 값으로 함께 쓴다(프로젝트 만들기 호환)', () => {
    writeBasket(storage, NEW_DESTINATION, ['a', 'b', 'a'])
    expect(JSON.parse(storage.getItem(NEW_BASKET_KEY))).toEqual(['a', 'b'])
    expect(JSON.parse(storage.getItem(LEGACY_BASKET_KEY))).toEqual(['a', 'b'])
  })

  it('옛 화면이 기존 키에만 담은 것도 새 프로젝트 담기로 읽는다', () => {
    storage.setItem(NEW_BASKET_KEY, JSON.stringify(['a']))
    storage.setItem(LEGACY_BASKET_KEY, JSON.stringify(['a', 'old']))
    expect(readBasket(storage, NEW_DESTINATION)).toEqual(['a', 'old'])
  })

  it('프로젝트 담기는 새 프로젝트·다른 프로젝트와 섞이지 않는다', () => {
    writeBasket(storage, NEW_DESTINATION, ['n1'])
    writeBasket(storage, projectDestination('p1'), ['p1a'])
    writeBasket(storage, projectDestination('p2'), ['p2a'])
    expect(readBasket(storage, projectDestination('p1'))).toEqual(['p1a'])
    expect(readBasket(storage, projectDestination('p2'))).toEqual(['p2a'])
    expect(readBasket(storage, NEW_DESTINATION)).toEqual(['n1'])
    expect(JSON.parse(storage.getItem(LEGACY_BASKET_KEY))).toEqual(['n1'])
  })

  it('비우기는 목적지 것만 지운다', () => {
    writeBasket(storage, NEW_DESTINATION, ['n1'])
    writeBasket(storage, projectDestination('p1'), ['p1a'])
    clearBasket(storage, projectDestination('p1'))
    expect(readBasket(storage, projectDestination('p1'))).toEqual([])
    expect(readBasket(storage, NEW_DESTINATION)).toEqual(['n1'])
    clearBasket(storage, NEW_DESTINATION)
    expect(storage.getItem(LEGACY_BASKET_KEY)).toBeNull()
  })

  it('깨진 값과 막힌 저장소에서도 예외 없이 빈 목록', () => {
    storage.setItem(NEW_BASKET_KEY, '{깨짐')
    expect(readBasket(storage, NEW_DESTINATION)).toEqual([])
    expect(readBasket(throwing, NEW_DESTINATION)).toEqual([])
    expect(writeBasket(throwing, NEW_DESTINATION, ['a'])).toBe(false)
    expect(clearBasket(throwing, NEW_DESTINATION)).toBe(false)
    expect(readBasketMeta(throwing)).toEqual({})
  })

  it('교과 메타는 누적된다', () => {
    mergeBasketMeta(storage, [['a', '국어']])
    mergeBasketMeta(storage, [['b', '과학'], ['c', '']])
    expect(readBasketMeta(storage)).toEqual({ a: '국어', b: '과학' })
  })
})

describe('비교 가능 개수와 주소', () => {
  it('2~7개만 비교하고, 넘치면 자르지 않고 막는다', () => {
    expect(compareAvailability(1)).toEqual({ ok: false, reason: 'tooFew' })
    expect(compareAvailability(2).ok).toBe(true)
    expect(compareAvailability(7).ok).toBe(true)
    expect(compareAvailability(8)).toEqual({ ok: false, reason: 'tooMany' })
  })
  it('주소에 보낼 곳을 함께 싣는다', () => {
    const dest = projectDestination('p1')
    expect(futuresUrl({ keys: ['k1', 'k2'], destination: dest })).toBe('/futures-lab?codes=k1%2Ck2&project=p1')
    expect(futuresUrl({ keys: [], destination: NEW_DESTINATION })).toBe('/futures-lab')
    expect(graphUrl({ mode: 'design', lens: 'pair', destination: dest })).toBe('/graph?mode=design&lens=pair&project=p1')
    expect(graphUrl({ mode: 'explore', destination: NEW_DESTINATION })).toBe('/graph?mode=explore')
    expect(exploreHubUrl(dest)).toBe('/explore?project=p1')
    expect(exploreHubUrl(NEW_DESTINATION, { preferNew: true })).toBe('/explore?for=new')
    expect(projectPath({ id: 'p1', workspace_id: 'w1' })).toBe('/workspaces/w1/projects/p1')
    expect(projectPath({ id: 'p1' })).toBe('')
  })
})

describe('보낼 곳 쓰기 가능 여부', () => {
  it.each([
    [{ status: 'active', my_role: 'owner' }, { canSend: true, readOnly: false, blocked: false }],
    [{ status: 'simulation' }, { canSend: false, readOnly: true, blocked: false }],
    [{ status: 'active', title: '[시뮬레이션] 결과' }, { canSend: false, readOnly: true, blocked: false }],
    [{ status: 'active', my_role: 'viewer' }, { canSend: false, readOnly: true, blocked: false }],
    [{ status: 'generating' }, { canSend: false, readOnly: false, blocked: true }],
    [{ status: 'failed' }, { canSend: false, readOnly: false, blocked: true }],
    [{ status: 'active', learner_context: { demo: true } }, { canSend: false, readOnly: false, blocked: true }],
  ])('%j', (project, expected) => {
    expect(destinationAccess(project)).toEqual(expected)
  })
})
