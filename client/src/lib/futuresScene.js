/**
 * 미래 보기 장면 — 연결 별자리 · 시간의 고리(시전 만다라) · 여덟 꼭지 별(꼭지 = 스톤) · 마법 입자 · 미래 카드.
 *
 * React는 성취기준 선택·URL·모델만 다루고, 의식 구간은 이 모듈이 DOM을 직접 그린다
 * (nebulaScene과 같은 방식 — 프레임마다 React를 거치지 않는다).
 * 모든 rAF·타이머·리스너·요청 결과 반영은 destroy()에서 끊는다. 다른 화면에 남는 것이 없어야 한다.
 */
import { FUTURE_TIPS } from './futures'

// 꼭지 순서 = 서버 FUTURE_LENSES 순서 (index % 8)
export const LENS_SHORT = ['지역 문제', '학교 생활', '데이터 탐구', '과학 탐구', '창작 프로젝트', '역사적 관점', '진로·직업', '지구적 문제']
// 꼭지 색만 엔드게임의 여섯 스톤 색 — 마주 보는 두 쌍(지역·창작=리얼리티, 과학·지구=스페이스)이 같은 색. 나머지는 초록.
const STONE = { space: '#3D8BFF', mind: '#FFD23F', reality: '#FF3D52', power: '#A55BFF', time: '#2BF59B', soul: '#FF8A2B' }
export const TIP_STONE = [STONE.reality, STONE.power, STONE.mind, STONE.space, STONE.reality, STONE.time, STONE.soul, STONE.space]
const GREENS = ['#2BF59B', '#5CFFB5', '#7CFFC6', '#B8FFE0', '#E9FFF5']
export const GROUP_COLORS = {
  '국어': '#F87171', '수학': '#60A5FA', '영어': '#818CF8', '과학': '#4ADE80', '사회': '#FACC15', '도덕': '#FB923C', '정보': '#22D3EE',
  '기술·가정': '#C084FC', '체육': '#A3E635', '음악': '#A78BFA', '미술': '#F472B6', '한문': '#2DD4BF', '제2외국어': '#38BDF8', '교양': '#94A3B8',
}
export const colorOfStandard = (s) => GROUP_COLORS[s?.subject_group] || '#9CA3AF'

const MAX_PARALLEL = 8 // 꼭지 8개를 한꺼번에 — 전체 시간 ≈ 미래 하나 시간
const NC = 210, NR = 168
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` }
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** 화면 전체에 떠다니는 빛 먼지. 정리 함수를 돌려준다. */
export function startDust(canvas) {
  const ctx = canvas.getContext('2d'); let ps = [], raf = 0
  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio
    ps = Array.from({ length: 110 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: (Math.random() * 1.6 + .3) * devicePixelRatio,
      vy: -(Math.random() * .25 + .05), vx: (Math.random() - .5) * .15, p: Math.random() * 6.28, g: Math.random() < .55 }))
  }
  resize(); addEventListener('resize', resize)
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const q of ps) {
      q.x += q.vx; q.y += q.vy; q.p += .02; if (q.y < -10) { q.y = canvas.height + 10; q.x = Math.random() * canvas.width }
      const a = .25 + Math.sin(q.p) * .2; ctx.fillStyle = q.g ? `rgba(92,255,181,${a})` : `rgba(220,240,235,${a * .7})`
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.28); ctx.fill()
    }
    raf = requestAnimationFrame(tick)
  }
  if (!reducedMotion()) raf = requestAnimationFrame(tick)
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize) }
}

/** 마법 입자 — 휘어지며 맴도는 빛 알갱이(잔상) + 떠올랐다 사라지는 문양. 직선 빛줄기는 쓰지 않는다. */
function createMagic(canvas) {
  const ctx = canvas.getContext('2d'); let dpr = 1, idle = 0, raf = 0, dead = false
  const off = reducedMotion()
  const fit = () => { dpr = Math.min(2, devicePixelRatio || 1); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr }
  fit(); addEventListener('resize', fit)
  const sprites = new Map()
  const sprite = (hex) => {
    if (!sprites.has(hex)) {
      const s = document.createElement('canvas'); s.width = s.height = 64
      const g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.14, hexA(hex, .9)); gr.addColorStop(.4, hexA(hex, .26)); gr.addColorStop(1, hexA(hex, 0))
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); sprites.set(hex, s)
    }
    return sprites.get(hex)
  }
  const RUNES = [
    (c, s) => { c.arc(0, 0, s, 0, 6.29); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.094; c[i ? 'lineTo' : 'moveTo'](s * .8 * Math.cos(a), s * .8 * Math.sin(a)) } c.closePath() },
    (c, s) => { c.arc(0, 0, s, 0, 6.29); c.moveTo(-s * .6, 0); c.lineTo(s * .6, 0); c.moveTo(0, -s * .6); c.lineTo(0, s * .6); c.moveTo(s * .25, 0); c.arc(0, 0, s * .25, 0, 6.29) },
    (c, s) => { for (const o of [-Math.PI / 2, Math.PI / 2]) for (let i = 0; i <= 3; i++) { const a = o + i * 2.094; c[i ? 'lineTo' : 'moveTo'](s * Math.cos(a), s * Math.sin(a)) } },
    (c, s) => { c.arc(0, 0, s, .5, 5.8); c.moveTo(s * .3, -s * .7); c.lineTo(s * .3, s * .7); c.moveTo(-s * .2, 0); c.lineTo(s * .7, 0) },
    (c, s) => { c.arc(0, 0, s, 0, 6.29); for (let i = 0; i <= 4; i++) { const a = i * Math.PI / 2; c[i ? 'lineTo' : 'moveTo'](s * .7 * Math.cos(a), s * .7 * Math.sin(a)) } },
  ]
  // 꼭지에서 펼쳐지는 작은 마법진
  const MANDALA = (c, s) => {
    c.arc(0, 0, s, 0, 6.29); c.moveTo(s * .74, 0); c.arc(0, 0, s * .74, 0, 6.29)
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r2 = i % 2 ? .86 : .95; c.moveTo(s * .76 * Math.cos(a), s * .76 * Math.sin(a)); c.lineTo(s * r2 * Math.cos(a), s * r2 * Math.sin(a)) }
    for (const rot of [0, Math.PI / 4]) for (let i = 0; i <= 4; i++) { const a = rot + i * Math.PI / 2; c[i ? 'lineTo' : 'moveTo'](s * .72 * Math.cos(a), s * .72 * Math.sin(a)) }
    c.moveTo(s * .22, 0); c.arc(0, 0, s * .22, 0, 6.29)
  }
  const motes = [], runes = [], timers = new Set()
  function frame() {
    if (dead) return
    const W = canvas.width, H = canvas.height
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i]
      if (++m.t > m.life) { motes.splice(i, 1); continue }
      if (m.orbit) { m.a += m.w; m.w *= .982; m.r += m.vr; m.vr *= .975; m.x = m.cx + m.r * Math.cos(m.a); m.y = m.cy + m.r * Math.sin(m.a) * m.sq + m.rise * m.t }
      else { const c = Math.cos(m.curl), s = Math.sin(m.curl), vx = m.vx * c - m.vy * s; m.vy = m.vx * s + m.vy * c; m.vx = vx * .968; m.vy = m.vy * .968 + m.rise; m.curl *= 1.01; m.x += m.vx; m.y += m.vy }
      const p = m.t / m.life, fade = p < .12 ? p / .12 : 1 - (p - .12) / .88, sz = m.size * dpr * (.55 + .45 * fade)
      ctx.globalAlpha = fade * (.72 + .28 * Math.sin(m.t * .33 + m.ph))
      ctx.drawImage(sprite(m.color), m.x * dpr - sz / 2, m.y * dpr - sz / 2, sz, sz)
    }
    for (let i = runes.length - 1; i >= 0; i--) {
      const r = runes[i]
      if (++r.t > r.life) { runes.splice(i, 1); continue }
      const p = r.t / r.life, fade = p < .2 ? p / .2 : 1 - (p - .2) / .8, s = r.size * dpr * (r.grow ? .4 + Math.pow(p, .6) * .9 : .85 + p * .3)
      r.x += r.dx; r.y += r.dy
      ctx.save(); ctx.translate(r.x * dpr, r.y * dpr); ctx.rotate(r.rot + r.spin * r.t); ctx.globalAlpha = fade * r.alpha
      ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(dpr, s * (r.grow ? .035 : .07)); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.shadowColor = r.color; ctx.shadowBlur = 12 * dpr
      ctx.beginPath(); (r.grow ? MANDALA : RUNES[r.kind])(ctx, s); ctx.stroke(); ctx.restore()
    }
    if (motes.length || runes.length) idle = 0; else idle++
    if (idle < 45) raf = requestAnimationFrame(frame); else { ctx.clearRect(0, 0, W, H); raf = 0 }
  }
  const wake = () => { idle = 0; if (!raf && !dead) raf = requestAnimationFrame(frame) }
  const later = (ms, fn) => { if (ms <= 0) return fn(); const id = setTimeout(() => { timers.delete(id); fn() }, ms); timers.add(id) }
  return {
    sprite,
    // 고리 둘레에서 회전 방향으로 맴돌며 바깥으로 풀려나는 빛
    swirl({ cx, cy, r, n, dir = 1, colors = GREENS, squash = .9, over = 0 }) {
      if (off) return
      for (let i = 0; i < n; i++) later(Math.random() * over, () => {
        motes.push({ orbit: true, cx, cy, a: Math.random() * 6.283, r: r * (.72 + Math.random() * .32), w: dir * (.018 + Math.random() * .03), vr: .4 + Math.random() * 1.5,
          sq: squash, rise: -(Math.random() * .12), size: 7 + Math.random() * 11, color: pick(colors), life: 60 + Math.random() * 60, t: 0, ph: Math.random() * 6 }); wake()
      })
    },
    // 한 점에서 소용돌이치며 흘러나오는 빛 — 궤적이 휘어진다
    pour({ x, y, angle, n, colors = GREENS, speed = 3, spread = 1, over = 0 }) {
      if (off) return
      for (let i = 0; i < n; i++) later(Math.random() * over, () => {
        const a = angle + (Math.random() - .5) * spread, v = speed * (.5 + Math.random())
        motes.push({ orbit: false, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, curl: (Math.random() < .5 ? -1 : 1) * (.012 + Math.random() * .035), rise: -.015,
          size: 6 + Math.random() * 10, color: pick(colors), life: 50 + Math.random() * 50, t: 0, ph: Math.random() * 6 }); wake()
      })
    },
    rune({ x, y, size = 12, color = '#9BFFD3', life = 80, grow = false, spin = .02, dx = 0, dy = -.15, alpha = .9, kind }) {
      if (off) return
      runes.push({ x, y, size, color, life, grow, spin, dx, dy, alpha, kind: kind ?? Math.floor(Math.random() * RUNES.length), rot: Math.random() * 6.283, t: 0 }); wake()
    },
    destroy() { dead = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); removeEventListener('resize', fit) },
  }
}

// 문양 띠(원 둘레에 짧은 획을 규칙적으로 새긴 것)
function glyphPath(P, r, count, size, w = .012) {
  let d = ''
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2, kind = i % 5
    const [x, y] = P(r, a), [x2, y2] = P(r + size, a), [xl, yl] = P(r + size * .5, a - w), [xr, yr] = P(r + size * .5, a + w)
    d += kind === 0 ? `M${x},${y}L${x2},${y2}` : kind === 1 ? `M${xl},${yl}L${xr},${yr}M${x},${y}L${x2},${y2}` : kind === 2 ? `M${x},${y}L${xl},${yl}L${x2},${y2}`
      : kind === 3 ? `M${xl},${yl}L${x2},${y2}L${xr},${yr}` : `M${x},${y}L${xr},${yr}`
  }
  return d
}
function starPath(cx, cy, r, n, step, rot = 0) {
  const pts = []
  for (let i = 0; i < n; i++) { const a = rot + (i * step) / n * Math.PI * 2; pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`) }
  return `M${pts.join('L')}Z`
}

