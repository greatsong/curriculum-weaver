/**
 * 첫 사용 투어 회귀 테스트 — 툴팁 위치와 스텝 정의
 *
 * 실제로 났던 사고 두 가지를 고정한다.
 *   1) 하이라이트 대상이 화면 아래쪽(하단 [원칙] 버튼)이면 툴팁이 뷰포트 밖으로
 *      밀려나 [이전][다음][다시 보지 않기]가 전부 화면 밖에 놓였다.
 *      → 신규 사용자가 단축키를 모르면 투어를 진행할 수 없다.
 *   2) 존재하지 않는 요소에 fallback 좌표를 주는 바람에, AI 제안이 아직 없는
 *      첫 투어에서 4단계가 엉뚱한 빈 영역/직전 스텝 자리를 비췄다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeTooltipPosition, TOOLTIP_WIDTH, TOUR_STEPS } from '../InteractiveTour.jsx'

const VIEWPORT = { width: 1440, height: 900 }
const TOOLTIP_HEIGHT = 180 // 실측값(설명 3줄 + 버튼 줄)
const PADDING = 16

/** 계산된 툴팁이 뷰포트 안에 완전히 들어오는지 */
function fitsInViewport(style, tooltipHeight = TOOLTIP_HEIGHT) {
  return (
    style.top >= 0 &&
    style.left >= 0 &&
    style.top + tooltipHeight <= VIEWPORT.height &&
    style.left + TOOLTIP_WIDTH <= VIEWPORT.width
  )
}

describe('computeTooltipPosition — 뷰포트 클램프', () => {
  it('화면 최하단 대상(하단 [원칙] 버튼)에서도 툴팁이 화면 안에 들어온다', () => {
    // 회귀 재현: 1440x900에서 top 844의 버튼 → 클램프가 없으면 top 884, bottom 1064
    const style = computeTooltipPosition({
      arrowPosition: 'left',
      targetRect: { top: 844, left: 663, width: 115, height: 50 },
      tooltipHeight: TOOLTIP_HEIGHT,
      viewport: VIEWPORT,
    })
    expect(style.top + TOOLTIP_HEIGHT).toBeLessThanOrEqual(VIEWPORT.height)
    expect(fitsInViewport(style)).toBe(true)
  })

  it('오른쪽 배치에서 대상이 화면 우측 끝에 있어도 툴팁이 잘리지 않는다', () => {
    const style = computeTooltipPosition({
      arrowPosition: 'right',
      targetRect: { top: 285, left: 1200, width: 240, height: 500 },
      tooltipHeight: TOOLTIP_HEIGHT,
      viewport: VIEWPORT,
    })
    expect(style.left + TOOLTIP_WIDTH).toBeLessThanOrEqual(VIEWPORT.width)
  })

  it('왼쪽 배치에서 대상이 화면 좌측 끝이어도 음수 좌표가 나오지 않는다', () => {
    const style = computeTooltipPosition({
      arrowPosition: 'left',
      targetRect: { top: 100, left: 0, width: 120, height: 60 },
      tooltipHeight: TOOLTIP_HEIGHT,
      viewport: VIEWPORT,
    })
    expect(style.left).toBeGreaterThanOrEqual(PADDING)
  })

  it('아래 배치에서 아래 공간이 모자라면 대상 위로 올린다', () => {
    const target = { top: 800, left: 0, width: 1440, height: 60 }
    const style = computeTooltipPosition({
      arrowPosition: 'bottom',
      targetRect: target,
      tooltipHeight: TOOLTIP_HEIGHT,
      viewport: VIEWPORT,
    })
    expect(style.top).toBeLessThan(target.top) // 대상 위쪽에 놓였다
    expect(fitsInViewport(style)).toBe(true)
  })

  it('아래 공간이 충분하면 대상 아래에 그대로 붙는다', () => {
    const target = { top: 147, left: 0, width: 1440, height: 138 }
    const style = computeTooltipPosition({
      arrowPosition: 'bottom',
      targetRect: target,
      tooltipHeight: TOOLTIP_HEIGHT,
      viewport: VIEWPORT,
    })
    expect(style.top).toBeGreaterThanOrEqual(target.top + target.height)
  })

  it('툴팁이 뷰포트보다 커도 좌표가 음수로 튀지 않는다', () => {
    const style = computeTooltipPosition({
      arrowPosition: 'left',
      targetRect: { top: 500, left: 700, width: 100, height: 100 },
      tooltipHeight: 2000,
      viewport: VIEWPORT,
    })
    expect(style.top).toBeGreaterThanOrEqual(PADDING)
  })

  it('대상이 없거나 center 스텝이면 화면 정가운데로 보낸다', () => {
    const noTarget = computeTooltipPosition({
      arrowPosition: 'right',
      targetRect: null,
      tooltipHeight: TOOLTIP_HEIGHT,
      viewport: VIEWPORT,
    })
    expect(noTarget.transform).toBe('translate(-50%, -50%)')

    const center = computeTooltipPosition({
      arrowPosition: 'center',
      targetRect: { top: 0, left: 0, width: 10, height: 10 },
      tooltipHeight: TOOLTIP_HEIGHT,
      viewport: VIEWPORT,
    })
    expect(center.transform).toBe('translate(-50%, -50%)')
  })

  it('모든 스텝 방향 × 화면 구석 조합에서 툴팁이 화면 밖으로 나가지 않는다', () => {
    const corners = [
      { top: 0, left: 0, width: 200, height: 80 },
      { top: 0, left: 1240, width: 200, height: 80 },
      { top: 820, left: 0, width: 200, height: 80 },
      { top: 820, left: 1240, width: 200, height: 80 },
    ]
    for (const arrowPosition of ['right', 'left', 'bottom']) {
      for (const targetRect of corners) {
        const style = computeTooltipPosition({ arrowPosition, targetRect, tooltipHeight: TOOLTIP_HEIGHT, viewport: VIEWPORT })
        expect(fitsInViewport(style), `${arrowPosition} @ ${targetRect.top}/${targetRect.left}`).toBe(true)
      }
    }
  })
})

