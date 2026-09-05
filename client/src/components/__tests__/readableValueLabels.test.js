/**
 * AI 제안 카드 라벨 회귀 테스트
 *
 * 보드 스키마(shared/boardSchemas.js)에는 필드마다 한국어 label이 있는데,
 * ReadableValue가 자체 사전 16개만 보던 탓에 신규 사용자가 처음 받는 제안 카드에
 * studentCount·digitalLiteracy 같은 영문 키가 그대로 노출됐다.
 * 여기가 무너지면 첫 화면이 다시 반쯤 영어가 된다.
 */
import { describe, it, expect } from 'vitest'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import { labelize, KEY_LABELS } from '../ReadableValue.jsx'

/** 영문 카멜케이스/스네이크 키가 그대로 노출됐는지 */
const looksLikeRawKey = (s) => /^[a-z][A-Za-z0-9_]*$/.test(s)

describe('labelize — 보드 스키마 라벨 사용', () => {
  it('prep(학습자 맥락) 보드의 모든 필드가 한국어 라벨을 갖는다', () => {
    for (const field of BOARD_SCHEMAS.learner_context.fields) {
      const label = labelize(field.name)
      expect(label, `${field.name}이 영문 키 그대로 노출`).toBe(field.label)
      expect(looksLikeRawKey(label)).toBe(false)
    }
  })

  it('첫 대화에서 실제로 나왔던 필드들이 한국어로 바뀐다', () => {
    expect(labelize('studentCount')).toBe('학생 수')
    expect(labelize('digitalLiteracy')).toBe('디지털 리터러시 수준')
    expect(labelize('genderRatio')).toBe('성별 구성')
    expect(labelize('multicultural')).toBe('다문화 학생')
    expect(labelize('specialNeeds')).toBe('특수 교육 대상')
    expect(labelize('prevContext')).toBe('선행 학습 맥락')
    expect(labelize('additionalNotes')).toBe('추가 참고사항')
  })

  it('모든 보드의 최상위 필드가 라벨을 갖는다 (스키마 전수)', () => {
    const missing = []
    for (const [boardKey, schema] of Object.entries(BOARD_SCHEMAS)) {
      for (const field of schema.fields || []) {
        if (labelize(field.name) === field.name && looksLikeRawKey(field.name)) {
          missing.push(`${boardKey}.${field.name}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('list 필드의 항목 스키마 키도 한국어로 바뀐다', () => {
    const withItems = Object.values(BOARD_SCHEMAS)
      .flatMap((s) => s.fields || [])
      .filter((f) => f.itemSchema)
    expect(withItems.length).toBeGreaterThan(0) // 스키마 구조가 바뀌면 이 테스트부터 깨지게

    // 같은 키가 보드마다 다른 라벨을 가질 수 있으므로(rationale → '근거'/'제안 근거')
    // '스키마가 정의한 라벨 중 하나'인지만 확인한다.
    const candidates = {}
    for (const field of withItems) {
      for (const [key, spec] of Object.entries(field.itemSchema)) {
        if (spec?.label) (candidates[key] ||= new Set()).add(spec.label)
      }
    }
    for (const [key, labels] of Object.entries(candidates)) {
      if (key in KEY_LABELS) continue // 범용 키는 자체 사전이 이긴다(별도 테스트)
      expect([...labels], `itemSchema ${key}`).toContain(labelize(key))
    }
  })

  it('같은 키의 라벨은 항상 같은 값으로 결정된다 (편집 순서에 안 흔들림)', () => {
    const first = labelize('rationale')
    for (let i = 0; i < 5; i++) expect(labelize('rationale')).toBe(first)
    expect(looksLikeRawKey(first)).toBe(false)
  })

  it('보드에 매이지 않는 범용 키는 스키마보다 자체 사전이 이긴다', () => {
    // 스키마에는 title이 어느 보드의 '맥락'으로도 정의돼 있지만,
    // 임의 객체의 title까지 '맥락'으로 보이면 오해를 부른다.
    expect(labelize('title')).toBe('제목')
    expect(labelize('items')).toBe('항목')
    expect(labelize('grade')).toBe('학년')
  })

  it('스키마에도 사전에도 없는 키는 그대로 둔다', () => {
    expect(labelize('content')).toBe('내용') // 사전에 있는 범용 키
    expect(labelize('someUnknownField')).toBe('someUnknownField')
  })

  it('알 수 없는 키는 그대로 돌려준다 (임의 치환 금지)', () => {
    expect(labelize('someUnknownKey')).toBe('someUnknownKey')
    expect(labelize('')).toBe('')
  })
})
