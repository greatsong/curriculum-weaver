import { useMemo } from 'react'
import { BOARD_TYPES } from 'curriculum-weaver-shared/constants.js'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import { useProcedureStore } from '../stores/procedureStore'
import BoardEditor from './BoardEditor'
import { buildSuggestionDraft, extractEditedSuggestion } from '../lib/boardContent'

/** 보드 스키마가 있는 제안만 폼으로 편집할 수 있다 */
export function canEditSuggestion(suggestion) {
  const boardType = suggestion?.procedureCode ? BOARD_TYPES[suggestion.procedureCode] : null
  return !!(boardType && BOARD_SCHEMAS[boardType])
}

/**
 * AI 제안 "편집" — JSON 원문 대신 보드와 같은 입력 폼으로 고친 뒤 수락한다.
 * 현재 보드 위에 제안을 얹은 모습에서 시작하고, 제안에 담긴 필드만 보여 준다.
 */
export default function SuggestionEditForm({ suggestion, onSubmit, onCancel }) {
  const boardType = suggestion?.procedureCode ? BOARD_TYPES[suggestion.procedureCode] : null
  const baseSchema = boardType ? BOARD_SCHEMAS[boardType] : null
  const boardContent = useProcedureStore((s) => (boardType ? s.boards[boardType]?.content : null))
  const spec = useMemo(
    () => (baseSchema ? buildSuggestionDraft(suggestion, baseSchema, boardContent) : null),
    [suggestion, baseSchema, boardContent],
  )
  if (!spec) return null
  return (
    <BoardEditor
      key={suggestion.id}
      schema={spec.schema}
      content={spec.content}
      fieldNames={spec.fieldNames}
      saveLabel="편집한 내용으로 수락"
      onSave={(draft) => onSubmit(extractEditedSuggestion(suggestion, draft, spec.fieldNames))}
      onCancel={onCancel}
    />
  )
}
