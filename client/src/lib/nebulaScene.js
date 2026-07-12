/**
 * nebulaScene — 3D 쇼케이스 성운 렌더러 (three.js 커스텀)
 *
 * 설계 원칙 (디자인 스펙: _workspace/design/graph3d-showcase-spec.md):
 * - 노드 전체 = Points 1 드로우콜 (글로우 셰이더, 크기/알파는 버텍스 어트리뷰트)
 * - 링크 전체 = LineSegments 1 드로우콜 (additive → 색 밝기가 알파 역할)
 * - 상태 전환 = 타깃 배열로 계산 후 프레임마다 지수 러프 — 오브젝트 재생성 0
 * - 기본 링크는 단일색 안개(#7C89B8 @0.10), 타입 색은 선택 하이라이트에만
 * - 라벨 = CSS2DRenderer (DOM — 한글 선명도), 소수만
 * - 좌표는 서버 사전계산 — force 시뮬레이션 없음
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import {
  NEBULA_FOG, LINK_BASE_COLOR, LINK_TYPE_COLORS_DARK,
  ALPHA, SIZE, TIMING, CAMERA, AUTOROTATE,
} from './nebulaTheme'

// ── 글로우 포인트 셰이더 (additive 뭉개짐 방지 3원칙 적용) ──
const NODE_VERTEX = /* glsl */ `
  uniform float uPixelRatio;
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // 레이아웃 반경 ~170 스케일 기준 — 오버뷰(카메라 ~430)에서 일반 별 4~6(CSS)px, 허브 ~19px
    // gl_PointSize는 디바이스 픽셀 단위 → pixelRatio 곱 필수 (레티나에서 절반 크기 방지)
    gl_PointSize = clamp(size * (900.0 / -mvPosition.z), 2.5, 56.0) * uPixelRatio;
    gl_Position = projectionMatrix * mvPosition;
  }
`
const NODE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;
    // 1) 가파른 감쇠(pow 2.4) — 겹침 누적이 백색까지 가지 않게
    float falloff = pow(max(0.0, 1.0 - d), 2.4);
    // 3) core 백색 혼합 45% 상한 — 교과 색 정체성 유지
    float core = smoothstep(0.3, 0.0, d);
    vec3 col = mix(vColor, vec3(1.0), core * 0.45);
    // 2) 알파 캡 0.85
    float a = min(falloff * vAlpha, 0.85);
    gl_FragColor = vec4(col, a);
  }
