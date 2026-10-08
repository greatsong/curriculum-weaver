import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, FileText, FileCode, FileDown, ExternalLink, Loader2, Eye, FileArchive } from 'lucide-react'
import { API_BASE, getHeaders } from '../lib/api'

// 받을 범위 — 보고서만(보드 전부) / 대화 기록만(대화 전문) / 둘 다(두 파일을 zip으로)
const SCOPES = [
  { id: 'report', label: '보고서만', desc: '설계 보드 전부. 대화는 건수만' },
  { id: 'transcript', label: '대화 기록만', desc: '교사·AI 대화 전문' },
  { id: 'both', label: '둘 다', desc: '보고서 + 대화 기록, zip 한 개' },
]

const FORMATS = [
  {
    id: 'html',
    label: 'HTML',
    desc: '브라우저에서 열 수 있는 문서',
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

const SCOPE_FILE_LABEL = { report: '보고서', transcript: '대화기록', both: '보고서+대화기록' }

export default function ReportDownload({ sessionId, sessionTitle, onClose }) {
  const [downloading, setDownloading] = useState(null)
  // 앱 안에서 바로 보기 — /preview(인라인 HTML)를 받아 iframe으로 렌더한다.
  const [previewHtml, setPreviewHtml] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [scope, setScope] = useState('report')
  // 이름 가리기 — 팀 밖으로 배포할 때. 기본은 끔(팀 내부 기록은 실명이 자연스럽다)
  const [anonymize, setAnonymize] = useState(false)

  const anonQuery = anonymize ? '?anonymize=1' : ''
  const anonSuffix = anonymize ? '_익명' : ''

  // 범위·형식에 맞는 서버 경로. PDF는 HTML을 새 창에 열어 인쇄한다(preview 인라인 응답).
  const buildUrl = (format) => {
    const base = `${API_BASE}/api/report/${sessionId}`
    if (scope === 'both') return `${base}/package/${format}${anonQuery}`
    if (scope === 'transcript') {
      if (format === 'pdf') return `${base}/transcript/html?preview=1${anonymize ? '&anonymize=1' : ''}`
      return `${base}/transcript/${format}${anonQuery}`
    }
    if (format === 'pdf') return `${base}/preview${anonQuery}`
    return `${base}/${format}${anonQuery}`
  }

  const handlePreview = async () => {
    setLoadingPreview(true)
    try {
      const headers = await getHeaders()
      const url = scope === 'transcript'
        ? `${API_BASE}/api/report/${sessionId}/transcript/html?preview=1${anonymize ? '&anonymize=1' : ''}`
        : `${API_BASE}/api/report/${sessionId}/preview${anonQuery}`
      const res = await fetch(url, { headers })
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
      const url = buildUrl(format)
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(format === 'pdf' ? '미리보기 로드 실패' : '다운로드 실패')
      const blob = await res.blob()

      if (format === 'pdf') {
        // PDF: HTML을 blob URL로 열고 인쇄 대화상자를 띄운다 (인증 헤더 포함)
        const blobUrl = URL.createObjectURL(blob)
        const win = window.open(blobUrl, '_blank')
        if (win && window.innerWidth >= 768) {
          win.addEventListener('load', () => {
            setTimeout(() => win.print(), 500)
          })
        }
        return
      }

      const ext = scope === 'both' ? 'zip' : format
      const filename = `${sessionTitle || '보고서'}_${SCOPE_FILE_LABEL[scope]}${anonSuffix}.${ext}`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
    } catch (err) {
      console.error('보고서 다운로드 오류:', err)
      alert('다운로드 중 오류가 발생했습니다.')
    } finally {
      setDownloading(null)
    }
  }

  // zip(둘 다)은 PDF가 없다 — 보고서·대화 기록을 각각 PDF로 받으면 된다
  const formats = scope === 'both' ? FORMATS.filter((f) => f.id !== 'pdf') : FORMATS

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
          <p className="text-sm text-white/80 mt-1">범위를 고르고, 바로 보거나 파일로 받으세요</p>
        </div>

        {/* 범위 선택 */}
        <div className="px-6 pt-5">
          <div className="text-xs font-medium text-gray-400 mb-2">받을 범위</div>
          <div className="grid grid-cols-3 gap-2">
            {SCOPES.map((s) => {
              const active = scope === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setScope(s.id)}
                  disabled={!!downloading || loadingPreview}
                  className={`rounded-xl border px-2 py-2.5 text-left transition disabled:opacity-50 ${
                    active ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className={`text-sm font-semibold ${active ? 'text-indigo-700' : 'text-gray-900'}`}>{s.label}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{s.desc}</div>
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-2 mt-3 text-xs text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={anonymize}
              onChange={(e) => setAnonymize(e.target.checked)}
              disabled={!!downloading || loadingPreview}
              className="accent-indigo-600"
            />
            이름 가리기 — 교사 이름을 "교사 A·B·C"로, 이메일·워크스페이스 이름은 지움 (팀 밖 배포용)
          </label>
        </div>

        {/* 바로 보기 — 앱을 벗어나지 않고 확인한다 (zip은 열어 볼 수 없어 제외) */}
        {scope !== 'both' && (
          <div className="px-6 pt-4">
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
        )}

        {/* 포맷 선택 */}
        <div className="p-6 space-y-3">
          <div className="text-xs font-medium text-gray-400">
            파일로 받기 {scope === 'both' && <span className="text-gray-400">· 보고서와 대화 기록 두 파일이 zip 하나로 담깁니다</span>}
          </div>
          {formats.map((fmt) => {
            const Icon = scope === 'both' ? FileArchive : fmt.icon
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
                  <div className="font-semibold text-gray-900 text-sm">{fmt.label}{scope === 'both' ? ' (zip)' : ''}</div>
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

      {/* 앱 내 뷰어 — 문서 HTML은 자체 완결(스타일 포함)이라 iframe으로 격리 렌더 */}
      {previewHtml && (
        <div className="absolute inset-0 z-10 flex flex-col bg-white">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 bg-white">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {sessionTitle || '결과 보고서'}{scope === 'transcript' ? ' — 대화 기록' : ''}
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
