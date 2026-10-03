/**
 * 절차 이동 후 역할·생략 목록 유지 회귀 테스트 (2026-10-03)
 *
 * 절차를 옮기면 PUT 응답(프로젝트 행)이 currentProject를 통째로 덮어써 GET에만 붙는
 * my_role·skipped_procedures가 사라졌다. 그 결과 호스트의 건너뛰기 버튼이 사라지고
 * 화면의 생략 표시가 풀렸다. PUT 응답을 기존 객체에 합쳐 두 값이 남는지 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}))

import { apiPut } from '../../lib/api'
import { useProjectStore, mergeProjectRow } from '../projectStore.js'

const row = (over = {}) => ({
  id: 'p1', workspace_id: 'w1', title: '융합 수업', grade: '고등학교', subjects: ['수학'],
  current_procedure: 'T-2-2', status: 'active', updated_at: '2026-10-03T00:00:00Z', ...over,
})

describe('mergeProjectRow', () => {
  it('PUT 응답 필드는 덮어쓰고 GET 전용 필드는 남긴다', () => {
    const skips = [{ procedure_code: 'T-2-3' }]
    const prev = { ...row(), my_role: 'owner', skipped_procedures: skips }
    const merged = mergeProjectRow(prev, row({ current_procedure: 'T-3-1' }))
    expect(merged.current_procedure).toBe('T-3-1')
    expect(merged.my_role).toBe('owner')
    expect(merged.skipped_procedures).toBe(skips)
  })

  it('한쪽이 없으면 있는 쪽을 돌려준다', () => {
    expect(mergeProjectRow(null, row())).toEqual(row())
    expect(mergeProjectRow(row(), null)).toEqual(row())
  })
})

describe('updateProcedure', () => {
  beforeEach(() => {
    vi.mocked(apiPut).mockReset()
  })

  it('절차를 옮겨도 my_role과 skipped_procedures 참조가 그대로 남는다', async () => {
    const skips = [{ procedure_code: 'T-2-3' }]
    useProjectStore.setState({
      currentProject: { ...row(), my_role: 'owner', skipped_procedures: skips },
      projects: [{ ...row(), message_count: 7 }],
    })
    vi.mocked(apiPut).mockResolvedValueOnce(row({ current_procedure: 'T-3-1' }))

    await useProjectStore.getState().updateProcedure('p1', 'T-3-1')

    const { currentProject, projects } = useProjectStore.getState()
    expect(currentProject.current_procedure).toBe('T-3-1')
    expect(currentProject.my_role).toBe('owner')
    expect(currentProject.skipped_procedures).toBe(skips)
    // 목록 항목의 부가 필드(메시지 수 등)도 지워지지 않는다
    expect(projects[0].message_count).toBe(7)
    expect(projects[0].current_procedure).toBe('T-3-1')
  })

  it('다른 프로젝트를 보고 있으면 currentProject를 건드리지 않는다', async () => {
    const other = { ...row({ id: 'p2' }), my_role: 'editor' }
    useProjectStore.setState({ currentProject: other, projects: [] })
    vi.mocked(apiPut).mockResolvedValueOnce(row({ current_procedure: 'T-3-1' }))

    await useProjectStore.getState().updateProcedure('p1', 'T-3-1')

    expect(useProjectStore.getState().currentProject).toBe(other)
  })
})
