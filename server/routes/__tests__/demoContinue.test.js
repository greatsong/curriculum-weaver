/**
 * 이어서 시뮬레이션 순수 헬퍼 테스트
 * - isBoardContentEmpty: 보드 공백 판정 (결정 #2의 기준)
 * - computeRemainingCodes: 잔여 절차 판정 (현재 절차 이후만, 작성분 재생성 금지)
 * - remapClonedMessageRows: 채팅 복제 시 멘션 자료 ID 재매핑
 */
import { describe, it, expect } from 'vitest'
import { isBoardContentEmpty, computeRemainingCodes, remapClonedMessageRows } from '../demo.js'

describe('isBoardContentEmpty', () => {
  it('null/undefined/비객체는 비어 있음', () => {
    expect(isBoardContentEmpty(null)).toBe(true)
    expect(isBoardContentEmpty(undefined)).toBe(true)
    expect(isBoardContentEmpty('text')).toBe(true)
  })

  it('빈 객체·빈 문자열·빈 배열만 있으면 비어 있음', () => {
    expect(isBoardContentEmpty({})).toBe(true)
    expect(isBoardContentEmpty({ a: '', b: [], c: null })).toBe(true)
    expect(isBoardContentEmpty({ a: '   ', b: [{}], c: { d: '' } })).toBe(true)
  })

  it('실질 값이 하나라도 있으면 작성됨', () => {
    expect(isBoardContentEmpty({ a: '내용' })).toBe(false)
    expect(isBoardContentEmpty({ a: '', rows: [{ goal: '목표' }] })).toBe(false)
    expect(isBoardContentEmpty({ nested: { deep: '값' } })).toBe(false)
    expect(isBoardContentEmpty({ count: 0 })).toBe(false) // 숫자는 값으로 취급
  })
})

describe('computeRemainingCodes', () => {
  const design = (code, content) => ({ procedure_code: code, content })

  it('현재 절차가 비어 있으면 현재 절차부터 포함', () => {
    const designs = [design('prep', { note: '작성됨' })]
    const { currentCode, remaining } = computeRemainingCodes('T-1-1', designs)
    expect(currentCode).toBe('T-1-1')
    expect(remaining[0]).toBe('T-1-1')
  })

  it('현재 절차가 작성돼 있으면 다음 절차부터', () => {
    const designs = [
      design('prep', { note: '작성됨' }),
      design('T-1-1', { vision: '팀 비전' }),
    ]
    const { remaining } = computeRemainingCodes('T-1-1', designs)
    expect(remaining[0]).toBe('T-1-2')
    expect(remaining).not.toContain('T-1-1')
    expect(remaining).not.toContain('prep') // 현재 절차 이전은 대상 아님
  })

  it('현재 절차 이후라도 이미 작성된 보드는 재생성하지 않음', () => {
    const designs = [
      design('T-1-1', { vision: '작성됨' }),
      design('A-1-1', { explore: '건너뛰고 미리 작성' }),
    ]
    const { remaining } = computeRemainingCodes('T-1-1', designs)
    expect(remaining).not.toContain('A-1-1')
    expect(remaining).toContain('T-1-2')
    expect(remaining).toContain('E-2-1')
  })

  it('유효하지 않은 현재 절차 코드는 prep으로 폴백', () => {
    const { currentCode, remaining } = computeRemainingCodes('없는코드', [])
    expect(currentCode).toBe('prep')
    expect(remaining[0]).toBe('prep')
    expect(remaining).toHaveLength(19) // 전체 절차
  })

  it('모든 절차가 작성되어 있으면 잔여 없음', () => {
    const designs = ['prep', 'T-1-1', 'T-1-2', 'T-2-1', 'T-2-2', 'T-2-3', 'A-1-1', 'A-1-2', 'A-2-1', 'A-2-2',
      'Ds-1-1', 'Ds-1-2', 'Ds-1-3', 'Ds-2-1', 'Ds-2-2', 'DI-1-1', 'DI-2-1', 'E-1-1', 'E-2-1']
      .map((c) => design(c, { done: '작성' }))
    const { remaining } = computeRemainingCodes('E-2-1', designs)
    expect(remaining).toHaveLength(0)
  })
})

describe('remapClonedMessageRows', () => {
  const idMap = new Map([
    ['old-mat-1', 'new-mat-1'],
    ['old-mat-2', 'new-mat-2'],
  ])

  it('id 제거 + project_id 교체', () => {
    const rows = remapClonedMessageRows(
      [{ id: 'msg-1', project_id: 'src', content: '안녕', sender_type: 'user' }],
      'clone-id', idMap
    )
    expect(rows[0].id).toBeUndefined()
    expect(rows[0].project_id).toBe('clone-id')
    expect(rows[0].content).toBe('안녕')
  })

  it('멘션 자료 ID를 새 ID로 재매핑, 매핑 없는 ID는 제거', () => {
    const rows = remapClonedMessageRows(
      [{
        id: 'm', project_id: 'src', content: '@자료',
        mentioned_material_ids: ['old-mat-1', 'deleted-mat', 'old-mat-2'],
      }],
      'clone-id', idMap
    )
    expect(rows[0].mentioned_material_ids).toEqual(['new-mat-1', 'new-mat-2'])
  })

  it('attached_material_id 재매핑, 매핑 없으면 null', () => {
    const rows = remapClonedMessageRows(
      [
        { id: 'a', project_id: 'src', content: 'x', attached_material_id: 'old-mat-1' },
        { id: 'b', project_id: 'src', content: 'y', attached_material_id: 'deleted-mat' },
      ],
      'clone-id', idMap
    )
    expect(rows[0].attached_material_id).toBe('new-mat-1')
    expect(rows[1].attached_material_id).toBeNull()
  })

  it('created_at은 보존 (복제본 타임라인 유지)', () => {
    const rows = remapClonedMessageRows(
      [{ id: 'm', project_id: 'src', content: 'x', created_at: '2026-07-01T00:00:00Z' }],
      'clone-id', idMap
    )
    expect(rows[0].created_at).toBe('2026-07-01T00:00:00Z')
  })
})
