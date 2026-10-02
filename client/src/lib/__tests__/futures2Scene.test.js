import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFuturesScene } from '../futures2Scene'

const criteria = Array.from({ length: 7 }, (_, i) => ({
  key: `criterion-${i}`, code: `[12교과01-0${i + 1}]`, subject: `교과 ${i + 1}`, subject_group: '과학', content: `자료 ${i + 1}을 분석한다.`,
}))
const future = (index, title = `수업의 미래 ${index + 1}`) => ({
  title, lens: '탐구', situation: '자료를 조사하는 수업입니다.', driving_question: '어떤 관계를 찾을 수 있을까요?',
  roles: [], activity_steps: ['조사', '분석'], data_sources: ['공공 자료'], student_output: '보고서', assessment_idea: '탐구 과정 관찰',
})
const noLinks = { keywords: {}, concepts: [], isolated: criteria.map(s => s.key) }
const partialLinks = {
  keywords: { [criteria[0].key]: ['자료 1'], [criteria[1].key]: ['자료 2'] },
  concepts: [{ label: '자료 비교', ends: [{ key: criteria[0].key, word: '자료 1' }, { key: criteria[1].key, word: '자료 2' }], keys: [criteria[0].key, criteria[1].key] }],
  isolated: criteria.slice(2).map(s => s.key),
}

let root, scene, frames, nextFrame, motionReduced, requestFuture, scrollIntoView
const advance = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms) }
const mount = (count = 6, request = requestFuture) => {
  scene = createFuturesScene(root, { standards: criteria.slice(0, count), requestFuture: request })
  return scene
}
const start = () => root.querySelector('.fu-start').click()
const expectFuture = (index, title = `수업의 미래 ${index + 1}`) => {
  expect(root.querySelector('.fu-ritual').classList.contains('viewing')).toBe(true)
  expect(root.querySelector('.fu-card h3')?.textContent).toBe(title)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
  motionReduced = false
  frames = new Map()
  nextFrame = 1
  scene = null
  requestFuture = vi.fn(async index => future(index))
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: query.includes('prefers-reduced-motion') && motionReduced })))
  // 실제 시각 효과는 브라우저에서 확인하고, 여기서는 프레임 등록과 정리를 관찰한다.
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { const id = nextFrame++; frames.set(id, callback); return id }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn(id => frames.delete(id)))
  const ctx = {
    clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), stroke: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  scrollIntoView = vi.fn()
  vi.stubGlobal('devicePixelRatio', 1)
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scrollIntoView)
  // HappyDOM은 SVG 화면 좌표 변환을 지원하지 않는다. 좌표 FX를 생략해 장면의 실제 흐름을 테스트한다.
  vi.spyOn(SVGSVGElement.prototype, 'getScreenCTM').mockReturnValue(null)
  root = document.createElement('div')
  document.body.appendChild(root)
})

