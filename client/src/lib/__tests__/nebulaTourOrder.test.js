/**
 * 교육과정 성운 우주여행 순서 (2026-10-19)
 * 산업수요전문·예술계열전문·교양은 뒤로, 산업수요전문이 마지막. 나머지는 받은 순서(성취기준 수 많은 순) 그대로
 */
import { describe, it, expect } from 'vitest'
import { orderTourGroups } from '../nebulaTheme'

const g = (name, count) => ({ name, count })

describe('orderTourGroups', () => {
  it('세 교과군을 뒤로 보내고 산업수요전문을 마지막에 둔다', () => {
    const input = [g('산업수요전문', 900), g('예술계열전문', 500), g('국어', 300), g('교양', 250), g('수학', 200), g('과학', 150)]
    expect(orderTourGroups(input).map((x) => x.name)).toEqual(['국어', '수학', '과학', '예술계열전문', '교양', '산업수요전문'])
  })

  it('예술계열전문·교양은 들어온 순서를 지킨다', () => {
    const input = [g('교양', 600), g('산업수요전문', 500), g('예술계열전문', 400), g('정보', 100)]
    expect(orderTourGroups(input).map((x) => x.name)).toEqual(['정보', '교양', '예술계열전문', '산업수요전문'])
  })

  it('세 교과군이 없으면 그대로, 원본 배열은 바꾸지 않는다', () => {
    const input = [g('국어', 3), g('수학', 2)]
    expect(orderTourGroups(input)).toEqual(input)
    const withTail = [g('산업수요전문', 9), g('국어', 3)]
    orderTourGroups(withTail)
    expect(withTail.map((x) => x.name)).toEqual(['산업수요전문', '국어'])
    expect(orderTourGroups(undefined)).toEqual([])
  })
})
