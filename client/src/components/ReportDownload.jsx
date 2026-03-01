import { useState } from 'react'
import { X, FileText, FileCode, FileDown, ExternalLink, Loader2 } from 'lucide-react'
import { API_BASE } from '../lib/api'

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

  const handleDownload = async (format) => {
    setDownloading(format)
    try {
      if (format === 'pdf') {
        // PDF: 새 창에서 HTML 미리보기 열기
        const previewUrl = `${API_BASE}/api/report/${sessionId}/preview`
        const win = window.open(previewUrl, '_blank')
        // 데스크톱에서만 자동 인쇄 다이얼로그 (모바일은 공유 메뉴 사용)
        if (win && window.innerWidth >= 768) {
          win.addEventListener('load', () => {
            setTimeout(() => win.print(), 500)
          })
        }
      } else {
        // HTML / MD: 직접 다운로드
        const url = `${API_BASE}/api/report/${sessionId}/${format}`
        const res = await fetch(url)
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

  return (
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
          <h2 className="text-lg font-bold">결과 보고서 다운로드</h2>
          <p className="text-sm text-white/80 mt-1">설계 과정과 결과를 정리한 보고서를 받아보세요</p>
        </div>

        {/* 포맷 선택 */}
        <div className="p-6 space-y-3">
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
    </div>
  )
}