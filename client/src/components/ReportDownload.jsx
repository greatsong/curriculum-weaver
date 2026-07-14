import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, FileText, FileCode, FileDown, ExternalLink, Loader2, Eye } from 'lucide-react'
import { API_BASE, getHeaders } from '../lib/api'

const FORMATS = [
  {
    id: 'html',
    label: 'HTML',
    desc: '브라우저에서 열 수 있는 예쁜 보고서',
    icon: FileCode,
    color: 'text-orange-500',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    hoverBg: 'hover:bg-orange-100',
  },
  {
    id: 'md',
    label: 'Markdown',
    desc: 'GitHub, Notion 등에서 활용 가능',
    icon: FileText,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    hoverBg: 'hover:bg-blue-100',
  },
  {
    id: 'pdf',
    label: 'PDF',
    desc: '인쇄 및 공유에 적합한 문서',
    icon: FileDown,
    color: 'text-red-500',
    bg: 'bg-red-50',
    border: 'border-red-200',
    hoverBg: 'hover:bg-red-100',
  },
]

export default function ReportDownload({ sessionId, sessionTitle, onClose }) {
  const [downloading, setDownloading] = useState(null)
  // 앱 안에서 바로 보기 — /preview(인라인 HTML)를 받아 iframe으로 렌더한다.
  const [previewHtml, setPreviewHtml] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const handlePreview = async () => {
    setLoadingPreview(true)
    try {
      const headers = await getHeaders()
      const res = await fetch(`${API_BASE}/api/report/${sessionId}/preview`, { headers })
      if (!res.ok) throw new Error('보고서를 불러오지 못했습니다.')
      setPreviewHtml(await res.text())
    } catch (err) {
      console.error('보고서 미리보기 오류:', err)
      alert('보고서를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleDownload = async (format) => {
    setDownloading(format)
    try {
      const headers = await getHeaders()

      if (format === 'pdf') {
        // PDF: fetch로 HTML을 받아 blob URL로 열기 (인증 헤더 포함)
        const previewUrl = `${API_BASE}/api/report/${sessionId}/preview`
        const res = await fetch(previewUrl, { headers })
        if (!res.ok) throw new Error('미리보기 로드 실패')
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        const win = window.open(blobUrl, '_blank')
        if (win && window.innerWidth >= 768) {
          win.addEventListener('load', () => {
            setTimeout(() => win.print(), 500)
          })
        }
      } else {
        // HTML / MD: 직접 다운로드 (인증 헤더 포함)
        const url = `${API_BASE}/api/report/${sessionId}/${format}`
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error('다운로드 실패')
        const blob = await res.blob()
        const filename = `${sessionTitle || '보고서'}_보고서.${format}`
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(a.href)
      }
    } catch (err) {
      console.error('보고서 다운로드 오류:', err)
      alert('보고서 다운로드 중 오류가 발생했습니다.')
    } finally {
      setDownloading(null)
    }
  }

  // ProjectPage는 .work-shell(zoom:1.5)로 감싸져 있어, 그 안에서 position:fixed
  // 모달을 렌더링하면 zoom이 중복 적용돼 화면 밖으로 밀려난다. document.body로
  // 포탈해서 zoom 조상 밖 좌표계에서 렌더링한다.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden">
        {/* 헤더 */}
        <div className="relative bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/20 transition"
          >
            <X size={18} />
          </button>
          <h2 className="text-lg font-bold">결과 보고서</h2>
          <p className="text-sm text-white/80 mt-1">여기서 바로 보거나, 파일로 받아보세요</p>
        </div>

        {/* 바로 보기 — 앱을 벗어나지 않고 보고서를 확인한다 */}
        <div className="px-6 pt-6">
          <button
            onClick={handlePreview}
            disabled={loadingPreview || !!downloading}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
              {loadingPreview ? (
                <Loader2 size={22} className="text-indigo-600 animate-spin" />
              ) : (
                <Eye size={22} className="text-indigo-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">바로 보기</div>
              <div className="text-xs text-gray-500 mt-0.5">다운로드 없이 이 화면에서 확인</div>
            </div>
          </button>
        </div>

        {/* 포맷 선택 */}
        <div className="p-6 space-y-3">
          <div className="text-xs font-medium text-gray-400">파일로 받기</div>
          {FORMATS.map((fmt) => {
            const Icon = fmt.icon
            const isLoading = downloading === fmt.id
            return (
              <button
                key={fmt.id}
                onClick={() => handleDownload(fmt.id)}
                disabled={!!downloading}
                className={`
                  w-full flex items-center gap-4 p-4 rounded-xl border transition
                  ${fmt.border} ${fmt.bg} ${fmt.hoverBg}
                  disabled:opacity-50 disabled:cursor-not-allowed
                  text-left
                `}
              >
                <div className={`w-11 h-11 rounded-xl ${fmt.bg} flex items-center justify-center flex-shrink-0`}>
                  {isLoading ? (
                    <Loader2 size={22} className={`${fmt.color} animate-spin`} />
                  ) : (
                    <Icon size={22} className={fmt.color} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{fmt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{fmt.desc}</div>
                </div>
                {fmt.id === 'pdf' && (
                  <ExternalLink size={16} className="text-gray-400 flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>

        {/* 하단 안내 */}
        <div className="px-6 pb-5">
          <p className="text-xs text-gray-400 text-center">
            PDF: 데스크톱에서는 "PDF로 저장", 모바일에서는 공유 버튼을 이용해주세요.
          </p>
        </div>
      </div>

      {/* 앱 내 보고서 뷰어 — 보고서 HTML은 자체 완결(스타일 포함)이라 iframe으로 격리 렌더 */}
      {previewHtml && (
        <div className="absolute inset-0 z-10 flex flex-col bg-white">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 bg-white">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {sessionTitle || '결과 보고서'}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleDownload('html')}
                disabled={!!downloading}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                HTML 저장
              </button>
              <button
                onClick={() => setPreviewHtml(null)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                title="닫기"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <iframe
            title="결과 보고서"
            srcDoc={previewHtml}
            sandbox=""
            className="flex-1 w-full border-0 bg-white"
          />
        </div>
      )}
    </div>,
    document.body
  )
}