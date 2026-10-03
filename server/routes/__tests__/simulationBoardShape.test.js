/**
 * 시뮬레이션 보드 형태 맞춤 — 형태 하나 때문에 절차 전체가 버려져 프로젝트가 '실패'로 표시되던 문제
 * (2026-10-04 운영: E-1 학습 결과가 문자열 목록으로 와서 18/19 저장, 실패 표시)
 */
import { describe, it, expect } from 'vitest'
import { buildSchemaText, isValidSimulationBoard, normalizeSimulationBoard } from '../demo.js'

describe('시뮬레이션 보드 스키마 안내', () => {
  it('항목 형식이 있는 목록 칸에는 문자열 배열 안내를 붙이지 않는다', () => {
    const text = buildSchemaText(['E-1-1'])
    const learning = text.split('\n  - ').find((line) => line.startsWith('learningResults'))
    const improvements = text.split('\n  - ').find((line) => line.startsWith('improvements'))
    expect(learning).toContain('객체 배열')
    expect(learning).not.toContain('문자열 배열')
    expect(improvements).toContain('문자열 배열')
  })
})

describe('normalizeSimulationBoard', () => {
  it('E-1 학습 결과가 문자열 목록이면 서술 칸에 담아 보드를 살린다', () => {
    const raw = { learningResults: ['물리: 데이터로 낙하 속도 확인', '정보: 회귀선 작성'], improvements: ['시간 배분 조정'] }
    expect(isValidSimulationBoard('E-1-1', raw)).toBe(false)
    const fixed = normalizeSimulationBoard('E-1-1', raw)
    expect(fixed.learningResults).toEqual([
      { processResult: '물리: 데이터로 낙하 속도 확인' },
      { processResult: '정보: 회귀선 작성' },
    ])
    expect(isValidSimulationBoard('E-1-1', fixed)).toBe(true)
  })

  it('서술 칸이 없는 항목 형식은 첫 키에 담는다 (A-2 주제 후보)', () => {
    const fixed = normalizeSimulationBoard('A-1-2', { candidates: ['기후와 데이터'], selectedTopic: '기후와 데이터' })
    expect(fixed.candidates).toEqual([{ topic: '기후와 데이터' }])
  })

  it('필수 항목 칸(T-2 방향)도 문자열 목록이면 객체로 바꿔 통과시킨다', () => {
    const fixed = normalizeSimulationBoard('T-1-2', { directions: ['학생 주도 탐구'] })
    expect(fixed.directions).toEqual([{ direction: '학생 주도 탐구' }])
    expect(isValidSimulationBoard('T-1-2', fixed)).toBe(true)
  })

  it('문자열 목록 칸에 객체가 오면 값을 이어 붙인 문장으로 바꾼다', () => {
    const fixed = normalizeSimulationBoard('E-1-1', { improvements: [{ item: '모둠 구성', detail: '역할 고정' }, '시간 조정', {}] })
    expect(fixed.improvements).toEqual(['모둠 구성 / 역할 고정', '시간 조정'])
    expect(isValidSimulationBoard('E-1-1', fixed)).toBe(true)
  })

  it('형태가 맞지 않는 선택 칸은 그 칸만 지운다', () => {
    const fixed = normalizeSimulationBoard('E-1-1', { improvements: ['시간 조정'], revisionLog: '표 대신 문장' })
    expect(fixed).not.toHaveProperty('revisionLog')
    expect(isValidSimulationBoard('E-1-1', fixed)).toBe(true)
  })

  it('필수 칸의 형태가 맞지 않으면 그대로 두어 검증에서 걸러진다', () => {
    const fixed = normalizeSimulationBoard('E-2-1', { agreementReview: '문장 하나', operatingPrinciples: ['서로 확인'] })
    expect(fixed.agreementReview).toBe('문장 하나')
    expect(isValidSimulationBoard('E-2-1', fixed)).toBe(false)
  })

  it('이미 올바른 보드는 바꾸지 않는다', () => {
    const board = {
      learningResults: [{ subject: '물리', processResult: '낙하 실험' }],
      rubricGapAnalysis: '차이 분석',
      improvements: ['시간 조정'],
      revisionLog: [{ target: '2차시', change: '자료 교체', reason: '난도' }],
    }
    expect(normalizeSimulationBoard('E-1-1', board)).toEqual(board)
  })
})
