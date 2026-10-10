import { describe, it, expect } from 'vitest'
import { extractProcedureAdvance } from '../chat.js'

// 회귀 테스트: 교사 피드백 "제목 없는 오류"(이동 버튼에 절차명·코드가 비는 현상).
// 근본원인 — ① 마지막 절차에서 AI가 존재하지 않는 다음 절차(E-2-2)를 환각,
//            ② 파서가 속성 순서/reason 유무에 민감해 유효 전환도 놓침.
describe('extractProcedureAdvance', () => {
  it('정상 self-closing 형식에서 다음 절차를 추출한다', () => {
    const { procedureAdvance } = extractProcedureAdvance(
      '좋아요! <procedure_advance current="A-1-1" suggested="A-2-1" reason="분석 완료"/> 다음으로 갈까요?'
    )
    expect(procedureAdvance).toEqual({ current: 'A-1-1', suggested: 'A-2-1', reason: '분석 완료' })
  })

  it('속성 순서가 바뀌어도 추출한다 (순서 비의존)', () => {
    const { procedureAdvance } = extractProcedureAdvance(
      '<procedure_advance suggested="A-2-1" reason="요약" current="A-1-1"/>'
    )
    expect(procedureAdvance?.suggested).toBe('A-2-1')
    expect(procedureAdvance?.current).toBe('A-1-1')
  })

  it('reason이 없어도 추출한다 (reason 선택적)', () => {
    const { procedureAdvance } = extractProcedureAdvance(
      '<procedure_advance current="A-1-1" suggested="A-2-1"/>'
    )
    expect(procedureAdvance?.suggested).toBe('A-2-1')
    expect(procedureAdvance?.reason).toBe('')
  })

  it('블록 형식(<...></procedure_advance>)도 추출한다', () => {
    const { procedureAdvance } = extractProcedureAdvance(
      '<procedure_advance current="A-1-1" suggested="A-2-1" reason="x"></procedure_advance>'
    )
    expect(procedureAdvance?.suggested).toBe('A-2-1')
  })

  it('존재하지 않는 절차 코드(E-2-2 환각)는 전환 제안을 버린다', () => {
    const input = '과정 성찰이 끝났어요! <procedure_advance current="E-2-1" suggested="E-2-2" reason="완료"/>'
    const { procedureAdvance, cleanText } = extractProcedureAdvance(input)
    expect(procedureAdvance).toBeNull()
    // XML 마커는 본문에서 제거된다
    expect(cleanText).not.toContain('procedure_advance')
  })

  it('suggested가 없으면 null', () => {
    const { procedureAdvance } = extractProcedureAdvance(
      '<procedure_advance current="A-1-1" reason="x"/>'
    )
    expect(procedureAdvance).toBeNull()
  })

  it('태그가 없으면 원문 유지 + null', () => {
    const { procedureAdvance, cleanText } = extractProcedureAdvance('그냥 대화입니다.')
    expect(procedureAdvance).toBeNull()
    expect(cleanText).toBe('그냥 대화입니다.')
  })

  it('추출 후 본문에서 XML 태그를 제거한다', () => {
    const { cleanText } = extractProcedureAdvance(
      '앞 문장 <procedure_advance current="A-1-1" suggested="A-2-1" reason="x"/> 뒤 문장'
    )
    expect(cleanText).toBe('앞 문장  뒤 문장'.trim())
    expect(cleanText).not.toContain('procedure_advance')
  })
})

describe('extractProcedureAdvance — 닫는 형식이 흔들려도 읽는다(2026-10-10 루나 시험 사례)', () => {
  const cases = [
    ['닫는 빗금 없음', '정리했습니다.\n<procedure_advance current="prep" suggested="T-1" reason="학습자 맥락 정리">'],
    ['빗금 뒤 공백', '정리했습니다.\n<procedure_advance current="T-4" suggested="T-5" reason="규칙 확정"/ >'],
    ['빗금+태그 이름', '정리했습니다.\n<procedure_advance current="A-1" suggested="A-2" reason="기준 정리"/procedure_advance>'],
    ['여는·닫는 태그 쌍', '정리했습니다.\n<procedure_advance current="A-3" suggested="A-4" reason="분석 정리"></procedure_advance>'],
  ]
  it.each(cases)('%s', (_label, text) => {
    const { cleanText, procedureAdvance } = extractProcedureAdvance(text)
    expect(procedureAdvance).not.toBeNull()
    expect(procedureAdvance.reason.length).toBeGreaterThan(0)
    expect(cleanText).toBe('정리했습니다.')
  })
  it('사유에 > 가 있어도 태그를 끝까지 읽는다', () => {
    const { procedureAdvance, cleanText } = extractProcedureAdvance('끝.\n<procedure_advance current="prep" suggested="T-1" reason="A > B 비교 정리"/>')
    expect(procedureAdvance.reason).toBe('A > B 비교 정리')
    expect(cleanText).toBe('끝.')
  })
})
