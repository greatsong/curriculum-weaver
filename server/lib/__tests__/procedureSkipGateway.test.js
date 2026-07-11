/**
 * 절차 스킵 관문 함수 회귀 테스트
 *
 * 스킵 인식이 필요한 모든 소비처(진행률·네비·AI 절차 계산·보고서)는
 * PROCEDURE_LIST 직접 순회 대신 이 관문 함수들을 쓴다 (shared/constants.js).
 * 여기가 무너지면 "스킵했는데 AI가 되살리는" 류의 조용한 버그가 전 소비처로 퍼진다.
 */
import { describe, it, expect } from 'vitest'
import {
  PROCEDURE_LIST,
  UNSKIPPABLE_PROCEDURES,
  isProcedureSkippable,
  getActiveProcedures,
  getNextActiveProcedure,
} from 'curriculum-weaver-shared/constants.js'

describe('UNSKIPPABLE_PROCEDURES', () => {
  it('코어 5개가 정확히 고정되어 있다 (보고서·AI 하드코딩 참조)', () => {
    expect(UNSKIPPABLE_PROCEDURES).toEqual(['T-1-1', 'T-2-1', 'A-1-2', 'A-2-1', 'A-2-2'])
  })

  it('코어는 전부 실존하는 절차 코드다', () => {
    const codes = new Set(PROCEDURE_LIST.map((p) => p.code))
    for (const core of UNSKIPPABLE_PROCEDURES) {
      expect(codes.has(core)).toBe(true)
    }
  })
})

describe('isProcedureSkippable', () => {
  it('코어 절차는 스킵 불가', () => {
    for (const core of UNSKIPPABLE_PROCEDURES) {
      expect(isProcedureSkippable(core)).toBe(false)
    }
  })

  it('prep은 스킵 불가', () => {
    expect(isProcedureSkippable('prep')).toBe(false)
  })

  it('존재하지 않는 코드는 스킵 불가', () => {
    expect(isProcedureSkippable('E-9-9')).toBe(false)
    expect(isProcedureSkippable('')).toBe(false)
    expect(isProcedureSkippable(undefined)).toBe(false)
  })

  it('일반 절차(T-2-2 팀 규칙 등)는 스킵 가능', () => {
    expect(isProcedureSkippable('T-2-2')).toBe(true)
    expect(isProcedureSkippable('Ds-2-2')).toBe(true)
    expect(isProcedureSkippable('E-2-1')).toBe(true)
  })
})

describe('getActiveProcedures', () => {
  it('스킵 없으면 전체 목록 그대로 (참조 동일 — 불필요한 재계산 없음)', () => {
    expect(getActiveProcedures()).toBe(PROCEDURE_LIST)
    expect(getActiveProcedures([])).toBe(PROCEDURE_LIST)
  })

  it('스킵된 절차가 목록·분모에서 빠진다', () => {
    const active = getActiveProcedures(['T-2-2', 'Ds-2-2'])
    expect(active.length).toBe(PROCEDURE_LIST.length - 2)
    expect(active.some((p) => p.code === 'T-2-2')).toBe(false)
    expect(active.some((p) => p.code === 'Ds-2-2')).toBe(false)
  })

  it('order 정렬이 유지된다', () => {
    const active = getActiveProcedures(['A-1-1'])
    const orders = active.map((p) => p.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })
})

describe('getNextActiveProcedure', () => {
  it('스킵 없으면 바로 다음 절차', () => {
    expect(getNextActiveProcedure('T-1-1').code).toBe('T-1-2')
  })

  it('다음 절차가 스킵이면 건너뛰고 그 다음 생존 절차 — AI 절차 전환 제안의 핵심', () => {
    // T-2-1(T-3) 다음은 T-2-2(T-4)지만 스킵됨 → T-2-3(T-5)
    expect(getNextActiveProcedure('T-2-1', ['T-2-2']).code).toBe('T-2-3')
  })

  it('연속 스킵 구간도 건너뛴다', () => {
    expect(getNextActiveProcedure('T-2-1', ['T-2-2', 'T-2-3']).code).toBe('A-1-1')
  })

  it('마지막 절차 이후는 null', () => {
    expect(getNextActiveProcedure('E-2-1')).toBeNull()
  })

  it('뒤가 전부 스킵이면 null (procedure_advance 미생성 경로)', () => {
    expect(getNextActiveProcedure('E-1-1', ['E-2-1'])).toBeNull()
  })

  it('존재하지 않는 기준 코드는 null', () => {
    expect(getNextActiveProcedure('X-0-0')).toBeNull()
  })
})
