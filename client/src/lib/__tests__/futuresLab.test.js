import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keywordId, layoutLabGraph, normalizeLabGraph } from '../futuresLabLayout'
import { createFuturesLabScene } from '../futuresLabScene'

const standards = Array.from({ length: 6 }, (_, i) => ({ key: `s-${i}`, code: `[12교과01-0${i + 1}]`, subject: ['음악', '음악', '수학', '수학', '국어', '국어'][i], content: `자료 ${i + 1}을 분석한다.` }))
const bridges = { keywords: Object.fromEntries(standards.map(s => [s.key, ['자료', '분석']])), concepts: [{ label: '함께 분석하기', ends: [{ key: 's-0', word: '자료' }, { key: 's-2', word: '분석' }], why: '서로 다른 자료를 비교한다.' }] }
const future = (i, roles = standards.map(s => ({ key: s.key, role: '자료를 비교한다.' }))) => ({ title: `미래 ${i}`, roles, situation: '실제 자료를 관찰한다.', driving_question: '무엇이 달라질까?', activity_steps: ['조사', '비교'] })

describe('실험실 과목과 연결 배치', () => {
  it('같은 키워드라도 성취기준의 소속을 유지하고 잘못된 끝점 연결은 제외한다', () => {
    const g = normalizeLabGraph(standards, { ...bridges, concepts: [...bridges.concepts, { label: '잘못된 연결', ends: [{ key: 's-0', word: '자료' }, { key: '없는 기준', word: '자료' }] }] })
    expect(g.groups).toHaveLength(3)
    expect(g.groups[0].standards).toHaveLength(2)
    expect(g.nodes).toHaveLength(12)
    expect(g.nodes.get(keywordId('s-0', '자료')).id).not.toBe(g.nodes.get(keywordId('s-1', '자료')).id)
    expect(g.concepts).toHaveLength(1)
  })
  it.each([288, 358, 768, 1000, 1224])('폭 %i에서 과목과 긴 이름표가 화면 안에 있고 연결점이 겹치지 않는다', width => {
    const word = '사회문화적맥락에서비판적으로자료해석하기'
    const data = { keywords: Object.fromEntries(standards.map(s => [s.key, [word, '자료']])), concepts: [{ label: '관점에 따라 다르게 해석하기', ends: [{ key: 's-0', word }, { key: 's-4', word }] }] }
    const layout = layoutLabGraph(standards, data, width)
    for (const g of layout.groups) { expect(g.x - g.radius).toBeGreaterThanOrEqual(0); expect(g.x + g.radius).toBeLessThanOrEqual(width) }
    for (const n of layout.nodes.values()) { expect(n.x - n.labelWidth / 2).toBeGreaterThanOrEqual(0); expect(n.x + n.labelWidth / 2).toBeLessThanOrEqual(width) }
    for (const h of layout.hubs) for (const g of layout.groups) expect(Math.hypot(h.x - g.x, h.y - g.y)).toBeGreaterThan(g.radius + 24)
  })
})

