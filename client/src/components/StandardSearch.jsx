import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Check, X, BookMarked, Link2, ChevronDown, ChevronUp, FileText, AlertTriangle } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '../lib/api'

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

  // 검색 (디바운스)
  const doSearch = useCallback(async () => {
    setLoading(true)
    const params = {}
    if (query) params.q = query
    if (subject) params.subject = subject
    if (schoolLevel) params.school_level = schoolLevel
    if (domain) params.domain = domain
    const data = await apiGet('/api/standards/search', params)
    setResults(data || [])
    setLoading(false)
  }, [query, subject, schoolLevel, domain])

  useEffect(() => {
    const timer = setTimeout(doSearch, 300)
    return () => clearTimeout(timer)
  }, [doSearch])

  // 성취기준 추가/제거
  const addStandard = async (standardId) => {
    await apiPost(`/api/standards/project/${sessionId}`, { standard_id: standardId })
    loadSessionStandards()
  }

  const removeStandard = async (standardId) => {
    await apiDelete(`/api/standards/project/${sessionId}/${standardId}`)
    loadSessionStandards()
  }

  const isAdded = (standardId) => sessionStandards.some((s) => s.standard_id === standardId)

  // 연결 보기
  const viewLinks = async (standard) => {
    setSelectedStandard(standard)
    const data = await apiGet(`/api/standards/${standard.id}/links`)
    setLinks(data || [])
  }

  return (
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

        {/* 검색 필터 */}
        <div className="px-3 sm:px-5 py-3 border-b border-gray-100 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="성취기준 검색 (내용, 코드, 키워드, 해설)..."
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
          {/* 세션에 추가된 성취기준 */}
          {sessionStandards.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">이 세션에 연결된 성취기준 ({sessionStandards.length})</h3>
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
                        onClick={() => removeStandard(std.id)}
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

          {/* 검색 결과 */}
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">검색 중...</div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              {query || subject ? '검색 결과가 없습니다' : '검색어를 입력하거나 교과를 선택하세요'}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-3">{results.length}개 결과</p>
              {results.map((std) => {
                const colorClass = getSubjectColor(std)
                const catColor = CATEGORY_COLORS[std.curriculum_category] || ''
                const added = isAdded(std.id)
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
                        <p className={`text-sm leading-relaxed ${isSecondary ? 'text-gray-500' : 'text-gray-800'}`}>{std.content}</p>
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
                          added ? removeStandard(std.id) : addStandard(std.id)
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
                              <p className="text-xs text-gray-600 leading-relaxed mt-0.5 max-h-40 overflow-y-auto pr-1">{std.explanation}</p>
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
                      <span className="text-gray-500">{link.rationale}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