afterEach(() => {
  scene?.destroy()
  root.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('미래 보기 2 장면의 진행과 재시도', () => {
  it('3과목의 성취기준 7개를 과목별로 묶고 동일 과목의 색을 일치시킨다', async () => {
    const standards = criteria.map((s, i) => ({ ...s, subject: ['음악', '음악', '수학', '수학', '국어', '국어', '음악'][i] }))
    scene = createFuturesScene(root, { standards, requestFuture })
    scene.setBridges(noLinks)
    expect(root.querySelectorAll('.fu2-subject-region')).toHaveLength(3)
    expect(root.querySelectorAll('.fu-wc')).toHaveLength(7)
    const stones = [...root.querySelectorAll('.fu-wc')]
    expect(stones[0].style.getPropertyValue('--c')).toBe(stones[6].style.getPropertyValue('--c'))
    expect(stones[0].getAttribute('transform')).not.toBe(stones[6].getAttribute('transform'))
    await advance(90_000)
    expect(requestFuture).not.toHaveBeenCalled()
  })
  it('성취기준이 1개일 때 시작과 선행 생성을 하지 않는다', async () => {
    mount(1)
    expect(root.querySelector('.fu-start').disabled).toBe(true)
    start()
    await advance(40_000)
    expect(requestFuture).not.toHaveBeenCalled()
    expect(root.querySelector('.fu-ritual').classList.contains('viewing')).toBe(false)
  })

  it('연결이 먼저 드러나고 미래 보기 버튼을 누른 뒤에만 생성과 전환을 시작한다', async () => {
    mount().setBridges(partialLinks)
    expect(root.querySelector('.fu-start').hidden).toBe(true)
    start()
    await advance(1100)
    expect(root.querySelectorAll('.fu-wlink.on')).toHaveLength(1)
    expect(root.querySelectorAll('.fu2-word-flight')).toHaveLength(2)
    expect(root.querySelector('.fu-start').hidden).toBe(true)
    expect(requestFuture).not.toHaveBeenCalled()
    await advance(1500)
    expect(root.querySelector('.fu-start').hidden).toBe(false)
    expect(root.querySelector('.fu-start').disabled).toBe(false)
    expect(root.querySelector('.fu-ritual').classList.contains('links-ready')).toBe(true)
    expect(root.querySelector('.fu-ritual').classList.contains('viewing')).toBe(false)
    expect(root.querySelector('.fu2-link-summary').hidden).toBe(false)
    expect(root.querySelector('.fu2-link-summary').textContent).toContain('자료 1 ↔ 자료 2')
    scene.setModel('precise')
    await advance(90_000)
    expect(requestFuture).not.toHaveBeenCalled()
    expect(root.querySelector('.fu-card')).toBeNull()
    expect(root.querySelector('.fu-ritual').classList.contains('links-ready')).toBe(true)
    expect(root.querySelector('.fu-start').hidden).toBe(false)
    start()
    await advance(6000)
    expectFuture(0)
    expect(root.querySelector('.fu2-link-summary').hidden).toBe(true)
    expect(requestFuture).toHaveBeenCalledTimes(8)
    expect(requestFuture.mock.calls.every(([, model]) => model === 'precise')).toBe(true)
  })

  it('연결 확인 중 퇴장하면 예약된 연결과 미래 버튼을 되살리지 않는다', async () => {
    mount().setBridges(partialLinks)
    await advance(1300)
    scene.destroy()
    await advance(40_000)
    expect(root.innerHTML).toBe('')
    expect(requestFuture).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('모든 키워드를 소속 과목에 직접 연결하고 교과 간 선은 실제 연결만 그린다', async () => {
    const graph = {
      keywords: { [criteria[0].key]: ['자료', '근거', '주장'], [criteria[1].key]: ['자료', '비율', '분석'] },
      concepts: [{ label: '자료 분석', ends: [{ key: criteria[0].key, word: '근거' }, { key: criteria[1].key, word: '자료' }] }],
      isolated: [],
    }
    mount(2).setBridges(graph)
    for (const i of [0, 1]) {
      const subject = root.querySelector(`.fu-wc[data-i="${i}"]`)
      const keywords = subject.querySelectorAll('.fu-kw')
      expect(keywords).toHaveLength(3)
      expect(subject.querySelectorAll('.fu-clines path')).toHaveLength(3)
      for (const keyword of keywords) {
        const node = keyword.querySelector('.fu2-keyword-node')
        const word = keyword.dataset.w
        const edge = [...subject.querySelectorAll('.fu2-membership-edge')].find(el => el.dataset.word === word)
        expect(edge?.getAttribute('d')).toBe(`M0,0L${node.getAttribute('cx')},${node.getAttribute('cy')}`)
      }
    }
    // 같은 '자료'도 각 과목에 소속된 서로 다른 노드이며, 임의로 하나로 합치지 않는다.
    expect(root.querySelectorAll('.fu-kw[data-w="자료"]')).toHaveLength(2)
    expect(root.querySelectorAll('.fu-wlink')).toHaveLength(1)
    await advance(90_000)
    expect(requestFuture).not.toHaveBeenCalled()
    expect(root.querySelector('.fu-card')).toBeNull()
  })

  it.each([2, 6])('성취기준 %i개에 연결이 없어도 8개의 미래를 볼 수 있다', async count => {
    mount(count).setBridges(noLinks)
    await advance(3000)
    start()
    await advance(20_000)
    expectFuture(0)
    expect(root.querySelectorAll('.fu-wc')).toHaveLength(count)
    expect(root.querySelectorAll('.fu-tip')).toHaveLength(8)
    expect(new Set(requestFuture.mock.calls.map(([index]) => index)).size).toBe(8)
  })

  it('6개 중 2개만 연결되어도 나머지를 억지로 연결하지 않고 미래로 진행한다', async () => {
    mount().setBridges(partialLinks)
    await advance(3000)
    start()
    await advance(20_000)
    expectFuture(0)
    expect(root.querySelectorAll('.fu-wlink.on')).toHaveLength(1)
    expect(root.querySelectorAll('.fu-wc.lit')).toHaveLength(2)
  })

  it('연결 찾기 실패를 받아도 미래 카드에 도달한다', async () => {
    mount().setBridges(null)
    await advance(3000)
    start()
    await advance(20_000)
    expectFuture(0)
  })

  it('연결 응답이 없어도 대기를 끝내고 교사의 클릭 후 미래를 보여준다', async () => {
    mount()
    start() // 숨겨진 시작 버튼은 대기 중 동작하지 않는다.
    await advance(27_000)
    expect(requestFuture).not.toHaveBeenCalled()
    expect(root.querySelector('.fu-start').disabled).toBe(false)
    start()
    await advance(6000)
    expectFuture(0)
  })

  it('시작 연타와 이전 미래 재열람은 동일한 미래를 중복 생성하지 않는다', async () => {
    mount().setBridges(noLinks)
    await advance(3000)
    start()
    start()
    await advance(20_000)
    expectFuture(0)
    expect(requestFuture).toHaveBeenCalledTimes(8)
    root.querySelector('[data-go="1"]').click()
    await advance(700)
    expectFuture(1)
    root.querySelector('[data-go="-1"]').click()
    await advance(700)
    expectFuture(0)
    expect(requestFuture).toHaveBeenCalledTimes(8)
  })

  it('카드의 휠은 페이지 스크롤을 유지하고 시간의 고리에서만 미래를 넘긴다', async () => {
    mount().setBridges(noLinks)
    await advance(3000)
    start()
    await advance(20_000)
    expectFuture(0)
    const cardWheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    root.querySelector('.fu-card').dispatchEvent(cardWheel)
    await advance(700)
    expect(cardWheel.defaultPrevented).toBe(false)
    expectFuture(0)
    const ringWheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    root.querySelector('.fu-navwrap').dispatchEvent(ringWheel)
    await advance(700)
    expect(ringWheel.defaultPrevented).toBe(true)
    expectFuture(1)
  })

  it('실패한 미래만 재시도하고 이미 완성한 미래는 다시 생성하지 않는다', async () => {
    requestFuture.mockImplementationOnce(async () => { throw new Error('일시적인 연결 오류') })
    mount().setBridges(noLinks)
    await advance(3000)
    start()
    await advance(20_000)
    expect(root.querySelector('.fu-card')?.textContent).toContain('일시적인 연결 오류')
    root.querySelector('[data-retry="0"]').click()
    await advance()
    expectFuture(0)
    expect(requestFuture.mock.calls.filter(([index]) => index === 0)).toHaveLength(2)
    expect(requestFuture).toHaveBeenCalledTimes(9)
  })

  it('늦은 이전 모델 응답이 새 모델의 미래 카드로 표시되지 않는다', async () => {
    const releases = []
    requestFuture.mockImplementation((index, model) => model === 'fast'
      ? new Promise(resolve => releases.push(() => resolve(future(index, '이전 모델의 미래'))))
      : Promise.resolve(future(index, '정밀 모델의 미래')))
    mount().setBridges(noLinks)
    await advance(3000)
    start()
    await advance(20_000)
    scene.setModel('precise')
    releases.forEach(release => release())
    await advance()
    expectFuture(0, '정밀 모델의 미래')
    expect(root.querySelector('.fu-card')?.textContent).not.toContain('이전 모델의 미래')
  })
})

describe('미래 보기 2 장면의 수명과 접근성', () => {
  it('퇴장하면 프레임·타이머를 정리하고 늦은 응답·전역 입력이 DOM을 되살리지 않는다', async () => {
    const releases = []
    requestFuture.mockImplementation(index => new Promise(resolve => releases.push(() => resolve(future(index)))))
    mount().setBridges(noLinks)
    await advance(3000)
    start()
    await advance(20_000)
    expect(frames.size).toBeGreaterThan(0)
    scene.destroy()
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    releases.forEach(release => release())
    scene.setBridges(partialLinks)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    window.dispatchEvent(new Event('resize'))
    await advance(60_000)
    expect(root.innerHTML).toBe('')
    expect(vi.getTimerCount()).toBe(0)
    expect(frames.size).toBe(0)
    expect(requestFuture).toHaveBeenCalledTimes(8)
  })

  it('움직임 줄이기에서는 프레임·SVG 반복 애니메이션 없이 키보드로 미래를 선택한다', async () => {
    motionReduced = true
    mount().setBridges(noLinks)
    await advance(3000)
    start()
    await advance(20_000)
    expectFuture(0)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(root.querySelectorAll('animate')).toHaveLength(0)
    expect(root.querySelectorAll('.fu-ripple, .fu2-inward-haze')).toHaveLength(0)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' })
    const tip = root.querySelector('.fu-tip[data-k="2"]')
    expect(tip.getAttribute('role')).toBe('button')
    expect(tip.getAttribute('tabindex')).toBe('0')
    tip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await advance(700)
    expectFuture(2)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('생성 결과의 HTML 문자열을 실행 가능한 요소로 만들지 않는다', async () => {
    const title = '<img src=x onerror="alert(1)">'
    requestFuture.mockImplementation(async index => future(index, title))
    mount().setBridges(noLinks)
    await advance(3000)
    start()
    await advance(20_000)
    expectFuture(0, title)
    expect(root.querySelector('img, script')).toBeNull()
  })
})
