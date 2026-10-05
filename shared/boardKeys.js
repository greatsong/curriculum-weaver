/**
 * 보드 내용의 한글 라벨 키 → 스키마 키 정규화
 *
 * AI가 보드 제안을 만들 때 칸 이름(code, subject …) 대신 화면 라벨("성취기준 코드", "교과" …)을
 * 키로 쓰는 일이 있다. 화면과 보고서는 라벨 키도 읽지만, A-3(A-2-1) 저장 검증은 code 칸만 보고
 * 행을 버려 표가 통째로 비었다(2026-10-05 연수 리허설에서 확인). 저장 전에 키를 맞춘다.
 *
 * 원칙: 스키마 키에 이미 값이 있으면 건드리지 않는다. 라벨과 정확히 같은 키(공백·가운뎃점 차이는 허용)만
 * 스키마 키로 옮긴다. 스키마에 없는 키는 그대로 둔다.
 */
import { BOARD_SCHEMAS } from './boardSchemas.js'
import { BOARD_TYPES } from './constants.js'

/**
 * 스키마 키 → AI가 대신 쓴 적 있는 키(별칭). 화면 편집기(client/src/lib/boardContent.js)도 이 표를 쓴다.
 * 라벨과 같은 키는 따로 적지 않아도 맞춘다.
 */
export const ITEM_KEY_ALIASES = {
  name: ['teacherName', 'teacher', 'teacher_name', '교사명', '이름', '교사'],
  vision: ['personalVision', 'individualVision', '비전', '개인 비전'],
  refinedVision: ['refined', 'aiRefinedVision', 'refined_vision'],
  subject: ['subjectName', '교과'],
  rationale: ['reason', '근거'],
}

const squash = (s) => String(s ?? '').replace(/[\s·⋅・.]/g, '').toLowerCase()

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function isEmptyValue(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

/** pairs: [{ name, label, aliases? }] — obj의 라벨·별칭 키를 name으로 옮긴 새 객체(바뀐 것이 없으면 원래 객체) */
function renameLabelKeys(obj, pairs) {
  if (!isPlainObject(obj)) return obj
  let out = null
  for (const { name, label, aliases = [] } of pairs) {
    if (!name) continue
    const current = out || obj
    if (!isEmptyValue(current[name])) continue
    const wanted = [label, ...aliases].filter((w) => w && w !== name).map(squash)
    if (!wanted.length) continue
    const key = Object.keys(current).find((k) => k !== name && wanted.includes(squash(k)) && !isEmptyValue(current[k]))
    if (key === undefined) continue
    out = out || { ...obj }
    out[name] = out[key]
    delete out[key]
  }
  return out || obj
}

/**
 * @param {string} procedureCode - 내부 절차 코드(A-2-1 등)
 * @param {object} content - 보드 내용
 * @returns {object} 키를 맞춘 보드 내용(바뀐 것이 없으면 원래 객체)
 */
export function normalizeBoardKeys(procedureCode, content) {
  const schema = BOARD_SCHEMAS[BOARD_TYPES[procedureCode]]
  if (!schema || !isPlainObject(content)) return content
  let out = renameLabelKeys(content, schema.fields.map((f) => ({ name: f.name, label: f.label })))
  for (const field of schema.fields) {
    const value = out[field.name]
    if (!Array.isArray(value)) continue
    let pairs = null
    if (field.type === 'table' && Array.isArray(field.columns)) {
      pairs = field.columns.map((c) => ({ name: c.name, label: c.label, aliases: ITEM_KEY_ALIASES[c.name] }))
    } else if (field.type === 'list' && isPlainObject(field.itemSchema)) {
      pairs = Object.entries(field.itemSchema).map(([name, def]) => ({ name, label: def?.label, aliases: ITEM_KEY_ALIASES[name] }))
    }
    if (!pairs) continue
    let changed = false
    const rows = value.map((row) => {
      const next = renameLabelKeys(row, pairs)
      if (next !== row) changed = true
      return next
    })
    if (changed) {
      if (out === content) out = { ...content }
      out[field.name] = rows
    }
  }
  return out
}