`

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (v) => Math.max(0, Math.min(1, v))
// OrbitControls autoRotateSpeed 2.0 ≈ 12°/s (60fps 기준 30s/회전)
const degPerSecToOrbitSpeed = (deg) => (deg / 12) * 2.0

export function createNebulaScene(container, {
  onHover, onSelect, onBackgroundClick, isMobile = false,
  prefersReducedMotion = false,
} = {}) {
  // ── 기본 셋업 ──
  const scene = new THREE.Scene()
  scene.background = null // 배경 그라디언트는 CSS 레이어가 담당 (스펙 §1)
  scene.fog = new THREE.FogExp2(NEBULA_FOG.color, NEBULA_FOG.density)

  const camera = new THREE.PerspectiveCamera(55, 1, 1, 6000)
  camera.position.set(0, CAMERA.overview * 0.18, CAMERA.overview)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2))
  container.appendChild(renderer.domElement)

  const labelRenderer = new CSS2DRenderer()
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.inset = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  container.appendChild(labelRenderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.rotateSpeed = 0.55
  controls.minDistance = 30
  controls.maxDistance = 1600
  controls.autoRotate = false

  // ── 배경 스타필드 (장식 — 데이터 성운 반경 밖 셸에 고정) ──
  {
    const starCount = isMobile ? 400 : 800
    const positions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const r = 1400 + Math.random() * 800
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color: '#8B95B8', size: 1.4, sizeAttenuation: false,
      transparent: true, opacity: 0.28, depthWrite: false, fog: false,
    })
    const stars = new THREE.Points(geo, mat)
    stars.matrixAutoUpdate = false
    scene.add(stars)
  }

  // ── 데이터/상태 ──
  let nodes = []                // [{code, group, x,y,z, color, size}]
  let links = []                // [{s, t, type}]
  let codeToIndex = new Map()
  let nodePoints = null
  let linkSegments = null
  let baseColors, baseSizes     // 원본 (Float32Array)
  let nodeIndexByLink = []

  // 러프 대상 (per-frame 지수 러프: current → target)
  let targetSize, targetAlpha, curSize, curAlpha
  let targetLinkRGB, curLinkRGB // per-link rgb (밝기 포함, 3 floats/link)
  let lerpActive = false

  // 표시 상태
  let dimMap = null             // Map<code, 0|1> | null
  let selectedCode = null
  let neighborCodes = new Set()
  let hoverCode = null
  let tourGroup = null

  // 진입 연출 상태
  let entryT0 = -1
  let entryDelays = null        // Float32Array (노드별 점등 지연 ms)
  let entryDone = true

  const colorScratch = new THREE.Color()
  const LINK_BASE_RGB = new THREE.Color(LINK_BASE_COLOR)
  const LINK_TYPE_RGB = Object.fromEntries(
    Object.entries(LINK_TYPE_COLORS_DARK).map(([k, v]) => [k, new THREE.Color(v)])
  )

  // 선택 링 (펄스 빌보드)
  const ringGeo = new THREE.RingGeometry(1, 1.16, 48)
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.7,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })
  const selectionRing = new THREE.Mesh(ringGeo, ringMat)
  selectionRing.visible = false
  scene.add(selectionRing)
  let ringBaseScale = 6

  function setData(data) {
    if (nodePoints) { scene.remove(nodePoints); nodePoints.geometry.dispose(); nodePoints.material.dispose() }
    if (linkSegments) { scene.remove(linkSegments); linkSegments.geometry.dispose(); linkSegments.material.dispose() }

    nodes = data.nodes
    links = data.links
    codeToIndex = new Map(nodes.map((n, i) => [n.code, i]))

    const n = nodes.length
    const positions = new Float32Array(n * 3)
    baseColors = new Float32Array(n * 3)
    baseSizes = new Float32Array(n)
    targetSize = new Float32Array(n); curSize = new Float32Array(n)
    targetAlpha = new Float32Array(n); curAlpha = new Float32Array(n)
    nodes.forEach((node, i) => {
      positions[i * 3] = node.x; positions[i * 3 + 1] = node.y; positions[i * 3 + 2] = node.z
      colorScratch.set(node.color)
      baseColors[i * 3] = colorScratch.r; baseColors[i * 3 + 1] = colorScratch.g; baseColors[i * 3 + 2] = colorScratch.b
      baseSizes[i] = node.size
    })

    const nodeGeo = new THREE.BufferGeometry()
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    nodeGeo.setAttribute('color', new THREE.BufferAttribute(baseColors.slice(), 3))
    nodeGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1))
    nodeGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1))
    const nodeMat = new THREE.ShaderMaterial({
      vertexShader: NODE_VERTEX, fragmentShader: NODE_FRAGMENT,
      uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    nodePoints = new THREE.Points(nodeGeo, nodeMat)
    scene.add(nodePoints)

    const m = links.length
    const linkPositions = new Float32Array(m * 6)
    targetLinkRGB = new Float32Array(m * 3); curLinkRGB = new Float32Array(m * 3)
    nodeIndexByLink = []
    links.forEach((l, i) => {
      const si = codeToIndex.get(l.s), ti = codeToIndex.get(l.t)
      nodeIndexByLink.push([si, ti])
      const sn = nodes[si], tn = nodes[ti]
      linkPositions[i * 6] = sn.x; linkPositions[i * 6 + 1] = sn.y; linkPositions[i * 6 + 2] = sn.z
      linkPositions[i * 6 + 3] = tn.x; linkPositions[i * 6 + 4] = tn.y; linkPositions[i * 6 + 5] = tn.z
    })

    const linkGeo = new THREE.BufferGeometry()
    linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3))
    linkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m * 6), 3))
    const linkMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    linkSegments = new THREE.LineSegments(linkGeo, linkMat)
    scene.add(linkSegments)

    computeTargets()
    // 첫 데이터: 현재값을 0에서 시작 (진입 페이드의 바탕)
    curSize.set(targetSize)
    curAlpha.fill(0)
    curLinkRGB.fill(0)
    lerpActive = true
  }

  /**
   * 상태(dim/선택/호버/투어)로부터 타깃 배열 재계산 — 유일한 상태→시각 매핑 경로.
   * 실제 어트리뷰트 반영은 렌더 루프의 지수 러프가 담당(스펙 §5-3).
   */
  function computeTargets() {
    if (!nodePoints) return
    const hasSelection = selectedCode !== null
    const nodeVisible = new Float32Array(nodes.length) // 링크 밝기 계산용 (0~1)

    nodes.forEach((node, i) => {
      const filterOn = dimMap ? (dimMap.get(node.code) ?? 1) : 1
      let sizeMul = 1
      let alpha = ALPHA.node
      if (hasSelection) {
        if (node.code === selectedCode) { sizeMul = SIZE.selected; alpha = 1 }
        else if (neighborCodes.has(node.code)) { sizeMul = SIZE.neighbor; alpha = 1 }
        else { sizeMul = SIZE.dim; alpha = ALPHA.nodeDim }
      }
      if (hoverCode === node.code && node.code !== selectedCode) {
        sizeMul = Math.max(sizeMul, 1) * SIZE.hover; alpha = 1
      }
      // 칩 off = 감광 (색 유지, 소멸 금지 — 스펙 §6-2)
      if (!filterOn && !(hasSelection && (node.code === selectedCode || neighborCodes.has(node.code)))) {
        alpha = ALPHA.nodeDim; sizeMul = SIZE.dim
      }
      if (tourGroup && node.group !== tourGroup) alpha *= ALPHA.tourOff
      targetSize[i] = baseSizes[i] * sizeMul
      targetAlpha[i] = alpha
      nodeVisible[i] = alpha >= ALPHA.node * 0.5 ? 1 : (alpha <= ALPHA.nodeDim * 1.5 ? 0 : alpha / ALPHA.node)
    })

    // 링크: 기본은 단일색 안개, 선택 연결만 타입 색으로 발광 (스펙 §2-2·6-3)
    links.forEach((l, i) => {
      const [si, ti] = nodeIndexByLink[i]
      let rgb = LINK_BASE_RGB
      let a
      const touchesSelection = hasSelection && (l.s === selectedCode || l.t === selectedCode)
      if (touchesSelection) {
        rgb = LINK_TYPE_RGB[l.type] || LINK_BASE_RGB
        a = ALPHA.linkHi
      } else if (hasSelection) {
        a = ALPHA.linkDim
      } else {
        const f = Math.min(nodeVisible[si], nodeVisible[ti])
        a = f <= 0 ? ALPHA.linkDim : ALPHA.link * f
        if (tourGroup) {
          const bothIn = nodes[si].group === tourGroup && nodes[ti].group === tourGroup
          if (bothIn) { rgb = LINK_TYPE_RGB[l.type] || LINK_BASE_RGB; a = ALPHA.tourLink }
          else a *= ALPHA.tourOff
        }
      }
      targetLinkRGB[i * 3] = rgb.r * a
      targetLinkRGB[i * 3 + 1] = rgb.g * a
      targetLinkRGB[i * 3 + 2] = rgb.b * a
    })
    lerpActive = true
  }

  // ── 상태 API ──
  function setDim(map) { dimMap = map; computeTargets() }
  function setTourFocus(group) { tourGroup = group; computeTargets() }
  function setHover(code) { if (code !== hoverCode) { hoverCode = code; computeTargets() } }

  function setHighlight(code, neighbors) {
    selectedCode = code
    neighborCodes = neighbors || new Set()
    if (code !== null && codeToIndex.has(code)) {
      const node = nodes[codeToIndex.get(code)]
      selectionRing.position.set(node.x, node.y, node.z)
      // 근접 카메라(nodeFocus)에서 화면을 압도하지 않는 크기
      ringBaseScale = Math.max(2.5, node.size * 1.15)
      selectionRing.visible = true
    } else {
      selectionRing.visible = false
    }
    computeTargets()
  }

  /** 진입 연출: 교과군별 스태거 점등 (스펙 §5-1 stage 2·3) */
  function playEntry(delayByCode) {
    entryDelays = new Float32Array(nodes.length)
    nodes.forEach((n, i) => { entryDelays[i] = delayByCode?.get(n.code) ?? 0 })
    entryT0 = performance.now()
    entryDone = false
    if (prefersReducedMotion) {
      // 축약: 단일 400ms 페이드
      entryDelays.fill(0)
    }
    lerpActive = true
  }

  // ── 카메라 애니메이션 (곡선 항해 — 스펙 §5-2) ──
  let cameraTween = null
  function flyTo(targetPos, lookAt, duration = TIMING.flyTo) {
    if (prefersReducedMotion) duration = Math.min(duration, 320)
    const fromPos = camera.position.clone()
    const mid = fromPos.clone().add(targetPos).multiplyScalar(0.5)
    // 중간점을 성운 중심 반대쪽으로 15% 밀어낸 quadratic bezier
    const push = mid.length() > 1 ? mid.clone().normalize() : new THREE.Vector3(0, 1, 0)
    const ctrl = mid.add(push.multiplyScalar(fromPos.distanceTo(targetPos) * 0.15))
    cameraTween = {
      t0: performance.now(), duration,
      fromPos, ctrl, toPos: targetPos.clone(),
      fromTarget: controls.target.clone(), toTarget: lookAt.clone(),
    }
  }

  /**
   * 노드로 플라이투.
   * screenShift: 노드를 화면 중앙에서 {x}px 왼쪽 / {y}px 위로 비껴 배치 —
   * 상세 카드(우측)·바텀 시트가 노드를 가리지 않도록 가시 영역 중앙에 놓는 용도.
   */
  function flyToNode(code, { distance, duration = TIMING.flyTo, screenShift } = {}) {
    const i = codeToIndex.get(code)
    if (i === undefined) return false
    const dist = distance ?? (isMobile ? CAMERA.mobileNodeFocus : CAMERA.nodeFocus)
    const node = nodes[i]
    const p = new THREE.Vector3(node.x, node.y, node.z)
    const dir = camera.position.clone().sub(controls.target)
    if (dir.lengthSq() < 1) dir.set(0, 0.2, 1)
    dir.normalize()
    const camPos = p.clone().add(dir.clone().multiplyScalar(dist))
    const lookAt = p.clone()
    if (screenShift && (screenShift.x || screenShift.y)) {
      // 목표 거리에서의 px→월드 변환 (수직 FOV 기준)
      const h = container.clientHeight || 800
      const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h
      const viewDir = p.clone().sub(camPos).normalize()
      const right = new THREE.Vector3().crossVectors(viewDir, camera.up).normalize()
      const upv = new THREE.Vector3().crossVectors(right, viewDir).normalize()
      // 카메라와 시선을 함께 이동 → 노드가 화면에서 반대 방향으로 비껴 보임
      const offset = right.multiplyScalar((screenShift.x || 0) * worldPerPx)
        .add(upv.multiplyScalar(-(screenShift.y || 0) * worldPerPx))
      camPos.add(offset)
      lookAt.add(offset)
    }
    flyTo(camPos, lookAt, duration)
    return true
  }

  function flyToPoint(point, { distance = CAMERA.clusterFocus, duration = TIMING.tourMove, lift = 0.3 } = {}) {
    const p = new THREE.Vector3(...point)
    const outward = p.length() > 1 ? p.clone().normalize() : new THREE.Vector3(0, 0, 1)
    const camPos = p.clone().add(outward.multiplyScalar(distance))
    camPos.y += distance * lift
    flyTo(camPos, p, duration)
  }

  function overview(duration = 1600) {
    const d = isMobile ? CAMERA.mobileOverview : CAMERA.overview
    flyTo(new THREE.Vector3(0, d * 0.18, d), new THREE.Vector3(0, 0, 0), duration)
  }

  /** 첫 진입: 아득한 곳에서 -18° 선회하며 다이브 (스펙 §5-1 stage 1) */
  function introFly(duration = TIMING.entryDolly) {
    const d0 = CAMERA.entryStart
    const angle = -18 * Math.PI / 180
    camera.position.set(Math.sin(angle) * d0, d0 * 0.32, Math.cos(angle) * d0)
    controls.target.set(0, 0, 0)
    overview(prefersReducedMotion ? 0 : duration)
  }

  // ── 라벨 (CSS2D) ──
  const labelObjects = new Map()
  function addLabelAt(key, position, element) {
    if (labelObjects.has(key)) return
    const obj = new CSS2DObject(element)
    obj.position.set(position[0], position[1], position[2])
    scene.add(obj)
    labelObjects.set(key, obj)
  }
  function addLabel(code, element, { offsetY = 5 } = {}) {
    const i = codeToIndex.get(code)
    if (i === undefined) return
    const n = nodes[i]
    addLabelAt(`node:${code}`, [n.x, n.y + offsetY, n.z], element)
  }
  function removeLabel(key) {
    const obj = labelObjects.get(key)
    if (!obj) return
    scene.remove(obj); obj.element.remove(); labelObjects.delete(key)
  }
  function clearLabels(prefix = null) {
    for (const key of [...labelObjects.keys()]) {
      if (!prefix || key.startsWith(prefix)) removeLabel(key)
    }
  }

  // ── 오토로테이트 (idle 8초 + 2초 램프 — 스펙 §5-6) ──
  let idleEnabled = true
  let forcedRotateDeg = null // 투어 궤도 선회
  let lastInteraction = performance.now()
  let curRotateSpeed = 0
  function markInteraction() { lastInteraction = performance.now() }
  renderer.domElement.addEventListener('pointerdown', markInteraction)
  renderer.domElement.addEventListener('wheel', markInteraction, { passive: true })

  // ── 픽킹 ──
  const raycaster = new THREE.Raycaster()
  raycaster.params.Points = { threshold: 4.5 }
  const pointer = new THREE.Vector2()
  let hoveredIndex = -1

  function pick(event) {
    if (!nodePoints) return -1
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObject(nodePoints)
    for (const hit of hits) {
      if (curAlpha[hit.index] > 0.15) return hit.index // 딤 노드 픽킹 제외
    }
    return -1
  }

  let lastMove = 0
  function handlePointerMove(e) {
    const now = performance.now()
    if (now - lastMove < 50) return
    lastMove = now
    const idx = pick(e)
    if (idx !== hoveredIndex) {
      hoveredIndex = idx
      setHover(idx >= 0 ? nodes[idx].code : null)
      renderer.domElement.style.cursor = idx >= 0 ? 'pointer' : 'grab'
      onHover?.(idx >= 0 ? { node: nodes[idx], clientX: e.clientX, clientY: e.clientY } : null)
    } else if (idx >= 0) {
      onHover?.({ node: nodes[idx], clientX: e.clientX, clientY: e.clientY })
    }
  }
  let downPos = null
  function handlePointerDown(e) { downPos = { x: e.clientX, y: e.clientY } }
  function handlePointerUp(e) {
    if (!downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return
    const idx = pick(e)
    if (idx >= 0) onSelect?.(nodes[idx])
    else onBackgroundClick?.()
  }
  renderer.domElement.addEventListener('pointermove', handlePointerMove)
  renderer.domElement.addEventListener('pointerdown', handlePointerDown)
  renderer.domElement.addEventListener('pointerup', handlePointerUp)

  // ── 리사이즈 ──
  function resize() {
    const w = container.clientWidth || 800
    const h = container.clientHeight || 500
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    labelRenderer.setSize(w, h)
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  // ── 렌더 루프 ──
  let disposed = false
  let prevFrame = performance.now()
  function animate(now) {
    if (disposed) return
    requestAnimationFrame(animate)
    frame(now)
  }
  // 프레임 로직 분리: rAF와 무관하게 1프레임 진행 (dev QA에서 수동 펌프용)
  function frame(now) {
    const dt = Math.min(100, now - prevFrame)
    prevFrame = now

    // 카메라 트윈 (quadratic bezier)
    if (cameraTween) {
      const t = clamp01((now - cameraTween.t0) / cameraTween.duration)
      const k = easeInOutCubic(t)
      const inv = 1 - k
      camera.position.set(
        inv * inv * cameraTween.fromPos.x + 2 * inv * k * cameraTween.ctrl.x + k * k * cameraTween.toPos.x,
        inv * inv * cameraTween.fromPos.y + 2 * inv * k * cameraTween.ctrl.y + k * k * cameraTween.toPos.y,
        inv * inv * cameraTween.fromPos.z + 2 * inv * k * cameraTween.ctrl.z + k * k * cameraTween.toPos.z,
      )
      controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, k)
      if (t >= 1) cameraTween = null
    }

    // 어트리뷰트 지수 러프 + 진입 스태거 (스펙 §5-1·5-3)
    if (nodePoints && (lerpActive || !entryDone || selectedCode !== null)) {
      const k = 1 - Math.exp(-dt / 130)
      const sizeAttr = nodePoints.geometry.getAttribute('size')
      const alphaAttr = nodePoints.geometry.getAttribute('alpha')
      let maxDelta = 0
      const entryElapsed = entryT0 >= 0 ? now - entryT0 : Infinity
      const fadeMs = prefersReducedMotion ? 400 : TIMING.entryNodeFade
      let entryAllDone = true

      for (let i = 0; i < nodes.length; i++) {
        curSize[i] += (targetSize[i] - curSize[i]) * k
        curAlpha[i] += (targetAlpha[i] - curAlpha[i]) * k
        maxDelta = Math.max(maxDelta, Math.abs(targetAlpha[i] - curAlpha[i]))
        let entryF = 1
        if (!entryDone && entryDelays) {
          entryF = clamp01((entryElapsed - entryDelays[i]) / fadeMs)
          if (entryF < 1) entryAllDone = false
        }
        sizeAttr.array[i] = curSize[i]
        alphaAttr.array[i] = curAlpha[i] * entryF
      }
      // 선택 노드 펄스 (2000ms sine — 스펙 §6-2)
      if (selectedCode !== null) {
        const si = codeToIndex.get(selectedCode)
        if (si !== undefined) {
          const pulse = 1 + Math.sin(now * (Math.PI * 2 / 2000)) * 0.045
          sizeAttr.array[si] = curSize[si] * pulse
        }
      }
      if (!entryDone && entryAllDone) entryDone = true
      sizeAttr.needsUpdate = true
      alphaAttr.needsUpdate = true

      // 링크: 별이 먼저, 실이 나중 (entryLinkStart 이후 페이드)
      const linkColorAttr = linkSegments.geometry.getAttribute('color')
      let linkEntryF = 1
      if (entryT0 >= 0 && !prefersReducedMotion) {
        linkEntryF = clamp01((entryElapsed - TIMING.entryLinkStart) / TIMING.entryLinkFade)
      }
      for (let i = 0; i < links.length; i++) {
        for (let c = 0; c < 3; c++) {
          curLinkRGB[i * 3 + c] += (targetLinkRGB[i * 3 + c] - curLinkRGB[i * 3 + c]) * k
          const v = curLinkRGB[i * 3 + c] * linkEntryF
          linkColorAttr.array[i * 6 + c] = v
          linkColorAttr.array[i * 6 + 3 + c] = v
        }
      }
      linkColorAttr.needsUpdate = true
      if (maxDelta < 0.002 && entryDone && selectedCode === null) lerpActive = false
    }

    // 선택 링 펄스 + 빌보드
    if (selectionRing.visible) {
      const pulse = 1 + Math.sin(now * 0.004) * 0.12
      selectionRing.scale.setScalar(ringBaseScale * pulse)
      selectionRing.quaternion.copy(camera.quaternion)
      ringMat.opacity = 0.5 + Math.sin(now * 0.004) * 0.2
    }

    // 오토로테이트: 투어 강제 > idle (8초 무입력 + 선택 없음), 2초 램프
    let targetRotate = 0
    if (forcedRotateDeg !== null) targetRotate = degPerSecToOrbitSpeed(forcedRotateDeg)
    else if (idleEnabled && selectedCode === null && !cameraTween &&
             now - lastInteraction > TIMING.idleDelay) {
      targetRotate = degPerSecToOrbitSpeed(AUTOROTATE.idleDegPerSec)
    }
    curRotateSpeed += (targetRotate - curRotateSpeed) * (1 - Math.exp(-dt / (TIMING.autoRotateRamp / 3)))
    controls.autoRotate = Math.abs(curRotateSpeed) > 0.001
    controls.autoRotateSpeed = curRotateSpeed

    controls.update()
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  }
  requestAnimationFrame(animate)

  function dispose() {
    disposed = true
    resizeObserver.disconnect()
    renderer.domElement.removeEventListener('pointermove', handlePointerMove)
    renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
    renderer.domElement.removeEventListener('pointerup', handlePointerUp)
    renderer.domElement.removeEventListener('pointerdown', markInteraction)
    renderer.domElement.removeEventListener('wheel', markInteraction)
    clearLabels()
    controls.dispose()
    scene.traverse(obj => {
      obj.geometry?.dispose?.()
      if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => { m.map?.dispose?.(); m.dispose() })
    })
    renderer.dispose()
    renderer.domElement.remove()
    labelRenderer.domElement.remove()
  }

  // dev 디버그 핸들 (프로덕션 빌드에서는 제외)
  if (import.meta.env.DEV) {
    window.__nebula = { camera, controls, frame, get tween() { return cameraTween } }
  }

  return {
    setData, setDim, setHighlight, setTourFocus, playEntry,
    flyToNode, flyToPoint, overview, introFly,
    addLabel, addLabelAt, removeLabel, clearLabels,
    setIdleAutoRotate: (v) => { idleEnabled = v; markInteraction() },
    setForcedRotate: (degPerSec) => { forcedRotateDeg = degPerSec },
    getNode: (code) => { const i = codeToIndex.get(code); return i === undefined ? null : nodes[i] },
    dispose,
  }
}
