// 성취기준의 스톤은 고유 색을 유지하고, 시간의 고리는 초록으로 수렴한다.
export const STONE_COLORS = ['#3D8BFF', '#FFD23F', '#FF3D52', '#A55BFF', '#FF8A2B', '#2BF59B']
export const colorOfStone = index => STONE_COLORS[((index % 6) + 6) % 6]

/** 평면 원 대신 깊이·절단면·반사광을 가진 작은 결정. 외부 이미지·WebGL 없이 렌더링한다. */
export function crystalMarkup(id, color, scale = 1) {
  return `<g class="fu2-crystal" style="--stone:${color}" transform="scale(${scale})">
    <defs>
      <radialGradient id="${id}-aura"><stop stop-color="${color}" stop-opacity=".48"/><stop offset=".35" stop-color="${color}" stop-opacity=".18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}-body" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#f1fbff"/><stop offset=".17" stop-color="${color}"/><stop offset=".64" stop-color="${color}"/><stop offset="1" stop-color="#071119"/></linearGradient>
      <linearGradient id="${id}-face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff" stop-opacity=".74"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
    </defs>
    <ellipse class="fu2-stone-aura" rx="76" ry="82" fill="url(#${id}-aura)"/>
    <g class="fu2-stone-body">
      <path d="M-5-31 17-21 26 1 16 25-4 33-23 17-25-6-15-26Z" fill="url(#${id}-body)" stroke="${color}" stroke-width=".7"/>
      <path d="M-5-31-8-7 17-21Z M-25-6-8-7-23 17Z M-8-7 10 5-4 33-23 17Z" fill="url(#${id}-face)"/>
      <path d="M17-21-8-7 10 5 26 1Z" fill="#ffffff" opacity=".22"/>
      <path d="M26 1 10 5 16 25-4 33 10 5Z" fill="#010a10" opacity=".48"/>
      <path d="M-15-26-8-7-5-31 M-8-7 10 5-4 33 M10 5 17-21 M10 5 26 1" fill="none" stroke="#edffff" stroke-opacity=".31" stroke-width=".65"/>
      <path d="M-13-23-6-26 3-20-5-18Z" fill="#ffffff" opacity=".83"/>
      <path class="fu2-facet-glint" d="M-19-13-12-21-15-5Z" fill="#ffffff" opacity=".55"/>
    </g>
  </g>`
}

/** 시간의 고리: 서로 기울어진 궤도·짧은 눈금·중앙의 초록 결정. */
export function portalMarkup(id, center = 300) {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = i * Math.PI / 36, r = i % 6 ? 228 : 220
    return `<path d="M${center + r * Math.cos(a)} ${center + r * Math.sin(a)}L${center + 239 * Math.cos(a)} ${center + 239 * Math.sin(a)}"/>`
  }).join('')
  const orbit = (radius, dash) => `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke-dasharray="${dash}"/>`
  return `<g class="fu2-time-portal">
    <defs><radialGradient id="${id}-haze"><stop stop-color="#3ef1a5" stop-opacity=".22"/><stop offset=".45" stop-color="#0abb71" stop-opacity=".07"/><stop offset="1" stop-color="#0abb71" stop-opacity="0"/></radialGradient>
      <filter id="${id}-soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.1"/></filter></defs>
    <circle cx="${center}" cy="${center}" r="288" fill="url(#${id}-haze)"/>
    <g class="fu2-orbit-plane fu2-plane-a"><g class="fu2-orbit-spin" stroke="#89efba" stroke-width="1.2">${orbit(244, '116 10 21 8')}${orbit(251, '3 24')}</g></g>
    <g class="fu2-orbit-plane fu2-plane-b"><g class="fu2-orbit-spin fu2-reverse" stroke="#d6c293" stroke-width=".85">${orbit(206, '65 11 4 10')}${orbit(199, '2 16')}</g></g>
    <g class="fu2-orbit-plane fu2-plane-c"><g class="fu2-orbit-spin" stroke="#58dca1" stroke-width="1">${orbit(174, '80 15 8 16')}</g></g>
    <g class="fu2-time-dial" stroke="#a4eaca" stroke-width=".9" fill="none">${ticks}${orbit(241, '1500 0')}</g>
    <g class="fu2-core-reverberation" transform="translate(${center} ${center})"><circle r="66" fill="none" stroke="#75ecb2" stroke-opacity=".3"/><circle r="90" fill="none" stroke="#75ecb2" stroke-opacity=".12"/></g>
    <g transform="translate(${center} ${center})"><g class="fu2-time-crystal">${crystalMarkup(id + '-core', '#2BF59B', 1.1)}</g></g>
  </g>`
}

/** 경로 끝점은 실제 연결점을 사용하고 중간 곡선만 부드럽게 휜다. */
export function energyPath(a, b, center) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1
  const bend = Math.min(65, length * .16), sign = ((mx - center.x) * dy - (my - center.y) * dx) > 0 ? -1 : 1
  const cx = mx - dy / length * bend * sign, cy = my + dx / length * bend * sign
  return { d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`, x: (a.x + 2 * cx + b.x) / 4, y: (a.y + 2 * cy + b.y) / 4, cx, cy }
}
