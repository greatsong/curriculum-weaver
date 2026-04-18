import { create } from 'zustand'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api'

export const useWorkspaceStore = create((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  loading: false,
  error: null,

  /**
   * 사용자의 워크스페이스 목록 조회
   */
  fetchWorkspaces: async () => {
    set({ loading: true, error: null })
    try {
      const data = await apiGet('/api/workspaces')
      set({ workspaces: data?.workspaces ?? data ?? [], loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  /**
   * 특정 워크스페이스 상세 조회 (멤버, 프로젝트 포함)
   */
  fetchWorkspace: async (id) => {
    set({ loading: true, error: null })
    try {
      const data = await apiGet(`/api/workspaces/${id}`)
      set({ currentWorkspace: data, loading: false })
      return data
    } catch (err) {
      set({ error: err.message, loading: false, currentWorkspace: null })
      throw err
    }
  },

  /**
   * 새 워크스페이스 생성
   */
  createWorkspace: async (data) => {
    try {
      const workspace = await apiPost('/api/workspaces', data)
      set((state) => ({
        workspaces: [workspace, ...state.workspaces],
      }))
      return workspace
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 워크스페이스 정보 수정
   */
  updateWorkspace: async (id, data) => {
    try {
      const updated = await apiPut(`/api/workspaces/${id}`, data)
      set((state) => ({
        workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, ...updated } : w)),
        currentWorkspace:
          state.currentWorkspace?.id === id
            ? { ...state.currentWorkspace, ...updated }  // members, my_role, projects 보존
            : state.currentWorkspace,
      }))
      return updated
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 워크스페이스 삭제
   */
  deleteWorkspace: async (id) => {
    try {
      await apiDelete(`/api/workspaces/${id}`)
      set((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== id),
        currentWorkspace:
          state.currentWorkspace?.id === id ? null : state.currentWorkspace,
      }))
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 워크스페이스에 멤버 초대 (이메일 기반)
   *
   * 서버 응답:
   * - { kind: 'added', member } — 가입된 사용자가 즉시 멤버로 추가됨
   * - { kind: 'link', token, invite_path, expires_at } — 미가입자, 토큰 링크 생성됨
   */
  inviteMember: async (workspaceId, email, role = 'member') => {
    try {
      const result = await apiPost(`/api/workspaces/${workspaceId}/invite`, {
        email,
        role,
      })
      // 즉시 추가된 경우만 워크스페이스 새로고침 (링크만 생성한 경우 멤버는 아직 없음)
      if (result?.kind === 'added' && get().currentWorkspace?.id === workspaceId) {
        await get().fetchWorkspace(workspaceId)
      }
      return result
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 초대 토큰으로 워크스페이스 참여
   */
  acceptInvite: async (token) => {
    try {
      const result = await apiPost(`/api/invites/${token}/accept`, {})
      // 서버 응답: { message, workspace_id, role }
      await get().fetchWorkspaces()
      // 방금 합류한 워크스페이스 상세 조회 (이름·멤버 포함)
      let workspace = null
      try {
        workspace = await get().fetchWorkspace(result.workspace_id)
      } catch {
        // 상세 조회 실패해도 id는 확보되므로 무시
      }
      return {
        id: result.workspace_id,
        name: workspace?.name,
        role: result.role,
        message: result.message,
      }
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 현재 워크스페이스 초기화
   */
  clearCurrent: () => set({ currentWorkspace: null }),

  /**
   * 에러 초기화
   */
  clearError: () => set({ error: null }),
}))
