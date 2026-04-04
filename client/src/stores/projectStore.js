import { create } from 'zustand'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api'

export const useProjectStore = create((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,

  /**
   * 워크스페이스 내 프로젝트 목록 조회
   */
  fetchProjects: async (workspaceId) => {
    set({ loading: true, error: null })
    try {
      const data = await apiGet(`/api/workspaces/${workspaceId}/projects`)
      set({ projects: data, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  /**
   * 특정 프로젝트 상세 조회
   */
  fetchProject: async (id) => {
    set({ loading: true, error: null })
    try {
      const data = await apiGet(`/api/projects/${id}`)
      set({ currentProject: data, loading: false })
      return data
    } catch (err) {
      set({ error: err.message, loading: false, currentProject: null })
      throw err
    }
  },

  /**
   * 새 프로젝트 생성
   */
  createProject: async (workspaceId, data) => {
    try {
      const project = await apiPost(`/api/workspaces/${workspaceId}/projects`, data)
      set((state) => ({
        projects: [project, ...state.projects],
      }))
      return project
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 프로젝트 정보 수정
   */
  updateProject: async (id, data) => {
    try {
      const updated = await apiPut(`/api/projects/${id}`, data)
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        currentProject:
          state.currentProject?.id === id ? updated : state.currentProject,
      }))
      return updated
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 프로젝트 삭제
   */
  deleteProject: async (id) => {
    try {
      await apiDelete(`/api/projects/${id}`)
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject:
          state.currentProject?.id === id ? null : state.currentProject,
      }))
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 프로젝트의 현재 절차 업데이트
   */
  updateProcedure: async (id, procedureCode) => {
    try {
      const updated = await apiPut(`/api/projects/${id}`, {
        current_procedure: procedureCode,
      })
      set((state) => ({
        currentProject:
          state.currentProject?.id === id ? updated : state.currentProject,
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
      }))
      return updated
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  /**
   * 현재 프로젝트 초기화
   */
  clearCurrent: () => set({ currentProject: null }),

  /**
   * 에러 초기화
   */
  clearError: () => set({ error: null }),
}))
