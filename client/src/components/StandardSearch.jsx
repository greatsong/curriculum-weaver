import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, Check, X, BookMarked, Link2, ChevronDown, ChevronUp, FileText, AlertTriangle, Sparkles } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '../lib/api'
import { standardKey, projectStandardKey, codeFromKey } from '../lib/standardKey'
import { courseLabel, findSameTextAdded } from '../lib/standardCourse'
import MathText from './MathText'
import { useProjectStore } from '../stores/projectStore'
import { buildRecommendBoardContext, resolveRecommendScope, recommendBasisText } from '../lib/recommendContext'
import ExplorationContextBar from './ExplorationContextBar'
import Button from './ui/Button'

// 교과군(subject_group) 기준 색상 매핑
const SUBJECT_GROUP_COLORS = {
  '과학': 'bg-green-100 text-green-700 border-green-200',
  '수학': 'bg-blue-100 text-blue-700 border-blue-200',
  '국어': 'bg-red-100 text-red-700 border-red-200',
  '사회': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  '도덕': 'bg-orange-100 text-orange-700 border-orange-200',
  '기술·가정': 'bg-purple-100 text-purple-700 border-purple-200',
  '정보': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  '실과(기술·가정)/정보': 'bg-purple-100 text-purple-700 border-purple-200',
  '실과': 'bg-teal-100 text-teal-700 border-teal-200',
  '미술': 'bg-pink-100 text-pink-700 border-pink-200',
  '체육': 'bg-lime-100 text-lime-700 border-lime-200',
  '음악': 'bg-violet-100 text-violet-700 border-violet-200',
  '영어': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  '제2외국어': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  '한문': 'bg-teal-100 text-teal-700 border-teal-200',
}
// 개별 과목에서 교과군 색상을 가져오는 헬퍼
function getSubjectColor(std) {
  if (std.subject_group) return SUBJECT_GROUP_COLORS[std.subject_group] || 'bg-gray-100 text-gray-700 border-gray-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

const CATEGORY_COLORS = {
  '공통': 'bg-blue-50 text-blue-600',
  '일반선택': 'bg-green-50 text-green-600',
  '진로선택': 'bg-purple-50 text-purple-600',
  '융합선택': 'bg-orange-50 text-orange-600',
}

export default function StandardSearch({ sessionId, onClose }) {
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('')
  const [schoolLevel, setSchoolLevel] = useState('')
  const [domain, setDomain] = useState('')
  const [subjects, setSubjects] = useState([])
  const [schoolLevels, setSchoolLevels] = useState([])
  const [domains, setDomains] = useState([])
  const [results, setResults] = useState([])
  const [sessionStandards, setSessionStandards] = useState([])
  const [selectedStandard, setSelectedStandard] = useState(null)
  const [expandedStandard, setExpandedStandard] = useState(null)
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  // 같은 문장의 다른 과목 성취기준을 담았을 때 안내(레이아웃을 밀지 않게 창 아래에 띄운다)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 7000)
    return () => clearTimeout(t)
  }, [notice])
  // 담거나 뺀 뒤 위쪽 내용(추천 칸 등)이 바뀌어도, 방금 누른 카드가 화면에서 같은 위치에 남도록
  // 스크롤을 맞춘다. 예전에는 담는 순간 결과가 78px 밀려 연속 클릭이 다른 카드에 들어갔다(2026-10-03 제보).
  const scrollRef = useRef(null)
  const anchorRef = useRef(null) // { keys: [누른 카드 키, 다음 카드 키], top, until }
  const findStdEl = (box, key) => {
    if (!box || !key) return null
    const esc = typeof window !== 'undefined' && window.CSS?.escape ? window.CSS.escape(key) : String(key).replace(/["\\]/g, '\\$&')
    return box.querySelector(`[data-std-key="${esc}"]`)
  }
  const rememberAnchor = (key) => {
    const box = scrollRef.current
    const el = findStdEl(box, key)
    if (!box || !el) return
    const all = [...box.querySelectorAll('[data-std-key]')]
    const next = all[all.indexOf(el) + 1]?.getAttribute('data-std-key') || null
    anchorRef.current = { keys: [key, next].filter(Boolean), tops: [el.getBoundingClientRect().top, next ? findStdEl(box, next)?.getBoundingClientRect().top : null], until: Date.now() + 3000 }
  }
  useLayoutEffect(() => {
    const a = anchorRef.current
    const box = scrollRef.current
    if (!a || !box) return
    if (Date.now() > a.until) { anchorRef.current = null; return }
    for (let i = 0; i < a.keys.length; i++) {
      const el = findStdEl(box, a.keys[i])
      if (!el || a.tops[i] == null) continue
      const delta = el.getBoundingClientRect().top - a.tops[i]
      if (Math.abs(delta) >= 1) box.scrollTop += delta
      break
    }
  })
  const [searchMode, setSearchMode] = useState('keyword') // 'keyword' | 'semantic'
  const [aiActive, setAiActive] = useState(false)          // AI 융합 추천 결과 표시 중
  const [aiLoading, setAiLoading] = useState(false)
  const [aiBasis, setAiBasis] = useState('')              // AI 추천 근거 안내 문구
  const currentProject = useProjectStore((st) => st.currentProject)
  const [companions, setCompanions] = useState([])         // 융합 궁합 성취기준 (검증된 링크 기반)
  const [syncStatus, setSyncStatus] = useState('loading')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const writePending = useRef(false)
  const readVersion = useRef(0)
  const readOnly = currentProject?.id === sessionId && (currentProject.my_role === 'viewer' || ['simulation', 'generating', 'failed'].includes(currentProject.status) || currentProject.title?.startsWith('[시뮬레이션]'))

  // 에러 메시지 자동 사라짐 (4초)
  useEffect(() => {
    if (!errorMsg) return
    const t = setTimeout(() => setErrorMsg(''), 4000)
    return () => clearTimeout(t)
  }, [errorMsg])

  // 필터 옵션 로드
  useEffect(() => {
    apiGet('/api/standards/subjects').then(setSubjects).catch(() => {})
    apiGet('/api/standards/school-levels').then(setSchoolLevels).catch(() => {})
    apiGet('/api/standards/domains').then(setDomains).catch(() => {})
    loadSessionStandards()
  }, [sessionId])

  const loadSessionStandards = async () => {
    const version = ++readVersion.current
    setSyncStatus('loading')
    try {
      const data = await apiGet(`/api/standards/project/${sessionId}`)
      const rows = Array.isArray(data) ? data : data?.standards
      if (!Array.isArray(rows)) throw new Error('성취기준 목록 형식 오류')
      if (version !== readVersion.current) return
      setSessionStandards(rows)
      setSyncStatus('ready')
      setSaveError('')
    } catch {
      if (version === readVersion.current) setSyncStatus('error')
    }
  }

  // 융합 궁합 성취기준 로드 — 프로젝트 성취기준과 검증된 링크로 연결된 상대들.
  // 성취기준이 0개면 섹션 숨김, 로딩/에러도 조용히 처리(섹션 미표시).
  useEffect(() => {
    if (sessionStandards.length === 0) { setCompanions([]); return }
    let cancelled = false
    apiGet(`/api/standards/project/${sessionId}/companions`, { limit: 12 })
      .then((data) => {
        if (!cancelled) setCompanions(Array.isArray(data?.companions) ? data.companions : [])
      })
      .catch(() => { if (!cancelled) setCompanions([]) })
    return () => { cancelled = true }
  }, [sessionId, sessionStandards.length])

  // 검색 (디바운스) — 키워드 또는 의미(시맨틱) 모드
  const doSearch = useCallback(async () => {
    if (aiActive) return // AI 융합 추천 결과 표시 중에는 자동 검색하지 않음
    setLoading(true)
    try {
      let data
      if (searchMode === 'semantic') {
        if (!query) { setResults([]); return }
        try {
          data = await apiGet('/api/standards/semantic-search', { q: query })
        } catch {
          // 의미 검색이 비활성(서버에 임베딩/키 미설정)일 때 graceful degradation:
          // 키워드 모드로 자동 전환하고 안내. 화면이 깨지거나 빈 채로 멈추지 않게 한다.
          setSearchMode('keyword')
          setErrorMsg('의미 검색은 현재 사용할 수 없어 키워드 검색으로 전환했어요.')
          return
        }
      } else {
        const params = {}
        if (query) params.q = query
        if (subject) params.subject = subject
        if (schoolLevel) params.school_level = schoolLevel
        if (domain) params.domain = domain
        data = await apiGet('/api/standards/search', params)
      }
      setResults(Array.isArray(data) ? data : [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query, subject, schoolLevel, domain, searchMode, aiActive])

  useEffect(() => {
    const timer = setTimeout(doSearch, 300)
    return () => clearTimeout(timer)
  }, [doSearch])

  // AI 융합 추천 — 프로젝트 교과·학년과 팀 공통 비전·최종 선정 주제를 근거로 AI가 성취기준을 선별.
  // 서버(/recommend-ai)는 그대로 두고, 이미 있는 보드 목록 응답에서 근거만 골라 함께 보낸다.
  // 보드 읽기가 실패해도 교과·학년만으로 예전처럼 추천한다(추천은 목록 표시일 뿐, 담기는 교사가 직접).
  const runAiRecommend = async () => {
    const { subjects, grade } = resolveRecommendScope({ project: currentProject, sessionStandards })
    if (subjects.length < 1) {
      setErrorMsg('프로젝트에 교과 정보가 없어 추천할 수 없습니다. 성취기준을 하나 먼저 담으면 그 교과를 기준으로 추천합니다.')
      return
    }
    setAiLoading(true)
    setErrorMsg('')
    try {
      let boardContext = {}
      try {
        const data = await apiGet(`/api/projects/${sessionId}/designs`)
        boardContext = buildRecommendBoardContext(Array.isArray(data) ? data : data?.designs)
      } catch {
        boardContext = {}
      }
      const data = await apiPost('/api/standards/recommend-ai', {
        projectId: sessionId,
        subjects,
        grade,
        topic: query.trim() || boardContext.selectedTopic || '',
        boardContext,
      })
      const recs = data?.recommendations || []
      setResults(recs)
      setAiBasis(recommendBasisText(boardContext))
      setAiActive(true)
      if (recs.length === 0) setErrorMsg('AI가 추천할 성취기준을 찾지 못했습니다.')
    } catch (err) {
      setErrorMsg(err?.message || 'AI 추천에 실패했습니다.')
    } finally {
      setAiLoading(false)
    }
  }

  // 검색 입력/모드 변경 시 AI 추천 결과 종료
  const exitAiMode = () => { if (aiActive) setAiActive(false) }

  // 성취기준 추가/제거 — key(복합 키: 충돌 코드는 "code|과목") 기준. 검색 결과의 id는 휘발성이라 사용 불가.
  // 서버 요청(standard_code, DELETE 경로)에도 key를 보낸다 — 서버가 code/key 모두 해석하되 충돌 코드는 key여야 정확하다.
  // 낙관적 업데이트: 클릭 즉시 UI에 반영하고 서버 저장은 백그라운드로 처리(실패 시 롤백).
  const keyOf = projectStandardKey
  const addStandard = async (std) => {
    const key = standardKey(std)
    if (readOnly || writePending.current || !key || sessionStandards.some((s) => keyOf(s) === key)) return
    rememberAnchor(key)
    const sameText = findSameTextAdded(std, sessionStandards, keyOf, key)
    writePending.current = true
    readVersion.current += 1
    setSaving(true); setSaveError('')
    // 낙관적: 검색 결과 객체로 즉시 칩 추가
    const optimistic = { id: `temp-${key}`, standard_id: std.id, curriculum_standards: std, _optimistic: true }
    setSessionStandards((prev) => [...prev, optimistic])
    try {
      await apiPost(`/api/standards/project/${sessionId}`, { standard_code: key })
      await loadSessionStandards() // 서버에서 확인한 목록만 저장 완료로 표시한다.
      if (sameText) {
        setNotice(`문장이 같은 성취기준을 이미 담았습니다: ${sameText.code} ${courseLabel(sameText)}. 한 과목만 쓰려면 둘 중 하나를 뺍니다.`)
      }
    } catch (err) {
      setSessionStandards((prev) => prev.filter((s) => keyOf(s) !== key)) // 롤백
      setErrorMsg(err?.message || '성취기준 추가에 실패했습니다.')
      setSaveError('추가 결과 확인 필요 · 서버 저장 상태를 다시 확인해 주세요.')
    } finally {
      writePending.current = false; setSaving(false)
    }
  }

  const removeStandard = async (stdOrKey) => {
    if (readOnly || writePending.current) return
    writePending.current = true
    readVersion.current += 1
    setSaving(true); setSaveError('')
    const key = typeof stdOrKey === 'string' ? stdOrKey : standardKey(stdOrKey)
    rememberAnchor(key)
    const backup = sessionStandards
    setSessionStandards((prev) => prev.filter((s) => keyOf(s) !== key)) // 낙관적 제거
    try {
      await apiDelete(`/api/standards/project/${sessionId}/${encodeURIComponent(key)}`)
      await loadSessionStandards()
    } catch (err) {
      setSessionStandards(backup) // 롤백
      setErrorMsg(err?.message || '성취기준 제거에 실패했습니다.')
      setSaveError('제거 결과 확인 필요 · 서버 저장 상태를 다시 확인해 주세요.')
    } finally {
      writePending.current = false; setSaving(false)
    }
  }

  const isAdded = (key) => sessionStandards.some((s) => keyOf(s) === key)

  // key만 아는 경우(연결 보기 목록의 상대 성취기준 등)의 추가 —
  // 저장 API는 standard_code(key)만 필요하므로 최소 객체로 addStandard를 재사용한다.
  const addStandardByKey = (key, stdLike = null) => {
    if (!key || isAdded(key)) return
    addStandard(stdLike || { id: `key-${key}`, key, code: codeFromKey(key) })
  }

  // 같은 코드가 두 과목에 담긴 경우(충돌 코드) 칩에 과목명을 덧붙여 구분한다
  const duplicateCodes = (() => {
    const seen = new Map()
    for (const entry of sessionStandards) {
      const code = entry.curriculum_standards?.code ?? entry.code
      if (code) seen.set(code, (seen.get(code) || 0) + 1)
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([code]) => code))
  })()

  // 연결 보기
  const viewLinks = async (standard) => {
    setSelectedStandard(standard)
    const data = await apiGet(`/api/standards/${standard.id}/links`)
    setLinks(data || [])
  }

  // ProjectPage는 .work-shell(zoom:1.5)로 감싸져 있다. 이 모달이 그 안에서
  // fixed inset-0으로 렌더링되면 zoom이 중복 적용돼 뷰포트보다 커지고 상단이
  // 화면 밖으로 밀려난다(InteractiveTour와 동일한 원인). document.body로
  // 포탈해서 zoom 영향을 받지 않는 좌표계에서 렌더링한다.
  return createPortal(
    <div className="fixed inset-0 bg-black/40 sm:flex sm:items-center sm:justify-center z-50" onClick={onClose}>
      <div className="bg-white h-full sm:h-auto sm:rounded-xl sm:shadow-2xl w-full sm:max-w-3xl sm:max-h-[90vh] sm:mx-4 flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-200">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <BookMarked size={20} className="text-blue-600" />
            성취기준 탐색
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"><X size={20} /></button>
        </div>

        {/* 프로젝트 안 성취기준 탐색 — 탐색 화면과 같은 머리 줄 부품. 저장 상태는 서버 확인 결과로만 표시 */}
        <ExplorationContextBar icon={readOnly ? 'lock' : 'search'} label={null}
          target={`${currentProject?.id === sessionId ? currentProject.title : `프로젝트 ${sessionId}`} · 성취기준 탐색`}
          statusTone={saving ? 'info' : (saveError || syncStatus === 'error') ? 'warning' : 'neutral'}
          statusLabel={saving ? '변경 저장 중 · 완료 전' : saveError || (syncStatus === 'loading' ? '저장된 성취기준 확인 중' : syncStatus === 'error' ? '저장 상태 확인 실패 · 재확인 필요' : `프로젝트에 저장된 성취기준 ${sessionStandards.filter(s => !s._optimistic).length}개`)}
          actions={(syncStatus === 'error' || saveError) && !saving
            ? <Button variant="link" size="sm" onClick={loadSessionStandards}>저장 상태 다시 확인</Button>
            : null}
          note="검색·AI 추천 결과는 검토용입니다. 추가한 성취기준만 이 프로젝트에 저장되며, A-3 분석 보드는 별도로 검토·저장합니다.">
          {readOnly && <div>읽기 전용 · 검색과 비교만 가능하며 성취기준을 추가하거나 제거할 수 없습니다.</div>}
        </ExplorationContextBar>

        {/* 에러 배너 */}
        {errorMsg && (
          <div className="flex items-center gap-2 px-3 sm:px-5 py-2 bg-red-50 border-b border-red-100 text-red-600 text-sm">
            <AlertTriangle size={15} className="shrink-0" />
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="hover:opacity-70"><X size={15} /></button>
          </div>
        )}

        {/* 검색 필터 */}
        <div className="px-3 sm:px-5 py-3 border-b border-gray-100 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); exitAiMode() }}
                placeholder={searchMode === 'semantic' ? '의미로 검색 (예: 환경을 지키는 시민)...' : '성취기준 검색 (내용, 코드, 키워드, 해설)...'}
                className="w-full pl-10! pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체 교과</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* 검색 모드 토글 + AI 융합 추천 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => { setSearchMode('keyword'); exitAiMode() }}
                className={`px-3 py-1.5 text-xs font-medium transition ${searchMode === 'keyword' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                키워드
              </button>
              <button
                onClick={() => { setSearchMode('semantic'); exitAiMode() }}
                className={`px-3 py-1.5 text-xs font-medium transition border-l border-gray-200 ${searchMode === 'semantic' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                title="뜻이 비슷한 성취기준을 교과를 넘나들며 찾습니다"
              >
                의미 검색
              </button>
            </div>
            <button
              onClick={runAiRecommend}
              disabled={aiLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50 transition"
              title="프로젝트 교과와 팀 공통 비전·최종 선정 주제를 바탕으로 AI가 성취기준을 골라 이유와 함께 추천합니다"
            >
              <Sparkles size={13} />
              {aiLoading ? '추천 중…' : 'AI 융합 추천'}
            </button>
            {aiActive && (
              <button onClick={() => setAiActive(false)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 underline">
                검색으로 돌아가기
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={schoolLevel}
              onChange={(e) => setSchoolLevel(e.target.value)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체 학교급</option>
              {schoolLevels.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체 영역</option>
              {domains.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {(schoolLevel || domain) && (
              <button
                onClick={() => { setSchoolLevel(''); setDomain('') }}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 underline"
              >
                필터 초기화
              </button>
            )}
          </div>
        </div>

        {/* 담은 성취기준 — 스크롤 영역 밖의 고정 높이 줄. 담거나 빼도 아래 검색 결과가 움직이지 않는다 */}
        <div className="px-3 sm:px-5 py-2 border-b border-gray-100 bg-gray-50/60 h-[52px] shrink-0 flex items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-gray-600">담은 성취기준 {sessionStandards.length}</span>
          <div className="flex-1 min-w-0 overflow-x-auto flex items-center gap-2 whitespace-nowrap">
            {sessionStandards.length === 0 ? (
              <span className="text-xs text-gray-400">아직 없습니다. 검색 결과의 + 버튼으로 담습니다.</span>
            ) : sessionStandards.map((entry) => {
              const std = entry.curriculum_standards
              if (!std) return null
              const colorClass = getSubjectColor(std)
              const course = courseLabel(std)
              return (
                <span
                  // 담은 기준 행에는 id가 없다(project_id+standard_id 복합 키). 예전 entry.id는 늘 비어 key가 겹쳤다.
                  key={entry.standard_id || std.id || std.code}
                  title={[course, std.content].filter(Boolean).join(' · ')}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass}`}
                >
                  {std.code}
                  {entry._optimistic && <span> · 저장 확인 중</span>}
                  {(duplicateCodes.has(std.code) || course !== std.subject) && course && (
                    <span className="font-normal opacity-70">{course}</span>
                  )}
                  <button
                    disabled={saving || readOnly}
                    onClick={() => removeStandard(standardKey(std))}
                    className="ml-0.5 hover:opacity-70"
                    aria-label={`${std.code} 빼기`}
                  >
                    <X size={12} />
                  </button>
                </span>
              )
            })}
          </div>
        </div>

        {/* 같은 문장 안내 — 레이아웃을 밀지 않도록 창 아래에 떠 있게 둔다 */}
        {notice && (
          <div role="status" className="absolute left-1/2 -translate-x-1/2 bottom-20 z-10 w-[min(92%,560px)] flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs shadow-lg">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice('')} className="hover:opacity-70" aria-label="안내 닫기"><X size={13} /></button>
          </div>
        )}

        {/* 결과 */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-3 sm:p-5">
          {/* 융합 궁합이 좋은 성취기준 — 검색어가 없을 때, 검증된 링크 기반 추천 */}
          {!query.trim() && !aiActive && (() => {
            // 담은 카드는 지우지 않고 '담김'으로 표시한다. 지우면 아래 카드가 올라와 연속 클릭이 다른 카드에 들어간다.
            const visible = companions.filter((c) => c?.companion?.code)
            if (visible.length === 0) return null
            return (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-0.5">💞 융합 궁합이 좋은 성취기준</h3>
                <p className="text-xs text-gray-400 mb-2">이 프로젝트의 성취기준과 검증된 교과간 연결이 있는 성취기준입니다</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visible.map(({ companion, anchorCode, link }) => {
                    const colorClass = getSubjectColor(companion)
                    const companionKey = standardKey(companion)
                    const companionAdded = isAdded(companionKey)
                    const companionSame = !companionAdded && findSameTextAdded(companion, sessionStandards, keyOf, companionKey)
                    return (
                      <div key={`${anchorCode}-${companionKey}`} data-std-key={companionKey}
                        className="p-3 rounded-lg border border-pink-100 bg-pink-50/30 hover:border-pink-200 transition">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${colorClass}`}>{companion.code}</span>
                              <span className="text-xs text-gray-400">{courseLabel(companion)}{companion.grade_group ? ` · ${companion.grade_group}` : ''}</span>
                              {companionSame && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 border border-amber-200 text-amber-700">같은 문장 담음: {companionSame.code}</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-800 leading-relaxed line-clamp-2"><MathText text={companion.content} /></p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {link?.integration_theme && (
                                <span className="px-1.5 py-0.5 bg-violet-50 border border-violet-100 rounded text-xs text-violet-600">
                                  🔗 {link.integration_theme}
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500 font-mono">
                                {codeFromKey(anchorCode)}와 연결
                              </span>
                            </div>
                            {link?.lesson_hook && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-1">📝 {link.lesson_hook}</p>
                            )}
                          </div>
                          <button
                            disabled={saving || readOnly || companionAdded}
                            onClick={() => addStandard(companion)}
                            className={`shrink-0 p-2.5 sm:p-1.5 rounded-lg transition min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center ${companionAdded ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600'}`}
                            title={companionAdded ? '담김' : '프로젝트에 추가'}
                          >
                            {companionAdded ? <Check size={16} /> : <Plus size={16} />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* 검색 결과 */}
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">검색 중...</div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              {query || subject ? '검색 결과가 없습니다' : '검색어를 입력하거나 교과를 선택하세요'}
              {/* 키워드 검색은 성취기준 문장·키워드·해설만 찾는다. '논설문'처럼 교수·학습 유의사항에만 있는
                  낱말은 0건이 되므로 뜻으로 찾는 검색을 바로 고를 수 있게 한다(2026-10-05 리허설) */}
              {query && searchMode === 'keyword' && !aiActive && (
                <div className="mt-3">
                  <button
                    onClick={() => { setSearchMode('semantic'); exitAiMode() }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-blue-600 hover:bg-blue-50 transition"
                  >
                    의미 검색으로 찾기
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {aiActive ? (
                <div className="flex items-center gap-1.5 mb-3 text-xs text-violet-600 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                  <Sparkles size={13} className="shrink-0" />
                  <span>AI 추천 {results.length}개. {aiBasis || '프로젝트 교과와 융합 가능한 성취기준입니다.'} 카드에서 추천 이유를 확인할 수 있습니다.</span>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-3">{results.length}개 결과{searchMode === 'semantic' ? ' · 의미 검색' : ''}</p>
              )}
              {results.map((std) => {
                const colorClass = getSubjectColor(std)
                const catColor = CATEGORY_COLORS[std.curriculum_category] || ''
                const added = isAdded(standardKey(std))
                const isExpanded = expandedStandard === std.id
                const hasDetail = std.explanation || std.application_notes
                const isSecondary = std._matchField === 'secondary'
                const sameAdded = !added && findSameTextAdded(std, sessionStandards, keyOf, standardKey(std))
                return (
                  <div
                    key={std.id}
                    data-std-key={standardKey(std)}
                    className={`p-3 rounded-lg border transition ${
                      selectedStandard?.id === std.id ? 'border-blue-300 bg-blue-50/50'
                        : isSecondary ? 'border-gray-100 bg-gray-50/50 hover:border-gray-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3 cursor-pointer" onClick={() => viewLinks(std)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${colorClass}`}>
                            {std.code}
                          </span>
                          <span className="text-xs text-gray-400">{courseLabel(std)} · {std.grade_group}</span>
                          {sameAdded && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 border border-amber-200 text-amber-700">같은 문장 담음: {sameAdded.code}</span>
                          )}
                          {std.domain && <span className="text-xs text-gray-400">· {std.domain}</span>}
                          <span className="text-xs text-gray-400">· {std.area}</span>
                          {std.curriculum_category && std.curriculum_category !== '공통' && (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${catColor}`}>{std.curriculum_category}</span>
                          )}
                        </div>
                        <p className={`text-sm leading-relaxed ${isSecondary ? 'text-gray-500' : 'text-gray-800'}`}><MathText text={std.content} /></p>
                        {std._reason && (
                          <p className="mt-1 text-xs text-violet-600 flex items-start gap-1">
                            <Sparkles size={11} className="mt-0.5 shrink-0" />
                            <span>{std._reason}</span>
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {isSecondary && (
                            <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-600">
                              해설에서 매칭
                            </span>
                          )}
                          {/* 정본 49개 성취기준이 같은 키워드를 두 번 가진다 — 키워드만 key로 쓰면 React key 중복 */}
                          {std.keywords?.length > 0 && std.keywords.map((k, i) => (
                            <span key={`${i}-${k}`} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
                              {k}
                            </span>
                          ))}
                          {hasDetail && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedStandard(isExpanded ? null : std.id)
                              }}
                              className="ml-1 px-1.5 py-0.5 bg-blue-50 rounded text-xs text-blue-500 hover:bg-blue-100 flex items-center gap-0.5"
                            >
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              상세
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        disabled={saving || readOnly}
                        onClick={(e) => {
                          e.stopPropagation()
                          added ? removeStandard(std) : addStandard(std)
                        }}
                        className={`shrink-0 p-2.5 sm:p-1.5 rounded-lg transition min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center ${
                          added
                            ? 'bg-green-100 text-green-600 hover:bg-red-100 hover:text-red-600'
                            : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600'
                        }`}
                        title={added ? '제거' : '추가'}
                      >
                        {added ? <Check size={16} /> : <Plus size={16} />}
                      </button>
                    </div>

                    {/* 확장 상세보기 */}
                    {isExpanded && hasDetail && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                        {std.explanation && (
                          <div className="flex items-start gap-2">
                            <FileText size={14} className="text-blue-400 mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-semibold text-blue-600">해설</span>
                              <p className="text-xs text-gray-600 leading-relaxed mt-0.5 max-h-40 overflow-y-auto pr-1"><MathText text={std.explanation} /></p>
                            </div>
                          </div>
                        )}
                        {std.application_notes && (
                          <div className="flex items-start gap-2">
                            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                            <div>
                              <span className="text-xs font-semibold text-amber-600">적용 시 고려사항</span>
                              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{std.application_notes}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* 연결 정보 */}
          {selectedStandard && links.length > 0 && (
            <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
              <h4 className="text-sm font-semibold text-indigo-800 flex items-center gap-1 mb-2">
                <Link2 size={14} />
                {selectedStandard.code}의 교과간 연결 ({links.length})
              </h4>
              <div className="space-y-2">
                {links.map((link) => {
                  const isSource = link.source_id === selectedStandard.id
                  // 링크 끝점(source_code/target_code)은 서버가 key로 준다 — 표시는 code로
                  const otherKey = isSource ? link.target_code : link.source_code
                  const otherCode = codeFromKey(otherKey)
                  const otherAdded = isAdded(otherKey)
                  return (
                    <div key={link.id} className="flex items-center gap-2 text-xs">
                      <span className="px-1.5 py-0.5 bg-indigo-100 rounded font-medium text-indigo-700">
                        {link.link_type === 'cross_subject' ? '교과연계'
                          : link.link_type === 'same_concept' ? '동일개념'
                          : link.link_type === 'prerequisite' ? '선수학습'
                          : link.link_type === 'application' ? '적용'
                          : link.link_type}
                      </span>
                      <span className="font-mono text-indigo-600">{otherCode}</span>
                      <span className="text-gray-500 flex-1 min-w-0 truncate">{link.rationale}</span>
                      <button
                        onClick={() => addStandardByKey(otherKey)}
                        disabled={otherAdded || saving || readOnly}
                        className={`shrink-0 p-1 rounded transition flex items-center justify-center ${
                          otherAdded
                            ? 'text-green-500 cursor-default'
                            : 'text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700'
                        }`}
                        title={otherAdded ? '이미 프로젝트에 있음' : `${otherCode} 프로젝트에 추가`}
                      >
                        {otherAdded ? <Check size={13} /> : <Plus size={13} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 — + 버튼은 즉시 저장되며, 완료 버튼으로 탐색을 마칩니다 */}
        <div className="border-t border-gray-200 px-3 sm:px-5 py-3 flex items-center justify-between gap-3 shrink-0">
          <span className="text-sm text-gray-500">
            {sessionStandards.length > 0
              ? `${sessionStandards.length}개 성취기준 연결됨`
              : '성취기준을 추가하세요'}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition min-h-[44px]"
          >
            완료
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
