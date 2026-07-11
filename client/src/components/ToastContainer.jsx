import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore } from '../stores/toastStore'

// ── 전역 토스트 컨테이너 ────
// App 루트에 한 번만 마운트. 우측 하단에 쌓이며, 자동 소멸(스토어 담당) + 수동 닫기 지원.

const KIND_STYLES = {
  success: {
    className: 'bg-green-50 border-green-200 text-green-800',
    icon: <CheckCircle2 size={16} className="text-green-600 shrink-0" />,
  },
  error: {
    className: 'bg-red-50 border-red-200 text-red-800',
    icon: <AlertCircle size={16} className="text-red-600 shrink-0" />,
  },
  info: {
    className: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: <Info size={16} className="text-blue-600 shrink-0" />,
  },
}

export default function ToastContainer() {
  const { toasts, dismissToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => {
        const style = KIND_STYLES[t.kind] || KIND_STYLES.info
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border shadow-lg text-[13px] leading-snug animate-slide-up ${style.className}`}
          >
            {style.icon}
            <span className="flex-1 break-keep">{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="shrink-0 p-0.5 opacity-50 hover:opacity-100 rounded"
              aria-label="알림 닫기"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
