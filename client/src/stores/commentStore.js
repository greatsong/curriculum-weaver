import { create } from 'zustand'
import { API_BASE } from '../lib/api'
import { supabase } from '../lib/supabase'
import { socket } from '../lib/socket'

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  } catch {
    // 인증 없이 계속 진행
  }
  return headers
}

export const useCommentStore = create((set, get) => ({
  // designId별 코멘트 배열
  comments: {},
  loading: false,

  /**
   * 특정 designId + sectionKey에 해당하는 코멘트 로드
   */
  loadComments: async (designId, sectionKey) => {
    set({ loading: true })
    try {
      const headers = await getHeaders()
      const params = sectionKey ? `?section_key=${encodeURIComponent(sectionKey)}` : ''
      const res = await fetch(`${API_BASE}/api/designs/${designId}/comments${params}`, { headers })
      if (!res.ok) throw new Error('코멘트 로드 실패')
      const data = await res.json()
      set((state) => ({
        comments: { ...state.comments, [designId]: data.comments || data || [] },
        loading: false,
      }))
    } catch {
      // API가 아직 없을 수 있으므로 빈 배열로 초기화
      set((state) => ({
        comments: { ...state.comments, [designId]: state.comments[designId] || [] },
        loading: false,
      }))
    }
  },

  /**
   * 새 코멘트 추가
   */
  addComment: async (designId, sectionKey, body) => {
    try {
      const headers = await getHeaders()
      const res = await fetch(`${API_BASE}/api/designs/${designId}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ section_key: sectionKey, body }),
      })
      if (!res.ok) throw new Error('코멘트 추가 실패')
      const data = await res.json()
      const comment = data.comment || {
        id: `local-${Date.now()}`,
        designId,
        sectionKey,
        body,
        resolved: false,
        created_at: new Date().toISOString(),
        author_name: localStorage.getItem('cw_nickname') || '나',
      }
      set((state) => ({
        comments: {
          ...state.comments,
          [designId]: [...(state.comments[designId] || []), comment],
        },
      }))
      return comment
    } catch {
      // 오프라인/API 없을 때 로컬로 추가
      const comment = {
        id: `local-${Date.now()}`,
        designId,
        sectionKey,
        body,
        resolved: false,
        created_at: new Date().toISOString(),
        author_name: localStorage.getItem('cw_nickname') || '나',
      }
      set((state) => ({
        comments: {
          ...state.comments,
          [designId]: [...(state.comments[designId] || []), comment],
        },
      }))
      return comment
    }
  },

  /**
   * 코멘트 내용 수정
   */
  updateComment: async (commentId, body) => {
    try {
      const headers = await getHeaders()
      await fetch(`${API_BASE}/api/comments/${commentId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ body }),
      })
    } catch {
      // 로컬 업데이트만 진행
    }
    set((state) => {
      const updated = {}
      for (const [key, list] of Object.entries(state.comments)) {
        updated[key] = list.map((c) =>
          c.id === commentId ? { ...c, body } : c
        )
      }
      return { comments: updated }
    })
  },

  /**
   * 코멘트 삭제
   */
  deleteComment: async (commentId) => {
    try {
      const headers = await getHeaders()
      await fetch(`${API_BASE}/api/comments/${commentId}`, {
        method: 'DELETE',
        headers,
      })
    } catch {
      // 로컬 삭제만 진행
    }
    set((state) => {
      const updated = {}
      for (const [key, list] of Object.entries(state.comments)) {
        updated[key] = list.filter((c) => c.id !== commentId)
      }
      return { comments: updated }
    })
  },

  /**
   * 코멘트 해결 처리
   */
  resolveComment: async (commentId) => {
    try {
      const headers = await getHeaders()
      await fetch(`${API_BASE}/api/comments/${commentId}/resolve`, {
        method: 'POST',
        headers,
      })
    } catch {
      // 로컬 업데이트만 진행
    }
    set((state) => {
      const updated = {}
      for (const [key, list] of Object.entries(state.comments)) {
        updated[key] = list.map((c) =>
          c.id === commentId ? { ...c, resolved: true, resolved_at: new Date().toISOString() } : c
        )
      }
      return { comments: updated }
    })
  },

  /**
   * 코멘트 해결 취소
   */
  unresolveComment: async (commentId) => {
    try {
      const headers = await getHeaders()
      await fetch(`${API_BASE}/api/comments/${commentId}/unresolve`, {
        method: 'POST',
        headers,
      })
    } catch {
      // 로컬 업데이트만 진행
    }
    set((state) => {
      const updated = {}
      for (const [key, list] of Object.entries(state.comments)) {
        updated[key] = list.map((c) =>
          c.id === commentId ? { ...c, resolved: false, resolved_at: null } : c
        )
      }
      return { comments: updated }
    })
  },

  /**
   * 실시간 댓글 이벤트 구독
   */
  subscribeComments: () => {
    const addHandler = (comment) => {
      if (!comment?.design_id) return
      set((state) => ({
        comments: {
          ...state.comments,
          [comment.design_id]: [...(state.comments[comment.design_id] || []).filter(c => c.id !== comment.id), comment],
        },
      }))
    }
    const updateHandler = (comment) => {
      if (!comment?.id) return
      set((state) => {
        const updated = {}
        for (const [key, list] of Object.entries(state.comments)) {
          updated[key] = list.map((c) => c.id === comment.id ? { ...c, ...comment } : c)
        }
        return { comments: updated }
      })
    }
    const resolveHandler = ({ commentId, resolved }) => {
      set((state) => {
        const updated = {}
        for (const [key, list] of Object.entries(state.comments)) {
          updated[key] = list.map((c) =>
            c.id === commentId ? { ...c, resolved, resolved_at: resolved ? new Date().toISOString() : null } : c
          )
        }
        return { comments: updated }
      })
    }

    socket.on('comment_added', addHandler)
    socket.on('comment_updated', updateHandler)
    socket.on('comment_resolved', resolveHandler)
    set({ _commentHandlers: { addHandler, updateHandler, resolveHandler } })
  },

  unsubscribeComments: () => {
    const handlers = get()._commentHandlers
    if (handlers) {
      socket.off('comment_added', handlers.addHandler)
      socket.off('comment_updated', handlers.updateHandler)
      socket.off('comment_resolved', handlers.resolveHandler)
    }
    set({ _commentHandlers: null })
  },
}))
