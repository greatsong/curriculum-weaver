import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, Database, Trash2, Download, CheckCircle, AlertCircle } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '../lib/api'

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
  const [tab, setTab] = useState('upload') // 'upload' | 'browse' | 'graph'
  const [allStandards, setAllStandards] = useState([])
  const [graphData, setGraphData] = useState(null)

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

  const loadGraph = async () => {
    const data = await apiGet('/api/standards/graph')
    setGraphData(data)
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
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </button>
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
              <div className="flex flex-wrap gap-2 mt-3">
                {stats.bySubject.map((s) => (
                  <span key={s.subject} className="px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                    {s.subject} ({s.count})
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 탭 */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-full sm:w-fit overflow-x-auto">
          {[
            { id: 'upload', label: '데이터 업로드' },
            { id: 'browse', label: '성취기준 보기' },
            { id: 'graph', label: '연결 그래프' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id === 'graph') loadGraph() }}
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

        {/* 그래프 탭 */}
        {tab === 'graph' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            {graphData ? (
              <>
                <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
                  <span>노드: {graphData.nodes.length}개</span>
                  <span>연결: {graphData.links.length}개</span>
                </div>
                <div className="space-y-2 max-h-[50vh] overflow-auto">
                  {graphData.links.map((link, i) => {
                    const source = graphData.nodes.find((n) => n.id === link.source)
                    const target = graphData.nodes.find((n) => n.id === link.target)
                    if (!source || !target) return null
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-2 bg-gray-50 rounded-lg text-xs">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-mono">{source.code}</span>
                        <span className="text-gray-400">{source.subject}</span>
                        <span className="text-gray-300">→</span>
                        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                          {link.link_type === 'cross_subject' ? '교과연계'
                            : link.link_type === 'same_concept' ? '동일개념'
                            : link.link_type === 'prerequisite' ? '선수학습'
                            : link.link_type === 'application' ? '적용'
                            : link.link_type}
                        </span>
                        <span className="text-gray-300">→</span>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-mono">{target.code}</span>
                        <span className="text-gray-400">{target.subject}</span>
                        <span className="text-gray-400 ml-auto">{link.rationale}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">
                그래프 데이터를 로딩 중...
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
