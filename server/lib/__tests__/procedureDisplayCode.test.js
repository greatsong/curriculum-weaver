/**
 * 절차 displayCode 정책 회귀 테스트
 *
 * UI는 내부 절차 코드(T-1-1 등)를 교사에게 노출하지 않고
 * 가이드북 표시용 displayCode(T-1 등)만 표시한다 (shared/constants.js 정책 주석 참조).
 * 새 절차를 추가하면서 displayCode를 빠뜨리면 UI 곳곳에서
 * 내부 코드가 그대로 노출되므로, 여기서 강제한다.
 */
import { describe, it, expect } from 'vitest'
import {
  PROCEDURES, PROCEDURE_LIST,
  getProcedureDisplayCode, getProcedureLabel,
} from 'curriculum-weaver-shared/constants.js'

// displayCode 없이 이름만 표시하기로 합의된 예외 절차
const DISPLAY_CODE_EXEMPT = new Set(['prep'])

describe('절차 displayCode 정책 (UI 내부 코드 노출 방지)', () => {
  it('예외(prep)를 제외한 모든 절차는 displayCode를 가진다', () => {
    for (const proc of PROCEDURE_LIST) {
      if (DISPLAY_CODE_EXEMPT.has(proc.code)) continue
      expect(proc.displayCode, `절차 ${proc.code}에 displayCode가 없습니다 — UI에 내부 코드가 노출됩니다`).toBeTruthy()
    }
  })

  it('displayCode는 내부 코드와 달라야 한다 (내부 코드 재노출 방지)', () => {
    for (const [code, proc] of Object.entries(PROCEDURES)) {
      if (!proc.displayCode) continue
      expect(proc.displayCode, `절차 ${code}의 displayCode가 내부 코드와 동일합니다`).not.toBe(code)
    }
  })

  it('예외 목록은 실제 존재하는 절차만 포함한다', () => {
    for (const code of DISPLAY_CODE_EXEMPT) {
      expect(PROCEDURES[code], `예외 목록의 ${code}가 PROCEDURES에 없습니다`).toBeTruthy()
    }
  })
})

describe('getProcedureDisplayCode / getProcedureLabel (UI 표시 헬퍼)', () => {
  it('내부 코드를 표시용 코드로 변환한다', () => {
    expect(getProcedureDisplayCode('T-1-1')).toBe('T-1')
    expect(getProcedureLabel('T-1-1')).toBe('T-1 공동 비전 설정')
  })

  it('displayCode 없는 절차(prep)는 코드 없이 이름만 반환한다', () => {
    expect(getProcedureDisplayCode('prep')).toBe('')
    expect(getProcedureLabel('prep')).toBe('학습자/맥락 정보 제공')
  })

  it('이름 오버라이드(SSE 이벤트의 name)를 지원한다', () => {
    expect(getProcedureLabel('T-1-1', '커스텀 이름')).toBe('T-1 커스텀 이름')
  })

  it('알 수 없는 코드는 내부 코드를 노출하지 않고 빈 값/오버라이드만 반환한다', () => {
    expect(getProcedureDisplayCode('X-9-9')).toBe('')
    expect(getProcedureLabel('X-9-9', '이름만')).toBe('이름만')
  })
})
