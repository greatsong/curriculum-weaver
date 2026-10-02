/**
 * 미래 보기 배경의 옅은 별빛 — 아주 느리게 떠오르는 점. 정리 함수를 돌려준다.
 * 움직임을 줄이는 설정이면 한 번만 그리고 멈춘다.
 */
export function startDust(canvas) {
  const ctx = canvas.getContext('2d')
  let ps = [], raf = 0
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr
    ps = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: (Math.random() * 1.3 + .3) * dpr,
      vy: -(Math.random() * .12 + .03), p: Math.random() * 6.28, g: Math.random() < .5,
    }))
  }
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const q of ps) {
      q.y += still ? 0 : q.vy; q.p += .012
      if (q.y < -10) { q.y = canvas.height + 10; q.x = Math.random() * canvas.width }
      const a = .18 + Math.sin(q.p) * .12
      ctx.fillStyle = q.g ? `rgba(92,255,181,${a})` : `rgba(220,240,235,${a * .7})`
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.28); ctx.fill()
    }
    if (!still) raf = requestAnimationFrame(draw)
  }
  resize(); addEventListener('resize', resize); draw()
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize) }
}
