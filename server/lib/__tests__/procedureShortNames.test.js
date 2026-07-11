/**
 * 절차 축약명(PROCEDURE_SHORT_NAMES) 무결성 — 랜딩·온보딩 카피의 단일 소스.
 * 절차를 추가/제거하고 이 테스트가 깨지면 축약명도 함께 정비하라는 신호다.
 */
import { describe, it, expect } from 'vitest'
import {
  PROCEDURES,
  PROCEDURE_SHORT_NAMES,
  getPhaseProcedureSummary,
} from 'curriculum-weaver-shared/constants.js'

describe('PROCEDURE_SHORT_NAMES 무결성', () => {
  it('displayCode 있는 모든 절차에 축약명이 있다', () => {
    for (const [code, proc] of Object.entries(PROCEDURES)) {
      if (proc.displayCode) {
        expect(PROCEDURE_SHORT_NAMES[code], `${code} 축약명 누락`).toBeTruthy()
      }
    }
  })

  it('축약명에 존재하지 않는 절차 코드가 없다 (고아 항목 방지)', () => {
    for (const code of Object.keys(PROCEDURE_SHORT_NAMES)) {
      expect(PROCEDURES[code], `고아 축약명: ${code}`).toBeTruthy()
    }
  })

  it('getPhaseProcedureSummary — 온보딩 카피 형식 유지', () => {
    const t = getPhaseProcedureSummary('T')
    expect(t.names).toEqual(['비전', '방향', '역할', '규칙', '일정'])
    expect(t.range).toBe('T-1~T-5')
    const di = getPhaseProcedureSummary('DI')
    expect(di.range).toBe('DI-1~DI-2')
  })

  it('축약명은 내부 절차 코드 패턴을 포함하지 않는다 (어휘 격리 정합)', () => {
    for (const name of Object.values(PROCEDURE_SHORT_NAMES)) {
      expect(name).not.toMatch(/\b(?:T|A|Ds|DI|E)-\d+-\d+\b/)
    }
  })
})
