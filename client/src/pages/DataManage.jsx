import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Database, Trash2, Download, CheckCircle, AlertCircle, FileUp, Eye, Save, X, Edit3, GitBranch } from 'lucide-react'
import { apiGet, apiPost, apiDelete, apiUploadFile } from '../lib/api'
import Logo from '../components/Logo'

const Graph3D = lazy(() =>
  import('../components/Graph3D').catch(() => {
    window.location.reload()
    return { default: () => null }
  })
)

const SAMPLE_JSON = `{
  "standards": [
    {
      "code": "[9과01-01]",
      "subject": "과학",
      "grade_group": "중1-3",
      "area": "운동과 에너지",
      "content": "물체의 운동을 관찰하여 시간, 거리, 속력의 관계를 설명할 수 있다.",
      "keywords": ["운동", "속력", "시간", "거리"]
    }
  ],
  "links": [
    {
      "source": "[9과01-01]",
      "target": "[9수02-02]",
      "link_type": "cross_subject",
      "rationale": "운동의 속력을 일차함수 그래프로 표현"
    }
  ]
}`

export default function DataManage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [jsonInput, setJsonInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [tab, setTab] = useState('upload') // 'upload' | 'browse' | 'graph' | 'extract'
  const [allStandards, setAllStandards] = useState([])

  // 교과 선택 상태 (인라인 그래프 탐색용)
  const [pickedSubjects, setPickedSubjects] = useState(new Set())
  const togglePickSubject = useCallback((subject) => {
    setPickedSubjects(prev => {
      const next = new Set(prev)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }, [])

  // AI 추출 상태
  const [extractFile, setExtractFile] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [extractResult, setExtractResult] = useState(null)
  const [extractError, setExtractError] = useState(null)
  const [editingIdx, setEditingIdx] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const [standards, subjects, grades] = await Promise.all([
      apiGet('/api/standards/all'),
      apiGet('/api/standards/subjects'),
      apiGet('/api/standards/grades'),
    ])
    setStats({
      total: standards.length,
      subjects,
      grades,
      bySubject: subjects.map((s) => ({
        subject: s,
        count: standards.filter((st) => st.subject === s).length,
      })),
    })
    setAllStandards(standards)
  }

  const handleUpload = async () => {
    if (!jsonInput.trim()) return
    setUploading(true)
    setResult(null)

    try {
      const parsed = JSON.parse(jsonInput)
      const data = await apiPost('/api/standards/upload', parsed)
      setResult({ success: true, message: data.message })
      setJsonInput('')
      loadStats()
    } catch (err) {
      if (err instanceof SyntaxError) {
        setResult({ success: false, message: 'JSON 형식이 올바르지 않습니다.' })
      } else {
        setResult({ success: false, message: err.message })
      }
    }
    setUploading(false)
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setJsonInput(ev.target.result)
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleClearAll = async () => {
    if (!confirm('모든 성취기준 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
    await apiDelete('/api/standards/all')
    setResult({ success: true, message: '모든 데이터가 초기화되었습니다.' })
    loadStats()
  }

  // ─── AI 추출 핸들러 ───
  const handleExtractFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setExtractFile(file)
    setExtracting(true)
    setExtractResult(null)
    setExtractError(null)
    setEditingIdx(null)
    try {
      const data = await apiUploadFile('/api/standards/extract', file)
      setExtractResult(data)
    } catch (err) {
      setExtractError(err.message)
    }
    setExtracting(false)
  }

  const handleRemoveExtracted = (idx) => {
    if (!extractResult) return
    const updated = [...extractResult.standards]
    updated.splice(idx, 1)
    setExtractResult({ ...extractResult, standards: updated, meta: { ...extractResult.meta, total_standards: updated.length } })
  }

  const handleStartEdit = (idx) => {
    setEditingIdx(idx)
    setEditForm({ ...extractResult.standards[idx] })
  }

  const handleSaveEdit = () => {
    if (editingIdx === null || !extractResult) return
    const updated = [...extractResult.standards]
    updated[editingIdx] = { ...editForm }
    setExtractResult({ ...extractResult, standards: updated })
    setEditingIdx(null)
  }

  const handleConfirmExtract = async () => {
    if (!extractResult?.standards?.length) return
    setConfirming(true)
    try {
      const data = await apiPost('/api/standards/extract/confirm', {
        standards: extractResult.standards,
        links: extractResult.links || [],
      })
      setResult({ success: true, message: data.message })
      setExtractResult(null)
      setExtractFile(null)
      loadStats()
      setTab('browse')
    } catch (err) {
      setResult({ success: false, message: err.message })
    }
    setConfirming(false)
  }

  const handleExport = () => {
    const exportData = {
      standards: allStandards.map(({ id, created_at, ...rest }) => rest),
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'curriculum-standards.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} className="flex items-center gap-2 hover:opacity-80 transition shrink-0" title="메인으로">
            <Logo size={28} />
            <span className="text-base font-bold text-gray-900">커리큘럼 위버</span>
          </a>
          <span className="text-gray-300">|</span>
          <Database size={20} className="text-blue-600" />
          <h1 className="text-lg font-bold text-gray-900">교육과정 데이터 관리</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* 통계 */}
        {stats && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="font-semibold text-gray-800 mb-3">현재 데이터</h2>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
              <div>
                <span className="text-2xl font-bold text-blue-600">{stats.total}</span>
                <span className="text-gray-500 ml-1">개 성취기준</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-green-600">{stats.subjects.length}</span>
                <span className="text-gray-500 ml-1">개 교과</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-purple-600">{stats.grades.length}</span>
                <span className="text-gray-500 ml-1">개 학년군</span>
              </div>
            </div>
            {stats.bySubject.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs text-gray-400">교과를 클릭하면 연결 그래프를 탐색할 수 있습니다</p>
                  {pickedSubjects.size > 0 && (
                    <button
                      onClick={() => setPickedSubjects(new Set())}
                      className="text-xs text-blue-500 hover:text-blue-700 transition"
                    >
                      선택 초기화
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {stats.bySubject.map((s) => {
                    const picked = pickedSubjects.has(s.subject)
                    return (
                      <button
                        key={s.subject}
                        onClick={() => togglePickSubject(s.subject)}
                        className={`px-2.5 py-1 rounded-full text-xs transition-all cursor-pointer border ${
                          picked
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-gray-100 text-gray-600 border-transparent hover:bg-blue-50 hover:text-blue-600'
                        }`}
                      >
                        {s.subject} ({s.count})
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 교과 1개 선택 시 안내 */}
            {pickedSubjects.size === 1 && (
              <p className="mt-3 text-xs text-blue-500 bg-blue-50 px-3 py-2 rounded-lg">
                교과를 1개 더 선택하면 두 교과 간 연결 그래프가 표시됩니다.
              </p>
            )}

            {/* 인라인 미니 그래프: 2개 이상 교과 선택 시 표시 */}
            {pickedSubjects.size >= 2 && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch size={16} className="text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    선택 교과 간 연결 그래프
                  </h3>
                  <span className="text-xs text-gray-400">
                    {[...pickedSubjects].join(' · ')}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">노드를 클릭하면 오른쪽에 연결 목록이 표시됩니다</span>
                </div>
                <div className="rounded-lg border border-gray-200 overflow-hidden" style={{ height: '60vh' }}>
                  <Suspense fallback={
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <div className="text-center">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs">그래프 로딩 중...</p>
                      </div>
                    </div>
                  }>
                    <Graph3D embedded showSidebar initialSubjects={[...pickedSubjects]} />
                  </Suspense>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 탭 */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-full sm:w-fit overflow-x-auto">
          {[
            { id: 'upload', label: '데이터 업로드' },
            { id: 'extract', label: 'AI 추출 (준비 중)' },
            { id: 'browse', label: '성취기준 보기' },
            { id: 'graph', label: '연결 그래프' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition min-h-[44px] whitespace-nowrap ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 업로드 탭 */}
        {tab === 'upload' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-2">JSON으로 성취기준 업로드</h3>
              <p className="text-sm text-gray-500 mb-4">
                아래 형식으로 JSON 데이터를 붙여넣거나 파일을 업로드하세요.
                기존 데이터에 추가됩니다 (동일 코드는 건너뜀).
              </p>

              {/* 파일 업로드 버튼 */}
              <div className="flex flex-wrap gap-2 sm:gap-3 mb-3">
                <label className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer text-sm font-medium w-full sm:w-auto min-h-[44px]">
                  <Upload size={16} />
                  JSON 파일 선택
                  <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                </label>
                <button
                  onClick={() => setJsonInput(SAMPLE_JSON)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition text-sm w-full sm:w-auto min-h-[44px]"
                >
                  예시 채우기
                </button>
                <button
                  onClick={handleExport}
                  disabled={!stats?.total}
                  className="flex items-center justify-center gap-1 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition text-sm disabled:opacity-50 w-full sm:w-auto min-h-[44px]"
                >
                  <Download size={14} />
                  현재 데이터 내보내기
                </button>
              </div>

              {/* JSON 입력 */}
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={SAMPLE_JSON}
                rows={12}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />

              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleUpload}
                  disabled={!jsonInput.trim() || uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm disabled:opacity-50"
                >
                  <Upload size={16} />
                  {uploading ? '업로드 중...' : '업로드'}
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition text-sm"
                >
                  <Trash2 size={14} />
                  전체 초기화
                </button>
              </div>

              {/* 결과 */}
              {result && (
                <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 text-sm ${
                  result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {result.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {result.message}
                </div>
              )}
            </div>

            {/* JSON 형식 안내 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-2">JSON 형식 안내</h3>
              <div className="text-sm text-gray-600 space-y-2">
                <p><strong>standards</strong> 배열 (필수):</p>
                <ul className="list-disc list-inside ml-4 space-y-1 text-xs text-gray-500">
                  <li><code>code</code> — 성취기준 코드 (필수, 예: "[9과01-01]")</li>
                  <li><code>subject</code> — 교과명 (필수, 예: "과학")</li>
                  <li><code>grade_group</code> — 학년군 (예: "중1-3", "초5-6")</li>
                  <li><code>area</code> — 영역 (예: "운동과 에너지")</li>
                  <li><code>content</code> — 성취기준 내용 (필수)</li>
                  <li><code>keywords</code> — 키워드 배열 (선택)</li>
                </ul>
                <p className="mt-3"><strong>links</strong> 배열 (선택):</p>
                <ul className="list-disc list-inside ml-4 space-y-1 text-xs text-gray-500">
                  <li><code>source</code> — 출발 성취기준 코드</li>
                  <li><code>target</code> — 도착 성취기준 코드</li>
                  <li><code>link_type</code> — 연결 유형 (cross_subject, same_concept, prerequisite, application, extension)</li>
                  <li><code>rationale</code> — 연결 근거</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* AI 추출 탭 (서버 API 미구현 — 준비 중) */}
        {tab === 'extract' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-2">PDF/DOCX에서 성취기준 자동 추출</h3>
              <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                이 기능은 현재 준비 중입니다. 향후 업데이트에서 제공됩니다.
              </div>
              <p className="text-sm text-gray-500 mb-4">
                교육과정 문서(PDF, DOCX)를 업로드하면 AI가 성취기준을 자동으로 인식하고 구조화합니다.
                추출 결과를 검토·수정한 뒤 확정하세요.
              </p>

              <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition w-full min-h-[44px] ${
                extracting ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500 hover:text-blue-600'
              }`}>
                {extracting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium">AI가 분석 중입니다... ({extractFile?.name})</span>
                  </>
                ) : (
                  <>
                    <FileUp size={20} />
                    <span className="text-sm font-medium">PDF 또는 DOCX 파일 선택</span>
                  </>
                )}
                <input type="file" accept=".pdf,.docx,.doc" onChange={handleExtractFile} disabled={extracting} className="hidden" />
              </label>

              {extractError && (
                <div className="mt-3 p-3 rounded-lg flex items-center gap-2 text-sm bg-red-50 text-red-700">
                  <AlertCircle size={16} />
                  {extractError}
                </div>
              )}
            </div>

            {/* 추출 결과 미리보기 */}
            {extractResult && extractResult.standards.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Eye size={18} className="text-blue-600" />
                    추출 결과 미리보기
                    <span className="text-sm font-normal text-gray-500">
                      ({extractResult.standards.length}개 성취기준, {extractResult.links?.length || 0}개 연결)
                    </span>
                  </h3>
                  <div className="flex gap-2">
                    <button onClick={() => { setExtractResult(null); setExtractFile(null) }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition min-h-[44px]">
                      <X size={14} /> 취소
                    </button>
                    <button onClick={handleConfirmExtract} disabled={confirming}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm disabled:opacity-50 min-h-[44px]">
                      <Save size={16} /> {confirming ? '저장 중...' : '확정 저장'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-500">
                  <span>원본: {extractFile?.name}</span>
                  <span>텍스트: {extractResult.meta?.extracted_chars?.toLocaleString()}자</span>
                  <span>청크: {extractResult.meta?.chunks_processed}개</span>
                </div>

                <div className="space-y-2 max-h-[50vh] overflow-auto">
                  {extractResult.standards.map((std, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3">
                      {editingIdx === idx ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <input value={editForm.code || ''} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                              placeholder="코드" className="px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <input value={editForm.subject || ''} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                              placeholder="교과" className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <input value={editForm.grade_group || ''} onChange={(e) => setEditForm({ ...editForm, grade_group: e.target.value })}
                              placeholder="학년군" className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <input value={editForm.area || ''} onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}
                              placeholder="영역" className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <textarea value={editForm.content || ''} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                            placeholder="성취기준 내용" rows={2}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                          <div className="flex gap-2">
                            <button onClick={handleSaveEdit}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition min-h-[44px]">
                              <CheckCircle size={14} /> 저장
                            </button>
                            <button onClick={() => setEditingIdx(null)}
                              className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded text-sm transition min-h-[44px]">
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-xs text-blue-600 font-bold">{std.code}</span>
                              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">{std.subject}</span>
                              <span className="text-xs text-gray-400">{std.grade_group}</span>
                              <span className="text-xs text-gray-400">{std.area}</span>
                            </div>
                            <p className="text-sm text-gray-700">{std.content}</p>
                            {std.keywords?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {std.keywords.map((kw, ki) => (
                                  <span key={ki} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{kw}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => handleStartEdit(idx)} title="수정"
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition min-w-[44px] min-h-[44px] flex items-center justify-center">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => handleRemoveExtracted(idx)} title="제거"
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded transition min-w-[44px] min-h-[44px] flex items-center justify-center">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {extractResult.links?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">추출된 교과 간 연결 ({extractResult.links.length}개)</h4>
                    <div className="space-y-1">
                      {extractResult.links.map((link, li) => (
                        <div key={li} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="font-mono text-blue-600">{link.source}</span>
                          <span>↔</span>
                          <span className="font-mono text-blue-600">{link.target}</span>
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded">{link.link_type}</span>
                          <span className="text-gray-400">{link.rationale}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {extractResult && extractResult.standards.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center text-gray-400">
                <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
                <p>문서에서 성취기준을 찾지 못했습니다.</p>
                <p className="text-sm mt-1">교육과정 성취기준이 포함된 문서인지 확인해주세요.</p>
              </div>
            )}
          </div>
        )}

        {/* 성취기준 보기 탭 */}
        {tab === 'browse' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {allStandards.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Database size={32} className="mx-auto mb-2 opacity-50" />
                <p>성취기준 데이터가 없습니다</p>
              </div>
            ) : (
              <>
                {/* 모바일: 카드 레이아웃 */}
                <div className="md:hidden overflow-auto max-h-[60vh] p-3 space-y-3">
                  {allStandards.map((std) => (
                    <div key={std.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-blue-600 font-bold">{std.code}</span>
                        <span className="text-xs text-gray-500">{std.grade_group}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">{std.subject}</span>
                        <span className="text-xs text-gray-400">{std.area}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{std.content}</p>
                    </div>
                  ))}
                </div>

                {/* 데스크톱: 테이블 레이아웃 */}
                <div className="hidden md:block overflow-auto max-h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">코드</th>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">교과</th>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">학년군</th>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">영역</th>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">내용</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allStandards.map((std) => (
                        <tr key={std.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-xs text-blue-600 whitespace-nowrap">{std.code}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{std.subject}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-gray-500">{std.grade_group}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-gray-500">{std.area}</td>
                          <td className="px-4 py-2 text-gray-700">{std.content}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* 그래프 탭 — 3D 시각화 */}
        {tab === 'graph' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ height: '75vh' }}>
            <Suspense fallback={
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm">3D 그래프 로딩 중...</p>
                </div>
              </div>
            }>
              <Graph3D embedded />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  )
}
