import { create } from 'zustand'

// ── 전역 토스트 스토어 ────
// 화면 어디서든(스토어 포함) pushToast로 알림을 띄운다.
// 컴포넌트 로컬 배너(MaterialUploadBar 등)와 달리 라우트 이동에도 살아남는다.

let _seq = 0

export const useToastStore = create((set, get) => ({
  toasts: [], // { id, kind: 'success'|'error'|'info', message }

  /**
   * 토스트 추가. duration(ms) 경과 후 자동 소멸 (0이면 수동 닫기 전까지 유지).
   * @returns {string} toast id
   */
  pushToast: ({ kind = 'info', message, duration = 6_000 }) => {
    if (!message) return null
    const id = `toast-${Date.now()}-${_seq++}`
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }))
    if (duration > 0) {
      setTimeout(() => get().dismissToast(id), duration)
    }
    return id
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/** 컴포넌트 밖(스토어·유틸)에서 쓰는 헬퍼 */
export const pushToast = (toast) => useToastStore.getState().pushToast(toast)
