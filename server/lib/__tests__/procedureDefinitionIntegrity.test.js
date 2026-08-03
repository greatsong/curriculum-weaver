/**
 * 절차 정의 4계층(constants·steps·boardSchemas·guide) 정합성 가드
 *
 * 가이드북 3장 개정(2026-08)처럼 스텝·보드 구조를 손볼 때 생기는 "조용한 실패"를 잡는다:
 * - 스텝의 boardField가 보드 스키마에 없으면 → AI 제안이 저장돼도 화면·보고서에 영원히 안 보임
 * - 미등록 actionType이면 → 대화 프로토콜이 빈 문자열로 조용히 무주입
 * - 가이드 필수 필드(aiRole·methods·reflectionQuestions)가 빠지면 → buildSystemPrompt가 TypeError
 * 이 테스트가 깨지면 테스트가 아니라 정의 파일을 고칠 것.
 */
import { describe, it, expect } from 'vitest'
import {
  PROCEDURE_LIST,
  BOARD_TYPES,
  ACTION_TYPES,
  ACTOR_COLUMNS,
} from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import { PROCEDURE_GUIDE } from '../../data/procedureGuide.js'

const CODES = PROCEDURE_LIST.map((p) => p.code)

describe('스텝 boardField ↔ 보드 스키마 정합', () => {
  it('boardField가 지정된 모든 스텝은 해당 절차 보드 스키마에 실재하는 필드를 가리킨다', () => {
    const violations = []
    for (const code of CODES) {
      const steps = PROCEDURE_STEPS[code] || []
      const boardType = BOARD_TYPES[code]
      const schema = boardType ? BOARD_SCHEMAS[boardType] : null
      const fieldNames = new Set((schema?.fields || []).map((f) => f.name))
      for (const step of steps) {
        if (step.boardField && !fieldNames.has(step.boardField)) {
          violations.push(`${code} 스텝${step.stepNumber} boardField='${step.boardField}' (보드 ${boardType}에 없음)`)
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('보드 스키마의 fields와 empty 골격이 어긋나지 않는다 (empty의 키는 전부 fields에 존재)', () => {
    const violations = []
    for (const [boardType, schema] of Object.entries(BOARD_SCHEMAS)) {
      const fieldNames = new Set((schema.fields || []).map((f) => f.name))
      for (const key of Object.keys(schema.empty || {})) {
        if (!fieldNames.has(key)) violations.push(`${boardType}.empty.${key} — fields에 정의 없음`)
      }
      for (const f of schema.fields || []) {
        if (!(f.name in (schema.empty || {}))) violations.push(`${boardType}.fields.${f.name} — empty에 골격 없음`)
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })
})

describe('스텝 actionType/actorColumn enum 정합', () => {
  it('모든 스텝의 actionType은 ACTION_TYPES에, actorColumn은 ACTOR_COLUMNS에 등록돼 있다', () => {
    const violations = []
    for (const code of CODES) {
      for (const step of PROCEDURE_STEPS[code] || []) {
        if (step.actionType && !ACTION_TYPES[step.actionType]) {
          violations.push(`${code} 스텝${step.stepNumber} actionType='${step.actionType}'`)
        }
        if (step.actorColumn && !ACTOR_COLUMNS[step.actorColumn]) {
          violations.push(`${code} 스텝${step.stepNumber} actorColumn='${step.actorColumn}'`)
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })
})

describe('절차 가이드 필수 필드 (buildSystemPrompt 크래시 방지)', () => {
  const GUIDED = CODES.filter((c) => c !== 'prep')

  it('18개 세부절차 가이드에 aiRole(guide·generate·check·record 키)·methods·reflectionQuestions가 존재한다', () => {
    const violations = []
    for (const code of GUIDED) {
      const g = PROCEDURE_GUIDE[code]
      if (!g) { violations.push(`${code}: 가이드 없음`); continue }
      if (!g.aiRole || typeof g.aiRole !== 'object') violations.push(`${code}: aiRole 없음`)
      else {
        for (const k of ['guide', 'generate', 'check', 'record']) {
          if (!(k in g.aiRole)) violations.push(`${code}: aiRole.${k} 키 없음`)
        }
      }
      if (!Array.isArray(g.methods) || g.methods.length === 0) violations.push(`${code}: methods 없음/빈 배열`)
      if (!Array.isArray(g.reflectionQuestions)) violations.push(`${code}: reflectionQuestions 없음`)
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('coherenceCheck.checkAgainst는 실재하는 내부 절차 코드만 참조한다', () => {
    const codeSet = new Set(CODES)
    const violations = []
    for (const code of GUIDED) {
      const targets = PROCEDURE_GUIDE[code]?.coherenceCheck?.checkAgainst || []
      for (const t of targets) {
        if (!codeSet.has(t)) violations.push(`${code} → checkAgainst '${t}' (미등록 코드)`)
        if (t && !BOARD_TYPES[t]) violations.push(`${code} → checkAgainst '${t}' (보드 타입 없음 — buildCoherenceContext가 조회 실패)`)
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })
})
