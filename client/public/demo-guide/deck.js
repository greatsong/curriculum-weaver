/**
 * 시연 안내 — 슬라이드 넘기기와 시연 모드
 *
 * 시연 모드: 왼쪽에 실제 앱 화면(iframe), 오른쪽에 그 화면의 안내를 함께 보여 준다.
 * 이 페이지가 앱과 같은 주소(같은 출처)에 있어야 동작한다 — 로그인 상태를 그대로 사용하고,
 * 앱은 같은 출처의 프레임만 허용한다(vercel.json의 frame-ancestors 'self').
 *
 * 실제 팀 프로젝트 주소는 이 저장소에 적지 않는다. 주소 끝의 ?p=<프로젝트 주소>로 한 번 열거나
 * 시연 모드에서 붙여 넣으면 이 브라우저에만 저장된다.
 */
(function () {
  var PROJECT_KEY = 'cw_demo_guide_project'
  var stage = document.getElementById('stage')
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'))
  var bar = document.getElementById('bar')
  var count = document.getElementById('count')
  var live = document.getElementById('live')
  var frame = document.getElementById('liveFrame')
  var empty = document.getElementById('liveEmpty')
  var startBtn = document.getElementById('liveStart')
  // 앱과 같은 주소에서 열렸을 때만 화면 안에 앱을 띄운다. 다른 곳(깃허브 페이지, 내려받은 파일)에서는
  // 로그인 상태가 이어지지 않으므로 버튼이 운영 주소를 새 탭으로 연다.
  var APP_ORIGIN = 'https://curriculum-weaver.vercel.app'
  var sameApp = location.origin === APP_ORIGIN || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  var canEmbed = sameApp
  var appBase = sameApp ? '' : APP_ORIGIN
  var cur = 0

  // ── 저장소 (막혀 있어도 페이지는 동작한다) ──
  function readProject() {
    try { return localStorage.getItem(PROJECT_KEY) || '' } catch (e) { return '' }
  }
  function saveProject(path) {
    try { localStorage.setItem(PROJECT_KEY, path) } catch (e) { /* 저장 실패는 무시 */ }
  }
  /** 붙여 넣은 주소에서 /workspaces/…/projects/… 경로만 꺼낸다. 다른 사이트 주소는 받지 않는다 */
  function toProjectPath(input) {
    var text = String(input || '').trim()
    if (!text) return ''
    var path = text
    try {
      var appOrigin = sameApp ? location.origin : APP_ORIGIN
      var url = new URL(text, appOrigin)
      if (url.origin !== appOrigin) return ''
      path = url.pathname
    } catch (e) { return '' }
    var m = path.match(/^\/workspaces\/[0-9a-f-]{36}\/projects\/[0-9a-f-]{36}/i)
    return m ? m[0] : ''
  }
  function projectLiveUrl() {
    var path = readProject()
    return path ? path + '?view=1' : ''
  }

  // ?p= 로 받은 프로젝트 주소를 저장하고 주소창에서 지운다
  ;(function takeProjectParam() {
    var params = new URLSearchParams(location.search)
    var p = toProjectPath(params.get('p'))
    if (p) saveProject(p)
    if (params.has('p')) {
      params.delete('p')
      var rest = params.toString()
      try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash) } catch (e) { /* 무시 */ }
    }
  })()

  // ── 슬라이드 ──
  function fit() {
    var s = Math.min(innerWidth / 1920, innerHeight / 1080)
    stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')'
  }
  function liveUrlOf(slide) {
    var v = slide.getAttribute('data-live')
    if (!v) return null
    return v === '@project' ? projectLiveUrl() : v
  }
  function show(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i))
    slides.forEach(function (el, k) { el.classList.toggle('active', k === cur); el.classList.remove('settled') })
    // 등장 효과가 끝나면 내용을 고정한다 — 탭이 가려져 효과가 멈춰도 글자가 비어 보이지 않게
    var now = slides[cur]
    setTimeout(function () { if (slides[cur] === now) now.classList.add('settled') }, 1800)
    bar.style.width = ((cur + 1) / slides.length * 100) + '%'
    count.textContent = (cur + 1) + ' / ' + slides.length
    try { history.replaceState(null, '', location.pathname + location.search + '#' + (cur + 1)) } catch (e) { /* 무시 */ }
    startBtn.hidden = !canEmbed || !liveSlides.length
    if (!live.hidden) renderLive()
  }
  function refreshProjectLinks() {
    var url = projectLiveUrl()
    document.querySelectorAll('[data-project-link]').forEach(function (a) {
      if (url) { a.setAttribute('href', appBase + url); a.style.opacity = '' }
      else { a.removeAttribute('href'); a.style.opacity = '.45'; a.title = '이 페이지 주소 끝에 ?p=<프로젝트 주소>를 붙여 한 번 열면 연결됩니다' }
    })
  }

  // ── 시연 모드 ──
  var liveSlides = slides.filter(function (el) { return el.hasAttribute('data-live') })
  var loadedUrl = null

  function nearestLiveIndex() {
    if (slides[cur].hasAttribute('data-live')) return cur
    for (var k = cur + 1; k < slides.length; k++) if (slides[k].hasAttribute('data-live')) return k
    for (var j = cur - 1; j >= 0; j--) if (slides[j].hasAttribute('data-live')) return j
    return cur
  }
  function stepLive(dir) {
    for (var k = cur + dir; k >= 0 && k < slides.length; k += dir) {
      if (slides[k].hasAttribute('data-live')) { show(k); return }
    }
  }
  function hasLive(dir) {
    for (var k = cur + dir; k >= 0 && k < slides.length; k += dir) if (slides[k].hasAttribute('data-live')) return true
    return false
  }
  function setFrame(url) {
    if (url === loadedUrl) return // 같은 화면의 다음 단계 — 다시 불러오지 않는다
    loadedUrl = url
    frame.src = url || 'about:blank'
  }
  function showProjectForm() {
    empty.hidden = false
    empty.innerHTML = ''
    var title = document.createElement('b')
    title.textContent = '보여 줄 팀 프로젝트 주소를 넣어 주세요'
    var help = document.createElement('p')
    help.textContent = '프로젝트 화면의 주소를 그대로 붙여 넣으면 보기 전용으로 엽니다. 주소는 이 브라우저에만 저장되고, 절차를 눌러도 팀 진행 위치와 대화 기록은 바뀌지 않습니다.'
    var input = document.createElement('input')
    input.type = 'text'
    input.placeholder = location.origin + '/workspaces/…/projects/…'
    var note = document.createElement('p')
    note.style.color = '#c2410c'
    var ok = document.createElement('button')
    ok.type = 'button'
    ok.textContent = '보기 전용으로 열기'
    function submit() {
      var path = toProjectPath(input.value)
      if (!path) { note.textContent = '이 서비스의 프로젝트 주소가 아닙니다. /workspaces/…/projects/… 형식인지 확인해 주세요.'; return }
      saveProject(path)
      refreshProjectLinks()
      renderLive()
    }
    ok.addEventListener('click', submit)
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit() })
    empty.appendChild(title); empty.appendChild(help); empty.appendChild(input); empty.appendChild(ok); empty.appendChild(note)
  }
  function renderLive() {
    var slide = slides[cur]
    if (!slide.hasAttribute('data-live')) { show(nearestLiveIndex()); return }
    var url = liveUrlOf(slide)
    var order = liveSlides.indexOf(slide) + 1
    document.getElementById('liveStep').textContent = '시연 ' + order + ' / ' + liveSlides.length
    var h2 = slide.querySelector('h2')
    document.getElementById('liveTitle').textContent = h2 ? h2.textContent : ''
    var guide = document.getElementById('liveGuide')
    guide.innerHTML = ''
    slide.querySelectorAll('.guide .g').forEach(function (g) {
      var copy = g.cloneNode(true)
      copy.classList.remove('rise')
      copy.removeAttribute('style')
      guide.appendChild(copy)
    })
    if (url) {
      empty.hidden = true
      setFrame(url)
    } else {
      setFrame('')
      showProjectForm()
    }
    var open = document.getElementById('liveOpen')
    if (url) { open.setAttribute('href', url); open.style.opacity = '' } else { open.removeAttribute('href'); open.style.opacity = '.4' }
    document.getElementById('livePrev').disabled = !hasLive(-1)
    document.getElementById('liveNext').disabled = !hasLive(1)
  }
  function openLive() {
    if (!canEmbed) return
    live.hidden = false
    startBtn.hidden = true
    renderLive()
  }
  function closeLive() {
    live.hidden = true
    loadedUrl = null
    frame.src = 'about:blank' // 성운(WebGL) 등 화면을 내려 자원을 돌려준다
    startBtn.hidden = !canEmbed
  }

  startBtn.addEventListener('click', openLive)
  document.getElementById('liveClose').addEventListener('click', closeLive)
  // 안내를 접으면 앱 화면이 전체 폭을 사용한다
  document.getElementById('liveHide').addEventListener('click', function () { live.classList.add('wide') })
  document.getElementById('liveWide').addEventListener('click', function () { live.classList.remove('wide') })
  document.getElementById('livePrev').addEventListener('click', function () { stepLive(-1) })
  document.getElementById('liveNext').addEventListener('click', function () { stepLive(1) })
  document.getElementById('liveReload').addEventListener('click', function () {
    var url = loadedUrl
    loadedUrl = null
    if (url) setFrame(url)
  })

  addEventListener('resize', fit)
  addEventListener('hashchange', function () {
    var n = (parseInt(location.hash.slice(1), 10) || 1) - 1
    if (n !== cur) show(n)
  })
  addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')
    if (typing) return
    var go = !live.hidden ? stepLive : function (d) { show(cur + d) }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && live.hidden)) { e.preventDefault(); go(1) }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
    else if (e.key === 'Home' && live.hidden) show(0)
    else if (e.key === 'End' && live.hidden) show(slides.length - 1)
    else if ((e.key === 'l' || e.key === 'L' || e.key === 'ㅣ') && canEmbed) { if (live.hidden) openLive(); else closeLive() }
    else if (e.key === 'Escape' && !live.hidden) closeLive()
  })
  document.querySelectorAll('#nav [data-go]').forEach(function (el) {
    el.addEventListener('click', function () { show(cur + Number(el.dataset.go)) })
  })

  document.querySelectorAll('a[data-app]').forEach(function (a) { a.setAttribute('href', appBase + a.getAttribute('data-app')) })
  fit()
  refreshProjectLinks()
  show((parseInt(location.hash.slice(1), 10) || 1) - 1)
})()
