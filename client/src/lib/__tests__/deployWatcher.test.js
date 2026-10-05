/**
 * 새 배포 감시 장치 — 감지 시점, 숨은 탭 폴링 금지, 자동 새로고침 시점·안전 조건·1회 제한
 * (fetch·document·저장소·시계는 모두 가짜로 주입한다)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDeployWatcher, MIN_HIDDEN_MS_FOR_AUTO_RELOAD } from '../deployWatcher'
import { AUTO_RELOAD_RECORD_KEY } from '../deployVersion'

const OLD = 'build-20261003135800000'
const NEW = 'build-20261003154300000'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
}

const jsonResponse = (body) => ({
  ok: true,
  headers: { get: () => 'application/json' },
  text: async () => JSON.stringify(body),
})
const htmlFallback = () => ({
  ok: true,
  headers: { get: () => 'text/html; charset=utf-8' },
  text: async () => '<!doctype html><html><body><div id="root"></div></body></html>',
})

function setup({ remote = NEW, safe = true, pathname = '/workspaces/w1/projects/p1', storage = memoryStorage(), currentId = OLD } = {}) {
  let clock = 1_000_000
  const doc = new EventTarget()
  doc.visibilityState = 'visible'
  const win = new EventTarget()
  let intervalFn = null
  const fetchImpl = vi.fn(async () => (typeof remote === 'function' ? remote() : jsonResponse({ buildId: remote })))
  const reload = vi.fn()
  const getSafety = vi.fn(() => (safe ? { safe: true, reasons: [] } : { safe: false, reasons: ['chat-input'] }))
  const watcher = createDeployWatcher({
    currentId,
    fetchImpl,
    doc,
    win,
    storage,
    getSafety,
    getPathname: () => pathname,
    reload,
    now: () => clock,
    setIntervalFn: (fn) => { intervalFn = fn; return 1 },
    clearIntervalFn: () => { intervalFn = null },
  })
  const hide = () => { doc.visibilityState = 'hidden'; return watcher.handleVisibilityChange() }
  const show = () => { doc.visibilityState = 'visible'; return watcher.handleVisibilityChange() }
  return {
    watcher, doc, win, fetchImpl, reload, getSafety, storage, hide, show,
    tick: (ms) => { clock += ms },
    poll: () => intervalFn?.(),
    pollFn: () => intervalFn,
    hasInterval: () => intervalFn != null,
  }
}

describe('감지', () => {
  it('SPA 폴백 HTML이 오면 업데이트 없음 — 안내도 새로고침도 없다', async () => {
    const t = setup({ remote: htmlFallback })
    t.watcher.start()
    await t.watcher.checkNow({ force: true })
    expect(t.fetchImpl).toHaveBeenCalledTimes(1)
    expect(t.watcher.getState().updateAvailable).toBe(false)
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('요청은 캐시를 쓰지 않고 주소에 캐시 무력화 값을 붙인다', async () => {
    const t = setup()
    t.watcher.start()
    await t.watcher.checkNow({ force: true })
    const [url, init] = t.fetchImpl.mock.calls[0]
    expect(url).toMatch(/^\/version\.json\?t=\d+$/)
    expect(init.cache).toBe('no-store')
  })

  it('새 빌드 식별자를 받으면 안내 상태로 바뀌고 구독자에게 알린다', async () => {
    const t = setup()
    const listener = vi.fn()
    t.watcher.subscribe(listener)
    t.watcher.start()
    await t.watcher.checkNow({ force: true })
    expect(t.watcher.getState()).toMatchObject({ updateAvailable: true, remoteId: NEW, dismissed: false })
    expect(listener).toHaveBeenCalled()
    // 감지만으로는 새로고침하지 않는다
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('네트워크 실패는 조용히 무시한다', async () => {
    const t = setup({ remote: () => { throw new TypeError('Failed to fetch') } })
    t.watcher.start()
    await expect(t.watcher.checkNow({ force: true })).resolves.toBeTruthy()
    expect(t.watcher.getState().updateAvailable).toBe(false)
  })

  it('같은 빌드면 업데이트 없음, 감지 뒤 배포가 이 빌드로 되돌아가면 안내를 거둔다', async () => {
    let remote = OLD
    const t = setup({ remote: () => jsonResponse({ buildId: remote }) })
    t.watcher.start()
    await t.watcher.checkNow({ force: true })
    expect(t.watcher.getState().updateAvailable).toBe(false)
    remote = NEW
    await t.watcher.checkNow({ force: true })
    expect(t.watcher.getState().updateAvailable).toBe(true)
    remote = OLD
    await t.watcher.checkNow({ force: true })
    expect(t.watcher.getState().updateAvailable).toBe(false)
  })

  it('빌드 식별자가 없으면(dev) 시작해도 요청하지 않는다', async () => {
    const t = setup({ currentId: 'not a valid id!' })
    t.watcher.start()
    await t.watcher.checkNow({ force: true })
    expect(t.fetchImpl).not.toHaveBeenCalled()
    expect(t.hasInterval()).toBe(false)
  })

  it('focus는 최소 간격 안에서 반복 요청하지 않는다', async () => {
    const t = setup({ remote: OLD })
    t.watcher.start()
    t.win.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    t.win.dispatchEvent(new Event('focus'))
    await new Promise((r) => setTimeout(r, 0))
    expect(t.fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('폴링', () => {
  it('보이는 탭만 간격마다 확인하고, 숨은 탭에서는 요청하지 않는다', async () => {
    const t = setup({ remote: OLD })
    t.watcher.start()
    expect(t.hasInterval()).toBe(true)
    await t.poll()
    expect(t.fetchImpl).toHaveBeenCalledTimes(1)

    const staleTick = t.pollFn()
    await t.hide()
    expect(t.hasInterval()).toBe(false) // 숨으면 타이머를 멈춘다
    await staleTick() // 멈추기 전에 예약된 호출이 와도 숨은 탭이면 요청하지 않는다
    expect(t.fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('자동 새로고침', () => {
  it('오래 숨었다 돌아왔고 안전하면 한 번 새로고침한다', async () => {
    const t = setup()
    t.watcher.start()
    await t.hide()
    t.tick(MIN_HIDDEN_MS_FOR_AUTO_RELOAD + 1)
    await t.show()
    expect(t.fetchImpl).toHaveBeenCalledTimes(1) // 돌아온 순간 확인
    expect(t.reload).toHaveBeenCalledTimes(1)
    expect(t.reload).toHaveBeenCalledWith('return')
    expect(JSON.parse(t.storage.getItem(AUTO_RELOAD_RECORD_KEY))).toMatchObject({ from: OLD, to: NEW })
  })

  it('잠깐 숨었다 돌아오면 새로고침하지 않고 안내만 남긴다', async () => {
    const t = setup()
    t.watcher.start()
    await t.hide()
    t.tick(5_000)
    await t.show()
    expect(t.watcher.getState().updateAvailable).toBe(true)
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('안전하지 않으면(입력 중 등) 새로고침하지 않고 이유를 남긴다', async () => {
    const t = setup({ safe: false })
    t.watcher.start()
    await t.hide()
    t.tick(MIN_HIDDEN_MS_FOR_AUTO_RELOAD * 10)
    await t.show()
    expect(t.getSafety).toHaveBeenCalled()
    expect(t.reload).not.toHaveBeenCalled()
    expect(t.watcher.getState()).toMatchObject({ updateAvailable: true, blockedReasons: ['chat-input'] })
  })

  it('안전 판정이 오류를 내면 새로고침하지 않는다', async () => {
    const t = setup()
    t.getSafety.mockImplementation(() => { throw new Error('boom') })
    t.watcher.start()
    await t.watcher.checkNow({ force: true })
    expect(t.watcher.handleRouteChange()).toBe(false)
    expect(t.reload).not.toHaveBeenCalled()
    expect(t.watcher.getState().blockedReasons).toEqual(['unknown'])
  })

  it('같은 배포로의 자동 새로고침은 탭마다 한 번만 — 새로고침 뒤에도 옛 빌드면 안내만', async () => {
    const storage = memoryStorage()
    storage.setItem(AUTO_RELOAD_RECORD_KEY, JSON.stringify({ from: OLD, to: NEW, at: 1 }))
    const t = setup({ storage })
    t.watcher.start()
    await t.hide()
    t.tick(MIN_HIDDEN_MS_FOR_AUTO_RELOAD + 1)
    await t.show()
    expect(t.reload).not.toHaveBeenCalled()
    expect(t.watcher.getState()).toMatchObject({ updateAvailable: true, autoReloadLimited: true })
  })

  it('저장소를 쓸 수 없으면 자동 새로고침하지 않는다', async () => {
    const t = setup({ storage: null })
    t.watcher.start()
    await t.watcher.checkNow({ force: true })
    expect(t.watcher.handleRouteChange()).toBe(false)
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('경로 이동 때 새 배포가 감지돼 있고 안전하면 그 주소로 새로고침한다', async () => {
    const t = setup()
    t.watcher.start()
    expect(t.watcher.handleRouteChange()).toBe(false) // 아직 감지 전
    await t.watcher.checkNow({ force: true })
    expect(t.watcher.handleRouteChange()).toBe(true)
    expect(t.reload).toHaveBeenCalledWith('navigate')
  })

  it('한 번만 하는 일이 있는 경로(초대 수락 등)에서는 자동 새로고침하지 않는다', async () => {
    const t = setup({ pathname: '/invite/token-1' })
    t.watcher.start()
    await t.watcher.checkNow({ force: true })
    expect(t.watcher.handleRouteChange()).toBe(false)
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('닫은 안내는 탭에 다시 돌아오면 되살아난다', async () => {
    const t = setup({ safe: false })
    t.watcher.start()
    await t.watcher.checkNow({ force: true })
    t.watcher.dismiss()
    expect(t.watcher.getState().dismissed).toBe(true)
    await t.hide()
    await t.show()
    expect(t.watcher.getState().dismissed).toBe(false)
  })

  it('[새로고침] 버튼은 1회 제한과 무관하게 새로고침한다', () => {
    const t = setup()
    t.watcher.start()
    t.watcher.reloadNow()
    expect(t.reload).toHaveBeenCalledWith('manual')
  })

  it('멈춘 뒤에는 이벤트에 반응하지 않는다', async () => {
    const t = setup()
    t.watcher.start()
    t.watcher.stop()
    t.doc.visibilityState = 'visible'
    t.doc.dispatchEvent(new Event('visibilitychange'))
    t.win.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 0))
    expect(t.fetchImpl).not.toHaveBeenCalled()
  })
})