// ── 스텝 정의 정합성 ─────────────────────────────────────────

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function collectSource(dir) {
  let out = ''
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      out += collectSource(full)
    } else if (/\.jsx?$/.test(name)) {
      out += readFileSync(full, 'utf-8')
    }
  }
  return out
}

describe('TOUR_STEPS 정의', () => {
  const source = collectSource(SRC_DIR)

  it('하이라이트 대상 선택자가 전부 실제 소스에 존재한다', () => {
    for (const step of TOUR_STEPS) {
      if (!step.targetSelector) continue
      const key = step.targetSelector.match(/\[data-tour="([^"]+)"\]/)?.[1]
      expect(key, `${step.id}의 선택자 형식`).toBeTruthy()
      expect(source.includes(`data-tour="${key}"`), `${step.id} → data-tour="${key}" 미존재`).toBe(true)
    }
  })

  it('fallback 좌표를 두지 않는다 (없는 요소를 억지로 비추지 않게)', () => {
    for (const step of TOUR_STEPS) {
      expect(step.fallbackPosition, `${step.id}에 fallbackPosition 부활`).toBeUndefined()
    }
  })

  it('안내 문구에 내부 절차 약어를 노출하지 않는다', () => {
    const text = TOUR_STEPS.map((s) => `${s.title} ${s.description}`).join(' ')
    expect(text).not.toMatch(/T·A·Ds·DI·E|Ds-\d|DI-\d|T-\d-\d/)
  })

  it('마지막 스텝은 하이라이트 없이 가운데 안내로 끝난다', () => {
    const last = TOUR_STEPS[TOUR_STEPS.length - 1]
    expect(last.targetSelector).toBeNull()
    expect(last.arrowPosition).toBe('center')
  })
})
