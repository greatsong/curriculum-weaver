import { describe, it, expect } from 'vitest'
import { normalizeBoardKeys } from 'curriculum-weaver-shared/boardKeys.js'

describe('normalizeBoardKeys — AI가 한글 라벨을 키로 쓴 보드', () => {
  it('A-3 표의 라벨 키 행을 스키마 키로 옮긴다(2026-10-05 리허설 실제 제안)', () => {
    const content = {
      standards: [
        { 교과: '사회', '가치·태도': '책임감', '과정·기능': '자료 분석', '지식·이해': '핵심 개념', '성취기준 내용': '아메리카의 인구 특징', '성취기준 코드': '9사(지리)05-02' },
      ],
      duplicateCheck: '',
      restructuredStandards: [],
    }
    const out = normalizeBoardKeys('A-2-1', content)
    expect(out.standards[0]).toEqual({
      subject: '사회', values: '책임감', process: '자료 분석', knowledge: '핵심 개념', content: '아메리카의 인구 특징', code: '9사(지리)05-02',
    })
    expect(content.standards[0].code).toBeUndefined() // 원본은 바꾸지 않는다
  })

  it('최상위 칸 라벨 키도 옮긴다(공백·가운뎃점 차이 허용)', () => {
    const out = normalizeBoardKeys('A-1-2', { '최종선정 주제': '기후 데이터', '선정 근거': '실제성' })
    expect(out.selectedTopic).toBe('기후 데이터')
    expect(out.selectionRationale).toBe('실제성')
    expect(out['최종선정 주제']).toBeUndefined()
  })

  it('목록 항목 스키마(itemSchema) 라벨 키도 옮긴다', () => {
    const out = normalizeBoardKeys('T-1-1', { individualVisions: [{ 교사명: '김가람', '개인 비전': '판단하는 학생' }], commonVision: 'x' })
    expect(out.individualVisions[0]).toEqual({ name: '김가람', vision: '판단하는 학생' })
  })

  it('스키마 키에 값이 있으면 라벨 키 값으로 덮지 않는다', () => {
    const row = { code: '[12정02-04]', '성취기준 코드': '[9수04-04]' }
    const out = normalizeBoardKeys('A-2-1', { standards: [row] })
    expect(out.standards[0].code).toBe('[12정02-04]')
    expect(out.standards[0]['성취기준 코드']).toBe('[9수04-04]')
  })

  it('스키마 키가 빈 문자열이면 라벨 키 값으로 채운다', () => {
    const out = normalizeBoardKeys('A-2-1', { standards: [{ code: '', '성취기준 코드': '[9수04-04]' }] })
    expect(out.standards[0]).toEqual({ code: '[9수04-04]' })
  })

  it('바꿀 것이 없으면 같은 객체를 돌려준다(불필요한 변경 없음)', () => {
    const content = { standards: [{ subject: '정보', code: '[12정02-04]' }], restructuredStandards: ['a'] }
    expect(normalizeBoardKeys('A-2-1', content)).toBe(content)
  })

  it('스키마에 없는 키·문자열 목록·알 수 없는 절차는 그대로 둔다', () => {
    const c1 = { coreRules: ['규칙1'], 메모: '자유 메모' }
    expect(normalizeBoardKeys('T-2-2', c1)).toBe(c1)
    const c2 = { foo: 1 }
    expect(normalizeBoardKeys('demo_lesson_plan', c2)).toBe(c2)
    expect(normalizeBoardKeys('A-2-1', null)).toBe(null)
    expect(normalizeBoardKeys('A-2-1', 'text')).toBe('text')
  })
})

import { hasFilledBoardContent, stripBoardKeyMentions, findDroppedStandardCodes } from 'curriculum-weaver-shared/boardKeys.js'

describe('hasFilledBoardContent — 진행률 판정', () => {
  it('칸 이름만 있고 값이 모두 빈 보드는 비어 있다(리허설의 빈 A-3 모양)', () => {
    expect(hasFilledBoardContent({ standards: [], duplicateCheck: '', restructuredStandards: [] })).toBe(false)
    expect(hasFilledBoardContent({ standards: [{ code: '', subject: '' }] })).toBe(false)
  })
  it('값이 하나라도 있으면 채워졌다', () => {
    expect(hasFilledBoardContent({ grade: '고1' })).toBe(true)
    expect(hasFilledBoardContent({ studentCount: 0 })).toBe(true)
    expect(hasFilledBoardContent({ standards: [{ code: '[12정02-04]' }] })).toBe(true)
  })
  it('객체가 아니면 비어 있다', () => {
    expect(hasFilledBoardContent(null)).toBe(false)
    expect(hasFilledBoardContent([])).toBe(false)
    expect(hasFilledBoardContent('x')).toBe(false)
  })
})

describe('stripBoardKeyMentions — 본문의 괄호 속 영문 키', () => {
  it('리허설 실제 문장', () => {
    expect(stripBoardKeyMentions('탐구 질문과 정합성 검토(alignment) 칸은 비워 두었습니다.')).toBe('탐구 질문과 정합성 검토 칸은 비워 두었습니다.')
  })
  it('키가 아닌 괄호·링크·수식은 그대로 둔다', () => {
    const t = '비고(참고) [링크](https://a.b/c) 함수 f(x) (선택)'
    expect(stripBoardKeyMentions(t)).toBe(t)
  })
  it('괄호가 없으면 같은 문자열을 돌려준다', () => {
    const t = 'alignment 칸'
    expect(stripBoardKeyMentions(t)).toBe(t)
    expect(stripBoardKeyMentions(null)).toBe(null)
  })
})

describe('findDroppedStandardCodes — A-3 저장에서 빠진 코드', () => {
  it('보낸 코드 중 저장본에 없는 것만(대괄호·라벨 키 차이 무시)', () => {
    const sent = { standards: [{ code: '12정02-04' }, { '성취기준 코드': '[가짜99-99]' }, { code: '' }, { subject: '국어' }] }
    const saved = { standards: [{ code: '[12정02-04]' }, { subject: '국어' }] }
    expect(findDroppedStandardCodes(sent, saved)).toEqual(['[가짜99-99]'])
  })
  it('빠진 것이 없거나 표가 없으면 빈 배열', () => {
    expect(findDroppedStandardCodes({ standards: [{ code: '[12정02-04]' }] }, { standards: [{ code: '[12정02-04]' }] })).toEqual([])
    expect(findDroppedStandardCodes({ x: 1 }, {})).toEqual([])
  })
})
