import { PROCEDURES, getProcedureLabel } from 'curriculum-weaver-shared/constants.js'

/**
 * '로/으로' 조사: 받침이 없거나 ㄹ 받침이면 '로', 그 밖의 받침이면 '으로'.
 * 한글로 끝나지 않으면(숫자·영문) '(으)로'로 둔다.
 */
export function josaRo(word) {
  const last = String(word || '').trim().slice(-1)
  const code = last.charCodeAt(0) - 0xac00
  if (!(code >= 0 && code <= 11171)) return '(으)로'
  const jong = code % 28
  return jong === 0 || jong === 8 ? '로' : '으로'
}

/**
 * 절차 이동 제안 버튼 문구. 사용자에게는 반드시 표시 코드(Ds-4 등)로 보인다.
 * 예전에는 내부 코드(Ds-2-1)를 그대로 앞에 붙여 "Ds-2-1 도구 연결(으)로 이동"으로 보였다(2026-10-03 제보).
 * @param {string} code 다음 절차 내부 코드
 * @param {string} [fallbackName] 정의에 없을 때 쓸 이름
 */
export function advanceButtonLabel(code, fallbackName = '') {
  const proc = PROCEDURES[code]
  const name = proc?.name || fallbackName || ''
  const label = proc ? getProcedureLabel(code) : name
  if (!label) return ''
  return `${label}${josaRo(name || label)} 이동`
}
