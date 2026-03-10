import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { Search, X, RotateCcw, ChevronLeft, ChevronRight, Link2, Send, MessageCircle, List, Plus, Check, Crosshair, HelpCircle, Sparkles } from 'lucide-react'
import { apiGet, apiPost, API_BASE } from '../lib/api'
import Logo from './Logo'

// 교과군(subject_group) 기준 색상 매핑
const SUBJECT_COLORS = {
  '과학': '#22c55e', '수학': '#3b82f6', '국어': '#ef4444',
  '사회': '#eab308', '도덕': '#f97316',
  '기술·가정': '#a855f7', '정보': '#06b6d4',
  '실과(기술·가정)/정보': '#a855f7', '실과': '#14b8a6',
  '미술': '#ec4899', '체육': '#84cc16', '음악': '#8b5cf6',
  '영어': '#6366f1', '제2외국어': '#0891b2', '한문': '#14b8a6',
}
// 교과군 표시명 (UI용)
const SUBJECT_GROUP_LABELS = {}

const LINK_TYPE_LABELS = {
  cross_subject: '교과연계', same_concept: '동일개념', prerequisite: '선수학습',
  application: '적용', extension: '확장',
}

const LINK_TYPE_COLORS = {
  cross_subject: '#f59e0b', same_concept: '#3b82f6', prerequisite: '#ef4444',
  application: '#22c55e', extension: '#a855f7',
}

// link의 source/target이 객체(force-graph가 변환)일 수도 있으므로 ID를 안전하게 추출
const getLinkSourceId = (l) => typeof l.source === 'object' ? l.source?.id : l.source
const getLinkTargetId = (l) => typeof l.target === 'object' ? l.target?.id : l.target

