import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, X, ChevronRight, ChevronDown, ChevronUp,
  ArrowLeft, Home, Link2, Filter, BookOpen, Layers, ExternalLink, Sparkles, Loader2, RotateCcw
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiGet, API_BASE } from '../lib/api'
import Logo from '../components/Logo'
import { LINK_TYPES } from 'curriculum-weaver-shared/constants.js'

// 색상 매핑 (Graph3D와 동일)
const SUBJECT_COLORS = {
  '과학': '#22c55e', '수학': '#3b82f6', '국어': '#ef4444',
  '사회': '#eab308', '도덕': '#f97316',
  '기술·가정': '#a855f7', '정보': '#06b6d4',
  '실과(기술·가정)/정보': '#a855f7', '실과': '#14b8a6',
  '미술': '#ec4899', '체육': '#84cc16', '음악': '#8b5cf6',
  '영어': '#6366f1', '제2외국어': '#0891b2', '한문': '#14b8a6',
}

const LINK_TYPE_COLORS = {
  cross_subject: '#f59e0b', same_concept: '#3b82f6', prerequisite: '#ef4444',
  application: '#22c55e', extension: '#a855f7',
}

const LINK_TYPE_LABELS = {
  cross_subject: '교과연계', same_concept: '동일개념', prerequisite: '선수학습',
  application: '적용', extension: '확장',
}

