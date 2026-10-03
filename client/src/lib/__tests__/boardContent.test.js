import { describe, it, expect } from 'vitest'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import {
  deepMergeBoardContent, parseObjectString, normalizeListItem, listItemFields, emptyListItem,
  buildSuggestionDraft, extractEditedSuggestion,
} from '../boardContent'

const visionSchema = BOARD_SCHEMAS.team_vision
const visionItemSchema = visionSchema.fields.find((f) => f.name === 'individualVisions').itemSchema

describe('목록 항목 정규화 — 예전 편집기가 문자열로 바꿔 저장한 객체 되살리기', () => {
  it('객체 JSON 문자열은 객체로 되살린다', () => {
    expect(normalizeListItem('{"name":"김","vision":"탐구"}')).toEqual({ name: '김', vision: '탐구' })
  })
  it('평범한 글자·깨진 JSON·배열 JSON은 그대로 둔다', () => {
    expect(normalizeListItem('학생 주도 탐구')).toBe('학생 주도 탐구')
    expect(normalizeListItem('{"name":"김"')).toBe('{"name":"김"')
    expect(parseObjectString('[1,2]')).toBeNull()
  })
})

describe('객체 항목 하위 칸', () => {
  it('itemSchema 순서와 라벨을 따르고, 항목에만 있는 글자 키를 덧붙인다', () => {
    const fields = listItemFields({ name: '김', vision: 'v', memo: '메모', nested: { a: 1 } }, visionItemSchema)
    expect(fields.map((f) => f.key)).toEqual(['name', 'vision', 'refinedVision', 'memo'])
    expect(fields[0]).toMatchObject({ label: '교사명', type: 'text' })
    expect(fields[1]).toMatchObject({ label: '개인 비전', type: 'textarea' })
  })
  it('새 항목은 itemSchema가 있으면 빈 칸 객체, 없으면 빈 글자', () => {
    expect(emptyListItem(visionItemSchema)).toEqual({ name: '', vision: '', refinedVision: '' })
    expect(emptyListItem(undefined)).toBe('')
  })
})

describe('AI 제안 편집 초안', () => {
  const board = { individualVisions: [{ name: '김', vision: '기존' }], commonVision: '기존 공통 비전' }

  it('보드 정리 제안은 제안에 담긴 필드만, 현재 보드와 병합해 보여 준다', () => {
    const suggestion = { procedureCode: 'T-1-1', value: { commonVision: 'AI 공통 비전' } }
    const spec = buildSuggestionDraft(suggestion, visionSchema, board)
    expect(spec.fieldNames).toEqual(['commonVision'])
    expect(spec.content.commonVision).toBe('AI 공통 비전')
    expect(spec.content.individualVisions).toEqual(board.individualVisions)
    const edited = extractEditedSuggestion(suggestion, { ...spec.content, commonVision: '교사가 고친 비전' }, spec.fieldNames)
    expect(edited).toEqual({ commonVision: '교사가 고친 비전' })
    // 수락 경로(applyBoardContent)와 같은 병합으로 다른 필드는 그대로 남는다
    expect(deepMergeBoardContent(board, edited)).toEqual({ ...board, commonVision: '교사가 고친 비전' })
  })

  it('목록에서 항목을 지우면 병합 후에도 지워진다 (배열은 통째 교체)', () => {
    const merged = deepMergeBoardContent(board, { individualVisions: [] })
    expect(merged.individualVisions).toEqual([])
  })

  it('필드 단위 제안은 그 필드 하나만 편집하고 값만 돌려준다', () => {
    const suggestion = { procedureCode: 'T-1-1', field: 'commonVision', value: '제안 문장' }
    const spec = buildSuggestionDraft(suggestion, visionSchema, board)
    expect(spec.fieldNames).toEqual(['commonVision'])
    expect(extractEditedSuggestion(suggestion, { commonVision: '고친 문장' }, spec.fieldNames)).toBe('고친 문장')
  })

  it('제안 키가 스키마와 하나도 맞지 않으면 전체 필드를 보여 주고 전체 초안을 돌려준다', () => {
    const suggestion = { procedureCode: 'T-1-1', value: { '공통 비전': '라벨 키' } }
    const spec = buildSuggestionDraft(suggestion, visionSchema, board)
    expect(spec.fieldNames).toBeNull()
    expect(extractEditedSuggestion(suggestion, spec.content, spec.fieldNames)).toBe(spec.content)
  })

  it('스키마에 없는 필드 제안은 값 모양으로 임시 칸을 만든다', () => {
    const suggestion = { procedureCode: 'T-1-1', field: 'extraNotes', value: ['a', 'b'] }
    const spec = buildSuggestionDraft(suggestion, visionSchema, board)
    expect(spec.schema.fields).toEqual([{ name: 'extraNotes', label: 'extraNotes', type: 'list' }])
  })
})
