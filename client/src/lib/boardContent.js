/**
 * 보드 content 편집 공용 유틸 (보드 편집기·AI 제안 편집이 함께 사용)
 *
 * 2026-10-03 제보: 보드 "편집"을 누르면 JSON이 보이고, 고쳐도 보드에 반영되지 않았다.
 * - 보드 편집기는 객체 항목(예: 개인 비전 {교사명, 개인 비전})을 JSON 한 줄로 보여 주고,
 *   고치면 객체가 문자열로 바뀌어 저장됐다.
 * - AI 제안 카드의 편집은 JSON 원문을 textarea로 보여 주고, 문법이 하나라도 깨지면
 *   편집 내용을 버린 채 "반영했어요"라고 알렸다.
 * 이 모듈은 두 경로가 같은 규칙으로 객체 항목을 다루게 한다.
 */

export const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/**
 * 보드 content 병합. 중첩 plain object는 깊은 병합으로 기존 하위 키를 보존하고,
 * 배열·스칼라는 incoming 값으로 교체한다.
 */
export function deepMergeBoardContent(base, incoming) {
  if (!isPlainObject(base)) return incoming
  if (!isPlainObject(incoming)) return base
  const out = { ...base }
  for (const [key, value] of Object.entries(incoming)) {
    const current = out[key]
    if (isPlainObject(value) && isPlainObject(current)) {
      out[key] = deepMergeBoardContent(current, value)
    } else {
      out[key] = value
    }
  }
  return out
}

/** "{...}" 모양 문자열이 객체 JSON이면 객체로, 아니면 null */
export function parseObjectString(value) {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!t.startsWith('{') || !t.endsWith('}')) return null
  try {
    const parsed = JSON.parse(t)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 목록 항목 정규화 — 예전 편집기가 문자열로 바꿔 저장한 객체 항목을 되살린다 */
export function normalizeListItem(item) {
  return parseObjectString(item) || item
}

/**
 * AI가 스키마 키 대신 쓰는 같은 뜻의 키. 실제 운영 데이터에서 개인 비전 항목이
 * name 대신 teacherName으로 저장돼, 편집기에 빈 "교사명" 칸과 영어 "teacherName" 칸이
 * 따로 생겼다(2026-10-03). 항목에 스키마 키가 없고 별칭 키가 있으면 별칭 키를 그 칸으로 쓴다.
 * 저장 키는 바꾸지 않는다(항목이 원래 가진 키에 그대로 쓴다).
 */
// 별칭 표는 서버 저장 정규화(shared/boardKeys.js)와 같은 것을 쓴다
import { ITEM_KEY_ALIASES } from 'curriculum-weaver-shared/boardKeys.js'
export { ITEM_KEY_ALIASES }

/**
 * 객체 항목에서 편집할 하위 칸. itemSchema 순서가 먼저이고,
 * 그다음 항목에만 있는 글자·숫자 키를 덧붙인다(그 밖의 값은 편집하지 않고 보존).
 * @returns {{ key: string, label: string|null, type: 'text'|'textarea' }[]}
 */
export function listItemFields(item, itemSchema) {
  const fields = []
  const seen = new Set()
  const has = (k) => isPlainObject(item) && Object.prototype.hasOwnProperty.call(item, k)
  for (const [schemaKey, def] of Object.entries(itemSchema || {})) {
    let key = schemaKey
    if (!has(schemaKey)) {
      // 별칭 목록 + 스키마 라벨 자체(AI가 "AI 정교화 비전"처럼 라벨을 키로 저장한 경우, 2026-10-03 완주 테스트에서 발견)
      const candidates = [...(ITEM_KEY_ALIASES[schemaKey] || []), def?.label].filter(Boolean)
      const alias = candidates.find((a) => has(a) && !seen.has(a))
      if (alias) key = alias
    }
    fields.push({ key, label: def?.label || null, type: def?.type === 'textarea' ? 'textarea' : 'text' })
    seen.add(key)
  }
  if (isPlainObject(item)) {
    for (const [key, val] of Object.entries(item)) {
      if (seen.has(key)) continue
      if (typeof val === 'string' || typeof val === 'number') {
        fields.push({ key, label: null, type: String(val).length > 40 ? 'textarea' : 'text' })
        seen.add(key)
      }
    }
  }
  return fields
}

/** 새 목록 항목 — itemSchema가 있으면 빈 칸을 가진 객체, 없으면 빈 문자열 */
export function emptyListItem(itemSchema) {
  if (!itemSchema || Object.keys(itemSchema).length === 0) return ''
  return Object.fromEntries(Object.keys(itemSchema).map((k) => [k, '']))
}

function inferFieldType(value) {
  if (Array.isArray(value)) return 'list'
  if (isPlainObject(value)) return 'json'
  if (typeof value === 'number') return 'number'
  return 'textarea'
}

/**
 * AI 제안을 보드 편집 폼으로 열 때의 초안.
 * - 필드 단위 제안: 그 필드 하나만, 현재 보드 위에 제안 값을 얹어 보여 준다.
 * - 보드 정리 제안: 제안에 담긴 필드만, 현재 보드와 병합한 값으로 보여 준다.
 *   제안 키가 스키마와 하나도 맞지 않으면 보드 전체 필드를 보여 준다.
 * @returns {{ schema: object, content: object, fieldNames: string[]|null }}
 */
export function buildSuggestionDraft(suggestion, schema, boardContent) {
  const fields = schema?.fields || []
  const base = isPlainObject(boardContent) ? boardContent : (isPlainObject(schema?.empty) ? schema.empty : {})
  const schemaNames = new Set(fields.map((f) => f.name))

  if (suggestion?.field) {
    const name = suggestion.field
    const value = parseObjectString(suggestion.value) || suggestion.value
    const content = { ...base, [name]: value }
    if (schemaNames.has(name)) return { schema, content, fieldNames: [name] }
    // 스키마에 없는 필드 제안 — 값 모양으로 임시 칸을 만들어 편집하게 한다
    const synthetic = { ...(schema || {}), fields: [{ name, label: name, type: inferFieldType(value) }] }
    return { schema: synthetic, content, fieldNames: [name] }
  }

  const value = isPlainObject(suggestion?.value) ? suggestion.value : (parseObjectString(suggestion?.value) || {})
  const names = Object.keys(value).filter((k) => schemaNames.has(k))
  return {
    schema,
    content: deepMergeBoardContent(base, value),
    fieldNames: names.length > 0 ? names : null,
  }
}

/** 편집 폼 결과에서 수락할 값만 꺼낸다 (필드 제안=그 필드 값, 보드 정리=보여 준 필드들) */
export function extractEditedSuggestion(suggestion, draft, fieldNames) {
  if (suggestion?.field) return draft?.[suggestion.field]
  if (!fieldNames) return draft
  return Object.fromEntries(fieldNames.map((n) => [n, draft?.[n]]))
}
