/**
 * 그래프 배치용 글자 폭 측정 — 캔버스 measureText(나눔고딕). 글꼴이 늦게 도착하면 배치를 한 번 더 한다.
 */
let ctx = null
export function measureText(text, font) {
  if (!ctx) {
    if (typeof document === 'undefined') return [...String(text)].length * 14
    ctx = document.createElement('canvas').getContext('2d')
  }
  ctx.font = font
  return ctx.measureText(String(text)).width
}

/** 나눔고딕이 준비되면 resolve(이미 준비됐으면 바로) */
export function fontsReady() {
  if (typeof document === 'undefined' || !document.fonts?.ready) return Promise.resolve()
  return document.fonts.load("700 16px 'Nanum Gothic'").catch(() => {}).then(() => document.fonts.ready)
}
