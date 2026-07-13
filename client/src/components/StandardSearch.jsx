import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, Check, X, BookMarked, Link2, ChevronDown, ChevronUp, FileText, AlertTriangle, Sparkles } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '../lib/api'
import MathText from './MathText'

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
  const [searchMode, setSearchMode] = useState('keyword') // 'keyword' | 'semantic'
  const [aiActive, setAiActive] = useState(false)          // AI 융합 추천 결과 표시 중
  const [aiLoading, setAiLoading] = useState(false)
  const [companions, setCompanions] = useState([])         // 융합 궁합 성취기준 (검증된 링크 기반)

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
    const data = await apiGet(`/api/standards/project/${sessionId}`)
    setSessionStandards(Array.isArray(data) ? data : (data?.standards ?? []))
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

  // AI 융합 추천 — 연결된 성취기준의 교과/학년을 바탕으로 융합 가능한 성취기준을 AI가 선별
  const runAiRecommend = async () => {
    const groups = [...new Set(
      sessionStandards
        .map((s) => { const std = s.curriculum_standards || s; return std.subject_group || std.subject })
        .filter(Boolean)
    )]
    if (groups.length < 1) {
      setErrorMsg('먼저 교과 성취기준을 1개 이상 추가하면, 그와 융합 가능한 성취기준을 AI가 추천합니다.')
      return
    }
    // 가장 많이 쓰인 학년군을 대표 학년으로 사용
    const grades = sessionStandards.map((s) => (s.curriculum_standards || s).grade_group).filter(Boolean)
    const grade = grades.length
      ? [...grades].sort((a, b) => grades.filter((g) => g === b).length - grades.filter((g) => g === a).length)[0]
      : ''
    setAiLoading(true)
    setErrorMsg('')
    try {
      const data = await apiPost('/api/standards/recommend-ai', {
        projectId: sessionId, subjects: groups, grade, topic: query || '',
      })
      const recs = data?.recommendations || []
      setResults(recs)
      setAiActive(true)
      if (recs.length === 0) setErrorMsg('AI가 추천할 추가 성취기준을 찾지 못했습니다.')
    } catch (err) {
      setErrorMsg(err?.message || 'AI 추천에 실패했습니다.')
    } finally {
      setAiLoading(false)
    }
  }

  // 검색 입력/모드 변경 시 AI 추천 결과 종료
  const exitAiMode = () => { if (aiActive) setAiActive(false) }

  // 성취기준 추가/제거 — code(자연키) 기준. 검색 결과의 id는 휘발성이라 사용 불가.
  // 낙관적 업데이트: 클릭 즉시 UI에 반영하고 서버 저장은 백그라운드로 처리(실패 시 롤백).
  const codeOf = (entry) => entry?.curriculum_standards?.code ?? entry?.code
  const addStandard = async (std) => {
    const code = std.code
    if (sessionStandards.some((s) => codeOf(s) === code)) return
    // 낙관적: 검색 결과 객체로 즉시 칩 추가
    const optimistic = { id: `temp-${code}`, standard_id: std.id, curriculum_standards: std, _optimistic: true }
    setSessionStandards((prev) => [...prev, optimistic])
    try {
      await apiPost(`/api/standards/project/${sessionId}`, { standard_code: code })
      loadSessionStandards() // 백그라운드 동기화(실제 id 등)
    } catch (err) {
      setSessionStandards((prev) => prev.filter((s) => codeOf(s) !== code)) // 롤백
      setErrorMsg(err?.message || '성취기준 추가에 실패했습니다.')
    }
  }

  const removeStandard = async (stdOrCode) => {
    const code = typeof stdOrCode === 'string' ? stdOrCode : stdOrCode.code
    const backup = sessionStandards
    setSessionStandards((prev) => prev.filter((s) => codeOf(s) !== code)) // 낙관적 제거
    try {
      await apiDelete(`/api/standards/project/${sessionId}/${encodeURIComponent(code)}`)
      loadSessionStandards()
    } catch (err) {
      setSessionStandards(backup) // 롤백
      setErrorMsg(err?.message || '성취기준 제거에 실패했습니다.')
    }
  }

  const isAdded = (standardCode) =>
    sessionStandards.some((s) => (s.curriculum_standards?.code ?? s.code) === standardCode)

  // code만 아는 경우(연결 보기 목록의 상대 성취기준 등)의 추가 —
  // 저장 API는 standard_code만 필요하므로 최소 객체로 addStandard를 재사용한다.
  const addStandardByCode = (code, stdLike = null) => {
    if (!code || isAdded(code)) return
    addStandard(stdLike || { id: `code-${code}`, code })
  }

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
      <div className="bg-white h-full sm:h-auto sm:rounded-xl sm:shadow-2xl w-full sm:max-w-3xl sm:max-h-[90vh] sm:mx-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-200">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <BookMarked size={20} className="text-blue-600" />
            성취기준 탐색
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"><X size={20} /></button>
        </div>

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
              title="연결된 성취기준과 융합 가능한 성취기준을 AI가 선별해 이유와 함께 추천합니다"
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

        {/* 결과 */}
        <div className="flex-1 overflow-auto p-3 sm:p-5">
          {/* 프로젝트에 추가된 성취기준 */}
          {sessionStandards.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">이 프로젝트에 연결된 성취기준 ({sessionStandards.length})</h3>
              <div className="flex flex-wrap gap-2">
                {sessionStandards.map((entry) => {
                  const std = entry.curriculum_standards
                  if (!std) return null
                  const colorClass = getSubjectColor(std)
                  return (
                    <span
                      key={entry.id}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass}`}
                    >
                      {std.code}
                      <button
                        onClick={() => removeStandard(std.code)}
                        className="ml-0.5 hover:opacity-70"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* 융합 궁합이 좋은 성취기준 — 검색어가 없을 때, 검증된 링크 기반 추천 */}
          {!query.trim() && !aiActive && (() => {
            const visible = companions.filter((c) => c?.companion?.code && !isAdded(c.companion.code))
            if (visible.length === 0) return null
            return (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-0.5">💞 융합 궁합이 좋은 성취기준</h3>
                <p className="text-xs text-gray-400 mb-2">이 프로젝트의 성취기준과 검증된 교과간 연결이 있는 성취기준입니다</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visible.map(({ companion, anchorCode, link }) => {
                    const colorClass = getSubjectColor(companion)
                    return (
                      <div key={`${anchorCode}-${companion.code}`}
                        className="p-3 rounded-lg border border-pink-100 bg-pink-50/30 hover:border-pink-200 transition">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${colorClass}`}>{companion.code}</span>
                              <span className="text-xs text-gray-400">{companion.subject}{companion.grade_group ? ` · ${companion.grade_group}` : ''}</span>
                            </div>
                            <p className="text-sm text-gray-800 leading-relaxed line-clamp-2"><MathText text={companion.content} /></p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {link?.integration_theme && (
                                <span className="px-1.5 py-0.5 bg-violet-50 border border-violet-100 rounded text-xs text-violet-600">
                                  🔗 {link.integration_theme}
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500 font-mono">
                                {anchorCode}와 연결
                              </span>
                            </div>
                            {link?.lesson_hook && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-1">📝 {link.lesson_hook}</p>
                            )}
                          </div>
                          <button
                            onClick={() => addStandard(companion)}
                            className="shrink-0 p-2.5 sm:p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600 transition min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                            title="프로젝트에 추가"
                          >
                            <Plus size={16} />
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
            </div>
          ) : (
            <div className="space-y-2">
              {aiActive ? (
                <div className="flex items-center gap-1.5 mb-3 text-xs text-violet-600 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                  <Sparkles size={13} className="shrink-0" />
                  <span>AI 융합 추천 {results.length}개 — 연결된 교과와 융합 가능한 성취기준입니다. 카드의 추천 이유를 확인하세요.</span>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-3">{results.length}개 결과{searchMode === 'semantic' ? ' · 의미 검색' : ''}</p>
              )}
              {results.map((std) => {
                const colorClass = getSubjectColor(std)
                const catColor = CATEGORY_COLORS[std.curriculum_category] || ''
                const added = isAdded(std.code)
                const isExpanded = expandedStandard === std.id
                const hasDetail = std.explanation || std.application_notes
                const isSecondary = std._matchField === 'secondary'
                return (
                  <div
                    key={std.id}
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
                          <span className="text-xs text-gray-400">{std.subject} · {std.grade_group}</span>
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
                          {std.keywords?.length > 0 && std.keywords.map((k) => (
                            <span key={k} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
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
                  const otherCode = isSource ? link.target_code : link.source_code
                  const otherAdded = isAdded(otherCode)
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
                        onClick={() => addStandardByCode(otherCode)}
                        disabled={otherAdded}
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
