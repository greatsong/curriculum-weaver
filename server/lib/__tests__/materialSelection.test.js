import { describe, expect, it } from 'vitest'

import { resolveSelectedMaterialIds } from '../materialSelection.js'

const materials = [
  { id: 'm1', file_name: 'a.pdf' },
  { id: 'm2', file_name: 'b.pdf' },
]

describe('resolveSelectedMaterialIds', () => {
  it('selected_material_ids가 없으면 전체 포함을 뜻하는 undefined를 반환한다', () => {
    expect(resolveSelectedMaterialIds(undefined, materials)).toBeUndefined()
    expect(resolveSelectedMaterialIds(null, materials)).toBeUndefined()
  })

  it('빈 배열이어도 명시적 선택이 아니면 전체 포함으로 복구한다', () => {
    expect(resolveSelectedMaterialIds([], materials, { explicit: false })).toBeUndefined()
  })

  it('빈 배열이고 명시적 선택이면 모두 제외를 유지한다', () => {
    expect(resolveSelectedMaterialIds([], materials, { explicit: true })).toEqual([])
  })

  it('유효한 id만 중복 제거해 반환한다', () => {
    expect(resolveSelectedMaterialIds(['m1', 'missing', 'm1', 'm2'], materials, { explicit: true }))
      .toEqual(['m1', 'm2'])
  })

  it('값은 있었지만 모두 유효하지 않으면 stale 선택으로 보고 전체 포함한다', () => {
    expect(resolveSelectedMaterialIds(['temp-1'], materials, { explicit: true })).toBeUndefined()
  })
})
