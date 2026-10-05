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

function isFilledValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(isFilledValue)
  if (typeof value === 'object') return Object.values(value).some(isFilledValue)
  return false
}

/**
 * 보드에 실제로 적힌 값이 있는지. 칸 이름만 있고 값이 모두 빈 보드({standards: [], ...})는 비어 있는 것으로 본다.
 * 진행률(화면 절차 목록·보고서)이 이 기준을 함께 쓴다. 예전에는 칸 이름만 있어도 '완료'로 세어,
 * 표가 빈 A-3가 보고서 본문에서는 빠지는데 진행률은 19/19로 나왔다(2026-10-05 리허설).
 * @param {object} content
 */
export function hasFilledBoardContent(content) {
  if (!isPlainObject(content)) return false
  return Object.values(content).some(isFilledValue)
}

// 스키마의 영문 키 전체(칸·열·목록 항목). 본문에 "(alignment)"처럼 괄호로 붙은 것을 지울 때 쓴다.
const BOARD_KEY_NAMES = (() => {
  const keys = new Set()
  for (const schema of Object.values(BOARD_SCHEMAS)) {
    for (const f of schema.fields || []) {
      keys.add(f.name)
      for (const c of f.columns || []) keys.add(c.name)
      for (const k of Object.keys(f.itemSchema || {})) keys.add(k)
    }
  }
  return [...keys].filter(Boolean).sort((a, b) => b.length - a.length)
})()
const BOARD_KEY_MENTION = new RegExp(`[ \\t]?\\((?:${BOARD_KEY_NAMES.join('|')})\\)`, 'g')

/**
 * AI 본문에서 "정합성 검토(alignment) 칸"처럼 한글 칸 이름 뒤 괄호에 붙은 영문 키를 지운다.
 * 지시문이 JSON 키를 알려 주면서 드물게 생긴다(2026-10-05 리허설 259건 중 1건). 괄호 안이 키 하나뿐일 때만 지우고,
 * <ai_suggestion> 안의 JSON("alignment": …)은 괄호 형태가 아니라 건드리지 않는다.
 * @param {string} text
 */
export function stripBoardKeyMentions(text) {
  if (typeof text !== 'string' || !text.includes('(')) return text
  return text.replace(BOARD_KEY_MENTION, '')
}

const codeKey = (code) => String(code ?? '').replace(/[[\]\s]/g, '')

/**
 * A-3(A-2-1) 저장 때 서버가 빼 버린 성취기준 코드 — 보낸 표에는 있는데 저장된 표에는 없는 코드.
 * 서버는 성취기준 목록에 없는 코드의 행을 지운다(가짜 코드 차단). 화면은 이 목록으로 교사에게 알린다.
 * 예전에는 조용히 지워져 "반영했어요" 뒤에 표가 비어 있었다(2026-10-05 리허설).
 * @param {object} sentContent - 저장 요청에 보낸 보드
 * @param {object} savedContent - 서버가 돌려준 보드
 * @returns {string[]} 빠진 코드(보낸 표기 그대로)
 */
export function findDroppedStandardCodes(sentContent, savedContent) {
  const sent = normalizeBoardKeys('A-2-1', sentContent)?.standards
  const saved = savedContent?.standards
  if (!Array.isArray(sent) || !Array.isArray(saved)) return []
  const kept = new Set(saved.map((row) => codeKey(row?.code)).filter(Boolean))
  return sent
    .map((row) => (row && typeof row === 'object' ? String(row.code ?? '').trim() : ''))
    .filter((code) => code && !kept.has(codeKey(code)))
}