export default function Graph3D({ embedded = false }) {
  const navigate = !embedded ? useNavigate() : null
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedSubjects, setSelectedSubjects] = useState(new Set())
  const [selectedSchoolLevels, setSelectedSchoolLevels] = useState(new Set())
  const [selectedGradeGroups, setSelectedGradeGroups] = useState(new Set())
  const [minOverlap, setMinOverlap] = useState(2) // 최소 교차 과목 수
  const [filterLinkType, setFilterLinkType] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightNodes, setHighlightNodes] = useState(new Set())
  const [highlightLinks, setHighlightLinks] = useState(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // 모바일에서는 사이드바 기본 닫힘
    if (typeof window !== 'undefined' && window.innerWidth < 640) return false
    return !embedded
  })
  const [sidebarTab, setSidebarTab] = useState('list') // 'list' | 'chat'
  // 과목 토글 핸들러
  const toggleSubject = useCallback((subject) => {
    setSelectedSubjects(prev => {
      const next = new Set(prev)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }, [])
  // 학교급 토글 핸들러
  const toggleSchoolLevel = useCallback((level) => {
    setSelectedSchoolLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }, [])
  // 학년군 토글 핸들러
  const toggleGradeGroup = useCallback((group) => {
    setSelectedGradeGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }, [])
  const containerRef = useRef(null)
  const fgRef = useRef()
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })

  // AI 채팅 상태
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const [chatStreamingText, setChatStreamingText] = useState('')
  const [suggestedLinks, setSuggestedLinks] = useState([])
  const [addedLinks, setAddedLinks] = useState(new Set())
  const chatScrollRef = useRef(null)
  const [focusMode, setFocusMode] = useState(false)
  const [hoveredLink, setHoveredLink] = useState(null)
  const [searchIndex, setSearchIndex] = useState(-1)

  // 채팅 자동 스크롤
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chatMessages, chatStreamingText])

  // 컨테이너 크기 감지
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setDimensions({ width: entry.contentRect.width, height: Math.max(entry.contentRect.height, 400) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 그래프 데이터 로드
  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiGet('/api/standards/graph')
        setGraphData(data)
      } catch (e) {
        console.error('그래프 로드 실패:', e)
      }
      setLoading(false)
    }
    load()
  }, [])

  // 그래프 새로고침 함수
  const refreshGraph = useCallback(async () => {
    try {
      const data = await apiGet('/api/standards/graph')
      setGraphData(data)
    } catch (e) {
      console.error('그래프 새로고침 실패:', e)
    }
  }, [])

  // 노드 ID → 교과군 매핑 (교과 간 연결 판단용)
  const nodeSubjectMap = useMemo(() => {
    if (!graphData) return new Map()
    const map = new Map()
    graphData.nodes.forEach(n => map.set(n.id, n.subject_group || n.subject))
    return map
  }, [graphData])

  // 필터링된 그래프 데이터 (같은 교과 간 연결 제거)
  const filteredData = useMemo(() => {
    if (!graphData) return null
    let nodes = graphData.nodes

    // 학교급 필터
    if (selectedSchoolLevels.size > 0) {
      nodes = nodes.filter(n => selectedSchoolLevels.has(n.school_level))
    }
    // 학년군 필터
    if (selectedGradeGroups.size > 0) {
      nodes = nodes.filter(n => selectedGradeGroups.has(n.grade_group))
    }

    const filteredNodeIds = new Set(nodes.map(n => n.id))
    let links = graphData.links.filter(l => {
      // 학교급/학년군 필터로 제거된 노드 간 연결도 제거
      if (!filteredNodeIds.has(getLinkSourceId(l)) || !filteredNodeIds.has(getLinkTargetId(l))) return false
      const srcSubject = nodeSubjectMap.get(getLinkSourceId(l))
      const tgtSubject = nodeSubjectMap.get(getLinkTargetId(l))
      return srcSubject !== tgtSubject
    })

    // 이웃 노드 추적 (선택 과목 외 연결된 다른 과목 노드)
    let neighborNodeIds = new Set()

    // 멀티 과목 필터
    if (selectedSubjects.size > 0) {
      const selNodeIds = new Set(nodes.filter(n => selectedSubjects.has(n.subject_group || n.subject)).map(n => n.id))

      let coreLinks, coreNodeIds

      if (selectedSubjects.size === 1) {
        // 단일 교과 선택: 해당 교과에서 다른 교과로 나가는 모든 교차 연결 표시
        coreLinks = links.filter(l => selNodeIds.has(getLinkSourceId(l)) || selNodeIds.has(getLinkTargetId(l)))
        coreNodeIds = new Set()
        coreLinks.forEach(l => { coreNodeIds.add(getLinkSourceId(l)); coreNodeIds.add(getLinkTargetId(l)) })
      } else {
        // 다중 교과 선택: 선택 과목 노드 사이의 코어 연결
        coreLinks = links.filter(l => selNodeIds.has(getLinkSourceId(l)) && selNodeIds.has(getLinkTargetId(l)))

        // minOverlap >= 3: 허브 노드 필터링 (코어 연결 기준)
        if (selectedSubjects.size >= 3 && minOverlap >= 3) {
          const nodeConnectedSubjects = new Map() // nodeId → Set<subject>
          nodes.filter(n => selNodeIds.has(n.id)).forEach(n => {
            nodeConnectedSubjects.set(n.id, new Set([n.subject]))
          })
          coreLinks.forEach(l => {
            const srcId = getLinkSourceId(l), tgtId = getLinkTargetId(l)
            const srcSubj = nodeSubjectMap.get(srcId), tgtSubj = nodeSubjectMap.get(tgtId)
            if (nodeConnectedSubjects.has(srcId)) nodeConnectedSubjects.get(srcId).add(tgtSubj)
            if (nodeConnectedSubjects.has(tgtId)) nodeConnectedSubjects.get(tgtId).add(srcSubj)
          })
          const hubNodeIds = new Set()
          nodeConnectedSubjects.forEach((subjs, nodeId) => {
            if (subjs.size >= minOverlap) hubNodeIds.add(nodeId)
          })
          coreLinks = coreLinks.filter(l => hubNodeIds.has(getLinkSourceId(l)) || hubNodeIds.has(getLinkTargetId(l)))
          coreNodeIds = new Set()
          coreLinks.forEach(l => { coreNodeIds.add(getLinkSourceId(l)); coreNodeIds.add(getLinkTargetId(l)) })
        } else {
          coreNodeIds = new Set()
          coreLinks.forEach(l => { coreNodeIds.add(getLinkSourceId(l)); coreNodeIds.add(getLinkTargetId(l)) })
        }

        // 선택 교과 간 연결만 표시 (확장 연결 제거 — 선택 교과에 집중)
      }

      links = coreLinks

      const connectedIds = new Set()
      links.forEach(l => { connectedIds.add(getLinkSourceId(l)); connectedIds.add(getLinkTargetId(l)) })
      nodes = nodes.filter(n => connectedIds.has(n.id))

      // 이웃 노드 = 선택 과목에 속하지 않는 노드
      nodes.forEach(n => { if (!selectedSubjects.has(n.subject_group || n.subject)) neighborNodeIds.add(n.id) })
    }

    if (filterLinkType) {
      links = links.filter(l => l.link_type === filterLinkType)
      const connectedIds = new Set()
      links.forEach(l => { connectedIds.add(getLinkSourceId(l)); connectedIds.add(getLinkTargetId(l)) })
      nodes = nodes.filter(n => connectedIds.has(n.id))
    }

    // 포커스 모드: 선택 노드의 1홉 이웃만 표시
    if (focusMode && selectedNode) {
      const egoLinks = links.filter(l =>
        getLinkSourceId(l) === selectedNode.id || getLinkTargetId(l) === selectedNode.id
      )
      const egoNodeIds = new Set([selectedNode.id])
      egoLinks.forEach(l => { egoNodeIds.add(getLinkSourceId(l)); egoNodeIds.add(getLinkTargetId(l)) })
      nodes = nodes.filter(n => egoNodeIds.has(n.id))
      links = egoLinks
    }

    return { nodes, links, neighborNodeIds }
  }, [graphData, selectedSubjects, selectedSchoolLevels, selectedGradeGroups, minOverlap, filterLinkType, nodeSubjectMap, focusMode, selectedNode])

  // 포스 시뮬레이션 설정 (반발력, 링크 거리 등)
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !filteredData) return
    // 약간의 딜레이 후 포스 설정 (그래프 초기화 후)
    const timer = setTimeout(() => {
      try {
        const nodeCount = filteredData.nodes.length
        // 노드 간 반발력 (강하게 밀어냄 → 노드가 넓게 퍼짐)
        const chargeStrength = nodeCount > 500 ? -80 : nodeCount > 100 ? -150 : -300
        const charge = fg.d3Force('charge')
        if (charge) charge.strength(chargeStrength)
        // 링크 거리 (연결된 노드 간 적정 거리)
        const linkDist = nodeCount > 500 ? 40 : nodeCount > 100 ? 60 : 80
        const link = fg.d3Force('link')
        if (link) link.distance(linkDist)
        // 시뮬레이션 재시작
        if (fg.d3ReheatSimulation) fg.d3ReheatSimulation()
      } catch (e) {
        console.warn('포스 설정 오류:', e)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [filteredData])

  // 필터 변경 시 자동 줌 투 핏
  useEffect(() => {
    if (!filteredData || !fgRef.current) return
    // 시뮬레이션이 안정화된 후 줌 투 핏
    const timer = setTimeout(() => {
      if (fgRef.current) fgRef.current.zoomToFit(600, 60)
    }, 800)
    return () => clearTimeout(timer)
  }, [filteredData])

  // 검색 결과 (원점에서 가까운 순 정렬)
  const sortedSearchResults = useMemo(() => {
    if (!graphData || !searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    const matched = graphData.nodes.filter(n =>
      n.code?.toLowerCase().includes(q) || n.subject?.toLowerCase().includes(q) ||
      n.content?.toLowerCase().includes(q) || n.area?.toLowerCase().includes(q) ||
      n.grade_group?.toLowerCase().includes(q)
    )
    return matched.sort((a, b) =>
      Math.hypot(a.x || 0, a.y || 0, a.z || 0) - Math.hypot(b.x || 0, b.y || 0, b.z || 0)
    )
  }, [graphData, searchQuery])

  // 검색 + 하이라이트
  useEffect(() => {
    if (sortedSearchResults.length === 0) {
      setHighlightNodes(new Set())
      setHighlightLinks(new Set())
      setSearchIndex(-1)
      return
    }
    const nodeIds = new Set(sortedSearchResults.map(n => n.id))
    const linkSet = new Set()
    graphData.links.forEach((l, i) => {
      if (nodeIds.has(getLinkSourceId(l)) || nodeIds.has(getLinkTargetId(l))) linkSet.add(i)
    })
    setHighlightNodes(nodeIds)
    setHighlightLinks(linkSet)
  }, [sortedSearchResults, graphData])

  // 검색 시 첫 번째 결과로 자동 이동 (디바운스)
  useEffect(() => {
    if (sortedSearchResults.length === 0) return
    const timer = setTimeout(() => {
      setSearchIndex(0)
      navigateToNode(sortedSearchResults[0])
    }, 400)
    return () => clearTimeout(timer)
  }, [sortedSearchResults])

  // 교과군 목록 (필터 버튼용 — 118개 세부과목이 아닌 11개 교과군)
  const subjects = useMemo(() => {
    if (!graphData) return []
    return [...new Set(graphData.nodes.map(n => n.subject_group || n.subject))].sort()
  }, [graphData])

  // 학교급 목록
  const schoolLevels = useMemo(() => {
    if (!graphData) return []
    return [...new Set(graphData.nodes.map(n => n.school_level).filter(Boolean))].sort((a, b) => {
      const order = { '초등학교': 0, '중학교': 1, '고등학교': 2 }
      return (order[a] ?? 9) - (order[b] ?? 9)
    })
  }, [graphData])

  // 학년군 목록
  const gradeGroups = useMemo(() => {
    if (!graphData) return []
    return [...new Set(graphData.nodes.map(n => n.grade_group).filter(Boolean))].sort((a, b) => {
      const order = { '초1-2': 0, '초3-4': 1, '초5-6': 2, '중1-3': 3, '고선택': 4 }
      return (order[a] ?? 9) - (order[b] ?? 9)
    })
  }, [graphData])

  const listItems = useMemo(() => {
    if (!graphData) return []
    let items = graphData.nodes
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(n =>
        n.code?.toLowerCase().includes(q) || n.subject?.toLowerCase().includes(q) ||
        n.content?.toLowerCase().includes(q) || n.area?.toLowerCase().includes(q) ||
        n.grade_group?.toLowerCase().includes(q)
      )
    }
    if (selectedSubjects.size > 0) items = items.filter(n => selectedSubjects.has(n.subject_group || n.subject))
    if (selectedSchoolLevels.size > 0) items = items.filter(n => selectedSchoolLevels.has(n.school_level))
    if (selectedGradeGroups.size > 0) items = items.filter(n => selectedGradeGroups.has(n.grade_group))
    return [...items].sort((a, b) => a.subject.localeCompare(b.subject) || a.code.localeCompare(b.code))
  }, [graphData, searchQuery, selectedSubjects, selectedSchoolLevels, selectedGradeGroups])

  const linkCountMap = useMemo(() => {
    if (!graphData) return new Map()
    const map = new Map()
    graphData.links.forEach(l => {
      const srcId = getLinkSourceId(l)
      const tgtId = getLinkTargetId(l)
      if (nodeSubjectMap.get(srcId) !== nodeSubjectMap.get(tgtId)) {
        map.set(srcId, (map.get(srcId) || 0) + 1)
        map.set(tgtId, (map.get(tgtId) || 0) + 1)
      }
    })
    return map
  }, [graphData, nodeSubjectMap])

  // 노드별 연결 교과 매핑: "영역(교과1x교과2x...)" 형식 라벨 생성
  const nodeLabelMap = useMemo(() => {
    if (!graphData) return new Map()
    const map = new Map()
    // 각 노드의 교차 교과 연결 교과명 수집
    const connectedSubjects = new Map()
    graphData.links.forEach(l => {
      const srcId = getLinkSourceId(l)
      const tgtId = getLinkTargetId(l)
      const srcSubject = nodeSubjectMap.get(srcId)
      const tgtSubject = nodeSubjectMap.get(tgtId)
      if (srcSubject && tgtSubject && srcSubject !== tgtSubject) {
        if (!connectedSubjects.has(srcId)) connectedSubjects.set(srcId, new Set())
        if (!connectedSubjects.has(tgtId)) connectedSubjects.set(tgtId, new Set())
        connectedSubjects.get(srcId).add(tgtSubject)
        connectedSubjects.get(tgtId).add(srcSubject)
      }
    })
    graphData.nodes.forEach(node => {
      const connected = connectedSubjects.get(node.id)
      if (connected && connected.size > 0) {
        // 영역명을 키워드로 사용, 연결된 교과들 나열
        const keyword = node.area || node.subject
        const subjects = [...connected].sort().join('x')
        map.set(node.id, `${keyword}(${subjects})`)
      } else {
        map.set(node.id, node.area || node.subject)
      }
    })
    return map
  }, [graphData, nodeSubjectMap])

  // 노드로 카메라 이동 (항상 선택)
  const navigateToNode = useCallback((node) => {
    setSelectedNode(node)
    if (fgRef.current) {
      // 포스 시뮬레이션 후 실제 위치 사용
      const gd = fgRef.current.graphData?.() || filteredData
      const realNode = gd?.nodes?.find(n => n.id === node.id) || node
      const x = realNode.x ?? 0, y = realNode.y ?? 0, z = realNode.z ?? 0
      const dist = Math.hypot(x, y, z) || 1
      const ratio = 1 + 120 / dist
      fgRef.current.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, 1000)
    }
  }, [filteredData])

  const focusNode = useCallback((node) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
    if (fgRef.current) {
      const gd = fgRef.current.graphData?.() || filteredData
      const realNode = gd?.nodes?.find(n => n.id === node.id) || node
      const distance = 120
      const distRatio = 1 + distance / Math.hypot(realNode.x || 0, realNode.y || 0, realNode.z || 0)
      fgRef.current.cameraPosition(
        { x: (realNode.x || 0) * distRatio, y: (realNode.y || 0) * distRatio, z: (realNode.z || 0) * distRatio },
        realNode, 1000
      )
    }
  }, [filteredData])

  // 검색 결과 이전/다음 이동
  const goSearchPrev = useCallback(() => {
    if (sortedSearchResults.length === 0) return
    const idx = Math.max(0, searchIndex - 1)
    setSearchIndex(idx)
    navigateToNode(sortedSearchResults[idx])
  }, [sortedSearchResults, searchIndex, navigateToNode])

  const goSearchNext = useCallback(() => {
    if (sortedSearchResults.length === 0) return
    const idx = Math.min(sortedSearchResults.length - 1, searchIndex + 1)
    setSearchIndex(idx)
    navigateToNode(sortedSearchResults[idx])
  }, [sortedSearchResults, searchIndex, navigateToNode])

  const selectedLinks = useMemo(() => {
    if (!selectedNode || !graphData) return []
    return graphData.links.filter(l => {
      return getLinkSourceId(l) === selectedNode.id || getLinkTargetId(l) === selectedNode.id
    })
  }, [selectedNode, graphData])

  const handleReset = () => {
    setSelectedSubjects(new Set()); setSelectedSchoolLevels(new Set()); setSelectedGradeGroups(new Set()); setMinOverlap(2); setFilterLinkType(''); setSearchQuery(''); setFocusMode(false)
    setSelectedNode(null); setHighlightNodes(new Set()); setHighlightLinks(new Set())
    if (fgRef.current) {
      setTimeout(() => fgRef.current?.zoomToFit(800, 60), 300)
    }
  }

  // AI 채팅 전송
  const handleChatSend = async (e) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text || chatStreaming) return

    const userMsg = { role: 'user', content: text }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatStreaming(true)
    setChatStreamingText('')

    try {
      const res = await fetch(`${API_BASE}/api/standards/graph/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatMessages,
          context: {
            selectedNode: selectedNode ? {
              code: selectedNode.code, subject: selectedNode.subject,
              content: selectedNode.content, area: selectedNode.area,
            } : null,
            filterSubject: selectedSubjects.size > 0 ? [...selectedSubjects].join(', ') : null,
            neighborCodes: selectedNode ? selectedLinks.map(link => {
              const srcId = getLinkSourceId(link)
              const tgtId = getLinkTargetId(link)
              const otherId = srcId === selectedNode.id ? tgtId : srcId
              const other = graphData?.nodes.find(n => n.id === otherId)
              return other ? `${other.code}(${other.subject})` : null
            }).filter(Boolean) : [],
          },
        }),
      })

      if (!res.ok) {
        setChatStreaming(false)
        setChatMessages(prev => [...prev, { role: 'assistant', content: '오류가 발생했습니다.' }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'text') {
              fullText += parsed.content
              setChatStreamingText(prev => prev + parsed.content)
            } else if (parsed.type === 'new_links') {
              setSuggestedLinks(prev => [...prev, ...parsed.links])
            }
          } catch {}
        }
      }

      // 스트리밍 완료 → 메시지에 추가
      const cleanText = fullText
        .replace(/<new_links>\s*[\s\S]*?\s*<\/new_links>/g, '')
        .trim()
      if (cleanText) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: cleanText }])
      }
      setChatStreaming(false)
      setChatStreamingText('')
    } catch (err) {
      console.error('AI 채팅 오류:', err)
      setChatStreaming(false)
      setChatStreamingText('')
      setChatMessages(prev => [...prev, { role: 'assistant', content: '네트워크 오류가 발생했습니다.' }])
    }
  }

  // AI 추천 링크 추가
  const handleAddLink = async (link) => {
    const key = `${link.source}-${link.target}`
    if (addedLinks.has(key)) return
    try {
      await apiPost('/api/standards/graph/add-links', { links: [link] })
      setAddedLinks(prev => new Set([...prev, key]))
      await refreshGraph()
    } catch (e) {
      console.error('링크 추가 실패:', e)
    }
  }

  // 모든 추천 링크 한번에 추가
  const handleAddAllLinks = async () => {
    const toAdd = suggestedLinks.filter(l => !addedLinks.has(`${l.source}-${l.target}`))
    if (toAdd.length === 0) return
    try {
      await apiPost('/api/standards/graph/add-links', { links: toAdd })
      const newAdded = new Set(addedLinks)
      toAdd.forEach(l => newAdded.add(`${l.source}-${l.target}`))
      setAddedLinks(newAdded)
      await refreshGraph()
    } catch (e) {
      console.error('링크 일괄 추가 실패:', e)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-center text-gray-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">3D 교육과정 그래프 로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-center text-gray-400">
          <p className="text-3xl mb-2">🔗</p>
          <p className="text-sm">성취기준 데이터가 없습니다</p>
        </div>
      </div>
    )
  }

  const hasSearch = searchQuery.trim().length > 0
  const pendingLinks = suggestedLinks.filter(l => !addedLinks.has(`${l.source}-${l.target}`))

  return (
    <div className="flex h-full bg-gray-900">
      {/* 왼쪽: 3D 그래프 */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* 상단 툴바 */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 z-10 shrink-0">
          {!embedded && (
            <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} className="flex items-center gap-1.5 hover:opacity-80 transition shrink-0" title="메인으로">
              <Logo size={22} />
              <span className="hidden sm:inline text-sm font-bold text-gray-100">커리큘럼 위버</span>
            </a>
          )}
          <span className="text-gray-600 hidden sm:inline">|</span>
          <h2 className="text-sm font-medium text-gray-200 hidden sm:block">교과 간 연결 탐색</h2>
          <div className="flex items-center gap-1.5 ml-auto">
            {(selectedSubjects.size > 0 || selectedSchoolLevels.size > 0 || selectedGradeGroups.size > 0) && (
              <span className="flex items-center gap-1.5">
                {selectedSchoolLevels.size > 0 && (
                  <span className="px-2 py-1 bg-orange-900/60 text-orange-300 rounded-lg text-[11px] font-medium">
                    {[...selectedSchoolLevels].map(l => l.replace('학교', '')).join('·')}
                  </span>
                )}
                {selectedGradeGroups.size > 0 && (
                  <span className="px-2 py-1 bg-teal-900/60 text-teal-300 rounded-lg text-[11px] font-medium">
                    {[...selectedGradeGroups].join('·')}
                  </span>
                )}
                {selectedSubjects.size > 0 && (
                <span className="px-2 py-1 bg-blue-900/60 text-blue-300 rounded-lg text-[11px] font-medium">
                  <span className="sm:hidden">{selectedSubjects.size}개 교과</span>
                  <span className="hidden sm:inline">{[...selectedSubjects].join(' × ')}</span>
                </span>
                )}
                {selectedSubjects.size >= 3 && (
                  <span className="flex items-center bg-gray-700 rounded-lg overflow-hidden">
                    {Array.from({ length: selectedSubjects.size - 1 }, (_, i) => i + 2).map(n => (
                      <button key={n}
                        onClick={() => setMinOverlap(n)}
                        className={`px-1.5 py-1 text-[11px] font-bold transition ${
                          minOverlap === n
                            ? 'bg-amber-600 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-gray-600'
                        }`}
                        title={`${n}개 이상 과목이 교차하는 노드만 표시`}>
                        {n}{n < selectedSubjects.size ? '+' : ''}
                      </button>
                    ))}
                  </span>
                )}
              </span>
            )}
            <select value={filterLinkType} onChange={(e) => setFilterLinkType(e.target.value)}
              className="px-2 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 hidden sm:block">
              <option value="">전체 연결</option>
              {Object.entries(LINK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={() => setFocusMode(!focusMode)}
              className={`p-1.5 rounded-lg transition ${focusMode ? 'text-blue-400 bg-blue-900/50' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title={focusMode ? '포커스 모드 끄기' : '포커스 모드 (선택 노드 중심)'}>
              <Crosshair size={16} />
            </button>
            <button onClick={handleReset} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition" title="초기화">
              <RotateCcw size={16} />
            </button>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 ml-1">
              {focusMode && <span className="px-1.5 py-0.5 bg-blue-900/50 text-blue-400 rounded text-[10px]">포커스</span>}
              <span className="px-1.5 py-0.5 bg-gray-700 rounded">{filteredData?.nodes.length || 0} 노드</span>
              <span className="px-1.5 py-0.5 bg-gray-700 rounded">{filteredData?.links.length || 0} 연결</span>
            </div>
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
              title={sidebarOpen ? '패널 닫기' : '패널 열기'}>
              {sidebarOpen ? <X size={16} /> : <List size={16} />}
            </button>
          </div>
        </div>

        {/* 교과 범례 (멀티 셀렉트) */}
        <div className="flex gap-x-1 gap-y-0.5 px-3 py-1.5 bg-gray-800/80 border-b border-gray-700/50 text-[11px] z-10 shrink-0 overflow-x-auto">
          {subjects.map(s => {
            const isActive = selectedSubjects.has(s)
            return (
              <button key={s} onClick={() => toggleSubject(s)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition whitespace-nowrap ${
                  isActive
                    ? 'text-white font-bold ring-1 ring-white/40'
                    : selectedSubjects.size > 0
                      ? 'text-gray-600 hover:text-gray-300 hover:bg-gray-700'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }`}
                style={isActive ? { backgroundColor: SUBJECT_COLORS[s] + '33' } : undefined}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SUBJECT_COLORS[s] || '#9ca3af' }} />
                {SUBJECT_GROUP_LABELS[s] || s}
              </button>
            )
          })}
          <span className="text-gray-600 mx-1 shrink-0">|</span>
          {/* 학교급 필터 */}
          {schoolLevels.map(level => {
            const isActive = selectedSchoolLevels.has(level)
            const short = level.replace('학교', '')
            const levelColors = { '초등': '#f97316', '중': '#a855f7', '고등': '#22c55e' }
            const color = levelColors[short] || '#9ca3af'
            return (
              <button key={level} onClick={() => toggleSchoolLevel(level)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition whitespace-nowrap ${
                  isActive
                    ? 'text-white font-bold ring-1 ring-white/40'
                    : selectedSchoolLevels.size > 0
                      ? 'text-gray-600 hover:text-gray-300 hover:bg-gray-700'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }`}
                style={isActive ? { backgroundColor: color + '33' } : undefined}>
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                {short}
              </button>
            )
          })}
          <span className="text-gray-600 mx-1 shrink-0">|</span>
          {/* 학년군 필터 */}
          {gradeGroups.map(group => {
            const isActive = selectedGradeGroups.has(group)
            return (
              <button key={group} onClick={() => toggleGradeGroup(group)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-600/30 text-teal-300 font-bold ring-1 ring-teal-400/40'
                    : selectedGradeGroups.size > 0
                      ? 'text-gray-600 hover:text-gray-300 hover:bg-gray-700'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }`}>
                {group}
              </button>
            )
          })}
          <span className="text-gray-600 mx-1 shrink-0">|</span>
          {Object.entries(LINK_TYPE_LABELS).map(([k, v]) => (
            <button key={k} onClick={() => setFilterLinkType(prev => prev === k ? '' : k)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition whitespace-nowrap ${filterLinkType === k ? 'bg-gray-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}>
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: LINK_TYPE_COLORS[k] }} />
              {v}
            </button>
          ))}
        </div>

        {/* 3D 그래프 */}
        <div ref={containerRef} className="flex-1 relative min-h-0">
          {filteredData && filteredData.nodes.length > 0 ? (
            <ForceGraph3D
              ref={fgRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={filteredData}
              nodeId="id"
              nodeThreeObject={(node) => {
                const isNeighbor = filteredData?.neighborNodeIds?.has(node.id)
                const color = selectedNode?.id === node.id ? '#ffffff'
                  : (hasSearch && highlightNodes.size > 0 && !highlightNodes.has(node.id))
                    ? '#374151' : SUBJECT_COLORS[node.subject_group] || '#9ca3af'
                const count = linkCountMap.get(node.id) || 0
                // 노드 크기: 로그 스케일로 제한 (최소 2, 최대 10)
                const size = Math.min(10, 2 + Math.log2(count + 1) * 2)
                const isSelected = selectedNode?.id === node.id
                const nodeOpacity = isNeighbor ? 0.25 : 0.9

                // 구체
                const sphereGeo = new THREE.SphereGeometry(isSelected ? size * 1.5 : size)
                const sphereMat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: nodeOpacity })
                const sphere = new THREE.Mesh(sphereGeo, sphereMat)

                // 텍스트 라벨 (키워드 + 연결 교과)
                const canvas = document.createElement('canvas')
                const ctx = canvas.getContext('2d')
                const label = nodeLabelMap.get(node.id) || node.subject
                const labelLen = Math.max(label.length, 4)
                canvas.width = Math.min(512, labelLen * 22)
                canvas.height = 40
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                ctx.font = 'bold 18px sans-serif'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = color
                ctx.globalAlpha = isNeighbor ? 0.3 : 1.0
                ctx.fillText(label, canvas.width / 2, canvas.height / 2)

                const texture = new THREE.CanvasTexture(canvas)
                const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: nodeOpacity })
                const sprite = new THREE.Sprite(spriteMat)
                const spriteWidth = Math.min(32, labelLen * 1.8)
                sprite.scale.set(spriteWidth, 5, 1)
                sprite.position.set(0, size + 5, 0)

                const group = new THREE.Group()
                group.add(sphere)
                group.add(sprite)
                return group
              }}
              nodeLabel={(node) => `${node.code} (${node.subject})\n${node.content?.substring(0, 60)}...`}
              nodeOpacity={0.9}
              linkColor={(link) => {
                if (hasSearch && highlightLinks.size > 0) {
                  const idx = filteredData.links.indexOf(link)
                  return highlightLinks.has(idx) ? LINK_TYPE_COLORS[link.link_type] || '#6b7280' : '#1f2937'
                }
                return LINK_TYPE_COLORS[link.link_type] || '#6b7280'
              }}
              linkWidth={(link) => {
                if (hasSearch && highlightLinks.size > 0) {
                  const idx = filteredData.links.indexOf(link)
                  return highlightLinks.has(idx) ? 2.5 : 0.3
                }
                // 이웃 노드로 가는 확장 링크는 가늘게
                if (filteredData?.neighborNodeIds?.size > 0) {
                  const srcIsNeighbor = filteredData.neighborNodeIds.has(getLinkSourceId(link))
                  const tgtIsNeighbor = filteredData.neighborNodeIds.has(getLinkTargetId(link))
                  if (srcIsNeighbor || tgtIsNeighbor) return 0.6
                }
                return 1.5
              }}
              linkOpacity={0.6}
              linkDirectionalParticles={2}
              linkDirectionalParticleWidth={1.5}
              linkDirectionalParticleSpeed={0.005}
              linkLabel={(link) => {
                const src = typeof link.source === 'object' ? link.source : filteredData.nodes.find(n => n.id === link.source)
                const tgt = typeof link.target === 'object' ? link.target : filteredData.nodes.find(n => n.id === link.target)
                return `${src?.code || '?'} → ${LINK_TYPE_LABELS[link.link_type] || link.link_type} → ${tgt?.code || '?'}\n${link.rationale || ''}`
              }}
              onNodeClick={focusNode}
              onNodeHover={(node, prevNode) => {
                // 이전 호버된 이웃 노드 → 반투명 복원
                if (prevNode?.__threeObj && filteredData?.neighborNodeIds?.has(prevNode.id)) {
                  prevNode.__threeObj.children.forEach(child => {
                    if (child.material) child.material.opacity = 0.25
                  })
                }
                // 현재 호버된 이웃 노드 → 불투명 전환
                if (node?.__threeObj && filteredData?.neighborNodeIds?.has(node.id)) {
                  node.__threeObj.children.forEach(child => {
                    if (child.material) child.material.opacity = 0.9
                  })
                }
              }}
              onLinkHover={(link) => setHoveredLink(link || null)}
              backgroundColor="#111827"
              showNavInfo={false}
              cooldownTicks={200}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              onEngineStop={() => {
                // 시뮬레이션 완료 시 자동 줌 투 핏
                if (fgRef.current) {
                  fgRef.current.zoomToFit(400, 40)
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              필터 조건에 맞는 데이터가 없습니다
              <button onClick={handleReset} className="ml-2 text-blue-400 hover:underline">초기화</button>
            </div>
          )}
          {/* 링크 호버 인사이트 */}
          {hoveredLink && (() => {
            const src = typeof hoveredLink.source === 'object' ? hoveredLink.source : graphData.nodes.find(n => n.id === hoveredLink.source)
            const tgt = typeof hoveredLink.target === 'object' ? hoveredLink.target : graphData.nodes.find(n => n.id === hoveredLink.target)
            return (
              <div className="absolute bottom-12 left-3 right-3 sm:right-auto sm:max-w-sm bg-gray-800/95 border border-gray-600 rounded-lg p-3 z-10 pointer-events-none">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium"
                    style={{ backgroundColor: LINK_TYPE_COLORS[hoveredLink.link_type] || '#6b7280' }}>
                    {LINK_TYPE_LABELS[hoveredLink.link_type] || hoveredLink.link_type}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs mb-1.5">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SUBJECT_COLORS[src?.subject_group] || '#9ca3af' }} />
                    <span className="font-mono text-blue-400">{src?.code}</span>
                    <span className="text-gray-500">{src?.subject}</span>
                  </span>
                  <span className="text-gray-500">↔</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SUBJECT_COLORS[tgt?.subject_group] || '#9ca3af' }} />
                    <span className="font-mono text-blue-400">{tgt?.code}</span>
                    <span className="text-gray-500">{tgt?.subject}</span>
                  </span>
                </div>
                {hoveredLink.rationale && (
                  <p className="text-[11px] text-gray-300 leading-relaxed">{hoveredLink.rationale}</p>
                )}
              </div>
            )
          })()}
          <div className="absolute bottom-3 left-3 text-[10px] sm:text-[11px] text-gray-500 bg-gray-800/80 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg">
            <span className="hidden sm:inline">드래그: 회전 · 스크롤: 확대/축소 · 노드 클릭: 상세 · 상단 교과: 멀티 선택</span>
            <span className="sm:hidden">터치: 회전 · 핀치: 확대 · 탭: 상세 · 교과 탭: 멀티 선택</span>
          </div>
        </div>
      </div>

      {/* 모바일 사이드바 백드롭 */}
      {sidebarOpen && (
        <div
          className="sm:hidden fixed inset-0 bg-black/40 z-10"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 오른쪽 패널 */}
      <div className={`
        transition-all duration-200 border-l border-gray-700 bg-gray-800 flex flex-col overflow-hidden shrink-0
        ${sidebarOpen ? 'w-[85vw] sm:w-80 md:w-96' : 'w-0 border-l-0'}
        ${sidebarOpen ? 'fixed sm:relative right-0 top-0 bottom-0 z-20' : ''}
      `}>

        {/* 탭 헤더 */}
        <div className="flex border-b border-gray-700 shrink-0">
          <button onClick={() => setSidebarTab('guide')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition ${
              sidebarTab === 'guide' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-750' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <HelpCircle size={14} /> 가이드
          </button>
          <button onClick={() => setSidebarTab('list')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition ${
              sidebarTab === 'list' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-750' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <List size={14} /> 성취기준
          </button>
          <button onClick={() => setSidebarTab('chat')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition relative ${
              sidebarTab === 'chat' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-750' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <MessageCircle size={14} /> AI 탐색
            {pendingLinks.length > 0 && sidebarTab !== 'chat' && (
              <span className="absolute top-1.5 right-4 w-4 h-4 bg-amber-500 rounded-full text-[10px] text-white flex items-center justify-center">
                {pendingLinks.length}
              </span>
            )}
          </button>
        </div>

        {/* 가이드 탭 */}
        {sidebarTab === 'guide' && (
          <div className="flex-1 overflow-auto min-h-0 p-4 space-y-5 text-sm text-gray-300">
            {/* 사용 시나리오 */}
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">이렇게 활용해보세요</h3>
              <div className="space-y-2">
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="font-medium text-blue-300 text-xs mb-1">시나리오 1 — 융합 수업 교과 탐색</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    과학과 수학을 선택해서 두 교과가 어떤 성취기준으로 연결되는지 확인하고,
                    거기에 정보 교과를 추가해 3교과 융합의 허브 성취기준을 발견해보세요.
                  </p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="font-medium text-blue-300 text-xs mb-1">시나리오 2 — 주제 중심 연결 발견</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    검색창에 "기후변화", "데이터", "에너지" 같은 주제를 입력하면
                    관련 성취기준이 하이라이트돼요. 어떤 교과들이 연결되는지 한눈에 파악!
                  </p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="font-medium text-blue-300 text-xs mb-1">시나리오 3 — AI와 새 연결 발견</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    노드를 선택한 뒤 AI 탐색 탭에서 질문하면,
                    아직 그래프에 없는 새로운 교과 간 연결을 AI가 제안해줘요.
                  </p>
                </div>
              </div>
            </section>

            {/* 기능 사용 팁 */}
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">기능 사용 팁</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex gap-2 items-start">
                  <span className="shrink-0 w-5 h-5 rounded bg-blue-900/60 text-blue-300 flex items-center justify-center text-[10px] font-bold mt-0.5">1</span>
                  <div>
                    <p className="font-medium text-gray-200">교과 멀티 선택</p>
                    <p className="text-gray-500">상단 바에서 교과 버튼을 여러 개 눌러 조합의 교차 연결만 필터링</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="shrink-0 w-5 h-5 rounded bg-blue-900/60 text-blue-300 flex items-center justify-center text-[10px] font-bold mt-0.5">2</span>
                  <div>
                    <p className="font-medium text-gray-200">조합 수 조절</p>
                    <p className="text-gray-500">3개 이상 선택 시 2+/3+/N 버튼으로 허브 성취기준만 골라보기</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="shrink-0 w-5 h-5 rounded bg-blue-900/60 text-blue-300 flex items-center justify-center text-[10px] font-bold mt-0.5">3</span>
                  <div>
                    <p className="font-medium text-gray-200">포커스 모드</p>
                    <p className="text-gray-500">조준 버튼을 누르면 선택한 노드의 1홉 이웃만 집중 탐색</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="shrink-0 w-5 h-5 rounded bg-blue-900/60 text-blue-300 flex items-center justify-center text-[10px] font-bold mt-0.5">4</span>
                  <div>
                    <p className="font-medium text-gray-200">AI 탐색</p>
                    <p className="text-gray-500">선택한 과목·노드 맥락을 AI가 자동 파악, 새 연결을 추천</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 인사이트 기대 */}
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">이런 인사이트를 발견할 수 있어요</h3>
              <div className="space-y-1.5 text-xs text-gray-400">
                <p className="flex gap-1.5 items-start"><span className="text-amber-400 shrink-0">*</span> "이 과학 성취기준이 수학·정보 3과목에 걸쳐 연결되네!"</p>
                <p className="flex gap-1.5 items-start"><span className="text-amber-400 shrink-0">*</span> "기후변화 주제로 과학×사회×도덕 융합이 가능하겠다"</p>
                <p className="flex gap-1.5 items-start"><span className="text-amber-400 shrink-0">*</span> "데이터 분석이 수학·과학·정보·사회를 관통하는 핵심이구나"</p>
                <p className="flex gap-1.5 items-start"><span className="text-amber-400 shrink-0">*</span> "AI가 추천한 국어-과학 연결이 토론 수업에 딱이다!"</p>
              </div>
            </section>

            {/* 세션 만들기 CTA */}
            <section className="border-t border-gray-700 pt-4">
              <p className="text-xs text-gray-500 mb-2">탐색한 교과와 성취기준으로 바로 융합 수업 설계를 시작하세요.</p>
              <button
                onClick={() => {
                  const params = new URLSearchParams()
                  if (selectedSubjects.size > 0) params.set('subjects', [...selectedSubjects].join(','))
                  if (selectedNode) params.set('standard', selectedNode.code)
                  const url = params.toString() ? `/?${params}` : '/'
                  navigate?.(url)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
                <Sparkles size={16} />
                새 설계 세션 만들기
              </button>
            </section>
          </div>
        )}

        {/* 목록 탭 */}
        {sidebarTab === 'list' && (
          <>
            {/* 검색 */}
            <div className="p-3 border-b border-gray-700 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="코드, 교과, 내용, 영역 검색..."
                  className="w-full pl-8 pr-8 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>{listItems.length}개 성취기준</span>
                {searchQuery && sortedSearchResults.length > 0 ? (
                  <div className="flex items-center gap-1">
                    <button onClick={goSearchPrev} disabled={searchIndex <= 0}
                      className="p-0.5 rounded hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronLeft size={14} className="text-blue-400" />
                    </button>
                    <span className="text-blue-400 tabular-nums min-w-[3ch] text-center">{searchIndex + 1}/{sortedSearchResults.length}</span>
                    <button onClick={goSearchNext} disabled={searchIndex >= sortedSearchResults.length - 1}
                      className="p-0.5 rounded hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronRight size={14} className="text-blue-400" />
                    </button>
                  </div>
                ) : searchQuery ? (
                  <span className="text-gray-500">결과 없음</span>
                ) : null}
              </div>
            </div>

            {/* 목록 */}
            <div className="flex-1 overflow-auto min-h-0">
              {listItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {searchQuery ? '검색 결과가 없습니다' : '데이터 없음'}
                </div>
              ) : (
                <div className="divide-y divide-gray-700/50">
                  {listItems.map(node => {
                    const isSelected = selectedNode?.id === node.id
                    const count = linkCountMap.get(node.id) || 0
                    return (
                      <button key={node.id} onClick={() => focusNode(node)}
                        className={`w-full text-left px-3 py-2.5 transition group ${
                          isSelected ? 'bg-blue-900/40 border-l-2 border-blue-400' : 'hover:bg-gray-700/50 border-l-2 border-transparent'
                        }`}>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SUBJECT_COLORS[node.subject_group] || '#9ca3af' }} />
                          <span className="font-mono text-xs font-bold text-blue-400">{node.code}</span>
                          <span className="text-[10px] text-gray-500">{node.subject}</span>
                          {count > 0 && (
                            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-gray-500">
                              <Link2 size={10} />{count}
                            </span>
                          )}
                          <ChevronRight size={12} className={`text-gray-600 group-hover:text-gray-400 transition ${isSelected ? 'text-blue-400' : ''}`} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 pl-[18px]">{node.content}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* AI 채팅 탭 */}
        {sidebarTab === 'chat' && (
          <>
            {/* 채팅 메시지 영역 */}
            <div ref={chatScrollRef} className="flex-1 overflow-auto min-h-0 p-3 space-y-3">
              {chatMessages.length === 0 && !chatStreaming && (
                <div className="text-center text-gray-500 mt-8 space-y-2">
                  <MessageCircle size={24} className="mx-auto opacity-50" />
                  <p className="text-xs">AI에게 교과 간 연결을 질문하세요</p>
                  <div className="space-y-1.5 mt-4">
                    {['기후변화 주제로 융합 가능한 교과 연결을 찾아줘',
                      '수학과 과학의 새로운 연결을 추천해줘',
                      '아직 연결되지 않은 교과 간 융합 가능성을 분석해줘'
                    ].map((q, i) => (
                      <button key={i} onClick={() => { setChatInput(q); }}
                        className="w-full text-left px-3 py-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-700 text-gray-200 rounded-bl-sm'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm prose-invert max-w-none text-xs">
                        {msg.content}
                      </ReactMarkdown>
                    ) : msg.content}
                  </div>
                </div>
              ))}

              {/* 스트리밍 중 */}
              {chatStreaming && chatStreamingText && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] bg-gray-700 text-gray-200 rounded-xl rounded-bl-sm px-3 py-2 text-xs leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm prose-invert max-w-none text-xs">
                      {chatStreamingText.replace(/<new_links>[\s\S]*?<\/new_links>/g, '').replace(/<new_links[\s\S]*$/g, '').trim() || '...'}
                    </ReactMarkdown>
                    <span className="inline-block w-1 h-3 bg-blue-500 animate-pulse ml-0.5" />
                  </div>
                </div>
              )}
              {chatStreaming && !chatStreamingText && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 rounded-xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* AI 추천 링크 카드 */}
              {suggestedLinks.length > 0 && (
                <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-amber-300">AI 추천 연결 {suggestedLinks.length}개</p>
                    {pendingLinks.length > 0 && (
                      <button onClick={handleAddAllLinks}
                        className="flex items-center gap-1 px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-medium transition">
                        <Plus size={10} /> 모두 추가
                      </button>
                    )}
                  </div>
                  {suggestedLinks.map((link, i) => {
                    const key = `${link.source}-${link.target}`
                    const isAdded = addedLinks.has(key)
                    return (
                      <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${isAdded ? 'bg-green-900/30' : 'bg-gray-800/50'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="font-mono text-blue-400">{link.source}</span>
                            <span className="text-gray-500">↔</span>
                            <span className="font-mono text-blue-400">{link.target}</span>
                            <span className="px-1 py-0.5 rounded text-white text-[10px]"
                              style={{ backgroundColor: LINK_TYPE_COLORS[link.link_type] || '#6b7280' }}>
                              {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                            </span>
                          </div>
                          <p className="text-gray-400 mt-0.5">{link.rationale}</p>
                        </div>
                        <button
                          onClick={() => !isAdded && handleAddLink(link)}
                          disabled={isAdded}
                          className={`shrink-0 p-1.5 rounded transition ${
                            isAdded ? 'text-green-400' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                          }`}>
                          {isAdded ? <Check size={14} /> : <Plus size={14} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 입력 */}
            <form onSubmit={handleChatSend} className="border-t border-gray-700 p-2 flex gap-2 shrink-0">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                placeholder={chatStreaming ? 'AI 응답 중...' : '교과 간 연결을 질문하세요...'}
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="submit" disabled={chatStreaming || !chatInput.trim()}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
                <Send size={16} />
              </button>
            </form>
          </>
        )}

        {/* 선택된 노드 상세 */}
        {selectedNode && (
          <div className="border-t border-gray-700 p-3 shrink-0 max-h-[200px] overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-blue-400">{selectedNode.code}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                  style={{ backgroundColor: SUBJECT_COLORS[selectedNode.subject_group] || '#9ca3af' }}>
                  {selectedNode.subject}
                </span>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-gray-500 hover:text-gray-300 p-0.5">
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-1">{selectedNode.grade_group} · {selectedNode.area}</p>
            <p className="text-sm text-gray-300 mb-2">{selectedNode.content}</p>
            {selectedLinks.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 font-medium">연결 {selectedLinks.length}개</p>
                {selectedLinks.map((link, i) => {
                  const src = typeof link.source === 'object' ? link.source : graphData.nodes.find(n => n.id === link.source)
                  const tgt = typeof link.target === 'object' ? link.target : graphData.nodes.find(n => n.id === link.target)
                  const isSource = (src?.id || link.source) === selectedNode.id
                  const other = isSource ? tgt : src
                  return (
                    <button key={i} onClick={() => other && focusNode(other)}
                      className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 bg-gray-700/50 hover:bg-gray-700 rounded text-xs text-gray-300 transition">
                      <span className="text-gray-500 text-[10px]">{isSource ? '→' : '←'}</span>
                      <span className="px-1 py-0.5 rounded text-white text-[10px] shrink-0"
                        style={{ backgroundColor: LINK_TYPE_COLORS[link.link_type] || '#6b7280' }}>
                        {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                      </span>
                      <span className="font-mono text-blue-400 shrink-0">{other?.code}</span>
                      <span className="text-gray-500 truncate">{other?.subject}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 사이드바 토글 (데스크톱만) */}
      {!sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)}
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-5 h-12 bg-gray-700 hover:bg-gray-600 rounded-l-lg transition text-gray-400 hover:text-white">
          <ChevronRight size={14} className="rotate-180" />
        </button>
      )}
    </div>
  )
}
