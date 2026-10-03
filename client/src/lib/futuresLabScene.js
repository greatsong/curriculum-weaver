import { layoutLabGraph } from './futuresLabLayout'
import { subjectOfStandard } from './futures2GraphLayout'

export const LAB_LENSES = ['지역 문제', '학교 생활', '데이터 탐구', '과학 탐구', '창작 프로젝트', '역사적 관점', '진로·직업', '지구적 문제']
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const array = value => Array.isArray(value) ? value : value ? [value] : []
let instance = 0

/** 기존 타임스톤과 상태·스타일·타이머를 공유하지 않는 실험실 장면. */
export function createFuturesLabScene(root, { standards, model: initialModel = 'fast', requestFuture, onStartProject, onBasket, onRetryBridges, externalGraph = false, onPhaseChange, onGraphState, colorForStandard, projectActionLabel = '이 미래로 프로젝트 시작 ↗', hideBasket = false }) {
  const uid = `lab-${++instance}`, byKey = new Map(standards.map(s => [s.key, s]))
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  let dead = false, model = initialModel, phase = 'graph', started = false, current = 0, bridgeState = standards.length >= 2 ? 'loading' : 'idle'
  let bridges = null, layout = null, active = null, revealing = false, revealTimers = [], analysisTimer = null
  const futures = { fast: new Map(), precise: new Map() }, timers = new Set(), transitions = new Set()
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn() }, ms); timers.add(id); return id }
  const cancel = id => { clearTimeout(id); timers.delete(id) }
  const keyboardTarget = root.ownerDocument
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)]
  root.innerHTML = `<section class="lab-scene" aria-label="빛의 원과 미래 탐색">
    <div class="lab-graph-view"><div class="lab-scene-head"><div><span class="lab-kicker">TIME STONE · 빛의 원</span><h2>교과 사이에서<br>수업의 가능성을 찾다.</h2></div><button type="button" class="lab-quiet" data-act="replay">연결 다시 보기 ↗</button></div>
    <p class="lab-status" role="status"></p><div class="lab-map"><svg class="lab-lines" aria-hidden="true"></svg><div class="lab-groups"></div><div class="lab-keywords"></div><div class="lab-hubs"></div></div>
    <div class="lab-inspector" aria-live="polite"><strong>선택한 성취기준을 중심으로</strong><p>과목 안의 코드와 키워드, 빛나는 연결점을 선택해 보세요.</p></div>
    <div class="lab-graph-actions"><button type="button" class="lab-quiet" data-act="retry-bridges">연결 다시 찾기</button><button type="button" class="lab-primary" data-act="open">미래 보기 ↗</button></div></div>
    <div class="lab-cast" hidden><div class="lab-portal" aria-hidden="true"></div><div class="lab-cast-copy"><span class="lab-kicker">연결이 하나의 가능성으로</span><h2>아직 만나지 않은<br>수업을 엽니다.</h2><p class="lab-cast-progress" role="status">여덟 갈래의 미래를 함께 준비합니다.</p></div></div>
    <div class="lab-future-view" hidden><button type="button" class="lab-quiet" data-act="graph">← 연결 지도</button><div class="lab-future-layout"><aside class="lab-orbit-panel"><span class="lab-kicker">가능성의 고리</span><div class="lab-orbit"><div class="lab-orbit-art" aria-hidden="true"></div><div class="lab-orbit-core"></div><div class="lab-orbit-buttons"></div></div><div class="lab-orbit-navigation"><button type="button" class="lab-round" data-go="-1" aria-label="이전 미래" aria-keyshortcuts="ArrowLeft">←</button><select class="lab-lens-select" aria-label="미래 관점">${LAB_LENSES.map((name, i) => `<option value="${i}">${name}</option>`).join('')}</select><button type="button" class="lab-round" data-go="1" aria-label="다음 미래" aria-keyshortcuts="ArrowRight">→</button></div><p class="lab-keyboard-hint">키보드 ← →로도 이동할 수 있습니다.</p><p class="lab-generation-progress" role="status"></p></aside><div class="lab-future-card" aria-live="polite"></div></div></div>
    <p class="lab-action-status" role="status"></p><p class="lab-ai-note">AI가 제안한 수업 아이디어입니다. 실제 수업의 효과를 예측하거나 보장하지 않습니다.</p>
    </section>`

  function graphMessage() {
    return { idle: '성취기준 2~7개를 선택하면 교과 사이의 연결을 찾습니다.', loading: '성취기준 원문에서 키워드와 연결을 찾고 있습니다.', slow: '연결 분석이 지연되고 있습니다. 기다리거나 각 교과의 관점으로 미래를 볼 수 있습니다.', error: '연결 분석을 완료하지 못했습니다. 다시 찾거나 각 교과의 관점으로 미래를 볼 수 있습니다.', ready: layout?.hubs.length ? '키워드를 따라 흐르는 빛에서 교과의 연결을 발견하세요.' : '뚜렷한 키워드 연결은 찾지 못했습니다. 각 교과의 관점으로 미래를 볼 수 있습니다.' }[bridgeState]
  }
  function updateGraphControls() {
    $('.lab-status').textContent = revealing ? '교과의 연결을 하나씩 밝히고 있습니다.' : graphMessage()
    $('[data-act="open"]').disabled = standards.length < 2 || revealing || bridgeState === 'loading'
    $('[data-act="replay"]').disabled = !layout?.hubs.length || revealing
    $('[data-act="retry-bridges"]').hidden = !['error', 'slow'].includes(bridgeState)
    onGraphState?.({ canOpen: !$('[data-act="open"]').disabled, status: bridgeState })
  }
  function stopReveal() {
    revealTimers.forEach(cancel); revealTimers = []; revealing = false
    $$('.lab-flowing,.lab-arrival').forEach(e => e.classList.remove('lab-flowing', 'lab-arrival'))
  }
  function drawGraph() {
    if (dead || phase !== 'graph') return
    const width = $('.lab-map').clientWidth || 1100
    layout = layoutLabGraph(standards, bridges, width)
    $('.lab-map').style.height = `${layout.height}px`
    const connected = new Set(layout.hubs.flatMap(h => h.ends.map(e => e.id)))
    let lines = '', groups = '', words = '', hubs = ''
    layout.groups.forEach(g => {
      groups += `<div class="lab-subject" data-group="${g.id}" style="left:${g.x}px;top:${g.y}px;width:${g.radius * 2}px;height:${g.radius * 2}px;--subject:${g.color}"><small>성취기준 ${g.standards.length}개</small><h3>${esc(g.subject)}</h3>${g.standards.map(s => `<button type="button" class="lab-standard" data-standard="${esc(s.key)}" aria-pressed="false">${esc(s.code)}</button>`).join('')}</div>`
    })
    layout.nodes.forEach(node => {
      lines += `<path data-owner="${esc(node.key)}" d="M${node.origin.x},${node.origin.y} Q${node.origin.x},${node.y} ${node.x},${node.y}" stroke="${node.color}" stroke-opacity=".3" fill="none"/>`
      words += `<button type="button" class="lab-keyword ${connected.has(node.id) ? 'is-connected' : ''}" data-word="${esc(node.id)}" aria-pressed="false" style="left:${node.x}px;top:${node.y}px;--subject:${node.color}"><span class="lab-key-light" aria-hidden="true"></span><span class="lab-key-name" style="width:${node.labelWidth}px">${esc(node.word)}</span></button>`
    })
    layout.hubs.forEach(h => {
      h.paths.forEach(({ end, d }, j) => {
        const gradient = `${uid}-${h.id}-${j}`
        lines += `<defs><linearGradient id="${gradient}" gradientUnits="userSpaceOnUse" x1="${end.x}" y1="${end.y}" x2="${h.x}" y2="${h.y}"><stop stop-color="${end.color}"/><stop offset=".7" stop-color="${end.color}"/><stop offset="1" stop-color="#d8ffe9"/></linearGradient></defs><g data-edge="${h.id}"><path d="${d}" stroke="url(#${gradient})" stroke-opacity=".15" stroke-width="13" fill="none" style="filter:blur(5px)"/><path d="${d}" stroke="url(#${gradient})" stroke-opacity=".3" stroke-width="4" fill="none" style="filter:blur(1.5px)"/><path d="${d}" stroke="url(#${gradient})" stroke-opacity=".95" stroke-width="1.8" fill="none"/><circle class="lab-beam" r="3.5"><animateMotion dur="1.1s" begin="indefinite" path="${d}"/></circle></g>`
      })
      hubs += `<button type="button" class="lab-hub" data-hub="${h.id}" aria-pressed="false" aria-label="${esc(h.label)} 연결 보기" style="left:${h.x}px;top:${h.y}px;--start:${h.ends[0].color};--end:${h.ends.at(-1).color}"><span style="width:${h.labelWidth}px">${esc(h.label)}</span></button>`
    })
    $('.lab-lines').setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`)
    $('.lab-lines').innerHTML = lines; $('.lab-groups').innerHTML = groups; $('.lab-keywords').innerHTML = words; $('.lab-hubs').innerHTML = hubs
    applyActive(); updateGraphControls()
  }
  function applyActive() {
    const hub = active?.type === 'hub' ? layout?.hubs.find(h => h.id === active.id) : null
    const selected = new Set(hub ? hub.ends.map(e => e.id) : active?.type === 'standard' ? [...layout.nodes.values()].filter(n => n.key === active.key).map(n => n.id) : [])
    const std = active?.type === 'standard' ? byKey.get(active.key) : null
    $$('.lab-keyword').forEach(e => { const hit = selected.has(e.dataset.word); e.setAttribute('aria-pressed', String(hit)); e.style.opacity = selected.size && !hit ? '.38' : '1' })
    $$('.lab-standard').forEach(e => e.setAttribute('aria-pressed', String(e.dataset.standard === std?.key)))
    $$('.lab-hub').forEach(e => e.setAttribute('aria-pressed', String(+e.dataset.hub === hub?.id)))
    $$('[data-edge]').forEach(e => { e.style.opacity = hub && +e.dataset.edge !== hub.id ? '.23' : '1' })
    $$('[data-owner]').forEach(e => { e.style.strokeOpacity = std ? e.dataset.owner === std.key ? '.85' : '.13' : '.3' })
    $('.lab-inspector strong').textContent = hub?.label || (std ? `${std.subject} · ${std.code}` : '선택한 성취기준을 중심으로')
    $('.lab-inspector p').textContent = hub ? `${hub.ends.map(e => `${e.standard.subject}의 ‘${e.word}’`).join(' ↔ ')}${hub.why ? ` — ${hub.why}` : ''}` : std?.content || '과목 안의 코드와 키워드, 빛나는 연결점을 선택해 보세요.'
  }
  function illuminate(hub) {
    active = { type: 'hub', id: hub.id }; applyActive()
    if (reduced()) return
    $$(`[data-edge="${hub.id}"] .lab-beam`).forEach(e => { e.classList.remove('lab-flowing'); void e.getBoundingClientRect(); e.classList.add('lab-flowing'); e.querySelector('animateMotion')?.beginElement?.() })
    revealTimers.push(later(() => { const e = $(`[data-hub="${hub.id}"]`); if (e) { e.classList.remove('lab-arrival'); void e.getBoundingClientRect(); e.classList.add('lab-arrival') } }, 1000))
  }
  function reveal() {
    stopReveal()
    if (!layout?.hubs.length || reduced()) { active = null; applyActive(); updateGraphControls(); return }
    revealing = true; updateGraphControls()
    layout.hubs.forEach((hub, i) => revealTimers.push(later(() => illuminate(hub), i * 1600)))
    revealTimers.push(later(() => { revealing = false; active = null; applyActive(); updateGraphControls() }, layout.hubs.length * 1600 + 250))
  }
  function armAnalysisTimeout() { cancel(analysisTimer); analysisTimer = later(() => { if (bridgeState === 'loading' && (!started || (externalGraph && phase === 'graph'))) { bridgeState = 'slow'; updateGraphControls() } }, 25000) }
  function setPhase(next) {
    stopTransition()
    phase = next; $('.lab-graph-view').hidden = externalGraph || next !== 'graph'; $('.lab-cast').hidden = next !== 'casting'; $('.lab-future-view').hidden = next !== 'future'
    $('.lab-ai-note').hidden = externalGraph && next === 'graph'
    if (next === 'graph') drawGraph()
    if (next === 'future') renderFuture()
    onPhaseChange?.(next)
    if (!externalGraph) root.scrollIntoView?.({ block: 'start', behavior: reduced() ? 'instant' : 'smooth' })
  }
  function validFuture(future) {
    if (!future?.title || !Array.isArray(future.roles)) return false
    const roleKeys = future.roles.map(r => r.key)
    return roleKeys.length === standards.length && new Set(roleKeys).size === standards.length && standards.every(s => roleKeys.includes(s.key))
  }
  function ensureFuture(index, m = model) {
    if (!started || dead || standards.length < 2 || futures[m].has(index)) return
    futures[m].set(index, { status: 'loading' })
    Promise.resolve().then(() => { if (!dead) return requestFuture(index, m) }).then(future => {
      if (dead) return
      if (!validFuture(future)) throw new Error('선택한 성취기준의 역할을 모두 담지 못했습니다. 다시 생성해 주세요.')
      futures[m].set(index, { status: 'ready', data: future })
      if (model === m) {
        renderProgress()
        if (current === index && phase === 'future') renderFuture()
      }
    }).catch(error => {
      if (dead) return
      futures[m].set(index, { status: 'error', error: error?.message || '미래를 생성하지 못했습니다.' })
      if (model === m) {
        renderProgress()
        if (current === index && phase === 'future') renderFuture()
      }
    })
  }
  // 서버의 기존 동시 생성 제한·캐시를 유지하면서 여덟 관점을 모두 즉시 요청한다.
  function ensureAllFutures() {
    LAB_LENSES.forEach((_, index) => ensureFuture(index))
    renderProgress()
  }
  function renderProgress() {
    const states = [...futures[model].values()]
    const ready = states.filter(s => s.status === 'ready').length
    const failed = states.filter(s => s.status === 'error').length
    const pending = LAB_LENSES.length - ready - failed
    const summary = pending ? `미래 ${ready}/8개 준비 완료 · ${pending}개 생성 중` : `미래 ${ready}/8개 준비 완료`
    const text = `${summary}${failed ? ` · ${failed}개 재시도 필요` : ''}`
    $('.lab-generation-progress').textContent = `${text}. ${ready ? '준비된 번호를 누르면 바로 볼 수 있습니다.' : '완성된 아이디어부터 볼 수 있습니다.'}`
    $('.lab-cast-progress').textContent = text
    // 완료 응답이 올 때 버튼을 교체하지 않아 키보드 포커스를 보존한다.
    $$('.lab-orbit-buttons button').forEach(button => {
      const index = +button.dataset.lens, status = futures[model].get(index)?.status || 'loading'
      const label = { ready: '준비 완료', loading: '생성 중', error: '재시도 필요' }[status]
      button.dataset.status = status
      button.setAttribute('aria-label', `${LAB_LENSES[index]} · ${label}`)
      button.title = `${LAB_LENSES[index]} · ${label}`
      button.setAttribute('aria-pressed', String(index === current))
    })
  }
  function renderFuture() {
    stopTransition()
    const state = futures[model].get(current), f = state?.data
    $('.lab-orbit-core').innerHTML = `<span>${String(current + 1).padStart(2, '0')}<small>/ 08</small></span><strong>${LAB_LENSES[current]}</strong>`
    $('.lab-lens-select').value = String(current)
    if (!$('.lab-orbit-buttons').children.length) $('.lab-orbit-buttons').innerHTML = LAB_LENSES.map((name, i) => { const a = i * Math.PI / 4 - Math.PI / 2; return `<button type="button" data-lens="${i}" aria-label="${name}" aria-pressed="${i === current}" style="left:${50 + 38 * Math.cos(a)}%;top:${50 + 38 * Math.sin(a)}%">${i + 1}</button>` }).join('')
    renderProgress()
    const head = `<div class="lab-card-meta">미래 ${current + 1} / 8 · ${LAB_LENSES[current]}<span>${model === 'precise' ? '정밀' : '빠른'} 모드</span></div>`
    if (!f) {
      $('.lab-future-card').innerHTML = `${head}<h2>${state?.status === 'error' ? '이 미래를 완성하지 못했습니다.' : '수업의 가능성을 펼치는 중입니다.'}</h2><p class="lab-description">${state?.status === 'error' ? esc(state.error) : '여덟 관점의 수업을 함께 생성하고 있습니다. 이 관점이 완성되면 바로 표시됩니다. 준비가 끝난 다른 번호는 기다리지 않고 볼 수 있습니다.'}</p>${state?.status === 'error' ? '<button type="button" class="lab-primary" data-act="retry-future">이 관점 다시 생성</button>' : '<div class="lab-wait-mark" aria-hidden="true"></div>'}`
      return
    }
    const colorFor = key => colorForStandard?.(byKey.get(key)) || layout?.groups.find(g => g.standards.some(s => s.key === key))?.color || '#b8ead3'
    $('.lab-future-card').innerHTML = `${head}<h2>${esc(f.title)}</h2><p class="lab-description">${esc(f.situation)}</p><div class="lab-question"><small>함께 탐구할 질문</small><p>${esc(f.driving_question)}</p></div><div class="lab-roles-head"><h3>과목들이 만나는 방식</h3><button type="button" class="lab-quiet" data-act="graph">연결 보기 ↗</button></div><div class="lab-roles">${f.roles.map(r => `<div class="lab-role"><div style="color:${colorFor(r.key)}">${esc(subjectOfStandard(byKey.get(r.key) || {}))}<small>${esc(byKey.get(r.key)?.code)}</small></div><p>${esc(r.role)}</p></div>`).join('')}</div><details class="lab-details"><summary>학생들의 활동과 결과물</summary><ol>${array(f.activity_steps).map(step => `<li>${esc(step)}</li>`).join('')}</ol><h4>결과물</h4><p>${esc(f.student_output)}</p><h4>자료</h4><p>${array(f.data_sources).map(esc).join('<br>')}</p><h4>평가 아이디어</h4><p>${esc(f.assessment_idea)}</p></details>${f.honesty_note ? `<p class="lab-honesty">${esc(f.honesty_note)}</p>` : ''}<div class="lab-card-actions"><button type="button" class="lab-primary" data-act="project">${esc(projectActionLabel)}</button>${hideBasket ? '' : '<button type="button" class="lab-quiet" data-act="basket">성취기준 담기</button>'}</div>`
  }
  function openFuture() {
    if (standards.length < 2 || revealing || bridgeState === 'loading' || phase === 'casting') return
    if (started) { ensureAllFutures(); setPhase('future'); return }
    started = true; stopReveal(); cancel(analysisTimer); ensureAllFutures()
    if (reduced()) { setPhase('future'); return }
    setPhase('casting'); later(() => setPhase('future'), 3400)
  }
  function stopTransition() {
    transitions.forEach(animation => animation.cancel())
    transitions.clear()
  }
  function playTransition(direction) {
    if (dead || phase !== 'future' || reduced()) return
    const animate = (element, frames, duration) => {
      if (!element?.animate) return
      const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)' })
      transitions.add(animation)
      animation.onfinish = animation.oncancel = () => transitions.delete(animation)
    }
    // 화면은 고정하고 본문만 6px 이동한다. 이전 효과를 취소하므로 빠른 탐색도 밀리지 않는다.
    animate($('.lab-future-card'), [
      { opacity: .68, transform: `translateX(${direction * 6}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ], 280)
    const restingGlow = '0 0 25px #b8ead31a, inset 0 0 30px #b8ead311'
    animate($('.lab-orbit-art'), [
      { boxShadow: restingGlow },
      { boxShadow: '0 0 32px #b8ead345, inset 0 0 30px #b8ead328', offset: .35 },
      { boxShadow: restingGlow },
    ], 420)
  }
  function go(index) {
    const next = (index + 8) % 8
    if (next === current) return
    const distance = (next - current + 8) % 8
    const direction = distance <= 4 ? 1 : -1
    current = next; ensureFuture(current); renderFuture(); playTransition(direction)
  }
  function click(e) {
    const button = e.target.closest('button'); if (!button || !root.contains(button)) return
    if (button.dataset.hub !== undefined) { stopReveal(); illuminate(layout.hubs.find(h => h.id === +button.dataset.hub)); updateGraphControls() }
    if (button.dataset.word) { stopReveal(); const node = layout.nodes.get(button.dataset.word); active = { type: 'standard', key: node.key }; applyActive(); updateGraphControls() }
    if (button.dataset.standard) { stopReveal(); active = { type: 'standard', key: button.dataset.standard }; applyActive(); updateGraphControls() }
    if (button.dataset.lens !== undefined) go(+button.dataset.lens)
    if (button.dataset.go) go(current + +button.dataset.go)
    const act = button.dataset.act
    if (act === 'replay') reveal()
    if (act === 'open') openFuture()
    if (act === 'graph') setPhase('graph')
    if (act === 'retry-bridges') { bridgeState = 'loading'; bridges = null; active = null; drawGraph(); armAnalysisTimeout(); onRetryBridges?.() }
    if (act === 'retry-future') { futures[model].delete(current); ensureFuture(current); renderFuture() }
    if (act === 'project' || act === 'basket') {
      try { if (act === 'project') onStartProject?.(futures[model].get(current)?.data); else { const changed = onBasket?.(standards.map(s => s.key)); $('.lab-action-status').textContent = changed ? '성취기준을 담았습니다.' : '선택한 성취기준이 이미 담겨 있습니다.' } }
      catch (error) { $('.lab-action-status').textContent = error.message || '저장하지 못했습니다. 다시 시도해 주세요.' }
    }
  }
  function keydown(e) {
    // 시작 버튼에 포커스가 남아 있어도 미래 화면에서 바로 방향키를 쓸 수 있다.
    if (dead || phase !== 'future' || !root.isConnected || root.closest('[hidden],[inert]')) return
    if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
    // 검색·복사 초안·선택 상자 및 편집기/대화상자의 고유 키보드 동작을 보존한다.
    if (e.target?.isContentEditable || e.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"],[role="combobox"],[role="dialog"],dialog')) return
    e.preventDefault()
    go(current + (e.key === 'ArrowRight' ? 1 : -1))
  }
  function change(e) { if (e.target.matches('.lab-lens-select')) go(+e.target.value) }
  root.addEventListener('click', click); keyboardTarget.addEventListener('keydown', keydown); root.addEventListener('change', change)
  let lastWidth = Math.round($('.lab-map').clientWidth)
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => { const width = Math.round(entries[0].contentRect.width); if (width && width !== lastWidth) { lastWidth = width; stopReveal(); drawGraph() } }) : null
  observer?.observe($('.lab-map'))
  drawGraph(); if (externalGraph) { $('.lab-graph-view').hidden = true; $('.lab-ai-note').hidden = true }
  if (standards.length >= 2) armAnalysisTimeout()
  return {
    open: openFuture,
    retryBridges() { if (dead || phase !== 'graph') return; bridgeState = 'loading'; bridges = null; active = null; drawGraph(); armAnalysisTimeout(); onRetryBridges?.() },
    setBridges(data) { if (dead || (started && (!externalGraph || phase !== 'graph'))) return; cancel(analysisTimer); stopReveal(); bridges = data; bridgeState = data ? 'ready' : 'error'; active = null; drawGraph(); if (data && !externalGraph) reveal() },
    setModel(next) { if (dead || next === model) return; model = next === 'precise' ? 'precise' : 'fast'; if (started) { ensureAllFutures(); if (phase === 'future') renderFuture() } },
    destroy() { dead = true; stopTransition(); timers.forEach(clearTimeout); timers.clear(); observer?.disconnect(); root.removeEventListener('click', click); keyboardTarget.removeEventListener('keydown', keydown); root.removeEventListener('change', change); root.replaceChildren() },
  }
}
