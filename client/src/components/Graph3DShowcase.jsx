/**
 * Graph3DShowcase — 교육과정 성운 (발표·감상 전용 3D 쇼케이스)
 *
 * 역할: 읽기 전용 프레젠테이션. 탐색·설계는 DesignMode 렌즈가 담당.
 * 데이터: /api/standards/graph3d (사전계산 좌표 — 클라이언트 force 시뮬레이션 없음)
 * 디자인: _workspace/design/graph3d-showcase-spec.md
 * URL이 상태를 기록: ?subjects= &levels= &focus= &tour=1
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Play, Compass, X, Rocket, ChevronDown, ChevronUp } from 'lucide-react'
import { apiGet } from '../lib/api'
import Logo from './Logo'
import { createNebulaScene } from '../lib/nebulaScene'
import {
  NEBULA_BG, SUBJECT_COLORS_DARK, FALLBACK_NODE_COLOR,
  LINK_TYPE_COLORS_DARK, LINK_TYPE_LABELS, SIZE, TIMING, AUTOROTATE,
} from '../lib/nebulaTheme'

const groupColor = (g) => SUBJECT_COLORS_DARK[g] || FALLBACK_NODE_COLOR

// 연결수 로그 스케일 노드 크기 (스펙 §6-1)
function nodeSize(degree, maxDegree) {
  const d = Math.min(degree, SIZE.degreeClamp)
  const dMax = Math.min(maxDegree, SIZE.degreeClamp)
  return SIZE.min + (SIZE.max - SIZE.min) * (Math.log2(1 + d) / Math.log2(1 + dMax))
}

// 카운트업 (easeOutExpo, 1200ms — 스펙 §4-1)
function useCountUp(target, start, duration = 1200) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start || !target) return
    let raf
    const t0 = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration)
      setValue(Math.round(target * (1 - Math.pow(2, -10 * t))))
      if (t < 1) raf = requestAnimationFrame(tick)
      else setValue(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, start, duration])
  return value
}

// 투어 스토리 문장 (교과군 통계 기반 — 절제된 플라네타리움 내레이션)
function buildStory(group, topPartner) {
  const lines = [
    `${group}의 별들은 ${topPartner}와 가장 많이 이어져 있습니다 — 두 성단이 만나는 곳마다 융합 수업이 시작됩니다.`,
    `${group} 성단에서 뻗어 나간 빛의 실은 ${topPartner}에 가장 많이 닿습니다. 교과의 경계는 생각보다 얇습니다.`,
    `${group}의 지식은 ${topPartner}를 만나 새로운 수업이 됩니다 — 연결선 하나가 곧 수업 아이디어 하나입니다.`,
  ]
  // 교과군명 기반 결정적 선택 (렌더마다 바뀌지 않게)
  let h = 0
  for (const ch of group) h = (h * 31 + ch.charCodeAt(0)) | 0
  return lines[Math.abs(h) % lines.length]
}

export default function Graph3DShowcase() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const containerRef = useRef(null)
  const sceneRef = useRef(null)

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const onChange = (e) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  const [data, setData] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [uiReady, setUiReady] = useState(false)
  const [selected, setSelected] = useState(null) // code
  const [hover, setHover] = useState(null)       // { node, x, y }
  const [activeGroups, setActiveGroups] = useState(null) // Set | null(전체)
  const [activeLevels, setActiveLevels] = useState(null)
  const [tour, setTour] = useState({ active: false, idx: 0, paused: false })
  const [legendPref, setLegendPref] = useState(true) // 사용자의 레전드 펼침 선호
  const visitedRef = useRef(new Set())
  // URL focus는 마운트 직후 URL 기록 effect가 지우기 전에 캡처해 둔다
  const initialFocusRef = useRef(null)
  if (initialFocusRef.current === null) initialFocusRef.current = searchParams.get('focus') || ''
  // 씬 재생성 세대 — 재생성 시 선택/필터를 다시 주입하기 위한 트리거
  const [sceneEpoch, setSceneEpoch] = useState(0)

  // ── 데이터 로드 (cold start 재시도) ──
  useEffect(() => {
    let cancelled = false
    const load = async (retries = 2) => {
      try {
        const d = await apiGet('/api/standards/graph3d')
        if (!cancelled) setData(d)
      } catch {
        if (!cancelled && retries > 0) {
          await new Promise(r => setTimeout(r, 2000))
          return load(retries - 1)
        }
        if (!cancelled) setLoadFailed(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── 파생 데이터 ──
  const derived = useMemo(() => {
    if (!data || data.nodes.length === 0) return null
    const nodesByCode = new Map(data.nodes.map(n => [n.code, n]))
    const degree = new Map()
    const adjacency = new Map() // code → [{other, type, theme, hook}]
    for (const l of data.links) {
      degree.set(l.s, (degree.get(l.s) || 0) + 1)
      degree.set(l.t, (degree.get(l.t) || 0) + 1)
      const sn = nodesByCode.get(l.s), tn = nodesByCode.get(l.t)
      if (!sn || !tn) continue
      if (!adjacency.has(l.s)) adjacency.set(l.s, [])
      if (!adjacency.has(l.t)) adjacency.set(l.t, [])
      adjacency.get(l.s).push({ other: tn, type: l.type, theme: l.theme, hook: l.hook })
      adjacency.get(l.t).push({ other: sn, type: l.type, theme: l.theme, hook: l.hook })
    }
    const maxDegree = Math.max(...degree.values(), 1)

    // 교과군 통계 + 무게중심
    const groupMap = new Map()
    for (const n of data.nodes) {
      const g = n.subject_group
      if (!groupMap.has(g)) groupMap.set(g, { name: g, color: groupColor(g), count: 0, cx: 0, cy: 0, cz: 0, links: 0, partners: new Map() })
      const gm = groupMap.get(g)
      gm.count++; gm.cx += n.x; gm.cy += n.y; gm.cz += n.z
    }
    for (const l of data.links) {
      const sg = nodesByCode.get(l.s)?.subject_group, tg = nodesByCode.get(l.t)?.subject_group
      if (!sg || !tg) continue
      const gs = groupMap.get(sg), gt = groupMap.get(tg)
      gs.links++; gt.links++
      gs.partners.set(tg, (gs.partners.get(tg) || 0) + 1)
      gt.partners.set(sg, (gt.partners.get(sg) || 0) + 1)
    }
    const groups = [...groupMap.values()].map(g => ({
      ...g,
      centroid: [g.cx / g.count, g.cy / g.count, g.cz / g.count],
      topPartner: [...g.partners.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    })).sort((a, b) => b.count - a.count)

    const levels = [...new Set(data.nodes.map(n => n.school_level).filter(Boolean))]
      .sort((a, b) => ({ '초등학교': 0, '중학교': 1, '고등학교': 2 }[a] ?? 9) - ({ '초등학교': 0, '중학교': 1, '고등학교': 2 }[b] ?? 9))

    return { nodesByCode, degree, maxDegree, adjacency, groups, levels }
  }, [data])

  // ── 씬 생성/파괴 ──
  // 씬이 재생성될 때(모바일 브레이크포인트 전환, HMR) 데이터를 다시 주입해야 하므로
  // 주입 로직을 ref로 노출한다 (씬과 데이터 도착 순서 무관하게 동작)
  const handlersRef = useRef({})
  const injectRef = useRef(null)
  useEffect(() => {
    if (!containerRef.current) return
    const scene = createNebulaScene(containerRef.current, {
      onHover: (info) => handlersRef.current.onHover?.(info),
      onSelect: (node) => handlersRef.current.onSelect?.(node),
      onBackgroundClick: () => handlersRef.current.onBackgroundClick?.(),
      isMobile, prefersReducedMotion,
    })
    sceneRef.current = scene
    injectRef.current?.()
    setSceneEpoch(e => e + 1) // 선택/필터 효과 재적용 트리거
    return () => { scene.dispose(); sceneRef.current = null }
  }, [isMobile, prefersReducedMotion])

  // ── 씬 데이터 주입 + 진입 연출 ──
  useEffect(() => {
    if (!data || !derived) return
    injectRef.current = () => {
      const scene = sceneRef.current
      if (!scene) return
      const sceneNodes = data.nodes.map(n => ({
        code: n.code, group: n.subject_group,
        x: n.x, y: n.y, z: n.z,
        color: groupColor(n.subject_group),
        size: nodeSize(derived.degree.get(n.code) || 0, derived.maxDegree),
      }))
      scene.setData({ nodes: sceneNodes, links: data.links })

      // 교과군 스태거 점등 딜레이 (인덱스 × 120ms — 스펙 §5-1)
      const groupIndex = new Map(derived.groups.map((g, i) => [g.name, i]))
      const delayByCode = new Map(data.nodes.map(n => [
        n.code, 200 + (groupIndex.get(n.subject_group) || 0) * TIMING.entryStagger,
      ]))
      scene.playEntry(delayByCode)
      scene.introFly()

      // 교과군 라벨 (성단 무게중심 상단 — 20개 이상 성단만, 높이 교차로 겹침 완화)
      scene.clearLabels('group:')
      derived.groups.filter(g => g.count >= 20).forEach((g, i) => {
        const el = document.createElement('div')
        el.className = 'nebula-group-label'
        el.style.color = g.color
        el.textContent = g.name
        const offsetY = 22 + (i % 3) * 13
        scene.addLabelAt(`group:${g.name}`, [g.centroid[0], g.centroid[1] + offsetY, g.centroid[2]], el)
      })
    }
    injectRef.current()

    const uiTimer = setTimeout(() => setUiReady(true), prefersReducedMotion ? 300 : 2400)

    // URL focus 복원 (진입 연출 후 — 마운트 시 캡처해 둔 값 사용)
    const focusCode = initialFocusRef.current
    let focusTimer
    if (focusCode && derived.nodesByCode.has(focusCode)) {
      initialFocusRef.current = '' // 1회만
      focusTimer = setTimeout(() => selectNodeRef.current?.(focusCode), prefersReducedMotion ? 400 : 3000)
    }
    return () => { clearTimeout(uiTimer); clearTimeout(focusTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, derived])

  // ── URL 상태 초기화 (mount 시 1회) ──
  useEffect(() => {
    const subjects = (searchParams.get('subjects') || '').split(',').filter(Boolean)
    if (subjects.length > 0) setActiveGroups(new Set(subjects))
    const levels = (searchParams.get('levels') || '').split(',').filter(Boolean)
    if (levels.length > 0) setActiveLevels(new Set(levels))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── URL 상태 기록 ──
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    next.set('mode', 'explore')
    if (activeGroups && derived && activeGroups.size < derived.groups.length) next.set('subjects', [...activeGroups].join(','))
    else next.delete('subjects')
    if (activeLevels && derived && activeLevels.size < derived.levels.length) next.set('levels', [...activeLevels].join(','))
    else next.delete('levels')
    if (selected) next.set('focus', selected); else next.delete('focus')
    if (tour.active) next.set('tour', '1'); else next.delete('tour')
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroups, activeLevels, selected, tour.active, derived])

  // ── 필터(조명 스위치) → 씬 감광 ──
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !data) return
    if (!activeGroups && !activeLevels) { scene.setDim(null); return }
    const dim = new Map()
    for (const n of data.nodes) {
      const on = (!activeGroups || activeGroups.has(n.subject_group)) &&
                 (!activeLevels || activeLevels.has(n.school_level))
      dim.set(n.code, on ? 1 : 0)
    }
    scene.setDim(dim)
  }, [activeGroups, activeLevels, data, sceneEpoch])

  // ── 선택 → 하이라이트 + 플라이투 + 라벨 ──
  const selectedNode = selected && derived ? derived.nodesByCode.get(selected) : null
  const connections = useMemo(() => {
    if (!selected || !derived) return []
    return derived.adjacency.get(selected) || []
  }, [selected, derived])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.clearLabels('node:')
    if (!selected) { scene.setHighlight(null); return }
    const neighborSet = new Set(connections.map(c => c.other.code))
    scene.setHighlight(selected, neighborSet)
    // 카드(우측 패널/바텀 시트)가 가리지 않는 가시 영역의 중앙에 노드 배치
    const screenShift = isMobile
      ? { x: 0, y: Math.round((window.innerHeight || 700) * 0.26) }
      : { x: 175, y: 0 }
    scene.flyToNode(selected, { screenShift })

    // 라벨: 선택 노드 + 이웃 최대 10개 (스펙 §6-4)
    const selEl = document.createElement('div')
    selEl.className = 'nebula-code-label selected'
    selEl.textContent = selected
    scene.addLabel(selected, selEl, { offsetY: 7 })
    connections.slice(0, 10).forEach(c => {
      const el = document.createElement('div')
      el.className = 'nebula-code-label'
      el.textContent = c.other.code
      scene.addLabel(c.other.code, el)
    })
  }, [selected, connections, sceneEpoch, isMobile])

  const selectNode = useCallback((code) => {
    visitedRef.current.add(code)
    setTour(t => (t.active ? { active: false, idx: 0, paused: false } : t))
    setSelected(code)
  }, [])
  const selectNodeRef = useRef(selectNode)
  selectNodeRef.current = selectNode

  // 씬 콜백 최신화
  handlersRef.current = {
    onHover: (info) => {
      if (isMobile) return
      setHover(info ? { node: info.node, x: info.clientX, y: info.clientY } : null)
    },
    onSelect: (node) => selectNode(node.code),
    onBackgroundClick: () => {
      if (tour.active) endTour()
      else if (selected) {
        // 명시적 '나가기' — 선택 해제 + 전체 뷰 복귀 (선택 없을 땐 카메라 유지)
        setSelected(null)
        sceneRef.current?.overview(1500)
      }
    },
  }

  // ── 투어 ──
  const tourStops = useMemo(() => {
    if (!derived) return []
    const stops = derived.groups.filter(g => g.count >= 40).slice(0, 8).map(g => ({
      group: g.name, color: g.color, centroid: g.centroid,
      stats: { nodes: g.count, links: g.links, topPartner: g.topPartner },
      story: buildStory(g.name, g.topPartner || '이웃 교과'),
    }))
    stops.push({
      finale: true, group: '교육과정 성운', color: '#60A5FA', centroid: [0, 0, 0],
      stats: null, story: '이 모든 연결이, 하나의 교육과정입니다.',
    })
    return stops
  }, [derived])

  const startTour = useCallback(() => {
    setSelected(null)
    visitedRef.current.clear()
    setTour({ active: true, idx: 0, paused: false })
  }, [])

  const endTour = useCallback(() => {
    setTour({ active: false, idx: 0, paused: false })
    const scene = sceneRef.current
    if (scene) {
      scene.setTourFocus(null)
      scene.setForcedRotate(null)
      scene.overview(1600)
    }
  }, [])

  // 투어 스텝 실행 (스톱당 9초: 이동 2s + 정착 궤도선회 7s — 스펙 §5-5)
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !tour.active || tour.paused || tourStops.length === 0) return
    const stop = tourStops[tour.idx]
    if (!stop) { endTour(); return }

    if (stop.finale) {
      scene.setTourFocus(null)
      scene.overview(2400)
      scene.setForcedRotate(null)
      const t = setTimeout(endTour, 9000)
      return () => clearTimeout(t)
    }
    scene.setTourFocus(stop.group)
    scene.flyToPoint(stop.centroid, { duration: TIMING.tourMove })
    scene.setForcedRotate(null)
    const dwellTimer = setTimeout(() => scene.setForcedRotate(AUTOROTATE.tourDegPerSec), TIMING.tourMove)
    const nextTimer = setTimeout(() => {
      setTour(t => ({ ...t, idx: t.idx + 1 }))
    }, TIMING.tourMove + TIMING.tourDwell)
    return () => { clearTimeout(dwellTimer); clearTimeout(nextTimer); scene.setForcedRotate(null) }
  }, [tour, tourStops, endTour])

  // Esc: 투어 종료 / 선택 해제
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (tour.active) endTour()
      else {
        setSelected(prev => {
          if (prev) sceneRef.current?.overview(1500)
          return null
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tour.active, endTour])

  // 투어 중 드래그 → 일시정지
  const handleCanvasPointerDown = useCallback(() => {
    if (tour.active && !tour.paused) setTour(t => ({ ...t, paused: true }))
  }, [tour])

  // ── 다음 연결로 여행 ──
  const travelNext = useCallback(() => {
    if (connections.length === 0) return
    const next = connections.find(c => !visitedRef.current.has(c.other.code)) || connections[0]
    selectNode(next.other.code)
  }, [connections, selectNode])

  // ── UI 유틸 ──
  const toggleGroup = (name) => {
    if (!derived) return
    setActiveGroups(prev => {
      const all = new Set(derived.groups.map(g => g.name))
      const cur = prev || all
      const next = new Set(cur)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next.size === all.size ? null : next
    })
  }
  const soloGroup = (name) => setActiveGroups(new Set([name]))
  const toggleLevel = (lv) => {
    if (!derived) return
    setActiveLevels(prev => {
      const all = new Set(derived.levels)
      const cur = prev || all
      const next = new Set(cur)
      if (next.has(lv)) next.delete(lv); else next.add(lv)
      return next.size === all.size ? null : next
    })
  }
  const resetAll = () => { setActiveGroups(null); setActiveLevels(null) }
  const toDesign = () => {
    const next = new URLSearchParams()
    next.set('mode', 'design')
    setSearchParams(next)
  }

  const nodeCount = useCountUp(data?.nodes.length || 0, uiReady)
  const linkCount = useCountUp(data?.links.length || 0, uiReady)
  const hasAnyDim = activeGroups !== null || activeLevels !== null
  const loading = !data && !loadFailed
  const currentStop = tour.active ? tourStops[tour.idx] : null

  const typeInfo = (type) => ({
    color: LINK_TYPE_COLORS_DARK[type] || '#7C89B8',
    label: LINK_TYPE_LABELS[type] || type,
  })

  // ── 상세 카드 내용 (데스크톱 패널 / 모바일 바텀시트 공유) ──
  const cardBody = selectedNode && (
    <>
      <div className="flex items-start gap-2.5 p-4 pb-3">
        <span className="mt-0.5 shrink-0 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold tracking-tight border"
          style={{
            color: groupColor(selectedNode.subject_group),
            borderColor: `${groupColor(selectedNode.subject_group)}55`,
            backgroundColor: `${groupColor(selectedNode.subject_group)}1A`,
          }}>
          {selectedNode.code}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-400/70">
            {selectedNode.subject}{selectedNode.grade_group ? ` · ${selectedNode.grade_group}` : ''}
          </p>
        </div>
        <button onClick={() => { setSelected(null); sceneRef.current?.overview(1500) }}
          className="shrink-0 p-1 -m-1 rounded-lg text-slate-400/70 hover:text-slate-100 hover:bg-white/[0.08] transition-colors">
          <X size={16} />
        </button>
      </div>
      <p className="px-4 text-sm font-semibold leading-relaxed text-slate-100">{selectedNode.content}</p>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="text-[11px] font-medium text-slate-400/70">
          연결 <b className="text-slate-100 tabular-nums">{connections.length}</b>개
        </span>
        <span className="h-px flex-1 bg-white/[0.08]" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
        {connections.map((c, i) => {
          const t = typeInfo(c.type)
          return (
            <button key={`${c.other.code}-${i}`} onClick={() => selectNode(c.other.code)}
              className="w-full text-left p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.06] hover:border-white/[0.14] transition-colors duration-150">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <span className="text-[11px] font-semibold shrink-0" style={{ color: t.color }}>{t.label}</span>
                <span className="font-mono text-[11px] text-slate-400/70 truncate">{c.other.code}</span>
                <span className="ml-auto text-[11px] text-slate-400/70 shrink-0">{c.other.subject}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-slate-300/90 line-clamp-2">{c.other.content}</p>
              {c.theme && <p className="mt-1.5 text-[11px] text-slate-400/70">🔗 {c.theme}</p>}
              {c.hook && <p className="mt-0.5 text-[11px] text-slate-400/70 line-clamp-1">📝 {c.hook}</p>}
            </button>
          )
        })}
      </div>
      <div className="p-3 border-t border-white/[0.08]">
        <button onClick={travelNext}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-sky-500/90 hover:bg-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.25)] transition-colors duration-150">
          <Rocket size={14} /> 다음 연결로 여행
        </button>
      </div>
    </>
  )

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      {/* 배경: 딥네이비 래디얼 + 비네트 (스펙 §1) */}
      <div className="absolute inset-0 z-0"
        style={{ background: `radial-gradient(ellipse 120% 90% at 50% 35%, ${NEBULA_BG.inner} 0%, ${NEBULA_BG.mid} 45%, ${NEBULA_BG.outer} 100%)` }} />
      <div className="pointer-events-none absolute inset-0 z-0"
        style={{ boxShadow: 'inset 0 0 180px 60px rgba(2,4,10,0.55)' }} />

      {/* 3D 캔버스 */}
      <div ref={containerRef} onPointerDown={handleCanvasPointerDown} className="absolute inset-0 z-10" />

      {/* 로딩: 별이 태어나는 중 (스펙 §4-6) */}
      {loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5">
          <div className="relative w-3 h-3">
            <span className="absolute inset-0 rounded-full bg-sky-300 animate-ping opacity-60" />
            <span className="absolute inset-0 rounded-full bg-sky-200 shadow-[0_0_24px_8px_rgba(125,211,252,0.5)]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-100 tracking-wide">교육과정 우주를 그리는 중</p>
            <p className="mt-1 text-[11px] text-slate-400/70">잠시만 기다려 주세요</p>
          </div>
        </div>
      )}

      {/* 빈 상태 / 로드 실패 (스펙 §4-7) */}
      {(loadFailed || (data && data.nodes.length === 0)) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="text-center px-8 py-7 bg-[#0B1228]/70 backdrop-blur-xl border border-white/[0.08] rounded-2xl">
            <p className="text-2xl mb-3">🌑</p>
            <p className="text-sm font-semibold text-slate-100 mb-1">이 우주엔 아직 별이 없습니다</p>
            <p className="text-[13px] text-slate-400/70 mb-4">
              {loadFailed ? '데이터를 불러오지 못했습니다 — 잠시 후 새로고침해 주세요' : '연결된 성취기준이 없습니다'}
            </p>
            {loadFailed && (
              <button onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-sky-500/90 hover:bg-sky-400 transition-colors">
                새로고침
              </button>
            )}
          </div>
        </div>
      )}

      {/* 상단 바: 떠 있는 알약 (스펙 §4-1) */}
      {uiReady && (
        <div className={`absolute top-4 inset-x-4 z-20 flex items-start justify-between pointer-events-none transition-opacity duration-500 ${tour.active ? 'opacity-50' : ''}`}>
          <div className="pointer-events-auto flex items-center gap-3 pl-3 pr-4 py-2 bg-[#0B1228]/70 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] animate-ui-in">
            <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
              <Logo size={20} />
              <span className="hidden sm:inline text-[13px] font-bold text-slate-100">커리큘럼 위버</span>
            </a>
            <span className="w-px h-4 bg-white/[0.12]" />
            <h1 className="text-[15px] font-bold tracking-tight text-slate-100">교육과정 성운</h1>
            <div className="hidden md:flex items-center gap-3 ml-1 text-[13px] tabular-nums">
              <span className="text-slate-400/70">성취기준 <b className="font-semibold text-slate-100">{nodeCount.toLocaleString()}</b></span>
              <span className="text-slate-400/70">연결 <b className="font-semibold text-sky-300">{linkCount.toLocaleString()}</b></span>
            </div>
          </div>
          <div className="pointer-events-auto flex items-center gap-2 animate-ui-in" style={{ animationDelay: '80ms' }}>
            {!tour.active && (
              <button onClick={startTour}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-sky-500/90 hover:bg-sky-400 text-white shadow-[0_0_24px_rgba(56,189,248,0.35)] transition-colors duration-150">
                <Play size={14} /> <span className="hidden sm:inline">우주 여행</span>
              </button>
            )}
            <button onClick={toDesign}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-300/90 hover:text-slate-100 transition-colors duration-150">
              <Compass size={14} /> <span className="hidden sm:inline">설계 모드</span>
            </button>
          </div>
        </div>
      )}

      {/* 레전드: 조명 스위치 (스펙 §4-2) — 데스크톱 좌하단 / 모바일 하단 스트립 */}
      {uiReady && !tour.active && derived && (
        isMobile ? (
          !selected && (
            <div className="absolute bottom-0 inset-x-0 z-20 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-6 flex gap-1.5 overflow-x-auto bg-gradient-to-t from-[#04060F] to-transparent">
              {derived.levels.map(lv => {
                const active = !activeLevels || activeLevels.has(lv)
                return (
                  <button key={lv} onClick={() => toggleLevel(lv)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-200 ${
                      active ? 'border-white/[0.14] bg-white/[0.1] text-slate-100' : 'border-transparent text-slate-500/60'}`}>
                    {lv.replace('학교', '')}
                  </button>
                )
              })}
              {derived.groups.map(g => {
                const active = !activeGroups || activeGroups.has(g.name)
                return (
                  <button key={g.name} onClick={() => toggleGroup(g.name)}
                    className={`shrink-0 flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-200 ${
                      active ? 'border-white/[0.14] bg-white/[0.08] text-slate-100' : 'border-transparent text-slate-500/60'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color, opacity: active ? 1 : 0.3, boxShadow: active ? `0 0 8px ${g.color}` : 'none' }} />
                    {g.name}
                  </button>
                )
              })}
            </div>
          )
        ) : (legendPref && !selected) ? (
          <div className="absolute left-4 bottom-4 z-20 max-w-[340px] bg-[#0B1228]/70 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-2.5 animate-ui-in" style={{ animationDelay: '160ms' }}>
            <div className="flex items-center gap-1 mb-2">
              {derived.levels.map(lv => {
                const active = !activeLevels || activeLevels.has(lv)
                return (
                  <button key={lv} onClick={() => toggleLevel(lv)}
                    className={`flex-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                      active ? 'bg-white/[0.14] text-slate-100' : 'text-slate-400/70 hover:text-slate-300 hover:bg-white/[0.06]'}`}>
                    {lv.replace('학교', '')}
                  </button>
                )
              })}
              <button onClick={() => setLegendPref(false)} title="레전드 접기"
                className="shrink-0 p-1 rounded-lg text-slate-400/70 hover:text-slate-100 hover:bg-white/[0.08] transition-colors">
                <ChevronDown size={13} />
              </button>
            </div>
            <div className="h-px bg-white/[0.08] mb-2" />
            <div className="flex flex-wrap gap-1">
              {derived.groups.map(g => {
                const active = !activeGroups || activeGroups.has(g.name)
                return (
                  <button key={g.name} onClick={() => toggleGroup(g.name)} onDoubleClick={() => soloGroup(g.name)}
                    title="더블클릭: 이 교과군만 보기"
                    className={`flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all duration-200 ${
                      active ? 'border-white/[0.14] bg-white/[0.08] text-slate-100' : 'border-transparent bg-transparent text-slate-500/60 hover:text-slate-400'}`}>
                    <span className="w-2 h-2 rounded-full transition-all duration-200"
                      style={{ backgroundColor: g.color, boxShadow: active ? `0 0 8px ${g.color}` : 'none', opacity: active ? 1 : 0.3 }} />
                    {g.name}
                  </button>
                )
              })}
            </div>
            {hasAnyDim && (
              <button onClick={resetAll} className="mt-1.5 text-[11px] text-sky-400/80 hover:text-sky-300 transition-colors">
                모두 켜기
              </button>
            )}
          </div>
        ) : (
          /* 접힌 레전드: 작은 알약 — 노드 선택 중이거나 사용자가 접었을 때 */
          <button onClick={() => { setLegendPref(true); if (selected) { setSelected(null); sceneRef.current?.overview(1500) } }}
            title="교과군·학교급 필터 펼치기"
            className="absolute left-4 bottom-4 z-20 flex items-center gap-2 pl-3 pr-3.5 py-2 bg-[#0B1228]/70 backdrop-blur-xl border border-white/[0.08] rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.45)] hover:bg-[#0E1633]/80 transition-colors">
            <span className="flex items-center -space-x-0.5">
              {derived.groups.slice(0, 6).map(g => {
                const active = !activeGroups || activeGroups.has(g.name)
                return <span key={g.name} className="w-2 h-2 rounded-full ring-1 ring-[#0B1228]"
                  style={{ backgroundColor: g.color, opacity: active ? 1 : 0.25 }} />
              })}
            </span>
            <span className="text-[11px] font-semibold text-slate-300/90">교과군 필터</span>
            {hasAnyDim && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />}
            <ChevronUp size={13} className="text-slate-400/70" />
          </button>
        )
      )}

      {/* 상세 카드: 데스크톱 우측 패널 / 모바일 바텀 시트 (스펙 §4-3·§7) */}
      {selectedNode && (
        isMobile ? (
          <aside className="fixed inset-x-0 bottom-0 z-20 max-h-[62dvh] flex flex-col bg-[#0E1633]/90 backdrop-blur-2xl border-t border-white/[0.12] rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.45)] animate-sheet-in">
            <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mt-2 shrink-0" />
            {cardBody}
          </aside>
        ) : (
          <aside className="absolute right-4 top-[72px] max-h-[calc(100dvh-96px)] z-20 w-[330px] max-w-[calc(100vw-32px)] flex flex-col bg-[#0E1633]/80 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] animate-card-in">
            {cardBody}
          </aside>
        )
      )}

      {/* 호버 툴팁 (스펙 §4-5) */}
      {hover && !isMobile && (
        <div className="pointer-events-none fixed z-40 px-2.5 py-1.5 rounded-lg bg-[#0B1228]/85 backdrop-blur-md border border-white/[0.12] shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
          style={{ left: hover.x + 12, top: hover.y - 12 }}>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: groupColor(hover.node.group) }} />
            <span className="font-mono text-[11px] font-semibold text-slate-100">{hover.node.code}</span>
          </div>
          {derived?.nodesByCode.get(hover.node.code) && (
            <p className="mt-0.5 text-[11px] leading-snug text-slate-300/90 max-w-[240px] truncate">
              {derived.nodesByCode.get(hover.node.code).content}
            </p>
          )}
        </div>
      )}

      {/* 투어: 진행 인디케이터 + 캡션 (스펙 §4-4) */}
      {tour.active && currentStop && (
        <>
          <div className={`absolute inset-x-0 z-30 flex justify-center ${isMobile ? 'bottom-[calc(env(safe-area-inset-bottom)+180px)]' : 'bottom-[168px]'}`}>
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-[#0B1228]/70 backdrop-blur-xl border border-white/[0.08]">
              <div className="flex items-center gap-1.5">
                {tourStops.map((s, i) => (
                  <button key={s.group} onClick={() => setTour(t => ({ ...t, idx: i, paused: false }))}
                    className={`rounded-full transition-all duration-300 ${i === tour.idx ? 'w-5 h-1.5' : 'w-1.5 h-1.5 hover:scale-125'}`}
                    style={{ backgroundColor: i === tour.idx ? s.color : 'rgba(255,255,255,0.25)' }} />
                ))}
              </div>
              <span className="w-px h-3 bg-white/[0.12]" />
              {tour.paused && (
                <button onClick={() => setTour(t => ({ ...t, paused: false }))}
                  className="flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:text-sky-200 transition-colors">
                  <Play size={12} /> 재개
                </button>
              )}
              <button onClick={endTour}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-400/70 hover:text-slate-100 transition-colors">
                <X size={12} /> 투어 종료
              </button>
            </div>
          </div>
          <div className="absolute bottom-8 inset-x-0 z-30 flex justify-center pointer-events-none">
            <div key={currentStop.group}
              className={`pointer-events-auto px-6 py-5 bg-[#0E1633]/80 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] animate-caption-in text-center ${isMobile ? 'w-full mx-4 px-4 py-4' : 'w-[560px] max-w-[calc(100vw-32px)]'}`}>
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentStop.color, boxShadow: `0 0 10px ${currentStop.color}` }} />
                <h2 className="text-lg font-bold text-slate-100">{currentStop.group}</h2>
              </div>
              {currentStop.stats && (
                <p className="text-[13px] tabular-nums text-slate-400/70 mb-2">
                  성취기준 {currentStop.stats.nodes.toLocaleString()}개 · 연결 {currentStop.stats.links.toLocaleString()}개
                  {currentStop.stats.topPartner && <> · 최다 연결 교과 <b className="text-slate-300/90">{currentStop.stats.topPartner}</b></>}
                </p>
              )}
              <p className={`leading-relaxed text-slate-300/90 ${isMobile ? 'text-[13px]' : 'text-sm'}`}>{currentStop.story}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