/**
 * @param {HTMLElement} root 의식 구간을 그릴 빈 요소
 * @param {object} opts
 * @param {object[]} opts.standards 고른 성취기준 2~6개 ({ key, code, subject, subject_group })
 * @param {'fast'|'precise'} opts.model
 * @param {(index:number, model:string) => Promise<object>} opts.requestFuture 미래 하나 요청 (실패 시 Error.message가 안내 문구)
 * @param {(future:object) => void} opts.onStartProject
 * @param {(keys:string[]) => boolean} opts.onBasket 담기 → 새로 담았으면 true
 * 연결 별자리 데이터는 scene.setBridges(bridges | null)로 넣는다(성취기준 키워드 + 키워드 사이 연결).
 */
export function createFuturesScene(root, { standards, model: initialModel = 'fast', requestFuture, onStartProject, onBasket }) {
  const TIPS = FUTURE_TIPS, STEP = 360 / TIPS
  let model = initialModel, current = 0, busy = false, dead = false
  const timers = new Set(), cleanups = []
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn() }, ms); timers.add(id); return id }
  const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)) }
  const byKey = new Map(standards.map((s) => [s.key, s]))
  const keys = standards.map((s) => s.key)
  const canStart = standards.length >= 2

  root.innerHTML = `
    <section class="fu-ritual">
      <div class="fu-mandala-wrap"><svg class="fu-mandala" viewBox="0 0 600 600" aria-hidden="true"></svg></div>
      <svg class="fu-weave" viewBox="0 0 1000 620" aria-hidden="true"></svg>
      <div class="fu-weave-caption" aria-live="polite"></div>
      <button type="button" class="fu-start" ${canStart ? '' : 'disabled'}>타임스톤으로 수업의 미래 보기</button>
      ${canStart ? '' : '<div class="fu-start-hint">성취기준을 2개 이상 넣으면 미래를 볼 수 있습니다.</div>'}
      <div class="fu-cast-label">미래를 내다보는 중…</div>
      <div class="fu-navwrap"><svg class="fu-nav" viewBox="-90 -90 600 600" aria-label="여덟 갈래 미래"></svg><canvas class="fu-navsparks"></canvas></div>
      <div class="fu-deck" aria-live="polite"></div>
    </section>
    <div class="fu-tooltip" role="tooltip"></div>
    <canvas class="fu-magic"></canvas>`
  const $ = (sel) => root.querySelector(sel)
  const ritual = $('.fu-ritual'), deck = $('.fu-deck'), navSvg = $('.fu-nav'), tooltip = $('.fu-tooltip')
  const FX = createMagic($('.fu-magic'))
  cleanups.push(() => FX.destroy())
  const viewing = () => ritual.classList.contains('viewing')
  const phi = () => (matchMedia('(max-width: 880px)').matches ? 90 : 0)

  // ── 미래 저장소: 모델별 index → { status: 'loading'|'ready'|'error', data, error, startedAt, ms } ──
  const store = { fast: new Map(), precise: new Map() }
  const queue = []; let running = 0
  function enqueue(indices) {
    for (const i of indices) if (!store[model].get(i) && !queue.some((q) => q.i === i && q.m === model)) queue.push({ i, m: model })
    pump()
  }
  function pump() {
    while (running < MAX_PARALLEL && queue.length) {
      const { i, m } = queue.shift()
      if (store[m].get(i)) continue
      running++
      const startedAt = Date.now()
      store[m].set(i, { status: 'loading', startedAt })
      refreshTip(i)
      Promise.resolve().then(() => requestFuture(i, m))
        .then((f) => { if (!f) throw new Error('미래를 그리지 못했습니다.'); store[m].set(i, { status: 'ready', data: f, ms: Date.now() - startedAt }) })
        .catch((e) => { store[m].set(i, { status: 'error', error: e?.message || '미래를 그리지 못했습니다.' }) })
        .finally(() => {
          running--
          if (dead) return
          if (m === model) { refreshTip(i); if (i === current && viewing()) showFuture(current, true) }
          pump()
        })
    }
  }
  // 지금 꼭지부터 가까운 순서로 모두 요청
  function requestAround(k) {
    const order = [k]
    for (let d = 1; d <= TIPS / 2; d++) order.push((k + d) % TIPS, (k - d + TIPS) % TIPS)
    enqueue([...new Set(order)])
  }
  function refreshTip(i) {
    const g = navSvg.querySelector(`.fu-tip[data-k="${i}"]`); if (!g) return
    const s = store[model].get(i)
    g.classList.toggle('ready', s?.status === 'ready'); g.classList.toggle('loading', s?.status === 'loading')
  }
  const elapsedTimer = setInterval(() => {
    const s = store[model].get(current)
    if (s?.status === 'loading') { const el = root.querySelector('.fu-elapsed'); if (el) el.textContent = Math.round((Date.now() - s.startedAt) / 1000) }
  }, 500)
  cleanups.push(() => clearInterval(elapsedTimer))

  // ── 시간의 고리 (시전 만다라) ──
  let runeRing = ''
  ;(() => {
    const C = 300, P = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)]
    const lines = `
      <g class="fu-spin-d"><circle cx="300" cy="300" r="286" fill="none" stroke-width="1.2" stroke-dasharray="2 7"/></g>
      <g class="fu-spin-a"><circle cx="300" cy="300" r="268" fill="none" stroke-width="3"/><circle cx="300" cy="300" r="236" fill="none" stroke-width="1.6"/>
        <path d="${glyphPath(P, 240, 96, 22)}" fill="none" stroke-width="1.6"/></g>
      <g class="fu-spin-b"><circle cx="300" cy="300" r="222" fill="none" stroke-width="1"/>
        <g class="fu-kick"><path d="${starPath(C, C, 222, 8, 3, Math.PI / 8)}" fill="none" stroke-width="1.8"/></g></g>
      <g class="fu-spin-c"><g class="fu-kick"><path d="${starPath(C, C, 176, 6, 2)}" fill="none" stroke-width="1.6"/><path d="${starPath(C, C, 176, 6, 2, Math.PI / 6)}" fill="none" stroke-width="1"/></g>
        <circle cx="300" cy="300" r="176" fill="none" stroke-width="1.4"/></g>
      <g class="fu-spin-b"><g class="fu-kick"><path d="${starPath(C, C, 128, 7, 2)}" fill="none" stroke-width="1.4"/></g><circle cx="300" cy="300" r="128" fill="none" stroke-width="1"/>
        <circle cx="300" cy="300" r="96" fill="none" stroke-width="2.2"/><circle cx="300" cy="300" r="84" fill="none" stroke-width=".8" stroke-dasharray="1 4"/></g>`
    runeRing = `<circle cx="300" cy="300" r="150" stroke-width="1.4"/><circle cx="300" cy="300" r="132" stroke-width=".8" stroke-dasharray="2 5"/><path d="${glyphPath(P, 134, 72, 14)}" stroke-width="1.3"/>`
    $('.fu-mandala').innerHTML = `
      <defs>
        <filter id="fu-bloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
        <filter id="fu-soft"><feGaussianBlur stdDeviation="1.2"/></filter>
        <radialGradient id="fu-orb" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#F4FFF9"/><stop offset="35%" stop-color="#7CFFC6"/><stop offset="75%" stop-color="#17C97A" stop-opacity=".55"/><stop offset="100%" stop-color="#0A6B42" stop-opacity="0"/></radialGradient>
        <radialGradient id="fu-haze" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#2BF59B" stop-opacity=".18"/><stop offset="70%" stop-color="#2BF59B" stop-opacity=".04"/><stop offset="100%" stop-color="#2BF59B" stop-opacity="0"/></radialGradient>
      </defs>
      <circle cx="300" cy="300" r="290" fill="url(#fu-haze)"/>
      <g><g stroke="#2BF59B" opacity=".75" filter="url(#fu-bloom)">${lines}</g><g stroke="#9BFFD3" opacity=".95" filter="url(#fu-soft)">${lines}</g></g>
      <circle cx="300" cy="300" r="62" fill="url(#fu-orb)"><animate attributeName="r" values="56;66;56" dur="3.2s" repeatCount="indefinite"/></circle>
      <circle cx="300" cy="300" r="20" fill="#F4FFF9" opacity=".85" filter="url(#fu-soft)"/>
      <g class="fu-fx"></g>`
  })()

  // 시간의 고리가 터질 때: 별 회전 + 초록 파동 + 펼쳐지는 문양 띠 + 맴돌며 풀려나는 빛 + 떠오르는 문양
  function burst() {
    const fx = $('.fu-fx')
    root.querySelectorAll('.fu-kick').forEach((k, i) => { k.classList.remove('go'); void k.getBoundingClientRect(); k.classList.add('go'); k.style.animationDelay = `${i * 60}ms` })
    let svg = ''
    for (let i = 0; i < 2; i++) svg += `<circle class="fu-wave" cx="300" cy="300" r="240" style="animation-delay:${i * 220}ms"/>`
    for (let i = 0; i < 2; i++) svg += `<g class="fu-runering" filter="url(#fu-soft)" style="animation-delay:${120 + i * 320}ms">${runeRing}</g>`
    svg += '<circle class="fu-flash" cx="300" cy="300" r="70" fill="#F4FFF9"/>'
    fx.innerHTML = svg; later(() => { if (fx.innerHTML === svg) fx.innerHTML = '' }, 2200)
    // 고리가 소환 애니메이션으로 아직 작을 때도 최종 크기 기준으로 뿌린다(offsetWidth는 transform 영향 없음)
    const wrap = $('.fu-mandala-wrap'), box = wrap.getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height / 2, R = wrap.offsetWidth * .4
    FX.swirl({ cx, cy, r: R, n: 70, dir: 1, over: 1000 })
    for (let i = 0; i < 9; i++) later(() => {
      const a = Math.random() * 6.283, r = R * (.85 + Math.random() * .25)
      FX.rune({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) * .9, size: 9 + Math.random() * 8, color: pick(['#9BFFD3', '#B8FFE0', '#5CFFB5']),
        life: 70 + Math.random() * 40, dx: -Math.sin(a) * .5, dy: Math.cos(a) * .5 - .2, spin: .02 })
    }, Math.random() * 1100)
  }

  // ── 여덟 꼭지 별: 꼭지 k의 기본 각도는 k×45°, 카드 쪽(φ)에 온 꼭지가 지금 미래 ──
  let navAngle = 0, navAnim = 0
  const tipXY = (k, r = NR) => [NC + r * Math.cos(k * 2 * Math.PI / TIPS), NC + r * Math.sin(k * 2 * Math.PI / TIPS)]
  function buildNav() {
    const P = (r, a) => [NC + r * Math.cos(a), NC + r * Math.sin(a)]
    let tips = '', labels = ''
    for (let k = 0; k < TIPS; k++) {
      const [x, y] = tipXY(k), [lx, ly] = tipXY(k, NR + 34)
      tips += `<g class="fu-tip" data-k="${k}" style="--stone:${TIP_STONE[k]}" tabindex="0" role="button" aria-label="미래 ${k + 1} ${LENS_SHORT[k]}"><circle cx="${x}" cy="${y}" r="24" fill="transparent"/>
        <circle class="fu-gem-halo" cx="${x}" cy="${y}" r="16" filter="url(#fu-nbloom)"/><circle class="fu-node" cx="${x}" cy="${y}" r="7"/><circle class="fu-gem-gloss" cx="${x - 2.2}" cy="${y - 2.4}" r="1.8"/></g>`
      labels += `<text class="fu-tiplabel" data-k="${k}" x="${lx}" y="${ly + 4}" text-anchor="middle">${LENS_SHORT[k]}</text>`
    }
    const rings = `
      <g class="fu-nspin-a"><circle cx="${NC}" cy="${NC}" r="${NR + 52}" fill="none" stroke-width="2.6"/><circle cx="${NC}" cy="${NC}" r="${NR + 30}" fill="none" stroke-width="1.2"/>
        <path d="${glyphPath(P, NR + 33, 120, 16, .014)}" fill="none" stroke-width="1.3"/></g>
      <g class="fu-nspin-b"><circle cx="${NC}" cy="${NC}" r="${NR + 64}" fill="none" stroke-width="1" stroke-dasharray="1 6"/>
        <path d="${starPath(NC, NC, NR + 22, 4, 1, Math.PI / 4)}" fill="none" stroke-width=".9" opacity=".7"/><path d="${starPath(NC, NC, NR + 22, 4, 1)}" fill="none" stroke-width=".9" opacity=".7"/></g>
      <g class="fu-nspin-c"><circle cx="${NC}" cy="${NC}" r="92" fill="none" stroke-width="1.6"/><path d="${glyphPath(P, 74, 48, 12, .014)}" fill="none" stroke-width="1.1"/>
        <path d="${starPath(NC, NC, 92, 6, 2)}" fill="none" stroke-width="1"/></g>
      <g class="fu-nspin-d"><circle cx="${NC}" cy="${NC}" r="${NR - 8}" fill="none" stroke-width=".8" stroke-dasharray="3 5"/></g>`
    const lines = `<circle cx="${NC}" cy="${NC}" r="${NR + 14}" fill="none" stroke-width="1.2" stroke-dasharray="2 6"/>
      <path d="${starPath(NC, NC, NR, TIPS, 3)}" fill="none" stroke-width="2"/><path d="${starPath(NC, NC, NR * .62, TIPS, 2, Math.PI / TIPS)}" fill="none" stroke-width="1.2"/>
      <circle cx="${NC}" cy="${NC}" r="${NR * .62}" fill="none" stroke-width="1"/><circle cx="${NC}" cy="${NC}" r="58" fill="none" stroke-width="2"/>`
    const [fx, fy] = [NC + NR * Math.cos(phi() * Math.PI / 180), NC + NR * Math.sin(phi() * Math.PI / 180)]
    const F = 'filterUnits="userSpaceOnUse" x="-90" y="-90" width="600" height="600"' // 수평·수직선이 흐림 필터에서 사라지지 않게
    navSvg.innerHTML = `
      <defs><filter id="fu-nbloom" ${F}><feGaussianBlur stdDeviation="5"/></filter>
        <filter id="fu-nwide" ${F}><feGaussianBlur stdDeviation="16"/></filter>
        <filter id="fu-ndream" ${F}>
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3" result="n"><animate attributeName="baseFrequency" values="0.010;0.017;0.010" dur="11s" repeatCount="indefinite"/></feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" result="d"/>
          <feGaussianBlur in="d" stdDeviation="3.2"/></filter>
        <radialGradient id="fu-norb" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#F4FFF9"/><stop offset="40%" stop-color="#7CFFC6"/><stop offset="80%" stop-color="#17C97A" stop-opacity=".5"/><stop offset="100%" stop-color="#0A6B42" stop-opacity="0"/></radialGradient>
        <radialGradient id="fu-nhaze"><stop offset="0%" stop-color="#3DF5C0" stop-opacity=".2"/><stop offset="55%" stop-color="#1FA88C" stop-opacity=".07"/><stop offset="100%" stop-color="#2BF59B" stop-opacity="0"/></radialGradient></defs>
      <circle cx="${NC}" cy="${NC}" r="260" fill="url(#fu-nhaze)"/>
      <g class="fu-rings-kick">
        <g class="fu-screen" stroke="#2BF59B" opacity=".6" filter="url(#fu-nwide)">${rings}</g>
        <g class="fu-screen" stroke="#58F2C8" opacity=".75" filter="url(#fu-ndream)">${rings}</g>
        <g stroke="#A9F5D8" opacity=".38">${rings}</g>
      </g>
      <g class="fu-echo2" opacity=".10"><g class="fu-screen" stroke="#6FF5D0" filter="url(#fu-ndream)">${lines}</g></g>
      <g class="fu-echo1" opacity=".22"><g class="fu-screen" stroke="#6FF5D0" filter="url(#fu-ndream)">${lines}</g></g>
      <g class="fu-navrot">
        <g class="fu-screen" stroke="#2BF59B" opacity=".65" filter="url(#fu-nwide)">${lines}</g>
        <g class="fu-screen" stroke="#4DF7B8" opacity=".85" filter="url(#fu-ndream)">${lines}</g>
        <g stroke="#C8FFE6" opacity=".5">${lines}</g>
        ${tips}
      </g>
      <g class="fu-navlabels">${labels}</g>
      <circle class="fu-core-pulse" cx="${NC}" cy="${NC}" r="52" fill="url(#fu-norb)" filter="url(#fu-nbloom)" opacity=".9"/>
      <circle class="fu-flare" cx="${fx}" cy="${fy}" r="22" fill="#CFFFEA" opacity="0"/>`
    navSvg.querySelectorAll('.fu-tip').forEach((g) => {
      const k = +g.dataset.k
      g.addEventListener('click', () => goTo(k))
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(k) } })
      g.addEventListener('mousemove', (e) => {
        const st = store[model].get(k), f = st?.status === 'ready' ? st.data : null
        tooltip.style.display = 'block'; tooltip.style.left = `${e.clientX + 14}px`; tooltip.style.top = `${e.clientY + 14}px`
        tooltip.innerHTML = `<b>미래 ${k + 1} · ${LENS_SHORT[k]}</b><br>${f ? esc(f.title) : st?.status === 'loading' ? '내다보는 중…' : st?.status === 'error' ? '그리지 못함' : '아직 보지 않은 미래'}`
      })
      g.addEventListener('mouseleave', () => { tooltip.style.display = 'none' })
    })
  }

  // 고리를 따라 맴도는 빛 알갱이 — 넘길 때는 한꺼번에 빨라져 시간이 감기는 듯 돈다(잔상으로 곡선이 남음)
  let sparkBoost = 0, sparkDir = 1, sparkLoop = 0, echoA1 = 0, echoA2 = 0, sparksStarted = false
  function startNavSparks() {
    if (sparksStarted) return
    sparksStarted = true
    const cv = $('.fu-navsparks'), ctx = cv.getContext('2d'), ps = [], off = reducedMotion()
    const fit = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio }
    fit(); listen(window, 'resize', fit)
    const tick = (now) => {
      if (dead) return
      const W = cv.width, k = W / 600, cx = (NC + 90) * k, cy = (NC + 90) * k, boost = now < sparkBoost
      const rate = off ? 0 : boost ? 2.4 : .4
      for (let i = 0; i < rate; i++) {
        if (Math.random() > rate - i) break
        ps.push({ a: Math.random() * 6.283, r: (NR + 18 + Math.random() * 50) * k, w: .004 + Math.random() * .006, vr: (Math.random() - .35) * .25 * k,
          size: (7 + Math.random() * 10) * k * 1.6, color: pick(GREENS), life: 70 + Math.random() * 80, t: 0, ph: Math.random() * 6 })
      }
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(0, 0, W, cv.height)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = ps.length - 1; i >= 0; i--) {
        const q = ps[i]
        if (++q.t > q.life) { ps.splice(i, 1); continue }
        q.a += sparkDir * q.w * (boost ? 4.5 : 1); q.r += q.vr
        const p = q.t / q.life, fade = p < .15 ? p / .15 : 1 - (p - .15) / .85, sz = q.size * (.55 + .45 * fade)
        ctx.globalAlpha = fade * (.7 + .3 * Math.sin(q.t * .3 + q.ph))
        ctx.drawImage(FX.sprite(q.color), cx + q.r * Math.cos(q.a) - sz / 2, cy + q.r * Math.sin(q.a) - sz / 2, sz, sz)
      }
      ctx.globalAlpha = 1
      echoA1 += (navAngle - echoA1) * .08; echoA2 += (navAngle - echoA2) * .04
      const e1 = navSvg.querySelector('.fu-echo1'), e2 = navSvg.querySelector('.fu-echo2')
      if (e1) { e1.setAttribute('transform', `rotate(${echoA1} ${NC} ${NC})`); e2.setAttribute('transform', `rotate(${echoA2} ${NC} ${NC})`) }
      sparkLoop = requestAnimationFrame(tick)
    }
    echoA1 = echoA2 = navAngle
    sparkLoop = requestAnimationFrame(tick)
    cleanups.push(() => cancelAnimationFrame(sparkLoop))
  }
  function setNav(angle) {
    navAngle = angle
    navSvg.querySelector('.fu-navrot')?.setAttribute('transform', `rotate(${angle} ${NC} ${NC})`)
    // 이름표는 별과 함께 돌지 않고 꼭지 바깥에 붙어 다닌다 — 좌우 꼭지는 바깥쪽으로 정렬해 보석과 겹치지 않게
    navSvg.querySelectorAll('.fu-tiplabel').forEach((el) => {
      const t = (+el.dataset.k * STEP + angle) * Math.PI / 180, c = Math.cos(t), side = c > .38 ? 'start' : c < -.38 ? 'end' : 'middle'
      const r = side === 'middle' ? NR + 32 : NR + 20
      el.setAttribute('x', NC + r * c); el.setAttribute('y', NC + r * Math.sin(t) + 4 + (side === 'middle' ? Math.sign(Math.sin(t)) * 4 : 0)); el.setAttribute('text-anchor', side)
    })
  }
  function rotateNav(to, dur = 950) {
    cancelAnimationFrame(navAnim)
    const from = navAngle, t0 = performance.now(), ease = (x) => 1 - Math.pow(1 - x, 3)
    const step = (now) => { if (dead) return; const x = Math.min(1, (now - t0) / dur); setNav(from + (to - from) * ease(x)); if (x < 1) navAnim = requestAnimationFrame(step) }
    navAnim = requestAnimationFrame(step)
  }
  cleanups.push(() => cancelAnimationFrame(navAnim))
  function markTip(k) {
    navSvg.querySelectorAll('.fu-tip').forEach((g) => g.classList.toggle('on', +g.dataset.k === k))
    navSvg.querySelectorAll('.fu-tiplabel').forEach((el) => el.classList.toggle('on', +el.dataset.k === k))
  }
  function tipScreenXY() {
    const box = navSvg.getBoundingClientRect(), s = box.width / 600, a = phi() * Math.PI / 180
    return { x: box.left + (NC + NR * Math.cos(a) + 90) * s, y: box.top + (NC + NR * Math.sin(a) + 90) * s, s, a }
  }
  // 꼭지에서 화면 전체로 퍼지는 시간 물결
  function timeRipple() {
    const { x, y } = tipScreenXY()
    const el = document.createElement('div'); el.className = 'fu-ripple'
    el.style.left = `${x}px`; el.style.top = `${y}px`
    root.appendChild(el); later(() => el.remove(), 1600)
  }
  // 카드 쪽 꼭지(스톤)에서 작은 마법진이 펼쳐지고, 스톤 빛이 소용돌이치며 카드로 흘러간다
  function fireTip(strong = false, k = current) {
    const stone = TIP_STONE[k % TIP_STONE.length]
    const fl = navSvg.querySelector('.fu-flare')
    if (fl) { fl.setAttribute('fill', stone); fl.classList.remove('fire'); void fl.getBoundingClientRect(); fl.classList.add('fire') }
    const { x, y, s, a } = tipScreenXY()
    sparkBoost = performance.now() + 700
    FX.rune({ x, y, size: (strong ? 46 : 36) * s * 1.4, color: stone, life: strong ? 85 : 70, grow: true, spin: (sparkDir || 1) * .025, dy: 0, alpha: .85 })
    FX.pour({ x, y, angle: a, n: strong ? 34 : 18, colors: [stone, stone, stone, '#FFFFFF'], speed: strong ? 3.6 : 3, spread: 1.3, over: 420 })
  }

  // ── 미래 카드 ──
  const ring = (i) => {
    const p = (i + 1) / TIPS, C = 2 * Math.PI * 9
    return `<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9" fill="none" stroke="rgba(92,255,181,.2)" stroke-width="2.5"/><circle cx="11" cy="11" r="9" fill="none" stroke="#5CFFB5" stroke-width="2.5" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 11 11)" stroke-linecap="round"/></svg>`
  }
  const lensTag = (i, extra = '') => `<div class="fu-lens" style="--stone:${TIP_STONE[i]}"><span class="fu-gem"></span>${LENS_SHORT[i]}${extra ? ` · ${esc(extra)}` : ''}</div>`
  // 이 미래가 축으로 삼은 연결 — 연결 별자리의 어느 선 위에서 그렸는지
  function axisLine(f) {
    const axis = (f.axis || []).map((label) => {
      const c = (bridges?.concepts || []).find((x) => x.label === label)
      return c ? `<b>${esc(c.label)}</b><em>${c.ends.map((e) => esc(e.word)).join(' · ')}</em>` : `<b>${esc(label)}</b>`
    })
    return axis.length ? `<div class="fu-axis"><span>연결 축</span>${axis.join('<i></i>')}</div>` : ''
  }
  function showFuture(i, quiet = false) {
    current = i
    deck.style.setProperty('--tip-origin', phi() === 90 ? '50% 0%' : '0% 50%')
    const old = deck.querySelector('.fu-card:not(.leaving):not(.echo)')
    if (old && !quiet) {
      // 떠나는 미래는 꼭지로 빨려 들고, 잔상 두 겹이 남았다 사라진다
      const clean = (el) => { el.classList.remove('fromtip', 'emerge', 'leaving', 'echo'); return el }
      const ghost = clean(old.cloneNode(true)); ghost.classList.add('leaving')
      const echoes = [1, 2].map((n) => {
        const e = clean(old.cloneNode(true)); e.classList.add('echo'); e.style.animationDelay = `${n * 60}ms`
        e.style.setProperty('--ex', `${(phi() === 90 ? 0 : -1) * n * 18}px`); e.style.setProperty('--ey', `${(phi() === 90 ? -1 : 0) * n * 18}px`); return e
      })
      later(() => { ghost.remove(); echoes.forEach((e) => e.remove()) }, 900)
      queueMicrotask(() => { if (!dead) { echoes.forEach((e) => deck.appendChild(e)); deck.appendChild(ghost) } })
    }
    const s = store[model].get(i), f = s?.status === 'ready' ? s.data : null
    const nav = '<button type="button" class="fu-navbtn prev" data-go="-1" aria-label="이전 미래">‹</button><button type="button" class="fu-navbtn next" data-go="1" aria-label="다음 미래">›</button>'
    const head = (extra) => `<div class="fu-meta"><div class="fu-counter">${ring(i)} 미래 ${i + 1} / ${TIPS}</div>${lensTag(i, extra)}</div>`
    if (!f) {
      const body = s?.status === 'error'
        ? `<h3>이 꼭지의 미래를 그리지 못했습니다</h3><p class="fu-sit">${esc(s.error)}</p><div class="fu-actions"><button type="button" class="fu-btn primary" data-retry="${i}">다시 내다보기</button></div>`
        : `<div class="fu-waiting"><div class="fu-spinner"></div><b>${LENS_SHORT[i]} 꼭지의 미래를 내다보는 중…</b><span>${model === 'precise' ? 'Opus 5.5' : 'Sonnet 5.5'} · <span class="fu-elapsed">0</span>초 · 보통 10초 남짓 걸립니다</span></div>`
      deck.innerHTML = `${nav}<article class="fu-card fromtip">${head()}${body}</article>`
      if (!s) requestAround(i)
      return
    }
    const roles = (f.roles || []).map((r) => {
      const std = byKey.get(r.key)
      return `<div class="fu-role" style="--c:${colorOfStandard(std || r)}"><span class="fu-dot"></span><div><b>${esc(r.code)}</b><i>${esc(r.subject)}</i> ${esc(r.role)}</div></div>`
    }).join('')
    const list = (arr) => (Array.isArray(arr) ? arr : [arr]).filter(Boolean)
    deck.innerHTML = `${nav}<article class="fu-card fromtip">
      ${head(f.lens)}
      <h3>${esc(f.title)}</h3>${axisLine(f)}<p class="fu-sit">${esc(f.situation)}</p>
      <div class="fu-dq"><small>핵심 질문</small><div>${esc(f.driving_question)}</div></div>
      <div class="fu-roles">${roles}</div>
      <div class="fu-grid2"><div class="fu-box"><h4>수업 흐름</h4><ol>${list(f.activity_steps).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
        <div class="fu-box"><h4>사용하는 자료</h4>${list(f.data_sources).map(esc).join('<br>')}<h4 class="sp">학생 결과물</h4>${esc(f.student_output)}<h4 class="sp">평가 아이디어</h4>${esc(f.assessment_idea)}</div></div>
      ${f.honesty_note ? `<div class="fu-honest"><b>솔직한 메모</b> ${esc(f.honesty_note)}</div>` : ''}
      <div class="fu-actions"><button type="button" class="fu-btn primary" data-act="project">이 미래로 프로젝트 시작</button><button type="button" class="fu-btn ghost" data-act="basket">성취기준 담기</button>
        <span class="fu-hint">${s.ms ? `${Math.max(1, Math.round(s.ms / 1000))}초 만에 생성 · ` : ''}휠 · 끌기 · ← → 키로 다른 미래로</span></div>
    </article>`
  }

  // 카드 안 버튼(이벤트 위임)
  listen(deck, 'click', (e) => {
    const btn = e.target.closest('button'); if (!btn || btn.closest('.leaving, .echo')) return
    if (btn.dataset.go) return go(+btn.dataset.go)
    if (btn.dataset.retry) { const i = +btn.dataset.retry; store[model].delete(i); requestAround(i); showFuture(i, true); return }
    const f = store[model].get(current)?.data
    if (btn.dataset.act === 'project' && f) onStartProject?.(f)
    if (btn.dataset.act === 'basket') {
      const added = onBasket?.(keys)
      btn.textContent = added ? '담았습니다 ✓' : '이미 담겨 있습니다 ✓'
      btn.disabled = true
    }
  })

  // 넘길 때마다 별이 돌고, 고리가 앞뒤로 감긴다
  const go = (d) => goTo((current + d + TIPS) % TIPS, d)
  function goTo(k, dHint) {
    if (busy || !viewing() || k === current) return
    let delta = ((k - current) % TIPS + TIPS) % TIPS
    if (delta > TIPS / 2) delta -= TIPS // 가까운 쪽으로 돈다
    if (dHint) delta = dHint
    busy = true; markTip(k); sparkDir = delta > 0 ? -1 : 1; sparkBoost = performance.now() + 800
    rotateNav(navAngle - delta * STEP, 1100)
    const kick = navSvg.querySelector('.fu-rings-kick')
    if (kick) { kick.classList.remove('scrub-next', 'scrub-prev'); void kick.getBoundingClientRect(); kick.classList.add(delta > 0 ? 'scrub-next' : 'scrub-prev') }
    timeRipple()
    later(() => fireTip(false, k), 520)
    showFuture(k); later(() => { busy = false }, 560)
  }

  // ── 연결 별자리: 성취기준 하나 = 별자리 하나, 둘레의 별이 원문 키워드. 이어지는 키워드는 초록 선으로 잇고, 이어진 별자리가 초록으로 켜진다 ──
  // 뒤에서 연결을 찾고(서버) 미래를 만드는 동안 이 장면이 시간을 번다.
  const weave = $('.fu-weave'), caption = $('.fu-weave-caption')
  const WC = { x: 500, y: 278, rx: 350, ry: 195, RK: 86 } // 아래쪽은 시작 버튼 자리
  const circlePos = standards.map((_, i) => {
    const n = standards.length
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n % 2 === 0 ? Math.PI / n : 0)
    return { x: WC.x + WC.rx * Math.cos(a), y: WC.y + WC.ry * Math.sin(a) }
  })
  const indexOfKey = new Map(standards.map((s, i) => [s.key, i]))
  let bridges, bridgesSettled = false
  const bridgeWaiters = []
  const shortSubject = (s) => String(s.subject || '').replace(/\(.*\)/, '').split(',')[0].trim()
  ;(() => {
    if (!standards.length) return
    let scan = ''
    for (let i = 0; i < circlePos.length; i++) for (let j = i + 1; j < circlePos.length; j++) {
      const a = circlePos[i], b = circlePos[j]
      scan += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`
    }
    weave.innerHTML = `
      <defs>
        <!-- 연결선: 무대 좌표 전체(수평·수직선도 사라지지 않게) / 별자리: 자기 영역 기준(옮겨진 그룹이라 무대 좌표를 쓰면 일부만 보인다) -->
        <filter id="fu-wglow" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="620"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="fu-wcglow" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="fu-starhalo"><stop offset="0%" stop-color="#fff" stop-opacity=".85"/><stop offset="35%" stop-color="#CFE3DE" stop-opacity=".32"/><stop offset="100%" stop-color="#CFE3DE" stop-opacity="0"/></radialGradient>
        <radialGradient id="fu-starhalo-g"><stop offset="0%" stop-color="#F4FFF9" stop-opacity="1"/><stop offset="30%" stop-color="#5CFFB5" stop-opacity=".6"/><stop offset="100%" stop-color="#2BF59B" stop-opacity="0"/></radialGradient>
      </defs>
      <g class="fu-wscan">${scan}</g>
      <g class="fu-wlinks"></g>
      ${standards.map((s, i) => `
        <g class="fu-wc" data-i="${i}" transform="translate(${circlePos[i].x} ${circlePos[i].y})" style="--c:${colorOfStandard(s)}; --d:${i * 140}ms">
          <g class="fu-wc-in">
            <g class="fu-clines"></g>
            <circle class="fu-core-halo" r="22" fill="url(#fu-starhalo)"/>
            <path class="fu-core-spark" d="M0,-15 L1.6,-1.6 L15,0 L1.6,1.6 L0,15 L-1.6,1.6 L-15,0 L-1.6,-1.6Z"/>
            <circle class="fu-core" r="4.2"/>
            <text class="fu-wc-subject" y="34">${esc(shortSubject(s))}</text>
            <text class="fu-wc-code" y="51">${esc(s.code)}</text>
            <g class="fu-wc-kws"></g>
          </g>
        </g>`).join('')}`
  })()
  // 키워드 별 자리: 다른 별자리와 이어지는 키워드는 그쪽을 향한 자리에, 나머지는 빈자리에 고르게
  function layoutKeywords() {
    const words = bridges?.keywords || {}
    const pos = new Map() // `${i}|${word}` → {x, y, a}
    standards.forEach((s, i) => {
      const list = words[s.key] || []
      if (!list.length) return
      const prefer = new Map()
      for (const c of bridges?.concepts || []) {
        const mine = c.ends.find((e) => e.key === s.key)
        if (!mine) continue
        let vx = 0, vy = 0
        for (const e of c.ends) { if (e.key === s.key) continue; const j = indexOfKey.get(e.key); vx += circlePos[j].x - circlePos[i].x; vy += circlePos[j].y - circlePos[i].y }
        const v = prefer.get(mine.word) || [0, 0]
        prefer.set(mine.word, [v[0] + vx, v[1] + vy])
      }
      // 자리는 아래쪽(과목 이름) 120°를 비운 위쪽 240°에 고르게
      const n = list.length, span = (4 * Math.PI) / 3
      const slots = list.map((_, k) => Math.PI / 2 + Math.PI / 3 + (n === 1 ? span / 2 : (k * span) / (n - 1)))
      const free = new Set(slots.map((_, k) => k))
      const order = [...list].sort((a, b) => (prefer.has(b) ? 1 : 0) - (prefer.has(a) ? 1 : 0))
      for (const w of order) {
        let best = [...free][0]
        if (prefer.has(w)) {
          const [vx, vy] = prefer.get(w), want = Math.atan2(vy, vx)
          let bd = Infinity
          for (const k of free) { const d = Math.abs(Math.atan2(Math.sin(slots[k] - want), Math.cos(slots[k] - want))); if (d < bd) { bd = d; best = k } }
        }
        free.delete(best)
        const a = slots[best]
        const h = [...w].reduce((t, ch) => (t * 31 + ch.charCodeAt(0)) % 997, 7) // 키워드마다 같은 자리(재현 가능)
        const r = WC.RK * (.78 + (h % 40) / 100)
        pos.set(`${i}|${w}`, { x: circlePos[i].x + r * Math.cos(a), y: circlePos[i].y + r * Math.sin(a), a })
      }
    })
    return pos
  }
  let kwPos = new Map()
  function drawKeywords() {
    kwPos = layoutKeywords()
    standards.forEach((s, i) => {
      const g = weave.querySelector(`.fu-wc[data-i="${i}"] .fu-wc-kws`); if (!g) return
      const list = bridges?.keywords?.[s.key] || []
      g.innerHTML = list.map((w, k) => {
        const p = kwPos.get(`${i}|${w}`); if (!p) return ''
        const lx = p.x - circlePos[i].x, ly = p.y - circlePos[i].y, c = Math.cos(p.a)
        const anchor = c > .35 ? 'start' : c < -.35 ? 'end' : 'middle'
        const tx = lx + (anchor === 'start' ? 9 : anchor === 'end' ? -9 : 0), ty = ly + (anchor === 'middle' ? (Math.sin(p.a) > 0 ? 20 : -11) : 5)
        return `<g class="fu-kw" data-w="${esc(w)}" style="--k:${k * 110}ms"><circle class="fu-kw-halo" cx="${lx}" cy="${ly}" r="9" fill="url(#fu-starhalo)"/><circle cx="${lx}" cy="${ly}" r="2.4"/><text x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(w)}</text></g>`
      }).join('')
      // 별자리 선: 키워드 별을 각도 순으로 잇고(가장 큰 틈은 비움), 가운데 별을 가장 가까운 키워드 별에 잇는다
      const pts = list.map((w) => kwPos.get(`${i}|${w}`)).filter(Boolean)
        .map((p) => ({ x: p.x - circlePos[i].x, y: p.y - circlePos[i].y, a: Math.atan2(p.y - circlePos[i].y, p.x - circlePos[i].x) }))
        .sort((p, q) => p.a - q.a)
      let lines = ''
      if (pts.length >= 2) {
        let gapAt = 0, gap = -1
        pts.forEach((p, k) => { const q = pts[(k + 1) % pts.length]; const d = ((q.a - p.a) + 2 * Math.PI) % (2 * Math.PI); if (d > gap) { gap = d; gapAt = k } })
        const chain = [...pts.slice(gapAt + 1), ...pts.slice(0, gapAt + 1)]
        lines += `<path d="M${chain.map((p) => `${p.x},${p.y}`).join('L')}" pathLength="1"/>`
      }
      if (pts.length) {
        const near = pts.reduce((m, p) => (Math.hypot(p.x, p.y) < Math.hypot(m.x, m.y) ? p : m))
        lines += `<path d="M0,0L${near.x},${near.y}" pathLength="1"/>`
      }
      const cl = weave.querySelector(`.fu-wc[data-i="${i}"] .fu-clines`); if (cl) cl.innerHTML = lines
    })
    // 연결선은 미리 그려 두고 숨겨 둔다(드러낼 때 선이 그어지며 나타난다)
    weave.querySelector('.fu-wlinks').innerHTML = (bridges?.concepts || []).map((c, n) => {
      const ends = c.ends.map((e) => kwPos.get(`${indexOfKey.get(e.key)}|${e.word}`)).filter(Boolean)
      if (ends.length < 2) return ''
      let paths, hx, hy
      if (ends.length === 2) {
        const [a, b] = ends, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        const cx = mx + (WC.x - mx) * .18, cy = my + (WC.y - my) * .18 // 무대 중심 쪽으로 살짝 휜다
        paths = `<path d="M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}" pathLength="1"/>`
        hx = (a.x + 2 * cx + b.x) / 4; hy = (a.y + 2 * cy + b.y) / 4
      } else {
        hx = ends.reduce((t, e) => t + e.x, 0) / ends.length; hy = ends.reduce((t, e) => t + e.y, 0) / ends.length
        paths = ends.map((e) => `<path d="M${e.x},${e.y} L${hx},${hy}" pathLength="1"/>`).join('')
      }
      const w = Math.max(64, [...c.label].length * 15 + 22)
      return `<g class="fu-wlink" data-n="${n}">${paths}<g class="fu-wlabel" transform="translate(${hx} ${hy})"><rect x="${-w / 2}" y="-13" width="${w}" height="26" rx="13"/><text y="5" text-anchor="middle">${esc(c.label)}</text></g></g>`
    }).join('')
  }
  function weaveToScreen(x, y) {
    const m = weave.getScreenCTM(); if (!m) return null
    const pt = weave.createSVGPoint(); pt.x = x; pt.y = y
    const r = pt.matrixTransform(m); return { x: r.x, y: r.y }
  }
  function setCaption(text) { caption.textContent = text; caption.classList.toggle('on', !!text) }
  function whenBridgesSettled() {
    return new Promise((resolve) => {
      if (bridgesSettled) return resolve()
      bridgeWaiters.push(resolve)
      later(resolve, 25_000) // 연결이 늦어도 미래로 넘어간다(서버도 연결 없이 그린다)
    })
  }
  // 이어진 키워드를 하나씩 잇고, 처음 이어진 별자리를 초록으로 켠다
  function revealLinks(done) {
    const concepts = bridges?.concepts || []
    if (!concepts.length) {
      setCaption(bridges ? '뚜렷하게 이어지는 키워드는 찾지 못했습니다. 성취기준마다의 관점으로 미래를 그립니다.' : '연결을 찾지 못했습니다. 성취기준마다의 관점으로 미래를 그립니다.')
      later(done, 1800)
      return
    }
    weave.classList.add('linking')
    setCaption('이어지는 키워드를 잇는 중…')
    const lit = new Set()
    concepts.forEach((c, n) => later(() => {
      const g = weave.querySelector(`.fu-wlink[data-n="${n}"]`); if (!g) return
      g.classList.add('on')
      for (const e of c.ends) {
        const i = indexOfKey.get(e.key)
        weave.querySelector(`.fu-wc[data-i="${i}"] .fu-kw[data-w="${CSS.escape(e.word)}"]`)?.classList.add('hit')
        if (!lit.has(i)) {
          lit.add(i)
          later(() => {
            weave.querySelector(`.fu-wc[data-i="${i}"]`)?.classList.add('lit')
            const p = weaveToScreen(circlePos[i].x, circlePos[i].y)
            if (p) { FX.pour({ x: p.x, y: p.y, angle: -Math.PI / 2, n: 14, spread: 6.2, speed: 2.2, over: 160 }); FX.swirl({ cx: p.x, cy: p.y, r: 30, n: 8, over: 200 }) }
          }, 420)
        }
      }
      const hub = g.querySelector('.fu-wlabel')?.getAttribute('transform')?.match(/translate\(([-\d.]+) ([-\d.]+)\)/)
      if (hub) { const p = weaveToScreen(+hub[1], +hub[2]); if (p) FX.pour({ x: p.x, y: p.y, angle: -Math.PI / 2, n: 6, spread: 3, speed: 1.4, over: 150 }) }
    }, n * 520))
    later(() => {
      const isolated = (bridges.isolated || []).length
      setCaption(`연결 ${concepts.length}개를 찾았습니다${isolated ? ` · 엮이지 않은 성취기준 ${isolated}개` : ''}`)
      later(done, 1300)
    }, concepts.length * 520 + 500)
  }

  // 시작: 연결 별자리(연결 찾기·잇기) → 별자리가 모여 시간의 고리 소환 → 터짐 → 별로 바뀌며 첫 미래
  function castAndView() {
    ritual.classList.remove('weaving'); ritual.classList.add('casting')
    setCaption('')
    later(burst, 350)
    later(() => {
      ritual.classList.remove('casting'); ritual.classList.add('viewing')
      buildNav(); for (let k = 0; k < TIPS; k++) refreshTip(k)
      startNavSparks(); sparkBoost = performance.now() + 1400
      setNav(phi() - 360); markTip(0); rotateNav(phi(), 1400)
      later(() => { fireTip(true, 0); timeRipple(); showFuture(0, true) }, 1150)
    }, 2600)
  }
  listen($('.fu-start'), 'click', () => {
    if (!canStart) return
    requestAround(0) // 8개 모두 지금 시작 — 서버는 연결을 기다렸다가 그 위에서 그린다
    ritual.classList.add('weaving')
    ritual.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (!bridgesSettled) setCaption('성취기준 사이의 연결을 찾는 중…')
    const t0 = performance.now()
    whenBridgesSettled().then(() => {
      if (dead || !ritual.classList.contains('weaving') || ritual.classList.contains('linking-started')) return
      ritual.classList.add('linking-started')
      later(() => revealLinks(castAndView), Math.max(0, 1500 - (performance.now() - t0)))
    })
  })
  // 조합이 1.5초 그대로면 첫 꼭지만 미리 요청 — 첫 미래는 누르자마자 보이고, 나머지 7개는 누를 때 시작한다.
  // (성취기준을 하나씩 넣는 동안 중간 조합마다 8개씩 생성되는 낭비를 막는다)
  if (canStart) later(() => enqueue([0]), 1500)

  listen(window, 'resize', () => { if (viewing()) { buildNav(); for (let k = 0; k < TIPS; k++) refreshTip(k); setNav(phi() - current * STEP); markTip(current) } })
  listen(window, 'keydown', (e) => {
    if (!viewing() || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
    if (e.key === 'ArrowRight') go(1)
    if (e.key === 'ArrowLeft') go(-1)
  })
  let wheelAt = 0
  listen(ritual, 'wheel', (e) => {
    if (!viewing()) return
    const now = Date.now()
    if (Math.abs(e.deltaX) + Math.abs(e.deltaY) < 30 || now - wheelAt < 650) return
    e.preventDefault(); wheelAt = now; go((e.deltaY || e.deltaX) > 0 ? 1 : -1)
  }, { passive: false })
  // 끌기: 마우스는 별 위에서만(카드 글자 선택과 겹치지 않게), 터치는 어디서나
  let downX = null
  listen(ritual, 'pointerdown', (e) => { downX = (e.pointerType === 'mouse' && !e.target.closest('.fu-navwrap')) ? null : e.clientX })
  listen(ritual, 'pointerup', (e) => { if (downX == null) return; const dx = e.clientX - downX; downX = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1) })

  return {
    /** 연결 별자리 데이터(성취기준 키워드 + 키워드 사이 연결). 실패면 null. */
    setBridges(data) {
      if (dead || bridgesSettled) return
      bridges = data || null
      bridgesSettled = true
      if (bridges) { drawKeywords(); weave.classList.add('has-kw') }
      bridgeWaiters.splice(0).forEach((fn) => fn())
    },
    setModel(m) {
      if (m === model) return
      model = m
      if (viewing()) { for (let k = 0; k < TIPS; k++) refreshTip(k); requestAround(current); showFuture(current, true) }
      else if (canStart) enqueue([0])
    },
    destroy() {
      dead = true
      timers.forEach(clearTimeout); timers.clear()
      cleanups.forEach((fn) => { try { fn() } catch { /* noop */ } })
      queue.length = 0
      root.innerHTML = ''
    },
  }
}