let root, scene, request, reduced, resize
const click = action => root.querySelector(`[data-act="${action}"]`).click()
const advance = ms => vi.advanceTimersByTimeAsync(ms)
const mount = (extra = {}) => (scene = createFuturesLabScene(root, { standards, requestFuture: request, ...extra }))
beforeEach(() => {
  vi.useFakeTimers(); reduced = false
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
  vi.stubGlobal('ResizeObserver', class { constructor(fn) { resize = fn } observe() {} disconnect() {} })
  root = document.createElement('div'); document.body.append(root)
  request = vi.fn(async i => future(i))
})
afterEach(() => { scene?.destroy(); root.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('실험실 생성과 수명 주기', () => {
  it('외부 지도의 시작 버튼으로 고리를 열고 지도에 돌아와도 결과와 관점을 보존한다', async () => {
    const phases = vi.fn(), graph = vi.fn(), retry = vi.fn()
    mount({ externalGraph: true, onPhaseChange: phases, onGraphState: graph, onRetryBridges: retry }).setBridges(bridges)
    expect(root.querySelector('.lab-graph-view').hidden).toBe(true)
    expect(graph).toHaveBeenLastCalledWith({ canOpen: true, status: 'ready' })
    await advance(90_000); expect(request).not.toHaveBeenCalled()
    scene.open(); await advance(0)
    expect(phases).toHaveBeenLastCalledWith('casting')
    await advance(3400)
    expect(phases).toHaveBeenLastCalledWith('future')
    root.querySelector('[data-lens="1"]').click(); click('graph')
    expect(phases).toHaveBeenLastCalledWith('graph')
    expect(root.querySelector('.lab-graph-view').hidden).toBe(true)
    scene.retryBridges(); expect(retry).toHaveBeenCalledTimes(1); scene.setBridges(bridges)
    scene.open(); await advance(0)
    expect(root.querySelector('.lab-future-card h2').textContent).toBe('미래 1')
    expect(request).toHaveBeenCalledTimes(8)
  })
  it('90초 대기·모델 변경·폭 변경으로 미래를 생성하지 않고 클릭 후 여덟 관점을 모두 준비한다', async () => {
    mount().setBridges(bridges)
    expect(root.querySelector('[data-act="open"]').disabled).toBe(true)
    click('open'); await advance(90_000); scene.setModel('precise'); resize([{ contentRect: { width: 500 } }]); await advance(90_000)
    expect(request).not.toHaveBeenCalled()
    click('open'); await advance(4000)
    expect(request.mock.calls).toEqual(Array.from({ length: 8 }, (_, i) => [i, 'precise']))
    expect(root.querySelector('.lab-future-card h2').textContent).toBe('미래 0')
    root.querySelector('[data-lens="1"]').click(); root.querySelector('[data-lens="0"]').click(); await advance(0)
    expect(request).toHaveBeenCalledTimes(8)
  })
  it('중복 클릭과 연속 관점 이동은 같은 모델의 같은 요청을 중복하지 않는다', async () => {
    reduced = true; request = vi.fn(() => new Promise(() => {})); mount().setBridges({ keywords: {}, concepts: [] })
    click('open'); click('open'); root.querySelector('[data-lens="1"]').click(); root.querySelector('[data-lens="0"]').click(); await advance(0)
    expect(request.mock.calls).toEqual(Array.from({ length: 8 }, (_, i) => [i, 'fast']))
  })
  it('역할이 누락된 생성은 오류로 표시하고 재시도 후에만 미래를 보여 준다', async () => {
    reduced = true; request.mockResolvedValueOnce(future(0, [])); mount().setBridges(bridges); click('open'); await advance(0)
    expect(root.textContent).toContain('선택한 성취기준의 역할을 모두 담지 못했습니다')
    expect(request).toHaveBeenCalledTimes(8)
    click('retry-future'); await advance(0)
    expect(root.querySelectorAll('.lab-role')).toHaveLength(6)
    expect(request).toHaveBeenCalledTimes(9)
  })
  it('분석 지연 후에도 사용자가 직접 미래를 시작하며 늦은 연결 응답은 화면을 덮지 않는다', async () => {
    reduced = true; mount(); await advance(25_000)
    expect(root.textContent).toContain('연결 분석이 지연')
    expect(request).not.toHaveBeenCalled()
    click('open'); await advance(0); scene.setBridges(bridges)
    expect(root.querySelector('.lab-future-view').hidden).toBe(false)
    expect(root.querySelector('.lab-future-card h2').textContent).toBe('미래 0')
  })
  it('저장 실패를 성공으로 표시하지 않고 생성된 문자열을 HTML로 실행하지 않는다', async () => {
    reduced = true; request.mockResolvedValue(future('<img src=x onerror=alert(1)>'))
    mount({ onBasket: () => { throw new Error('저장 실패') } }).setBridges(bridges); click('open'); await advance(0); click('basket')
    expect(root.querySelector('.lab-action-status').textContent).toBe('저장 실패')
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.lab-future-card h2').textContent).toContain('<img')
  })
  it('해제한 장면은 타이머와 늦은 생성 응답으로 되살아나지 않는다', async () => {
    let resolve; request = vi.fn(() => new Promise(r => { resolve = r }))
    mount().setBridges(bridges); await advance(2000); click('open'); await advance(0); scene.destroy(); resolve(future(0)); await advance(90_000)
    expect(root.innerHTML).toBe(''); expect(vi.getTimerCount()).toBe(0); expect(request).toHaveBeenCalledTimes(8)
  })
})


describe('여덟 관점 동시 준비', () => {
  it('첫 관점이 늦어도 모두 시작하고 먼저 도착한 5번을 바로 읽는다', async () => {
    reduced = true
    const pending = new Map()
    request = vi.fn(i => new Promise(resolve => pending.set(i, resolve)))
    mount({ externalGraph: true }).setBridges(bridges)
    scene.open(); await advance(0)
    expect([...pending.keys()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(root.querySelector('.lab-generation-progress').textContent).toContain('0/8개 준비 완료 · 8개 생성 중')
    const fifth = root.querySelector('[data-lens="4"]')
    fifth.focus(); pending.get(4)(future(4)); await advance(0)
    expect(document.activeElement).toBe(fifth)
    expect(fifth.dataset.status).toBe('ready')
    expect(fifth.getAttribute('aria-label')).toContain('준비 완료')
    fifth.click()
    expect(root.querySelector('.lab-future-card h2').textContent).toBe('미래 4')
    expect(root.querySelector('.lab-generation-progress').textContent).toContain('1/8개 준비 완료 · 7개 생성 중')
    expect(request).toHaveBeenCalledTimes(8)
  })
  it('부분 실패는 완성된 결과를 보존하고 실패한 관점만 다시 요청한다', async () => {
    reduced = true
    request = vi.fn(async i => { if (i === 4) throw new Error('네트워크 연결 중단'); return future(i) })
    mount({ externalGraph: true }).setBridges(bridges); scene.open(); await advance(0)
    expect(root.querySelector('.lab-generation-progress').textContent).toContain('7/8개 준비 완료 · 1개 재시도 필요')
    root.querySelector('[data-lens="4"]').click()
    expect(root.querySelector('.lab-future-card').textContent).toContain('네트워크 연결 중단')
    request.mockImplementation(async i => future(i))
    click('retry-future'); await advance(0)
    expect(request).toHaveBeenCalledTimes(9)
    expect(request).toHaveBeenLastCalledWith(4, 'fast')
    expect(root.querySelector('.lab-generation-progress').textContent).toContain('8/8개 준비 완료')
    expect(root.querySelector('.lab-generation-progress').textContent).not.toContain('재시도 필요')
    root.querySelector('[data-lens="0"]').click()
    expect(root.querySelector('.lab-future-card h2').textContent).toBe('미래 0')
  })
  it('전체 실패에도 번호를 이동해 각각 재시도할 수 있다', async () => {
    reduced = true; request.mockRejectedValue(new Error('서버 오류'))
    mount().setBridges(bridges); scene.open(); await advance(0)
    expect(root.querySelector('.lab-generation-progress').textContent).toContain('8개 재시도 필요')
    root.querySelector('[data-lens="7"]').click()
    expect(root.querySelector('[data-act="retry-future"]')).not.toBeNull()
    expect(request).toHaveBeenCalledTimes(8)
  })
  it('모델별 8개 결과를 분리하고 늦은 이전 모델 응답이 현재 화면을 덮지 않는다', async () => {
    reduced = true
    const pending = new Map()
    request = vi.fn((i, m) => new Promise(resolve => pending.set(`${m}-${i}`, resolve)))
    mount().setBridges(bridges); scene.open(); await advance(0)
    scene.setModel('precise'); await advance(0)
    expect(request).toHaveBeenCalledTimes(16)
    pending.get('fast-0')(future('빠른')); await advance(0)
    expect(root.querySelector('.lab-future-card h2').textContent).not.toContain('빠른')
    expect(root.querySelector('.lab-generation-progress').textContent).toContain('0/8개 준비 완료')
    pending.get('precise-0')(future('정밀')); await advance(0)
    expect(root.querySelector('.lab-future-card h2').textContent).toBe('미래 정밀')
    scene.setModel('fast'); await advance(0)
    expect(root.querySelector('.lab-future-card h2').textContent).toBe('미래 빠른')
    expect(request).toHaveBeenCalledTimes(16)
  })
  it('선택을 바꿔 장면을 다시 만들면 이전 8개 응답이 새 결과를 덮지 않는다', async () => {
    reduced = true
    const old = []
    request = vi.fn(i => new Promise(resolve => old.push(() => resolve(future(`이전 ${i}`)))))
    mount().setBridges(bridges); scene.open(); await advance(0); scene.destroy()
    request = vi.fn(async i => future(`새 선택 ${i}`))
    mount().setBridges(bridges); scene.open(); await advance(0)
    old.forEach(resolve => resolve()); await advance(0)
    expect(root.querySelector('.lab-future-card h2').textContent).toBe('미래 새 선택 0')
    expect(root.querySelector('.lab-generation-progress').textContent).toContain('8/8개 준비 완료')
  })
})
