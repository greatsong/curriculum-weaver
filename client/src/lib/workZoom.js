/**
 * 작업 화면(.work-shell) 확대 배율.
 *
 * 처음에는 데스크톱 전체를 1.5배로 고정했다(브라우저 150% 확대 느낌). 큰 화면에서는 읽기
 * 좋았지만, 연수에 흔한 1366×768 노트북은 실제 작업 영역이 911×512로 줄어 보드와 채팅이
 * 몇 줄만 보였다. 1920×1080에 윈도 배율 125%(CSS 1536×864)도 1024×576이었다.
 *
 * 그래서 큰 화면은 기존대로 1.5배를 유지하고, 작은 화면은 작업 영역이 MIN_WIDTH×MIN_HEIGHT보다
 * 좁아지지 않는 만큼만 확대한다. 1배보다 작게 줄이지는 않는다.
 *   1920×1080 → 1.5 · 1536×864 → 1.35 · 1440×900 → 1.31 · 1366×768 → 1.2 · 1280×720 → 1.12
 */
export const MAX_WORK_ZOOM = 1.5
export const MIN_WORK_ZOOM = 1
export const MIN_WORK_WIDTH = 1100
export const MIN_WORK_HEIGHT = 640

export function computeWorkZoom(width, height) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return MAX_WORK_ZOOM
  const fit = Math.min(w / MIN_WORK_WIDTH, h / MIN_WORK_HEIGHT)
  const clamped = Math.min(MAX_WORK_ZOOM, Math.max(MIN_WORK_ZOOM, fit))
  // 내림: 반올림하면 작업 영역이 최소 크기보다 1~2px 모자랄 수 있다(1e-9는 1.2*100 같은 부동소수 오차 보정)
  return Math.floor(clamped * 100 + 1e-9) / 100
}