export default function ExplorerPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // 데이터
  const [allStandards, setAllStandards] = useState([])
  const [allLinks, setAllLinks] = useState([])
  const [loading, setLoading] = useState(true)

  // UI 상태
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedStandard, setSelectedStandard] = useState(null)
  const [breadcrumb, setBreadcrumb] = useState([]) // 탐색 경로
  const [expandedTypes, setExpandedTypes] = useState(new Set(['cross_subject', 'same_concept']))
  const [filterSubject, setFilterSubject] = useState('') // 교과 필터
  const [filterLinkType, setFilterLinkType] = useState('') // 연결유형 필터
  const [showFilters, setShowFilters] = useState(false)

  // AI 내러티브 상태
  const [narrative, setNarrative] = useState('')
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [narrativeError, setNarrativeError] = useState('')
  const [showNarrative, setShowNarrative] = useState(false)
  const [narrativeForCode, setNarrativeForCode] = useState('') // 어떤 성취기준용인지

  // 데이터 로드
  useEffect(() => {
    async function load() {
      try {
        const graph = await apiGet('/api/standards/graph')
        setAllStandards(graph.nodes || [])
        setAllLinks(graph.links || [])

        // URL 파라미터에 code가 있으면 해당 성취기준 선택
        const codeParam = searchParams.get('code')
        if (codeParam && graph.nodes) {
          const found = graph.nodes.find(n => n.code === codeParam)
          if (found) {
            setSelectedStandard(found)
            setBreadcrumb([found])
          }
        }
      } catch (err) {
        console.error('데이터 로드 실패:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 교과 목록 (필터용)
  const subjectGroups = useMemo(() => {
    const groups = new Set(allStandards.map(s => s.subject_group).filter(Boolean))
    return [...groups].sort()
  }, [allStandards])

  // 검색
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const q = searchQuery.toLowerCase()
    const results = allStandards.filter(s =>
      s.code?.toLowerCase().includes(q) ||
      s.content?.toLowerCase().includes(q) ||
      s.subject?.toLowerCase().includes(q) ||
      s.area?.toLowerCase().includes(q)
    ).slice(0, 20)
    setSearchResults(results)
  }, [searchQuery, allStandards])

  // 현재 선택한 성취기준의 연결 (그룹별 정리)
  const connectionsByType = useMemo(() => {
    if (!selectedStandard) return {}

    const nodeId = selectedStandard.id
    const connected = allLinks.filter(l => {
      const sid = typeof l.source === 'object' ? l.source?.id : l.source
      const tid = typeof l.target === 'object' ? l.target?.id : l.target
      return sid === nodeId || tid === nodeId
    })

    // 그룹별로 정리
    const groups = {}
    for (const link of connected) {
      const sid = typeof link.source === 'object' ? link.source?.id : link.source
      const tid = typeof link.target === 'object' ? link.target?.id : link.target
      const neighborId = sid === nodeId ? tid : sid
      const neighbor = allStandards.find(s => s.id === neighborId)
      if (!neighbor) continue

      // 필터 적용
      if (filterSubject && neighbor.subject_group !== filterSubject) continue
      if (filterLinkType && link.link_type !== filterLinkType) continue

      const type = link.link_type || 'cross_subject'
      if (!groups[type]) groups[type] = []
      groups[type].push({ link, neighbor })
    }

    // 각 그룹 내에서 교과별 정렬
    for (const type of Object.keys(groups)) {
      groups[type].sort((a, b) => {
        const subCmp = (a.neighbor.subject_group || '').localeCompare(b.neighbor.subject_group || '')
        if (subCmp !== 0) return subCmp
        return (a.neighbor.code || '').localeCompare(b.neighbor.code || '')
      })
    }

    return groups
  }, [selectedStandard, allLinks, allStandards, filterSubject, filterLinkType])

  // 전체 연결 수
  const totalConnections = useMemo(() =>
    Object.values(connectionsByType).reduce((sum, arr) => sum + arr.length, 0),
    [connectionsByType]
  )

  // 연결된 교과 통계
  const subjectStats = useMemo(() => {
    const stats = {}
    for (const items of Object.values(connectionsByType)) {
      for (const { neighbor } of items) {
        const sg = neighbor.subject_group || '기타'
        stats[sg] = (stats[sg] || 0) + 1
      }
    }
    return Object.entries(stats).sort((a, b) => b[1] - a[1])
  }, [connectionsByType])

  // 성취기준 선택 (드릴다운)
  const selectStandard = useCallback((standard) => {
    setSelectedStandard(standard)
    setBreadcrumb(prev => {
      // 이미 breadcrumb에 있으면 그 지점까지 자르기
      const idx = prev.findIndex(s => s.id === standard.id)
      if (idx >= 0) return prev.slice(0, idx + 1)
      return [...prev, standard]
    })
    setSearchQuery('')
    setSearchResults([])
    setSearchParams({ code: standard.code })
    // 아코디언 초기화
    setExpandedTypes(new Set(['cross_subject', 'same_concept']))
    // 내러티브 초기화 (다른 성취기준으로 이동 시)
    setShowNarrative(false)
    setNarrative('')
    setNarrativeError('')
  }, [setSearchParams])

  // 브레드크럼 네비게이션
  const navigateBreadcrumb = useCallback((index) => {
    const target = breadcrumb[index]
    setSelectedStandard(target)
    setBreadcrumb(prev => prev.slice(0, index + 1))
    setSearchParams({ code: target.code })
  }, [breadcrumb, setSearchParams])

  // 아코디언 토글
  const toggleType = useCallback((type) => {
    setExpandedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  // AI 내러티브 생성
  const generateNarrative = useCallback(async () => {
    if (!selectedStandard || narrativeLoading) return

    setNarrativeLoading(true)
    setNarrativeError('')
    setNarrative('')
    setShowNarrative(true)
    setNarrativeForCode(selectedStandard.code)

    // 현재 연결 정보 수집
    const connections = []
    for (const [type, items] of Object.entries(connectionsByType)) {
      for (const { link, neighbor } of items) {
        connections.push({
          neighborCode: neighbor.code,
          subjectGroup: neighbor.subject_group,
          linkType: type,
          rationale: link.rationale || '',
        })
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/standards/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          standardCode: selectedStandard.code,
          connections,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setNarrativeError(err.error || '알 수 없는 오류')
        setNarrativeLoading(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') {
            setNarrativeLoading(false)
            return
          }
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'text') {
              setNarrative(prev => prev + parsed.content)
            } else if (parsed.type === 'error') {
              setNarrativeError(parsed.message)
            }
          } catch {
            // 파싱 실패 무시
          }
        }
      }
      setNarrativeLoading(false)
    } catch (err) {
      setNarrativeError('네트워크 연결을 확인해주세요.')
      setNarrativeLoading(false)
    }
  }, [selectedStandard, connectionsByType, narrativeLoading])

  // 타입 순서 정의
  const typeOrder = ['cross_subject', 'same_concept', 'prerequisite', 'application', 'extension']

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Logo size={48} className="mx-auto mb-4 animate-pulse" />
          <p className="text-gray-500">교육과정 데이터 로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-violet-50/20">
      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            title="대시보드로"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shrink-0">
              <BookOpen size={15} className="text-white" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 truncate">교육과정 연계 탐색기</h1>
          </div>
          <button
            onClick={() => navigate('/graph')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
          >
            <Layers size={14} />
            3D 그래프
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* 검색 영역 */}
        <div className="mb-6">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="성취기준 코드, 내용, 교과명으로 검색 (예: 과학, [4과11-03], 생태계)"
              className="w-full pl-10 pr-10 py-3 bg-white/90 backdrop-blur border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white text-sm"
              autoFocus={!selectedStandard}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* 검색 결과 드롭다운 */}
          {searchResults.length > 0 && (
            <div className="mt-1 bg-white/95 backdrop-blur-lg border border-gray-200/60 rounded-xl shadow-lg max-h-80 overflow-auto">
              {searchResults.map(s => (
                <button
                  key={s.id}
                  onClick={() => selectStandard(s)}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition text-left border-b border-gray-100 last:border-0"
                >
                  <span
                    className="px-2 py-0.5 text-xs font-bold text-white rounded shrink-0 mt-0.5"
                    style={{ backgroundColor: SUBJECT_COLORS[s.subject_group] || '#6b7280' }}
                  >
                    {s.subject_group}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono font-bold text-blue-700">{s.code}</p>
                    <p className="text-sm text-gray-700 line-clamp-2">{s.content}</p>
                    {s.area && <p className="text-xs text-gray-400 mt-0.5">{s.area}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 선택 전 안내 */}
        {!selectedStandard && searchResults.length === 0 && (
          <div className="text-center py-16 bg-white/50 backdrop-blur rounded-2xl border border-gray-100 mt-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center">
              <BookOpen size={28} className="text-blue-500" />
            </div>
            <p className="text-gray-600 mb-1 font-medium">탐색할 성취기준을 검색하세요</p>
            <p className="text-sm text-gray-400">
              성취기준을 선택하면 교과 간 연계를 아코디언 형태로 탐색할 수 있습니다
            </p>
            {/* 인기 검색 */}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {['과학', '수학', '국어', '사회', '정보', '미술'].map(subject => (
                <button
                  key={subject}
                  onClick={() => setSearchQuery(subject)}
                  className="px-3 py-1.5 text-sm rounded-full border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition"
                  style={{ color: SUBJECT_COLORS[subject] || '#6b7280' }}
                >
                  {subject}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 선택된 성취기준 탐색 */}
        {selectedStandard && (
          <div className="space-y-4">
            {/* 브레드크럼 */}
            {breadcrumb.length > 0 && (
              <nav className="flex items-center gap-1 text-sm overflow-x-auto pb-1">
                <button
                  onClick={() => {
                    setSelectedStandard(null)
                    setBreadcrumb([])
                    setSearchParams({})
                  }}
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition shrink-0"
                >
                  <Home size={14} />
                </button>
                {breadcrumb.map((item, i) => (
                  <span key={item.id} className="flex items-center gap-1 shrink-0">
                    <ChevronRight size={14} className="text-gray-300" />
                    <button
                      onClick={() => navigateBreadcrumb(i)}
                      className={`px-2 py-0.5 rounded transition whitespace-nowrap ${
                        i === breadcrumb.length - 1
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      {item.code}
                    </button>
                  </span>
                ))}
              </nav>
            )}

            {/* 선택 성취기준 카드 */}
            <div
              className="bg-white/90 backdrop-blur rounded-xl border-l-4 p-5 shadow-sm ring-1 ring-gray-100"
              style={{ borderLeftColor: SUBJECT_COLORS[selectedStandard.subject_group] || '#6b7280' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-lg font-mono font-bold text-gray-900">{selectedStandard.code}</span>
                    <span
                      className="px-2 py-0.5 text-xs font-bold text-white rounded"
                      style={{ backgroundColor: SUBJECT_COLORS[selectedStandard.subject_group] || '#6b7280' }}
                    >
                      {selectedStandard.subject_group}
                    </span>
                    {selectedStandard.grade_group && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                        {selectedStandard.grade_group}
                      </span>
                    )}
                    {selectedStandard.school_level && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                        {selectedStandard.school_level}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-800 leading-relaxed">{selectedStandard.content}</p>
                  {selectedStandard.area && (
                    <p className="text-sm text-gray-500 mt-1">영역: {selectedStandard.area}</p>
                  )}
                  {selectedStandard.explanation && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-3">{selectedStandard.explanation}</p>
                  )}
                </div>
                <button
                  onClick={() => navigate(`/graph?focus=${selectedStandard.code}`)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition shrink-0"
                  title="3D 그래프에서 보기"
                >
                  <ExternalLink size={18} />
                </button>
              </div>

              {/* 연결 통계 */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link2 size={14} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">
                    연결 {totalConnections}개
                  </span>
                  <span className="text-gray-300">|</span>
                  {subjectStats.map(([subject, count]) => (
                    <span
                      key={subject}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${SUBJECT_COLORS[subject] || '#6b7280'}15`,
                        color: SUBJECT_COLORS[subject] || '#6b7280'
                      }}
                    >
                      {subject} {count}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 필터 바 */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition ${
                  showFilters || filterSubject || filterLinkType
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Filter size={14} />
                필터
                {(filterSubject || filterLinkType) && (
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </button>

              {/* 유형별 펼치기/접기 */}
              <button
                onClick={() => setExpandedTypes(new Set(typeOrder))}
                className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition"
              >
                모두 펼치기
              </button>
              <button
                onClick={() => setExpandedTypes(new Set())}
                className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition"
              >
                모두 접기
              </button>
            </div>

            {/* 필터 패널 */}
            {showFilters && (
              <div className="bg-white/80 backdrop-blur rounded-xl border border-gray-200/60 p-4 space-y-3 shadow-sm">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">교과 필터</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setFilterSubject('')}
                      className={`px-2.5 py-1 text-xs rounded-full transition ${
                        !filterSubject ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      전체
                    </button>
                    {subjectGroups.map(sg => (
                      <button
                        key={sg}
                        onClick={() => setFilterSubject(filterSubject === sg ? '' : sg)}
                        className={`px-2.5 py-1 text-xs rounded-full transition ${
                          filterSubject === sg
                            ? 'text-white'
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                        style={filterSubject === sg ? { backgroundColor: SUBJECT_COLORS[sg] || '#6b7280' } : { color: SUBJECT_COLORS[sg] || '#6b7280' }}
                      >
                        {sg}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">연결 유형</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setFilterLinkType('')}
                      className={`px-2.5 py-1 text-xs rounded-full transition ${
                        !filterLinkType ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      전체
                    </button>
                    {typeOrder.map(type => (
                      <button
                        key={type}
                        onClick={() => setFilterLinkType(filterLinkType === type ? '' : type)}
                        className={`px-2.5 py-1 text-xs rounded-full transition ${
                          filterLinkType === type
                            ? 'text-white'
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                        style={filterLinkType === type ? { backgroundColor: LINK_TYPE_COLORS[type] } : { color: LINK_TYPE_COLORS[type] }}
                      >
                        {LINK_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>
                {(filterSubject || filterLinkType) && (
                  <button
                    onClick={() => { setFilterSubject(''); setFilterLinkType('') }}
                    className="text-xs text-red-500 hover:text-red-700 transition"
                  >
                    필터 초기화
                  </button>
                )}
              </div>
            )}

            {/* 연결 유형별 아코디언 */}
            <div className="space-y-2">
              {typeOrder.map(type => {
                const items = connectionsByType[type]
                if (!items || items.length === 0) return null
                const isExpanded = expandedTypes.has(type)

                // 교과별 서브그룹
                const bySubject = {}
                for (const item of items) {
                  const sg = item.neighbor.subject_group || '기타'
                  if (!bySubject[sg]) bySubject[sg] = []
                  bySubject[sg].push(item)
                }

                return (
                  <div key={type} className="bg-white/90 backdrop-blur rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
                    {/* 아코디언 헤더 */}
                    <button
                      onClick={() => toggleType(type)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left"
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: LINK_TYPE_COLORS[type] }}
                      />
                      <span className="font-medium text-gray-900 flex-1">
                        {LINK_TYPE_LABELS[type] || type}
                      </span>
                      <span
                        className="px-2 py-0.5 text-xs font-bold rounded-full"
                        style={{
                          backgroundColor: `${LINK_TYPE_COLORS[type]}20`,
                          color: LINK_TYPE_COLORS[type]
                        }}
                      >
                        {items.length}
                      </span>
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </button>

                    {/* 아코디언 내용 */}
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        {Object.entries(bySubject).map(([subject, subItems]) => (
                          <div key={subject}>
                            {/* 교과 소제목 (2개 이상 교과일 때만) */}
                            {Object.keys(bySubject).length > 1 && (
                              <div
                                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5"
                                style={{
                                  backgroundColor: `${SUBJECT_COLORS[subject] || '#6b7280'}08`,
                                  color: SUBJECT_COLORS[subject] || '#6b7280'
                                }}
                              >
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: SUBJECT_COLORS[subject] || '#6b7280' }}
                                />
                                {subject} ({subItems.length})
                              </div>
                            )}

                            {/* 연결 항목 */}
                            {subItems.map(({ link, neighbor }) => (
                              <button
                                key={neighbor.id}
                                onClick={() => selectStandard(neighbor)}
                                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition text-left border-b border-gray-50 last:border-0 group"
                              >
                                <span
                                  className="w-1 self-stretch rounded-full shrink-0 mt-1"
                                  style={{ backgroundColor: SUBJECT_COLORS[neighbor.subject_group] || '#6b7280' }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                    <span className="text-sm font-mono font-bold text-blue-700 group-hover:text-blue-800">
                                      {neighbor.code}
                                    </span>
                                    <span
                                      className="px-1.5 py-0.5 text-[10px] font-bold text-white rounded"
                                      style={{ backgroundColor: SUBJECT_COLORS[neighbor.subject_group] || '#6b7280' }}
                                    >
                                      {neighbor.subject_group}
                                    </span>
                                    {neighbor.grade_group && (
                                      <span className="text-[10px] text-gray-400">{neighbor.grade_group}</span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed">
                                    {neighbor.content}
                                  </p>
                                  {link.rationale && (
                                    <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                                      <span className="shrink-0">💡</span>
                                      <span className="line-clamp-2">{link.rationale}</span>
                                    </p>
                                  )}
                                </div>
                                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 mt-1 shrink-0 transition" />
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 연결 없음 */}
            {totalConnections === 0 && (
              <div className="text-center py-8 bg-white/80 rounded-xl border border-gray-200/60">
                <Link2 size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-gray-500">
                  {filterSubject || filterLinkType
                    ? '필터 조건에 맞는 연결이 없습니다'
                    : '이 성취기준에 연결된 항목이 없습니다'}
                </p>
              </div>
            )}

            {/* AI 내러티브 섹션 */}
            {totalConnections > 0 && (
              <div className="bg-white/90 backdrop-blur rounded-xl border border-violet-200/60 shadow-sm overflow-hidden">
                {/* 내러티브 헤더 / 생성 버튼 */}
                {!showNarrative ? (
                  <button
                    onClick={generateNarrative}
                    disabled={narrativeLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-50 to-blue-50 hover:from-violet-100 hover:to-blue-100 transition text-sm font-medium text-violet-700 border-b border-gray-100"
                  >
                    <Sparkles size={16} />
                    AI 융합 수업 내러티브 생성
                  </button>
                ) : (
                  <div>
                    {/* 내러티브 헤더 바 */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-violet-50 to-blue-50 border-b border-gray-100">
                      <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                        <Sparkles size={16} />
                        AI 융합 수업 내러티브
                        {narrativeForCode && (
                          <span className="text-xs text-violet-500 font-normal">({narrativeForCode})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!narrativeLoading && (
                          <button
                            onClick={generateNarrative}
                            className="p-1 text-violet-400 hover:text-violet-700 hover:bg-violet-100 rounded transition"
                            title="다시 생성"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setShowNarrative(false)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition"
                          title="닫기"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    {/* 내러티브 내용 */}
                    <div className="px-5 py-4">
                      {narrativeLoading && !narrative && (
                        <div className="flex items-center gap-2 text-sm text-violet-500 py-4 justify-center">
                          <Loader2 size={16} className="animate-spin" />
                          AI가 연결을 분석하고 있습니다...
                        </div>
                      )}

                      {narrative && (
                        <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:mt-4 prose-headings:mb-2 prose-p:text-gray-700 prose-p:leading-relaxed prose-li:text-gray-700 prose-strong:text-gray-900 prose-code:text-violet-700 prose-code:bg-violet-50 prose-code:px-1 prose-code:rounded">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {narrative}
                          </ReactMarkdown>
                          {narrativeLoading && (
                            <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse rounded-sm ml-0.5" />
                          )}
                        </div>
                      )}

                      {narrativeError && (
                        <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-2">
                          {narrativeError}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 통계 (하단) */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-400 text-center">
            교육과정 성취기준 {allStandards.length}개 · 연결 {allLinks.length}개
          </p>
        </div>
      </main>
    </div>
  )
}
