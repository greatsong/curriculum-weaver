import { create } from 'zustand'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api'
import { sameJson } from '../lib/sameJson'

/**
 * PUT 응답(프로젝트 행)을 기존 객체에 합친다.
 * PUT 응답에는 GET에만 붙는 my_role·skipped_procedures가 없다. 통째로 바꾸면
 * 절차를 옮길 때마다 호스트의 건너뛰기 버튼이 사라지고 화면의 생략 표시가 풀린다.
 * skipped_procedures는 기존 참조를 유지해 생략 목록 초기화 effect가 다시 돌지 않게 한다.
 */
export function mergeProjectRow(prev, updated) {
  if (!prev || !updated) return updated || prev
  return { ...prev, ...updated }
}

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
      set({ projects: data?.projects ?? data ?? [], loading: false })
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
      // 내용이 같으면 기존 객체를 유지한다. 새 객체로 바꾸면 currentProject를 의존하는
      // effect(보드·성취기준·자료 재로딩)가 탭 복귀 때마다 한 번 더 돈다.
      const prev = get().currentProject
      if (prev && prev.id === data?.id && sameJson(prev, data)) {
        set({ loading: false })
        return prev
      }
      set({ currentProject: data, loading: false })
      return data
    } catch (err) {
      // ★ 일시 실패(탭 복귀·배포 재시작 등)로 같은 프로젝트의 기존 상태를 날리면
      //   절차 복원 effect가 동작 못 해 1단계로 리셋된다. 마지막으로 알던 값을 보존한다.
      set((state) => ({
        error: err.message,
        loading: false,
        currentProject: state.currentProject?.id === id ? state.currentProject : null,
      }))
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
        projects: state.projects.map((p) => (p.id === id ? mergeProjectRow(p, updated) : p)),
        currentProject:
          state.currentProject?.id === id
            ? mergeProjectRow(state.currentProject, updated)
            : state.currentProject,
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
          state.currentProject?.id === id
            ? mergeProjectRow(state.currentProject, updated)
            : state.currentProject,
        projects: state.projects.map((p) => (p.id === id ? mergeProjectRow(p, updated) : p)),
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
