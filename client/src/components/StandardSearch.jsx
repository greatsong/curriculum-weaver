import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Check, X, BookMarked, Link2 } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '../lib/api'

const SUBJECT_COLORS = {
  '과학': 'bg-green-100 text-green-700 border-green-200',
  '수학': 'bg-blue-100 text-blue-700 border-blue-200',
  '국어': 'bg-red-100 text-red-700 border-red-200',
  '사회': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  '기술·가정': 'bg-purple-100 text-purple-700 border-purple-200',
  '미술': 'bg-pink-100 text-pink-700 border-pink-200',
  '도덕': 'bg-orange-100 text-orange-700 border-orange-200',
  '정보': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  '체육': 'bg-lime-100 text-lime-700 border-lime-200',
  '음악': 'bg-violet-100 text-violet-700 border-violet-200',
  '영어': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  '실과': 'bg-teal-100 text-teal-700 border-teal-200',
}

export default function StandardSearch({ sessionId, onClose }) {
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('')
  const [subjects, setSubjects] = useState([])
  const [results, setResults] = useState([])
  const [sessionStandards, setSessionStandards] = useState([])
  const [selectedStandard, setSelectedStandard] = useState(null)
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(false)

  // 교과 목록 로드
  useEffect(() => {
    apiGet('/api/standards/subjects').then(setSubjects).catch(() => {})
    loadSessionStandards()
  }, [sessionId])

  const loadSessionStandards = async () => {
    const data = await apiGet(`/api/sessions/${sessionId}/standards`)
    setSessionStandards(data || [])
  }

  // 검색 (디바운스)
  const doSearch = useCallback(async () => {
    setLoading(true)
    const params = {}
    if (query) params.q = query
    if (subject) params.subject = subject
    const data = await apiGet('/api/standards/search', params)
    setResults(data || [])
    setLoading(false)
  }, [query, subject])

  useEffect(() => {
    const timer = setTimeout(doSearch, 300)
    return () => clearTimeout(timer)
  }, [doSearch])

  // 성취기준 추가/제거
  const addStandard = async (standardId) => {
    await apiPost(`/api/standards/session/${sessionId}`, { standard_id: standardId })
    loadSessionStandards()
  }

  const removeStandard = async (standardId) => {
    await apiDelete(`/api/standards/session/${sessionId}/${standardId}`)
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
      <div className="bg-white h-full sm:h-auto sm:rounded-xl sm:shadow-2xl w-full sm:max-w-3xl sm:max-h-[80vh] sm:mx-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-200">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <BookMarked size={20} className="text-blue-600" />
            성취기준 탐색
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"><X size={20} /></button>
        </div>

        {/* 검색 필터 */}
        <div className="px-3 sm:px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="성취기준 검색 (내용, 코드, 키워드)..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  const colorClass = SUBJECT_COLORS[std.subject] || 'bg-gray-100 text-gray-700 border-gray-200'
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
                const colorClass = SUBJECT_COLORS[std.subject] || 'bg-gray-100 text-gray-700'
                const added = isAdded(std.id)
                return (
                  <div
                    key={std.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer hover:shadow-sm ${
                      selectedStandard?.id === std.id ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => viewLinks(std)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${colorClass}`}>
                          {std.code}
                        </span>
                        <span className="text-xs text-gray-400">{std.subject} · {std.grade_group}</span>
                        <span className="text-xs text-gray-400">· {std.area}</span>
                      </div>
                      <p className="text-sm text-gray-800 leading-relaxed">{std.content}</p>
                      {std.keywords?.length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {std.keywords.map((k) => (
                            <span key={k} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
                              {k}
                            </span>
                          ))}
                        </div>
                      )}
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
