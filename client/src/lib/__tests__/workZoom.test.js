import { describe, it, expect } from 'vitest'
import { computeWorkZoom, MAX_WORK_ZOOM, MIN_WORK_WIDTH, MIN_WORK_HEIGHT } from '../workZoom'

describe('computeWorkZoom — 화면 크기에 맞춘 작업 화면 확대', () => {
  it('큰 화면은 최대 배율(1.35배)에서 멈춘다', () => {
    expect(MAX_WORK_ZOOM).toBe(1.35)
    expect(computeWorkZoom(1920, 1080)).toBe(1.35)
    expect(computeWorkZoom(2560, 1440)).toBe(1.35)
  })

  it('연수에 흔한 노트북 화면은 작업 영역이 최소 크기보다 좁아지지 않게 줄인다', () => {
    expect(computeWorkZoom(1366, 768)).toBe(1.2)
    expect(computeWorkZoom(1536, 864)).toBe(1.35)
    expect(computeWorkZoom(1280, 720)).toBe(1.12)
    for (const [w, h] of [[1366, 768], [1536, 864], [1440, 900], [1280, 720]]) {
      const z = computeWorkZoom(w, h)
      // 최소 작업 영역을 지킨다(부동소수 오차 0.01px 허용)
      expect(w / z).toBeGreaterThanOrEqual(MIN_WORK_WIDTH - 0.01)
      expect(h / z).toBeGreaterThanOrEqual(MIN_WORK_HEIGHT - 0.01)
    }
  })

  it('작은 창에서도 1배보다 작게 줄이지 않는다', () => {
    expect(computeWorkZoom(1024, 600)).toBe(1)
    expect(computeWorkZoom(800, 500)).toBe(1)
  })

  it('잘못된 값이면 최대 배율로 돌아간다', () => {
    expect(computeWorkZoom(undefined, 900)).toBe(MAX_WORK_ZOOM)
    expect(computeWorkZoom(0, 0)).toBe(MAX_WORK_ZOOM)
    expect(computeWorkZoom(NaN, 768)).toBe(MAX_WORK_ZOOM)
  })
})
