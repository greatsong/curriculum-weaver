import { useState, useRef } from 'react'
import { MATERIAL_CATEGORIES } from 'curriculum-weaver-shared/constants.js'
import { useProcedureStore } from '../stores/procedureStore'
import { Upload, Link, ChevronDown, ChevronUp, X, FileText, Globe, Loader2 } from 'lucide-react'

export default function MaterialUploadBar({ sessionId }) {
  const { materials, uploadMaterial, addUrlMaterial } = useProcedureStore()
  const [expanded, setExpanded] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('reference')
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      await uploadMaterial(sessionId, file, selectedCategory)
    } catch (err) {
      alert(err.message || '파일 업로드 실패')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleUrlSubmit = async (e) => {
    e.preventDefault()
    const url = urlInput.trim()
    if (!url) return

    setUploading(true)
    try {
      await addUrlMaterial(sessionId, url, selectedCategory, urlTitle.trim())
      setUrlInput('')
      setUrlTitle('')
      setShowUrlForm(false)
    } catch (err) {
      alert(err.message || 'URL 추가 실패')
    } finally {
      setUploading(false)
    }
  }

  const categoryCount = (catId) => materials.filter((m) => m.category === catId).length

  return (
    <div className="bg-white border-b border-gray-200 shrink-0">
      {/* 접힌 상태: 한 줄 요약 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-sm hover:bg-gray-50 transition"
      >
        <Upload size={14} className="text-gray-500 shrink-0" />
        <span className="text-gray-600 truncate">
          자료 관리
          {materials.length > 0 && (
            <span className="text-gray-400 ml-1">({materials.length}개)</span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {/* 카테고리별 뱃지 (접힌 상태에서도 보이는 요약) */}
          <div className="hidden sm:flex items-center gap-1">
            {MATERIAL_CATEGORIES.map((cat) => {
              const count = categoryCount(cat.id)
              if (count === 0) return null
              return (
                <span
                  key={cat.id}
                  className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
                >
                  {cat.label} {count}
                </span>
              )
            })}
          </div>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {/* 펼친 상태 */}
      {expanded && (
        <div className="px-3 sm:px-4 pb-3 space-y-3">
          {/* 카테고리 칩 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {MATERIAL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.label}
                {categoryCount(cat.id) > 0 && (
                  <span className="ml-1 opacity-75">({categoryCount(cat.id)})</span>
                )}
              </button>
            ))}
          </div>

          {/* 업로드 버튼들 */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.hwp,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls,.csv"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              파일 업로드
            </button>
            <button
              onClick={() => setShowUrlForm(!showUrlForm)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition"
            >
              <Link size={14} />
              URL 추가
            </button>
          </div>

          {/* URL 입력 폼 */}
          {showUrlForm && (
            <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-2">
              <input
                value={urlTitle}
                onChange={(e) => setUrlTitle(e.target.value)}
                placeholder="제목 (선택)"
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:w-36"
              />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://..."
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="submit"
                disabled={!urlInput.trim() || uploading}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                추가
              </button>
            </form>
          )}

          {/* 업로드된 자료 목록 */}
          {materials.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {materials
                .filter((m) => !selectedCategory || m.category === selectedCategory)
                .map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg text-xs text-gray-600">
                    {m.file_type === 'url' ? (
                      <Globe size={12} className="text-green-500 shrink-0" />
                    ) : (
                      <FileText size={12} className="text-blue-500 shrink-0" />
                    )}
                    <span className="truncate flex-1">{m.file_name}</span>
                    {m.file_size > 0 && (
                      <span className="text-gray-400 shrink-0">
                        {(m.file_size / 1024).toFixed(0)}KB
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
